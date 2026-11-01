-- =============================================================================
-- 0030_shared_catalogue.sql — one catalogue for the whole team.
--
-- Packages, elements (with their rate history), tiers, vendors and vendor purchase rates
-- are now shared: every signed-in user sees them, can use them in a quote, and can edit,
-- archive or delete them. owner_id stays as "created by".
-- Quotes, quote lines, the Quote Ledger, P&L and each user's option lists (functions,
-- venues, sessions) stay private to each user, exactly as before.
--
-- * Composite (owner_id, id) foreign keys into the catalogue become plain id foreign keys,
--   so a quote / package / rate entry may point at a row someone else created.
-- * Tiers are merged into one list (same name = same tier); packages are re-pointed.
-- * Package functions also store the function NAME, because each user has their own
--   function list: "Wedding" tagged by one user matches "Wedding" for everyone.
-- * New element / package names must be unique across the team (existing duplicates stay
--   until someone renames or archives one).
-- * Element and package images can be read (and replaced) by every user.
-- Safe to re-run (idempotent).
-- =============================================================================

-- ---------- Foreign keys: (owner_id, id) -> id ---------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl
      from pg_constraint c
     where c.contype = 'f'
       and c.confrelid in ('public.elements'::regclass, 'public.packages'::regclass,
                           'public.tiers'::regclass, 'public.vendors'::regclass)
       and array_length(c.conkey, 1) = 2
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

do $$
declare
  fk text[];
begin
  foreach fk slice 1 in array array[
    ['packages',            'packages_tier_id_fkey',                'foreign key (tier_id) references public.tiers (id)'],
    ['package_elements',    'package_elements_package_id_fkey',     'foreign key (package_id) references public.packages (id) on delete cascade'],
    ['package_elements',    'package_elements_element_id_fkey',     'foreign key (element_id) references public.elements (id)'],
    ['package_functions',   'package_functions_package_fkey',       'foreign key (package_id) references public.packages (id) on delete cascade'],
    ['vendor_rate_entries', 'vendor_rate_entries_element_id_fkey',  'foreign key (element_id) references public.elements (id)'],
    ['vendor_rate_entries', 'vendor_rate_entries_vendor_id_fkey',   'foreign key (vendor_id) references public.vendors (id)'],
    ['quote_items',         'quote_items_element_id_fkey',          'foreign key (element_id) references public.elements (id) on delete set null'],
    ['rate_change_logs',    'rate_change_logs_element_id_fkey',     'foreign key (element_id) references public.elements (id) on delete set null'],
    ['rate_change_logs',    'rate_change_logs_package_id_fkey',     'foreign key (package_id) references public.packages (id) on delete set null'],
    ['quotes',              'quotes_package_id_fkey',               'foreign key (package_id) references public.packages (id) on delete set null'],
    ['quote_packages',      'quote_packages_package_id_fkey',       'foreign key (package_id) references public.packages (id) on delete set null']
  ] loop
    if not exists (select 1 from pg_constraint where conname = fk[2]) then
      execute format('alter table public.%I add constraint %I %s', fk[1], fk[2], fk[3]);
    end if;
  end loop;
end $$;

-- ---------- One tier list: merge tiers with the same name ------------------------------
-- The kept tier per name: an active one first, then the oldest.
drop table if exists pg_temp.tier_canon;
create temporary table tier_canon as
  select distinct on (lower(name)) id, lower(name) as k
    from public.tiers
   order by lower(name), is_active desc, created_at, id;

update public.packages p
   set tier_id = c.id
  from public.tiers t
  join tier_canon c on c.k = lower(t.name)
 where p.tier_id = t.id and t.id <> c.id;

delete from public.tiers t where t.id not in (select id from tier_canon);
drop table tier_canon;

create unique index if not exists tiers_name_uq on public.tiers (lower(name));

-- New users get Standard / Premium only if the team doesn't have them yet.
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
  on conflict do nothing;
end;
$$;
revoke all on function public.seed_default_options(uuid) from public, anon, authenticated;

-- ---------- Package functions match by name ---------------------------------------------
alter table public.package_functions add column if not exists function_name text;

update public.package_functions pf
   set function_name = f.name
  from public.function_options f
 where f.id = pf.function_id and pf.function_name is null;

