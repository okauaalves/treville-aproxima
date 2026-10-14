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
