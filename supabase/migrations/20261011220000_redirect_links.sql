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
