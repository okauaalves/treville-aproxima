-- =============================================================================
-- Tréville Aproxima — setup completo do banco (Supabase)
--
-- Para colar no SQL Editor se não usar a CLI; equivale a todas as migrações em ordem; idempotente.
-- Pode rodar de novo sem efeito colateral. Quem usa a CLI deve continuar com `supabase db push`.
--
-- NÃO EDITE À MÃO. Gerado por scripts/build-setup-sql.mjs a partir de supabase/migrations/
-- (migrações commitadas no HEAD):
--   - 20260930120000_init.sql
--   - 20260930130000_profiles.sql
--   - 20261011220000_redirect_links.sql
--   - 20261012010000_profile_page_webhook.sql
--   - 20261012020000_rate_limit_cleanup.sql
--   - 20261012030000_admins.sql
--   - 20261013230000_user_access.sql
--   - 20261014010000_edit_requests.sql
--   - 20261014020000_updated_at_triggers.sql
--   - 20261014030000_schema_compat.sql
--
-- Funções que mudam de retorno entre migrações (recebem drop antes de recriar):
--   - public.increment_scan_count(text)
--
-- Requer: extensão pg_cron (Database → Extensions) para a limpeza automática agendada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 20260930120000_init.sql
-- -----------------------------------------------------------------------------

