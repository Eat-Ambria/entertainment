-- =============================================================================
-- 0029_performer_photos.sql — "On our stage" photos for the Guest Studio landing.
--
-- Each user can upload up to 6 photos of guests/artists performing at their venue
-- (Settings → Branding → Performer photos). The landing page cycles through them.
-- Paths point into the existing private `brand` bucket (per-user folder).
-- Safe to re-run (idempotent).
-- =============================================================================

alter table public.profiles add column if not exists performer_photo_paths text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_performer_photo_paths_max') then
    alter table public.profiles add constraint profiles_performer_photo_paths_max
      check (coalesce(array_length(performer_photo_paths, 1), 0) <= 6);
  end if;
end $$;

-- Users may set it on their own profile (same rule as the logo and landing photo).
grant update (performer_photo_paths) on public.profiles to authenticated;
