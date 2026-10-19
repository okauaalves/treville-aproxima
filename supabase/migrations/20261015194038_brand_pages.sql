-- Minha Página: brand_pages + brand_links + storage brand-assets.
-- plaquinha_id referencia redirect_links(id) (TEXT), alinhado ao schema existente.

create table if not exists public.brand_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plaquinha_id text references public.redirect_links (id) on delete cascade,
  brand_name text,
  tagline text,
  logo_url text,
  theme_mode text not null default 'dark' check (theme_mode in ('dark', 'light', 'balanced')),
  primary_color text,
  secondary_color text,
  accent_color text,
  background_color text,
  text_color text,
  border_color text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.brand_links (
  id uuid primary key default gen_random_uuid(),
  brand_page_id uuid not null references public.brand_pages (id) on delete cascade,
  link_type text not null check (link_type in ('social', 'instagram', 'google_reviews', 'portfolio', 'about', 'contact')),
  label text,
  description text,
  destination_url text,
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists brand_pages_user_id_idx on public.brand_pages (user_id);
create index if not exists brand_pages_plaquinha_id_idx on public.brand_pages (plaquinha_id);
create index if not exists brand_links_brand_page_id_idx on public.brand_links (brand_page_id, position);

drop trigger if exists brand_pages_set_updated_at on public.brand_pages;
create trigger brand_pages_set_updated_at
  before update on public.brand_pages
  for each row execute function public.set_updated_at();

alter table public.brand_pages enable row level security;
alter table public.brand_links enable row level security;

drop policy if exists owner_full_access_pages on public.brand_pages;
create policy owner_full_access_pages on public.brand_pages
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists public_read_published_pages on public.brand_pages;
create policy public_read_published_pages on public.brand_pages
  for select
  to anon, authenticated
  using (is_published = true);

drop policy if exists owner_full_access_links on public.brand_links;
create policy owner_full_access_links on public.brand_links
  for all
  to authenticated
  using (
    exists (
      select 1 from public.brand_pages
      where id = brand_page_id and user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.brand_pages
      where id = brand_page_id and user_id = (select auth.uid())
    )
  );

drop policy if exists public_read_published_links on public.brand_links;
create policy public_read_published_links on public.brand_links
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.brand_pages
      where id = brand_page_id and is_published = true
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-assets',
  'brand-assets',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists brand_assets_select_public on storage.objects;
create policy brand_assets_select_public on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'brand-assets');

drop policy if exists brand_assets_insert_own on storage.objects;
create policy brand_assets_insert_own on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'brand-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists brand_assets_update_own on storage.objects;
create policy brand_assets_update_own on storage.objects
  for update
  to authenticated
  using (bucket_id = 'brand-assets' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'brand-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists brand_assets_delete_own on storage.objects;
create policy brand_assets_delete_own on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'brand-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