-- Operações e templates sincronizados por usuário.
create table if not exists public.operations (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tag_id text,
  operation text not null,
  status text not null,
  content_type text,
  payload jsonb,
  error_message text,
  integrity_percent integer,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create table if not exists public.templates (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  type text not null,
  icon text,
  color text,
  configuration jsonb not null,
  use_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.operations enable row level security;
alter table public.templates enable row level security;

drop policy if exists "operations_own" on public.operations;
create policy "operations_own"
  on public.operations
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "templates_own" on public.templates;
create policy "templates_own"
  on public.templates
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists operations_user_created_idx on public.operations (user_id, created_at desc);
create index if not exists templates_user_updated_idx on public.templates (user_id, updated_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists templates_set_updated_at on public.templates;
create trigger templates_set_updated_at
  before update on public.templates
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 20260930130000_profiles.sql
-- -----------------------------------------------------------------------------

-- Perfis criados automaticamente a partir de auth.users.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 20261011220000_redirect_links.sql
-- -----------------------------------------------------------------------------

-- Plaquinhas dinâmicas: a URL curta (QR + NFC) nunca muda; só o destino é editável.

create table if not exists public.redirect_links (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{4,64}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  destination_url text not null check (destination_url ~* '^(https?|mailto|tel|sms):'),
  destination_type text not null default 'url',
  is_active boolean not null default true,
  scan_count integer not null default 0,
  nfc_synced boolean not null default false,
  qr_synced boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scan_logs (
  id uuid primary key default gen_random_uuid(),
  link_id text not null references public.redirect_links (id) on delete cascade,
  scanned_at timestamptz not null default now(),
  scan_type text not null default 'qr' check (scan_type in ('qr', 'nfc')),
  user_agent text,
  ip_hash text
);

create index if not exists redirect_links_user_id_idx on public.redirect_links (user_id);
create index if not exists scan_logs_link_id_scanned_at_idx on public.scan_logs (link_id, scanned_at desc);

alter table public.redirect_links enable row level security;
alter table public.scan_logs enable row level security;

drop policy if exists users_own_links on public.redirect_links;
create policy users_own_links on public.redirect_links
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Inserção de logs só pela Edge Function (service_role, que ignora RLS). O dono só lê.
drop policy if exists users_own_logs on public.scan_logs;
create policy users_own_logs on public.scan_logs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.redirect_links l
      where l.id = scan_logs.link_id and l.user_id = (select auth.uid())
    )
  );

-- Versões posteriores devolvem integer: CREATE OR REPLACE não troca o tipo de retorno.
drop function if exists public.increment_scan_count(text);
create function public.increment_scan_count(link_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.redirect_links
  set scan_count = scan_count + 1,
      updated_at = now()
  where id = link_id;
$$;

revoke execute on function public.increment_scan_count(text) from public, anon, authenticated;
grant execute on function public.increment_scan_count(text) to service_role;

-- -----------------------------------------------------------------------------
-- 20261012010000_profile_page_webhook.sql
-- -----------------------------------------------------------------------------

-- Mini página de perfil digital + links + webhook das plaquinhas.

-- Planos/limites foram cancelados. Limpeza inofensiva caso algo tenha sido aplicado à mão.
drop trigger if exists enforce_plaquinha_limit on public.redirect_links;
drop function if exists public.enforce_plaquinha_limit();
drop function if exists public.check_plaquinha_limit();
drop function if exists public.check_plaquinha_limit(uuid);
alter table if exists public.profiles drop column if exists plan;
alter table if exists public.profiles drop column if exists plaquinhas_limit;
alter table if exists public.profiles drop column if exists is_blocked;

-- profiles (já criada em 20260930130000_profiles.sql; repetido de forma idempotente).
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists bio text,
  add column if not exists avatar_url text,
  add column if not exists theme_color text not null default '#1E40AF',
  add column if not exists theme_style text not null default 'glass';

alter table public.profiles drop constraint if exists profiles_display_name_len;
alter table public.profiles add constraint profiles_display_name_len check (display_name is null or char_length(display_name) <= 60) not valid;
alter table public.profiles drop constraint if exists profiles_bio_len;
alter table public.profiles add constraint profiles_bio_len check (bio is null or char_length(bio) <= 120) not valid;
alter table public.profiles drop constraint if exists profiles_theme_color_hex;
alter table public.profiles add constraint profiles_theme_color_hex check (theme_color ~ '^#[0-9A-Fa-f]{6}$') not valid;
alter table public.profiles drop constraint if exists profiles_theme_style_valid;
alter table public.profiles add constraint profiles_theme_style_valid check (theme_style in ('glass', 'solid')) not valid;
alter table public.profiles drop constraint if exists profiles_avatar_url_https;
alter table public.profiles add constraint profiles_avatar_url_https check (avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url) <= 1024)) not valid;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill de quem já tinha conta antes do trigger.
insert into public.profiles (id, full_name)
select u.id, u.raw_user_meta_data ->> 'full_name'
from auth.users u
on conflict (id) do nothing;

-- Plaquinhas: página de perfil e webhook.
alter table public.redirect_links
  add column if not exists profile_enabled boolean not null default false,
  add column if not exists webhook_url text;

alter table public.redirect_links drop constraint if exists redirect_links_webhook_https;
alter table public.redirect_links add constraint redirect_links_webhook_https
  check (webhook_url is null or (webhook_url ~ '^https://' and char_length(webhook_url) <= 2048)) not valid;

-- Links do perfil (por plaquinha).
create table if not exists public.profile_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plaquinha_id text not null references public.redirect_links (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  url text not null check (url ~* '^(https?|mailto|tel|sms):' and char_length(url) <= 2048),
  icon text not null default 'link' check (icon ~ '^[a-z_]{1,24}$'),
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists profile_links_plaquinha_position_idx on public.profile_links (plaquinha_id, position);
create index if not exists profile_links_user_id_idx on public.profile_links (user_id);

alter table public.profile_links enable row level security;

drop policy if exists users_own_profile_links on public.profile_links;
create policy users_own_profile_links on public.profile_links
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.redirect_links l
      where l.id = profile_links.plaquinha_id and l.user_id = (select auth.uid())
    )
  );

