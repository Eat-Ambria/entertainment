-- =============================================================================
-- 0002_options.sql — per-user option lists: functions, venues, sub-venues,
-- sessions, tiers. Each user gets their own copy (seeded on account creation)
-- and can edit it without affecting anyone else.
-- Functions are guest/event info only — nothing here links to packages.
-- Safe to re-run (idempotent).
-- =============================================================================

create table if not exists public.function_options (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 80),
  lms_id     integer,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, id)
);
create unique index if not exists function_options_owner_name_uq on public.function_options (owner_id, lower(name));

create table if not exists public.venues (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 120),
  lms_id     integer,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, id)
);
create unique index if not exists venues_owner_name_uq on public.venues (owner_id, lower(name));

-- Sub-venue = LMS "location". Composite FK keeps it inside the same user's venues.
create table if not exists public.sub_venues (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  venue_id   uuid not null,
  name       text not null check (length(btrim(name)) between 1 and 120),
  lms_id     integer,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, id),
  foreign key (owner_id, venue_id) references public.venues (owner_id, id) on delete cascade
);
create unique index if not exists sub_venues_owner_venue_name_uq on public.sub_venues (owner_id, venue_id, lower(name));

create table if not exists public.sessions (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 40),
  lms_timing time,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, id)
);
create unique index if not exists sessions_owner_name_uq on public.sessions (owner_id, lower(name));

create table if not exists public.tiers (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 40),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, id)
);
create unique index if not exists tiers_owner_name_uq on public.tiers (owner_id, lower(name));

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['function_options', 'venues', 'sub_venues', 'sessions', 'tiers'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------- Default lists (from LMS_API_Mapping) ---------------------------
-- Called once per new user by the auth trigger (0003). Re-running is harmless.
create or replace function public.seed_default_options(p_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exotica uuid;
begin
  insert into public.function_options (owner_id, name, lms_id, sort_order, is_active)
  select p_owner, f.name, f.lms_id, f.ord, f.active
  from (values
    ('Wedding', 3, 1, true), ('Sangeet', 20, 2, true), ('Haldi', 14, 3, true),
    ('Mehendi', 15, 4, true), ('Reception', 4, 5, true), ('Engagement', 22, 6, true),
    ('Ring Ceremony', 1, 7, true), ('Cocktail', 9, 8, true), ('Roka Ceremony', 16, 9, true),
    ('Sagan', 8, 10, true), ('Lagan', 7, 11, true), ('Barat Assembly', 24, 12, true),
    ('Residential Wedding', 17, 13, true), ('Destination Wedding', 18, 14, true),
    ('Birthday', 2, 15, true), ('Anniversary', 6, 16, true), ('Baby Shower', 21, 17, true),
    ('Kua Poojan', 5, 18, true), ('Proposal Ceremony', 12, 19, true), ('Religious', 10, 20, true),
    ('Mata Ki Chowki', 36, 21, true), ('Lohri', 33, 22, true), ('Diwali Party', 34, 23, true),
    ('Corporate', 11, 24, true), ('Get Together', 35, 25, true), ('House Party', 25, 26, true),
    ('Kitty Party', 31, 27, true), ('Kothi Booking', 19, 28, true),
    ('Breakfast Function', 27, 29, true), ('Lunch Function', 26, 30, true), ('Dinner Function', 28, 31, true),
    ('Breakfast', 29, 32, true), ('Lunch', 30, 33, true),
    -- internal LMS types, hidden by default so they never appear in front of guests
    ('Restaurant Sale', 32, 90, false), ('Tender (North East Flood)', 23, 91, false)
  ) as f(name, lms_id, ord, active)
  on conflict (owner_id, lower(name)) do nothing;

  insert into public.venues (owner_id, name, lms_id, sort_order)
  values
    (p_owner, 'Ambria Pushpanjali', 3, 1),
    (p_owner, 'Emerald Green', 6, 2),
    (p_owner, 'Ambria Exotica', 19, 3),
    (p_owner, 'Ambria Restro', 16, 4)
  on conflict (owner_id, lower(name)) do nothing;

  select id into v_exotica from public.venues where owner_id = p_owner and lower(name) = 'ambria exotica';
  if v_exotica is not null then
    insert into public.sub_venues (owner_id, venue_id, name, lms_id, sort_order)
    values (p_owner, v_exotica, 'The Aura', null, 1), (p_owner, v_exotica, 'Valencia', null, 2)
    on conflict (owner_id, venue_id, lower(name)) do nothing;
  end if;

  insert into public.sessions (owner_id, name, lms_timing, sort_order)
  values (p_owner, 'Lunch', '12:00', 1), (p_owner, 'Sundowner', '16:00', 2), (p_owner, 'Dinner', '18:00', 3)
  on conflict (owner_id, lower(name)) do nothing;

  insert into public.tiers (owner_id, name, sort_order)
  values (p_owner, 'Standard', 1), (p_owner, 'Premium', 2)
  on conflict (owner_id, lower(name)) do nothing;
end;
$$;

revoke all on function public.seed_default_options(uuid) from public, anon, authenticated;
