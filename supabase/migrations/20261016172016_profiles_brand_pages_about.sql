-- Descrição longa (sobre) da página pública — distinta de bio/tagline curta.
-- profiles: mini perfil /p/ ; brand_pages: Minha Página /b/
-- Limite ~800 caracteres (check).

alter table public.profiles
  add column if not exists about text;

alter table public.profiles drop constraint if exists profiles_about_len;
alter table public.profiles
  add constraint profiles_about_len
  check (about is null or char_length(about) <= 800)
  not valid;

alter table public.brand_pages
  add column if not exists about text;

alter table public.brand_pages drop constraint if exists brand_pages_about_len;
alter table public.brand_pages
  add constraint brand_pages_about_len
  check (about is null or char_length(about) <= 800)
  not valid;