-- Salva a lista inteira numa transação: upsert dos enviados + remoção dos que saíram.
-- SECURITY INVOKER: a RLS acima continua valendo.
create or replace function public.save_profile_links(p_plaquinha_id text, p_links jsonb)
returns setof public.profile_links
language plpgsql
security invoker
set search_path = public
as $$
begin
  if jsonb_typeof(p_links) <> 'array' or jsonb_array_length(p_links) > 50 then
    raise exception 'Lista de links inválida' using errcode = '22023';
  end if;
  if not exists (select 1 from public.redirect_links where id = p_plaquinha_id and user_id = auth.uid()) then
    raise exception 'Plaquinha não encontrada' using errcode = '42501';
  end if;

  delete from public.profile_links
  where plaquinha_id = p_plaquinha_id
    and user_id = auth.uid()
    and id not in (
      select (e ->> 'id')::uuid from jsonb_array_elements(p_links) e
      where coalesce(e ->> 'id', '') <> ''
    );

  insert into public.profile_links (id, user_id, plaquinha_id, title, url, icon, position, is_active)
  select
    coalesce(nullif(e ->> 'id', '')::uuid, gen_random_uuid()),
    auth.uid(),
    p_plaquinha_id,
    e ->> 'title',
    e ->> 'url',
    coalesce(nullif(e ->> 'icon', ''), 'link'),
    (t.ord - 1)::integer,
    coalesce((e ->> 'is_active')::boolean, true)
  from jsonb_array_elements(p_links) with ordinality as t(e, ord)
  on conflict (id) do update
    set title = excluded.title,
        url = excluded.url,
        icon = excluded.icon,
        position = excluded.position,
        is_active = excluded.is_active
    where public.profile_links.user_id = auth.uid()
      and public.profile_links.plaquinha_id = p_plaquinha_id;

  return query
    select * from public.profile_links
    where plaquinha_id = p_plaquinha_id and user_id = auth.uid()
    order by position;
end;
$$;

revoke execute on function public.save_profile_links(text, jsonb) from public, anon;
grant execute on function public.save_profile_links(text, jsonb) to authenticated;

-- Contador agora devolve o total (vai no payload do webhook).
drop function if exists public.increment_scan_count(text);
create function public.increment_scan_count(link_id text)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.redirect_links
  set scan_count = scan_count + 1,
      updated_at = now()
  where id = link_id
  returning scan_count;
$$;

revoke execute on function public.increment_scan_count(text) from public, anon, authenticated;
grant execute on function public.increment_scan_count(text) to service_role;

-- Storage: bucket público de avatares (2 MB, só imagens).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Leitura pública vem do bucket público (URL /object/public). O SELECT abaixo é só da própria pasta:
-- o upsert precisa dele, e assim ninguém lista as pastas dos outros.
drop policy if exists avatars_select_own on storage.objects;
create policy avatars_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- -----------------------------------------------------------------------------
-- 20261012020000_rate_limit_cleanup.sql
-- -----------------------------------------------------------------------------

-- Rate limit dos scans, limpeza automática (pg_cron) e índices de escala.
-- Idempotente: pode rodar de novo sem efeito colateral.

-- 1) Rate limit: só a Edge Function (service_role) lê e escreve. RLS ligado e nenhuma policy.
--    Chave = "<linkId>:<hmac do ip>" — o IP cru nunca chega ao banco.
create table if not exists public.rate_limits (
  key text primary key check (char_length(key) between 6 and 80),
  window_start timestamptz not null default now(),
  hits integer not null default 1 check (hits >= 1)
);

alter table public.rate_limits enable row level security;
revoke all on table public.rate_limits from public, anon, authenticated;

create index if not exists rate_limits_window_start_idx on public.rate_limits (window_start);

-- Atômica: um único INSERT ... ON CONFLICT. Janela fixa de 10s; true = ainda pode contar (até 5 na janela).
create or replace function public.rate_limit_hit(p_key text, p_limit integer default 5, p_window_seconds integer default 10)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set window_start = case when r.window_start <= now() - make_interval(secs => p_window_seconds) then now() else r.window_start end,
        hits = case when r.window_start <= now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end
  returning hits <= p_limit;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- 2) Índices.
