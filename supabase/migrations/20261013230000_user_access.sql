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
