-- Múltiplos admins geridos pelo painel + autorização de edição de plaquinhas alheias.
-- Evolui public.admins (20261012030000) e is_admin() (20261013230000): nada é duplicado.
-- Gestão de admins só por RPCs SECURITY DEFINER com checagem no servidor; o cliente não escreve em admins.
-- Idempotente: pode rodar de novo sem efeito colateral.

-- 1) Admins: nome + seed só do admin principal. Os demais são cadastrados pelo painel.
alter table public.admins add column if not exists name text;
alter table public.admins drop constraint if exists admins_name_len;
alter table public.admins add constraint admins_name_len check (name is null or char_length(name) between 1 and 80) not valid;

insert into public.admins (email, name) values ('previaemailofc@gmail.com', 'Admin principal')
on conflict (email) do update set name = coalesce(public.admins.name, excluded.name);

revoke all on table public.admins from public, anon, authenticated;
grant select on table public.admins to authenticated;
grant all on table public.admins to service_role;

-- A policy não consulta admins (recursão): is_admin() é SECURITY DEFINER e lê a tabela fora da RLS.
drop policy if exists "admins_select_own" on public.admins;
drop policy if exists admins_select on public.admins;
create policy admins_select on public.admins
  for select to authenticated
  using (email = lower(coalesce((select auth.jwt()) ->> 'email', '')) or (select public.is_admin()));

-- Vale até para service_role/dashboard: o principal não sai e a tabela nunca fica vazia.
create or replace function public.guard_admins_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.email = 'previaemailofc@gmail.com' and new.email is distinct from old.email then
      raise exception 'O administrador principal não pode ser removido.' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.email = 'previaemailofc@gmail.com' then
    raise exception 'O administrador principal não pode ser removido.' using errcode = '42501';
  end if;
  if (select count(*) from public.admins) <= 1 then
    raise exception 'É preciso manter pelo menos um administrador.' using errcode = '42501';
  end if;
  return old;
end;
$$;

drop trigger if exists guard_admins_change on public.admins;
create trigger guard_admins_change
  before update or delete on public.admins
  for each row execute function public.guard_admins_change();

create or replace function public.list_admins()
returns table (email text, name text, created_at timestamptz, is_primary boolean, has_account boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return query
    select a.email, a.name, a.created_at, a.email = 'previaemailofc@gmail.com',
      exists (select 1 from auth.users u where lower(u.email) = a.email)
    from public.admins a
    order by (a.email = 'previaemailofc@gmail.com') desc, a.created_at;
end;
$$;

create or replace function public.add_admin(p_email text, p_name text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if char_length(v_email) not between 3 and 320 or v_email !~ '^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$' then
    raise exception 'E-mail inválido.' using errcode = '22023';
  end if;
  if v_name is not null and char_length(v_name) > 80 then
    raise exception 'Nome muito longo (máximo 80 caracteres).' using errcode = '22023';
  end if;
  insert into public.admins (email, name) values (v_email, v_name)
  on conflict (email) do update set name = coalesce(excluded.name, public.admins.name);
  update public.user_access
    set status = 'approved', approved_at = coalesce(approved_at, now())
    where status <> 'approved'
      and (email = v_email or user_id in (select u.id from auth.users u where lower(u.email) = v_email));
end;
$$;

create or replace function public.remove_admin(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if v_email = lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'Você não pode remover a si mesmo.' using errcode = '42501';
  end if;
  if v_email = 'previaemailofc@gmail.com' then
    raise exception 'O administrador principal não pode ser removido.' using errcode = '42501';
  end if;
  if (select count(*) from public.admins) <= 1 then
    raise exception 'É preciso manter pelo menos um administrador.' using errcode = '42501';
  end if;
  delete from public.admins a where a.email = v_email;
  if not found then
    raise exception 'Administrador não encontrado.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.list_admins() from public, anon;
revoke all on function public.add_admin(text, text) from public, anon;
revoke all on function public.remove_admin(text) from public, anon;
grant execute on function public.list_admins() to authenticated;
grant execute on function public.add_admin(text, text) to authenticated;
grant execute on function public.remove_admin(text) to authenticated;

-- 2) Pedidos de edição.
create table if not exists public.edit_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  user_email text not null default '',
  link_id text not null references public.redirect_links (id) on delete cascade,
  link_name text not null default '',
  reason text check (reason is null or char_length(reason) <= 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'revoked')),
  requested_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  expires_at timestamptz
);

