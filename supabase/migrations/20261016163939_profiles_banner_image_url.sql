-- Banner de fundo da página pública (distinto de avatar/logo).
-- profiles: mini perfil /p/ ; brand_pages: Minha Página /b/

alter table public.profiles
  add column if not exists banner_image_url text;

alter table public.profiles drop constraint if exists profiles_banner_image_url_https;
alter table public.profiles
  add constraint profiles_banner_image_url_https
  check (banner_image_url is null or (banner_image_url ~ '^https://' and char_length(banner_image_url) <= 1024))
  not valid;

alter table public.brand_pages
  add column if not exists banner_image_url text;

alter table public.brand_pages drop constraint if exists brand_pages_banner_image_url_https;
alter table public.brand_pages
  add constraint brand_pages_banner_image_url_https
  check (banner_image_url is null or (banner_image_url ~ '^https://' and char_length(banner_image_url) <= 1024))
  not valid;
