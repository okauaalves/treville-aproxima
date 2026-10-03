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
