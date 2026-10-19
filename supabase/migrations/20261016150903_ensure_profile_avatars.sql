-- Garante coluna avatar_url + bucket público avatars (pasta por uid).
-- Schema real do mini perfil: profiles.avatar_url / storage avatars
-- (não usar logo_url/profile-logos — isso é brand_pages/brand-assets).

alter table public.profiles
  add column if not exists avatar_url text;

alter table public.profiles drop constraint if exists profiles_avatar_url_https;
alter table public.profiles
  add constraint profiles_avatar_url_https
  check (avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url) <= 1024))
  not valid;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Leitura pública via URL /object/public. SELECT autenticado só da própria pasta (upsert).
drop policy if exists avatars_select_own on storage.objects;
create policy avatars_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.has_app_access())
  );

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.has_app_access())
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.has_app_access())
  );

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