-- Um pedido ativo por usuário e plaquinha; negado/revogado não bloqueia um novo pedido.
create unique index if not exists edit_requests_active_uidx on public.edit_requests (user_id, link_id) where status in ('pending', 'approved');
create index if not exists edit_requests_status_requested_idx on public.edit_requests (status, requested_at desc);
create index if not exists edit_requests_link_idx on public.edit_requests (link_id);

alter table public.edit_requests enable row level security;
revoke all on table public.edit_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.edit_requests to authenticated;
grant all on table public.edit_requests to service_role;

drop policy if exists edit_requests_select_own on public.edit_requests;
create policy edit_requests_select_own on public.edit_requests
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists edit_requests_admin_select on public.edit_requests;
create policy edit_requests_admin_select on public.edit_requests
  for select to authenticated
  using ((select public.is_admin()));

drop policy if exists edit_requests_insert_own on public.edit_requests;
create policy edit_requests_insert_own on public.edit_requests
  for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'pending' and (select public.has_app_access()));

drop policy if exists edit_requests_admin_update on public.edit_requests;
create policy edit_requests_admin_update on public.edit_requests
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists edit_requests_admin_delete on public.edit_requests;
create policy edit_requests_admin_delete on public.edit_requests
  for delete to authenticated
  using ((select public.is_admin()));

-- Campos de servidor: e-mail e nome da plaquinha nunca vêm do cliente.
create or replace function public.edit_requests_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_name text;
begin
  select l.user_id, l.name into v_owner, v_name from public.redirect_links l where l.id = new.link_id;
  if not found then
    raise exception 'Plaquinha não encontrada.' using errcode = 'P0002';
  end if;
  if v_owner = new.user_id then
    raise exception 'Esta plaquinha já é sua.' using errcode = '22023';
  end if;
  if (select count(*) from public.edit_requests r where r.user_id = new.user_id and r.status = 'pending') >= 20 then
    raise exception 'Você já tem muitas solicitações pendentes. Aguarde a análise.' using errcode = '54000';
  end if;
  -- Autorização vencida libera um novo pedido.
  update public.edit_requests r
    set status = 'revoked', reviewed_at = now()
    where r.user_id = new.user_id and r.link_id = new.link_id and r.status = 'approved'
      and r.expires_at is not null and r.expires_at <= now();
  new.user_email := coalesce(
    nullif(lower(case when new.user_id = auth.uid() then auth.jwt() ->> 'email' end), ''),
    (select lower(u.email) from auth.users u where u.id = new.user_id),
    ''
  );
  new.link_name := v_name;
  new.reason := nullif(btrim(coalesce(new.reason, '')), '');
  new.status := 'pending';
  new.requested_at := now();
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.expires_at := null;
  return new;
end;
$$;

drop trigger if exists edit_requests_before_insert on public.edit_requests;
create trigger edit_requests_before_insert
  before insert on public.edit_requests
  for each row execute function public.edit_requests_before_insert();

-- Só o status (e o prazo ao aprovar) muda; quem revisou e quando vêm do servidor.
create or replace function public.edit_requests_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  new.id := old.id;
  new.user_id := old.user_id;
  new.user_email := old.user_email;
  new.link_id := old.link_id;
  new.link_name := old.link_name;
  new.reason := old.reason;
  new.requested_at := old.requested_at;
  if new.status is distinct from old.status then
    if not ((old.status = 'pending' and new.status in ('approved', 'denied')) or (old.status = 'approved' and new.status = 'revoked')) then
      raise exception 'Mudança de status inválida.' using errcode = '22023';
    end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
    if new.status = 'approved' then
      if new.expires_at is not null and new.expires_at <= now() then
        raise exception 'O prazo precisa ser no futuro.' using errcode = '22023';
      end if;
    elsif new.status = 'denied' then
      new.expires_at := null;
    else
      new.expires_at := old.expires_at;
    end if;
  else
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.expires_at := old.expires_at;
  end if;
  return new;
end;
$$;

drop trigger if exists edit_requests_before_update on public.edit_requests;
create trigger edit_requests_before_update
  before update on public.edit_requests
  for each row execute function public.edit_requests_before_update();

