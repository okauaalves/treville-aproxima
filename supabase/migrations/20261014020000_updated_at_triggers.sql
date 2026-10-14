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