create index if not exists profile_links_plaquinha_position_idx on public.profile_links (plaquinha_id, position);
create index if not exists scan_logs_scanned_at_idx on public.scan_logs (scanned_at);

-- 3) Limpeza com pg_cron (disponível no plano free). Reagendar é idempotente: remove o job antigo pelo nome.
create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule(jobid) from cron.job where jobname in ('treville_rate_limits_cleanup', 'treville_scan_logs_cleanup');

-- Janelas de rate limit vencidas (> 1 min), a cada minuto.
select cron.schedule(
  'treville_rate_limits_cleanup',
  '* * * * *',
  $job$delete from public.rate_limits where window_start < now() - interval '1 minute'$job$
);

-- Logs com mais de 90 dias e excesso por plaquinha (mantém os 1000 mais recentes), num único statement.
select cron.schedule(
  'treville_scan_logs_cleanup',
  '17 3 * * *',
  $job$
  delete from public.scan_logs s
  using (
    select id
    from (
      select id, scanned_at, row_number() over (partition by link_id order by scanned_at desc, id desc) as rn
      from public.scan_logs
    ) ranked
    where ranked.rn > 1000 or ranked.scanned_at < now() - interval '90 days'
  ) expired
  where s.id = expired.id
  $job$
);

-- -----------------------------------------------------------------------------
-- 20261012030000_admins.sql
-- -----------------------------------------------------------------------------

-- Múltiplos admins. Gerenciado só pelo dashboard / service_role: nenhuma policy de escrita.
-- Idempotente: pode rodar de novo sem efeito colateral.

create table if not exists public.admins (
  id uuid default gen_random_uuid() primary key,
  email text unique not null check (email = lower(btrim(email)) and char_length(email) between 3 and 320),
  created_at timestamptz default now()
);

-- Tabela criada à mão antes desta migration: completa colunas, normaliza e garante o índice único do ON CONFLICT.
alter table public.admins add column if not exists name text;
alter table public.admins add column if not exists created_at timestamptz default now();
delete from public.admins where email is null or btrim(email) = '';
delete from public.admins a
  using public.admins b
  where lower(btrim(a.email)) = lower(btrim(b.email)) and a.ctid > b.ctid;
update public.admins set email = lower(btrim(email)) where email <> lower(btrim(email));
create unique index if not exists admins_email_key on public.admins (email);

insert into public.admins (email, name) values ('previaemailofc@gmail.com', 'Admin principal')
on conflict (email) do nothing;

alter table public.admins enable row level security;
revoke all on table public.admins from public, anon, authenticated;
grant select on table public.admins to authenticated;

drop policy if exists "admins_select_own" on public.admins;
create policy "admins_select_own" on public.admins
  for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));

-- Para usar em policies: `using (public.is_admin())`.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins a
    where a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 20261013230000_user_access.sql
-- -----------------------------------------------------------------------------

-- Aprovação de acesso: tabela user_access, is_admin() pelo JWT, has_app_access() nas policies de escrita.
-- O app nunca insere nem altera user_access: o registro nasce no servidor (trigger em auth.users ou
-- my_access_status()) e só o admin (is_admin()) ou a Edge Function admin (service_role) mudam o status.
-- Idempotente: pode rodar de novo sem efeito colateral.

-- 1) Admin. auth.users não é legível pelo papel authenticated, por isso nada de subquery nele em policy:
--    a decisão vem do JWT. E-mail (lista public.admins ou o admin principal) só vale confirmado.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
    or (
      lower(coalesce(auth.jwt() ->> 'email', '')) <> ''
      and (
        lower(auth.jwt() ->> 'email') = 'previaemailofc@gmail.com'
        or exists (select 1 from public.admins a where a.email = lower(auth.jwt() ->> 'email'))
      )
      and exists (select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null)
    );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- 2) Tabela.