-- 3) Quem pode editar: dono, admin ou pedido aprovado e dentro do prazo.
create or replace function public.can_edit_link(link_id_param text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.redirect_links l where l.id = link_id_param and l.user_id = auth.uid())
    or public.is_admin()
    or exists (
      select 1 from public.edit_requests r
      where r.link_id = link_id_param and r.user_id = auth.uid() and r.status = 'approved'
        and (r.expires_at is null or r.expires_at > now())
    )
  );
$$;

revoke all on function public.can_edit_link(text) from public, anon;
grant execute on function public.can_edit_link(text) to authenticated, service_role;

-- Descoberta por código (QR/NFC/digitado): só id e nome, nada de destino, dono ou e-mail.
create or replace function public.lookup_plaquinha(p_code text)
returns table (id text, name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if auth.uid() is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;
  if not public.has_app_access() then
    raise exception 'Acesso ainda não aprovado.' using errcode = '42501';
  end if;
  if v_code !~ '^[A-Z0-9]{4,8}$' then
    raise exception 'Código inválido.' using errcode = '22023';
  end if;
  return query select l.id, l.name from public.redirect_links l where l.id = v_code;
end;
$$;

revoke all on function public.lookup_plaquinha(text) from public, anon;
grant execute on function public.lookup_plaquinha(text) to authenticated;

-- Lista do painel com nome/avatar do perfil (profiles só é legível pelo dono via RLS).
create or replace function public.admin_list_edit_requests()
returns table (
  id uuid, user_id uuid, user_email text, user_name text, avatar_url text, link_id text, link_name text,
  reason text, status text, requested_at timestamptz, reviewed_at timestamptz, expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return query
    select r.id, r.user_id, r.user_email,
      coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.full_name), ''), r.user_email),
      p.avatar_url, r.link_id, r.link_name, r.reason, r.status, r.requested_at, r.reviewed_at, r.expires_at
    from public.edit_requests r
    left join public.profiles p on p.id = r.user_id
    order by r.requested_at desc
    limit 500;
end;
$$;

revoke all on function public.admin_list_edit_requests() from public, anon;
grant execute on function public.admin_list_edit_requests() to authenticated;

-- 4) Enforcement em redirect_links. Políticas permissivas somam (OR) às do dono.
drop policy if exists links_shared_select on public.redirect_links;
create policy links_shared_select on public.redirect_links
  for select to authenticated
  using (public.can_edit_link(id));

drop policy if exists links_shared_update on public.redirect_links;
create policy links_shared_update on public.redirect_links
  for update to authenticated
  using (public.can_edit_link(id) and (select public.has_app_access()))
  with check (public.can_edit_link(id) and (select public.has_app_access()));

drop policy if exists links_admin_delete on public.redirect_links;
create policy links_admin_delete on public.redirect_links
  for delete to authenticated
  using ((select public.is_admin()));

-- Editor autorizado (nem dono nem admin) só troca destino e marca a tag gravada.
-- Sem auth.uid() = service_role (Edge Functions, increment_scan_count): segue sem restrição.
create or replace function public.guard_redirect_link_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is not null and old.user_id <> v_uid and not public.is_admin() then
    if new.id is distinct from old.id
      or new.user_id is distinct from old.user_id
      or new.name is distinct from old.name
      or new.is_active is distinct from old.is_active
      or new.profile_enabled is distinct from old.profile_enabled
      or new.webhook_url is distinct from old.webhook_url
      or new.scan_count is distinct from old.scan_count
      or new.qr_synced is distinct from old.qr_synced
      or new.created_at is distinct from old.created_at then
      raise exception 'Você só pode alterar o destino desta plaquinha.' using errcode = '42501';
    end if;
    if new.destination_type in ('profile', 'empty') and new.destination_type is distinct from old.destination_type then
      raise exception 'Tipo de destino não permitido.' using errcode = '42501';
    end if;
  end if;
  -- Plaquinha de lote "Sem destino" (inativa) liga quando recebe o primeiro destino.
  if old.destination_type = 'empty' and new.destination_type is distinct from 'empty' then
    new.is_active := true;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_redirect_link_update on public.redirect_links;
create trigger guard_redirect_link_update
  before update on public.redirect_links
  for each row execute function public.guard_redirect_link_update();

-- Estatísticas também para quem pode editar.
drop policy if exists users_shared_logs on public.scan_logs;
create policy users_shared_logs on public.scan_logs
  for select to authenticated
  using (public.can_edit_link(link_id));
