-- =============================================================================
-- 0028_profile_hero_image.sql — a landing photo for the Guest Studio.
--
-- Each user can upload their own event photo (Settings → Branding → Landing photo). It is
-- shown in the featured card on the Studio landing page; without one, a designed "golden
-- stage" is shown instead. Stored in the existing private `brand` bucket (per-user folder).
-- Safe to re-run (idempotent).
-- =============================================================================

alter table public.profiles add column if not exists hero_image_path text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_hero_image_path_len') then
    alter table public.profiles add constraint profiles_hero_image_path_len check (hero_image_path is null or length(hero_image_path) <= 300);
  end if;
end $$;

-- Users may set it on their own profile (same rule as the logo).
grant update (hero_image_path) on public.profiles to authenticated;