create table if not exists public.user_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete cascade,
  email text unique check (email is null or (email = lower(btrim(email)) and char_length(email) between 3 and 320)),
  status text not null default 'pending' check (status in ('pending', 'approved', 'blocked')),
  invited_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_access_status_created_idx on public.user_access (status, created_at desc);

alter table public.user_access enable row level security;
revoke all on table public.user_access from public, anon, authenticated;
grant select, insert, update, delete on table public.user_access to authenticated;
grant all on table public.user_access to service_role;

-- Usuário comum: só lê a própria linha. Nada de insert/update (senão se auto-aprovaria).
drop policy if exists user_access_select_own on public.user_access;
create policy user_access_select_own on public.user_access
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists user_access_admin_all on public.user_access;
create policy user_access_admin_all on public.user_access
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- 3) Vincula (convite prévio por e-mail) ou cria o registro. Admin nasce aprovado; o resto, pendente.
create or replace function public.link_user_access(p_user_id uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_status text;
  v_admin boolean;
begin
  select ua.status into v_status from public.user_access ua where ua.user_id = p_user_id;
  if found then
    return v_status;
  end if;
  if v_email is not null then
    update public.user_access ua
      set user_id = p_user_id
      where ua.email = v_email and ua.user_id is null
      returning ua.status into v_status;
    if found then
      return v_status;
    end if;
  end if;
  v_admin := v_email = 'previaemailofc@gmail.com' or exists (select 1 from public.admins a where a.email = v_email);
  insert into public.user_access (user_id, email, status, approved_at)
  values (p_user_id, v_email, case when v_admin then 'approved' else 'pending' end, case when v_admin then now() end)
  on conflict do nothing
  returning status into v_status;
  return coalesce(v_status, 'pending');
end;
$$;

revoke all on function public.link_user_access(uuid, text) from public, anon, authenticated;
grant execute on function public.link_user_access(uuid, text) to service_role;

-- Trigger existente (perfil) + registro de acesso. Falha no acesso não pode impedir o cadastro:
-- sem linha, my_access_status() cria a pendente no primeiro login.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  begin
    perform public.link_user_access(new.id, new.email);
  exception when others then
    raise warning 'user_access não criado para %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) Status do usuário da sessão para o gate do app: 'admin' | 'approved' | 'pending' | 'blocked'.
create or replace function public.my_access_status()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;
  if public.is_admin() then
    return 'admin';
  end if;
  select u.email into v_email from auth.users u where u.id = v_uid;
  return public.link_user_access(v_uid, v_email);
end;
$$;

revoke all on function public.my_access_status() from public, anon;
grant execute on function public.my_access_status() to authenticated;

create or replace function public.has_app_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
    or exists (select 1 from public.user_access ua where ua.user_id = auth.uid() and ua.status = 'approved');
$$;

revoke all on function public.has_app_access() from public, anon;
grant execute on function public.has_app_access() to authenticated, service_role;

-- 5) Backfill: só na primeira aplicação (tabela vazia). Quem já usava o app entra aprovado.
do $$
begin
  if not exists (select 1 from public.user_access) then
    insert into public.user_access (user_id, email, status, approved_at)
    select u.id, nullif(lower(btrim(coalesce(u.email, ''))), ''), 'approved', now()
    from auth.users u
    on conflict do nothing;
  end if;
end;
$$;

update public.user_access
set status = 'approved', approved_at = coalesce(approved_at, now())
where status <> 'approved'
  and (email = 'previaemailofc@gmail.com' or email in (select a.email from public.admins a));

-- 6) Escrita exige acesso aprovado. A política FOR ALL passa a exigir has_app_access(); uma política
--    só de SELECT mantém a leitura do próprio dado (pendente/bloqueado ainda vê o que é seu).
--    A Edge Function redirect usa service_role e ignora RLS: plaquinhas de bloqueados continuam funcionando.
drop policy if exists users_own_links on public.redirect_links;
create policy users_own_links on public.redirect_links
  for all to authenticated
  using ((select auth.uid()) = user_id and (select public.has_app_access()))
  with check ((select auth.uid()) = user_id and (select public.has_app_access()));