create or replace function public.package_functions_set_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select name into new.function_name from public.function_options where id = new.function_id;
  return new;
end;
$$;
revoke all on function public.package_functions_set_name() from public, anon, authenticated;
drop trigger if exists package_functions_set_name on public.package_functions;
create trigger package_functions_set_name before insert on public.package_functions
  for each row execute function public.package_functions_set_name();

create or replace function public.studio_packages(p_function_id uuid, p_offset integer, p_limit integer)
returns table (
  id            uuid,
  name          text,
  tier_name     text,
  display_price numeric,
  description   text,
  image_path    text,
  video_url     text,
  for_function  boolean,
  total         bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.id, s.name, s.tier_name, s.display_price, s.description, s.image_path, s.video_url,
         (p_function_id is not null and exists (
            select 1 from public.package_functions pf
             where pf.package_id = s.id
               and lower(pf.function_name) = (select lower(f.name) from public.function_options f where f.id = p_function_id)
         )) as for_function,
         count(*) over () as total
    from public.package_summaries s
   where s.is_active
   order by for_function desc, s.name, s.tier_sort, s.id
  offset greatest(coalesce(p_offset, 0), 0)
   limit least(greatest(coalesce(p_limit, 12), 1), 50);
$$;
revoke all on function public.studio_packages(uuid, integer, integer) from public, anon;
grant execute on function public.studio_packages(uuid, integer, integer) to authenticated;

-- ---------- Team-wide unique names for new / renamed elements and packages ---------------
create or replace function public.catalogue_unique_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dup boolean;
begin
  if not new.is_active then
    return new;
  end if;
  if tg_op = 'UPDATE' and lower(new.name) = lower(old.name) and old.is_active
     and (to_jsonb(new) ->> 'tier_id') is not distinct from (to_jsonb(old) ->> 'tier_id') then
    return new;
  end if;
  if tg_table_name = 'elements' then
    select exists (select 1 from public.elements e
                    where e.is_active and lower(e.name) = lower(new.name) and e.id <> new.id) into v_dup;
  else
    select exists (select 1 from public.packages p
                    where p.is_active and lower(p.name) = lower(new.name)
                      and p.tier_id = (to_jsonb(new) ->> 'tier_id')::uuid and p.id <> new.id) into v_dup;
  end if;
  if v_dup then
    raise exception 'An active % with this name already exists.', left(tg_table_name, -1) using errcode = '23505';
  end if;
  return new;
end;
$$;
revoke all on function public.catalogue_unique_name() from public, anon, authenticated;
drop trigger if exists elements_unique_name on public.elements;
create trigger elements_unique_name before insert or update of name, is_active on public.elements
  for each row execute function public.catalogue_unique_name();
drop trigger if exists packages_unique_name on public.packages;
create trigger packages_unique_name before insert or update of name, tier_id, is_active on public.packages
  for each row execute function public.catalogue_unique_name();

-- ---------- RLS: catalogue readable and editable by every signed-in user ------------------
-- Added next to the existing own_* policies (permissive policies are OR-ed). Inserts still
-- record the creator (own_insert: owner_id = auth.uid()).
do $$
declare
  t text;
  ops text[];
  op text;
begin
  foreach t in array array['elements', 'packages', 'package_elements', 'package_functions',
                           'tiers', 'vendors', 'vendor_rate_entries'] loop
    ops := case t
             when 'vendor_rate_entries' then array['select']
             when 'tiers'               then array['select', 'update']
             when 'vendors'             then array['select', 'update']
             else array['select', 'update', 'delete']
           end;
    foreach op in array array['select', 'update', 'delete'] loop
      execute format('drop policy if exists %I on public.%I', 'team_' || op, t);
    end loop;
    foreach op in array ops loop
      execute format('grant %s on public.%I to authenticated', op, t);
      if op = 'update' then
        execute format('create policy team_update on public.%I for update to authenticated using (true) with check (true)', t);
      else
        execute format('create policy %I on public.%I for %s to authenticated using (true)', 'team_' || op, t, op);
      end if;
    end loop;
  end loop;
end $$;

-- Rate history: element rate changes are shared; "rate changed for a quote" rows stay with
-- the quote's owner.
drop policy if exists team_select on public.rate_change_logs;
create policy team_select on public.rate_change_logs for select to authenticated using (quote_id is null);

-- Anyone may void a purchase entry (the reason is kept).
create or replace function public.void_vendor_rate_entry(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A reason is required to void an entry.';
  end if;
  update public.vendor_rate_entries
     set voided_at = now(), void_reason = btrim(p_reason)
   where id = p_id and voided_at is null;
  if not found then
    raise exception 'Entry not found or already voided.';
  end if;
end;
$$;
revoke all on function public.void_vendor_rate_entry(uuid, text) from public, anon;
grant execute on function public.void_vendor_rate_entry(uuid, text) to authenticated;

-- ---------- Images: element / package photos readable and replaceable by everyone ---------
drop policy if exists catalogue_images_select on storage.objects;
drop policy if exists catalogue_images_update on storage.objects;
drop policy if exists catalogue_images_delete on storage.objects;
create policy catalogue_images_select on storage.objects for select to authenticated
  using (bucket_id in ('element-images', 'package-images'));
create policy catalogue_images_update on storage.objects for update to authenticated
  using (bucket_id in ('element-images', 'package-images'))
  with check (bucket_id in ('element-images', 'package-images'));
create policy catalogue_images_delete on storage.objects for delete to authenticated
  using (bucket_id in ('element-images', 'package-images'));

-- ---------- Vendor rate views: one history per element (not per user) ---------------------
create or replace view public.vendor_rate_history
with (security_invoker = true) as
with ordered as (
  select
    r.*,
    lag(r.rate_per_unit) over (
      partition by r.element_id
      order by r.purchase_date, r.logged_at, r.id
    ) as prev_rate
  from public.vendor_rate_entries r
  where r.voided_at is null
)
select
  r.id,
  r.owner_id,
  r.element_id,
  e.name  as element_name,
  e.unit  as element_unit,
  r.vendor_id,
  v.name  as vendor_name,
  r.purchase_date,
  r.qty,
  r.unit,
  r.rate_per_unit,
  r.remarks,
  r.logged_by,
  p.full_name as logged_by_name,
  r.logged_at,
  r.voided_at,
  r.void_reason,
  o.prev_rate,
  case
    when r.voided_at is not null then 'void'
    when o.prev_rate is null then 'new'
    when r.rate_per_unit > o.prev_rate then 'up'
    when r.rate_per_unit < o.prev_rate then 'down'
    else 'same'
  end as trend
from public.vendor_rate_entries r
join public.elements e on e.id = r.element_id
join public.vendors v on v.id = r.vendor_id
left join public.profiles p on p.id = r.logged_by
left join ordered o on o.id = r.id;

revoke all on public.vendor_rate_history from anon, authenticated;
grant select on public.vendor_rate_history to authenticated;

create or replace view public.vendor_rate_latest
with (security_invoker = true) as
with ranked as (
  select
    r.*,
    row_number() over w                          as rn,
    lead(r.rate_per_unit) over w                  as old_rate,
    lead(r.purchase_date) over w                  as old_date,
    count(*) over (partition by r.element_id, r.vendor_id) as purchases
  from public.vendor_rate_entries r
  where r.voided_at is null
  window w as (partition by r.element_id, r.vendor_id order by r.purchase_date desc, r.logged_at desc, r.id desc)
)
select
  r.id,
  r.owner_id,
  r.element_id,
  e.name           as element_name,
  r.vendor_id,
  v.name           as vendor_name,
  r.purchase_date  as new_date,
  r.qty,
  r.unit,
  r.rate_per_unit  as new_rate,
  r.old_rate,
  r.old_date,
  r.purchases::integer as purchases,
  case
    when r.old_rate is null then 'new'
    when r.rate_per_unit > r.old_rate then 'up'
    when r.rate_per_unit < r.old_rate then 'down'
    else 'same'
  end as trend
from ranked r
join public.elements e on e.id = r.element_id
join public.vendors v on v.id = r.vendor_id
where r.rn = 1;

revoke all on public.vendor_rate_latest from anon, authenticated;
grant select on public.vendor_rate_latest to authenticated;

-- ---------- Quote lines snapshot remarks from any element ----------------------------------
create or replace function public.quote_items_snapshot_remarks()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.element_id is not null and new.remarks is null then
    select e.remarks into new.remarks from public.elements e where e.id = new.element_id;
  end if;
  return new;
end;
$$;

-- ---------- save_quote: 0023 version; any team package / element may be used --------------
create or replace function public.save_quote(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_quote_id  uuid := nullif(p_payload ->> 'quote_id', '')::uuid;
  g           jsonb := p_payload -> 'guest';
  v_packages  jsonb;
  v_charges   jsonb := coalesce(p_payload -> 'charges', '[]'::jsonb);
  v_all_lines jsonb;
  v_phone     text;
  v_function  text;
  v_venue     text;
  v_sub_venue text;
  v_session   text;
  v_names     text;
  v_tiers     text;
  v_first_pkg uuid;
  v_subtotal  numeric(14, 2);
  v_charges_t numeric(14, 2);
  v_status    public.quote_status;
  v_no        text;
  v_bad       integer;
  v_block     record;
  v_qp_id     uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  perform public.enforce_rate_limit('quote_save', 20, 60);

  -- Old single-package payload -> one block.
  v_packages := coalesce(
    p_payload -> 'packages',
    case when p_payload ? 'package_id'
         then jsonb_build_array(jsonb_build_object('package_id', p_payload -> 'package_id', 'lines', coalesce(p_payload -> 'lines', '[]'::jsonb)))
    end,
    '[]'::jsonb
  );

  if g is null or jsonb_typeof(g) <> 'object' then
    raise exception 'Guest details are missing.' using errcode = '23514';
  end if;
  if jsonb_typeof(v_packages) <> 'array' or jsonb_typeof(v_charges) <> 'array' then
    raise exception 'Invalid quote payload.' using errcode = '22023';
  end if;
  if jsonb_array_length(v_packages) = 0 then
    raise exception 'Choose the package again.' using errcode = '23514';
  end if;
  if jsonb_array_length(v_packages) > 20 or jsonb_array_length(v_charges) > 30 then
    raise exception 'Too many lines in this quote.' using errcode = '23514';
  end if;
  if (select count(*) from jsonb_array_elements(v_packages))
     <> (select count(distinct b ->> 'package_id') from jsonb_array_elements(v_packages) b) then
    raise exception 'Each package can be added only once.' using errcode = '23514';
  end if;

  -- All lines with their package, for checks.
  select coalesce(jsonb_agg(l || jsonb_build_object('_pkg', b ->> 'package_id')), '[]'::jsonb)
    into v_all_lines
    from jsonb_array_elements(v_packages) b, jsonb_array_elements(coalesce(b -> 'lines', '[]'::jsonb)) l;

  if jsonb_array_length(v_all_lines) > 300 then
    raise exception 'Too many lines in this quote.' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_packages) b
     where not exists (
       select 1 from jsonb_array_elements(coalesce(b -> 'lines', '[]'::jsonb)) l where coalesce((l ->> 'included')::boolean, true)
     )
  ) then
    raise exception 'Include at least one element.' using errcode = '23514';
  end if;
  if (select count(*) from jsonb_array_elements(v_all_lines))
     <> (select count(distinct (l ->> '_pkg') || ':' || (l ->> 'element_id')) from jsonb_array_elements(v_all_lines) l) then
    raise exception 'Each element can appear only once.' using errcode = '23514';
  end if;

  v_phone := public.normalize_phone(g ->> 'guest_phone');
  if v_phone is null then
    raise exception 'Enter a valid 10-digit mobile number.' using errcode = '23514';
  end if;
  if nullif(g ->> 'event_date', '') is null then
    raise exception 'Choose the event date.' using errcode = '23514';
  end if;

  -- Option lists are still per user.
  select name into v_function from public.function_options where id = (g ->> 'function_id')::uuid and owner_id = v_uid;
  select name into v_venue    from public.venues           where id = (g ->> 'venue_id')::uuid    and owner_id = v_uid;
  select name into v_session  from public.sessions         where id = (g ->> 'session_id')::uuid  and owner_id = v_uid;
  if v_function is null or v_venue is null or v_session is null then
    raise exception 'Choose the function, venue and session again.' using errcode = '23514';
  end if;
  if nullif(g ->> 'sub_venue_id', '') is not null then
    select name into v_sub_venue from public.sub_venues
     where id = (g ->> 'sub_venue_id')::uuid and owner_id = v_uid and venue_id = (g ->> 'venue_id')::uuid;
    if v_sub_venue is null then
      raise exception 'The sub-venue does not belong to this venue.' using errcode = '23514';
    end if;
  end if;

  -- Packages must exist (any team member's).
  select count(*) into v_bad
    from jsonb_array_elements(v_packages) b
    left join public.packages p on p.id = (b ->> 'package_id')::uuid
   where p.id is null;
  if v_bad > 0 then
    raise exception 'Choose the package again.' using errcode = '23514';
  end if;

  select string_agg(p.name, ' + ' order by t.ord), string_agg(tr.name, ' + ' order by t.ord),
         (array_agg(p.id order by t.ord))[1]
    into v_names, v_tiers, v_first_pkg
    from jsonb_array_elements(v_packages) with ordinality as t(b, ord)
    join public.packages p on p.id = (t.b ->> 'package_id')::uuid
    join public.tiers tr on tr.id = p.tier_id;

  -- Elements must exist (any team member's).
  select count(*) into v_bad
    from jsonb_array_elements(v_all_lines) l
    left join public.elements e on e.id = (l ->> 'element_id')::uuid
   where e.id is null;
  if v_bad > 0 then
    raise exception 'One of the elements is no longer available.' using errcode = '23503';
  end if;

  select coalesce(sum(round((l ->> 'qty')::numeric * (l ->> 'rate')::numeric, 2)), 0)
    into v_subtotal
    from jsonb_array_elements(v_all_lines) l
   where coalesce((l ->> 'included')::boolean, true);
  select coalesce(sum((c ->> 'amount')::numeric), 0) into v_charges_t from jsonb_array_elements(v_charges) c;

  if v_quote_id is null then
    insert into public.quotes (
      owner_id, source, source_ref, source_raw, guest_name, guest_phone, venue_name, sub_venue_name,
      event_date, session_name, function_name, package_id, package_name, package_tier,
      elements_subtotal, charges_total, final_total, notes,
      function_id, venue_id, sub_venue_id, session_id
    ) values (
      v_uid, coalesce(nullif(g ->> 'source', ''), 'manual')::public.quote_source, nullif(g ->> 'source_ref', ''),
      g -> 'source_raw', btrim(g ->> 'guest_name'), v_phone, v_venue, v_sub_venue,
      (g ->> 'event_date')::date, v_session, v_function, v_first_pkg, v_names, v_tiers,
      v_subtotal, v_charges_t, v_subtotal + v_charges_t, nullif(btrim(coalesce(p_payload ->> 'notes', '')), ''),
      (g ->> 'function_id')::uuid, (g ->> 'venue_id')::uuid, nullif(g ->> 'sub_venue_id', '')::uuid, (g ->> 'session_id')::uuid
    )
    returning id, quote_no into v_quote_id, v_no;
  else
    select status, quote_no into v_status, v_no from public.quotes where id = v_quote_id and owner_id = v_uid for update;
    if v_status is null then
      raise exception 'Quote not found.' using errcode = 'P0002';
    end if;
    if v_status not in ('draft', 'sent') then
      raise exception 'Quote % is % and can no longer be edited.', v_no, v_status using errcode = '23514';
    end if;
    update public.quotes set
      source = coalesce(nullif(g ->> 'source', ''), 'manual')::public.quote_source,
      source_ref = nullif(g ->> 'source_ref', ''),
      -- Editing from the Studio doesn't carry the original LMS row; keep the stored one.
      source_raw = case when jsonb_typeof(g -> 'source_raw') in ('object', 'array') then g -> 'source_raw' else source_raw end,
      guest_name = btrim(g ->> 'guest_name'), guest_phone = v_phone,
      venue_name = v_venue, sub_venue_name = v_sub_venue, event_date = (g ->> 'event_date')::date,
      session_name = v_session, function_name = v_function,
      package_id = v_first_pkg, package_name = v_names, package_tier = v_tiers,
      elements_subtotal = v_subtotal, charges_total = v_charges_t, final_total = v_subtotal + v_charges_t,
      notes = nullif(btrim(coalesce(p_payload ->> 'notes', '')), ''),
      function_id = (g ->> 'function_id')::uuid, venue_id = (g ->> 'venue_id')::uuid,
      sub_venue_id = nullif(g ->> 'sub_venue_id', '')::uuid, session_id = (g ->> 'session_id')::uuid
    where id = v_quote_id;
    if v_status = 'sent' then
      insert into public.audit_log (owner_id, table_name, row_id, action, old_data, new_data)
      values (v_uid, 'quotes', v_quote_id, 'edited', jsonb_build_object('status', v_status), jsonb_build_object('status', v_status));
    end if;
    delete from public.quote_items where quote_id = v_quote_id;
    delete from public.quote_packages where quote_id = v_quote_id;
    delete from public.quote_charges where quote_id = v_quote_id;
  end if;

  -- One section per package, then its lines.
  for v_block in
    select t.b, t.ord, p.id as pid, p.name as pname, tr.name as ptier
      from jsonb_array_elements(v_packages) with ordinality as t(b, ord)
      join public.packages p on p.id = (t.b ->> 'package_id')::uuid
      join public.tiers tr on tr.id = p.tier_id
     order by t.ord
  loop
    insert into public.quote_packages (owner_id, quote_id, package_id, package_name, package_tier, subtotal, sort_order)
    values (
      v_uid, v_quote_id, v_block.pid, v_block.pname, v_block.ptier,
      (select coalesce(sum(round((l ->> 'qty')::numeric * (l ->> 'rate')::numeric, 2)), 0)
         from jsonb_array_elements(coalesce(v_block.b -> 'lines', '[]'::jsonb)) l
        where coalesce((l ->> 'included')::boolean, true)),
      v_block.ord::integer
    )
    returning id into v_qp_id;

    insert into public.quote_items (
      owner_id, quote_id, quote_package_id, element_id, element_name, unit, image_path, master_rate_at_quote,
      qty, rate, amount, is_included, sort_order
    )
    select v_uid, v_quote_id, v_qp_id, e.id, e.name, e.unit, e.image_path, e.selling_rate,
           (t.l ->> 'qty')::numeric, (t.l ->> 'rate')::numeric,
           round((t.l ->> 'qty')::numeric * (t.l ->> 'rate')::numeric, 2),
           coalesce((t.l ->> 'included')::boolean, true), (v_block.ord * 1000 + t.ord)::integer
      from jsonb_array_elements(coalesce(v_block.b -> 'lines', '[]'::jsonb)) with ordinality as t(l, ord)
      join public.elements e on e.id = (t.l ->> 'element_id')::uuid;
  end loop;

  insert into public.quote_charges (owner_id, quote_id, description, amount, sort_order)
  select v_uid, v_quote_id, btrim(t.c ->> 'description'), (t.c ->> 'amount')::numeric, t.ord::integer
    from jsonb_array_elements(v_charges) with ordinality as t(c, ord);

  -- Quote-specific rate overrides -> Rate History (each element+rate logged once per quote).
  insert into public.rate_change_logs (owner_id, change_type, element_id, element_name, quote_id, old_rate, new_rate, reason, changed_by)
  select distinct on (qi.element_id, qi.rate)
         v_uid, 'quote_override', qi.element_id, qi.element_name, v_quote_id, qi.master_rate_at_quote, qi.rate,
         'Rate changed for quote ' || v_no, v_uid
    from public.quote_items qi
   where qi.quote_id = v_quote_id
     and qi.is_included
     and qi.rate is distinct from qi.master_rate_at_quote
     and not exists (
       select 1 from public.rate_change_logs r
        where r.quote_id = v_quote_id and r.element_id = qi.element_id
          and r.change_type = 'quote_override' and r.new_rate = qi.rate
     );

  return jsonb_build_object('id', v_quote_id, 'quote_no', v_no);
end;
$$;
revoke all on function public.save_quote(jsonb) from public, anon;
grant execute on function public.save_quote(jsonb) to authenticated;
