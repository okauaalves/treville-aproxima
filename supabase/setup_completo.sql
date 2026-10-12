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

drop function if exists public.increment_scan_count(text);
create or replace function public.increment_scan_count(link_id text)
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
alter table public.profiles add constraint profiles_display_name_len check (display_name is null or char_length(display_name) <= 60);
alter table public.profiles drop constraint if exists profiles_bio_len;
alter table public.profiles add constraint profiles_bio_len check (bio is null or char_length(bio) <= 120);
alter table public.profiles drop constraint if exists profiles_theme_color_hex;
alter table public.profiles add constraint profiles_theme_color_hex check (theme_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.profiles drop constraint if exists profiles_theme_style_valid;
alter table public.profiles add constraint profiles_theme_style_valid check (theme_style in ('glass', 'solid'));
alter table public.profiles drop constraint if exists profiles_avatar_url_https;
alter table public.profiles add constraint profiles_avatar_url_https check (avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url) <= 1024));

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
  check (webhook_url is null or (webhook_url ~ '^https://' and char_length(webhook_url) <= 2048));

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
