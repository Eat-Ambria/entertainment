-- =============================================================================
-- 0007_storage.sql — private image buckets with per-user folders.
-- Paths: <user_id>/<anything>.jpg  e.g. 3f1c…/elements/arch.webp
-- A user can only read/write files inside their own <user_id>/ folder.
-- Images are shown via short-lived signed URLs.
-- Safe to re-run (idempotent).
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('element-images', 'element-images', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('package-images', 'package-images', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('brand',          'brand',          false, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists app_images_select on storage.objects;
drop policy if exists app_images_insert on storage.objects;
drop policy if exists app_images_update on storage.objects;
drop policy if exists app_images_delete on storage.objects;

create policy app_images_select on storage.objects for select to authenticated
  using (bucket_id in ('element-images', 'package-images', 'brand')
         and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy app_images_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('element-images', 'package-images', 'brand')
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy app_images_update on storage.objects for update to authenticated
  using (bucket_id in ('element-images', 'package-images', 'brand')
         and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id in ('element-images', 'package-images', 'brand')
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy app_images_delete on storage.objects for delete to authenticated
  using (bucket_id in ('element-images', 'package-images', 'brand')
         and (storage.foldername(name))[1] = (select auth.uid())::text);
