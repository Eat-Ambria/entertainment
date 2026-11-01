-- =============================================================================
-- 0020_manaktala_venue.sql — the "Emerald Green" venue is shown as "Manaktala".
--
-- It is the same LMS venue (id 6, "Manaktala Farm"), so it is renamed in place: the LMS
-- link, venue charge rates and sub-venues stay. Saved quotes keep the venue name they
-- were saved with. New users get "Manaktala" from the start.
-- Safe to re-run (idempotent).
-- =============================================================================

update public.venues v
   set name = 'Manaktala'
 where lower(v.name) = 'emerald green'
   and not exists (
     select 1 from public.venues m where m.owner_id = v.owner_id and lower(m.name) = 'manaktala'
   );

-- Defaults for new users (same as 0002, with the new name).
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
    (p_owner, 'Manaktala', 6, 2),
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
  on conflict do nothing; -- any conflict: tiers are one shared list since 0030

end;
$$;

revoke all on function public.seed_default_options(uuid) from public, anon, authenticated;
