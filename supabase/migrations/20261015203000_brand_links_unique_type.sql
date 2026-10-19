-- Upsert de brand_links por (brand_page_id, link_type).
create unique index if not exists brand_links_page_type_uidx
  on public.brand_links (brand_page_id, link_type);
