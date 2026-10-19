-- Slug público opcional para Minha Página (além de plaquinha_id).
alter table public.brand_pages
  add column if not exists custom_slug text;

alter table public.brand_pages drop constraint if exists brand_pages_custom_slug_format;
alter table public.brand_pages add constraint brand_pages_custom_slug_format
  check (
    custom_slug is null
    or (custom_slug ~ '^[a-z0-9]([a-z0-9-]{1,46}[a-z0-9])?$' and char_length(custom_slug) between 3 and 48)
  ) not valid;

create unique index if not exists brand_pages_custom_slug_uidx
  on public.brand_pages (custom_slug)
  where custom_slug is not null;