drop policy if exists users_read_own_links on public.redirect_links;
create policy users_read_own_links on public.redirect_links
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists users_own_profile_links on public.profile_links;
create policy users_own_profile_links on public.profile_links
  for all to authenticated
  using ((select auth.uid()) = user_id and (select public.has_app_access()))
  with check (
    (select auth.uid()) = user_id
    and (select public.has_app_access())
    and exists (
      select 1 from public.redirect_links l
      where l.id = profile_links.plaquinha_id and l.user_id = (select auth.uid())
    )
  );

drop policy if exists users_read_own_profile_links on public.profile_links;
create policy users_read_own_profile_links on public.profile_links
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id and (select public.has_app_access()))
  with check ((select auth.uid()) = id and (select public.has_app_access()));

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id and (select public.has_app_access()));

drop policy if exists "operations_own" on public.operations;
create policy "operations_own" on public.operations
  for all to authenticated
  using ((select auth.uid()) = user_id and (select public.has_app_access()))
  with check ((select auth.uid()) = user_id and (select public.has_app_access()));

drop policy if exists "operations_read_own" on public.operations;
create policy "operations_read_own" on public.operations
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "templates_own" on public.templates;
create policy "templates_own" on public.templates
  for all to authenticated
  using ((select auth.uid()) = user_id and (select public.has_app_access()))
  with check ((select auth.uid()) = user_id and (select public.has_app_access()));

drop policy if exists "templates_read_own" on public.templates;
create policy "templates_read_own" on public.templates
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.has_app_access()));

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.has_app_access()))
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.has_app_access()));

-- -----------------------------------------------------------------------------
-- 20261014010000_edit_requests.sql
-- -----------------------------------------------------------------------------

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

-- -----------------------------------------------------------------------------
-- 20261014020000_updated_at_triggers.sql
-- -----------------------------------------------------------------------------

-- updated_at automático em profiles e redirect_links (antes só templates tinha).
-- Reaproveita public.set_updated_at() da migração init; recriada aqui com search_path fixo.
-- Não conflita com guard_redirect_link_update: ele não restringe updated_at, e os dois são BEFORE UPDATE
-- (o Postgres roda em ordem alfabética: guard_* antes de *_set_updated_at).

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.redirect_links add column if not exists updated_at timestamptz not null default now();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists redirect_links_set_updated_at on public.redirect_links;
create trigger redirect_links_set_updated_at
  before update on public.redirect_links
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 20261014030000_schema_compat.sql
-- -----------------------------------------------------------------------------

-- Compatibilidade com tabelas criadas à mão antes das migrations (CREATE TABLE IF NOT EXISTS não completa colunas).
-- Roda por último: guard_redirect_link_update (edit_requests) lê qr_synced em todo UPDATE de redirect_links.
-- Idempotente: pode rodar de novo sem efeito colateral.

alter table public.redirect_links
  add column if not exists destination_type text not null default 'url',
  add column if not exists is_active boolean not null default true,
  add column if not exists scan_count integer not null default 0,
  add column if not exists nfc_synced boolean not null default false,
  add column if not exists qr_synced boolean not null default true,
  add column if not exists profile_enabled boolean not null default false,
  add column if not exists webhook_url text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.scan_logs
  add column if not exists scanned_at timestamptz not null default now(),
  add column if not exists scan_type text not null default 'qr',
  add column if not exists user_agent text,
  add column if not exists ip_hash text;

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists bio text,
  add column if not exists avatar_url text,
  add column if not exists theme_color text not null default '#1E40AF',
  add column if not exists theme_style text not null default 'glass',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- O contador era executável pela anon em instalações manuais.
revoke execute on function public.increment_scan_count(text) from public, anon, authenticated;
grant execute on function public.increment_scan_count(text) to service_role;
