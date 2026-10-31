-- =============================================================================
-- 0023_element_multiplier.sql — a multiplier on each element (My Workspace only).
--
--   guest rate (selling_rate) = default_rate × multiplier
-- The Guest Studio only ever reads selling_rate, so the multiplier is never shown or sent
-- to the guest side. Quotes store the rate used (as before), package totals and the
-- "rate changed for this quote" check use selling_rate.
--
-- An earlier draft of this migration put the multiplier on quote lines; that column is
-- removed here if it exists. Safe to re-run (idempotent).
-- =============================================================================

alter table public.quote_items drop constraint if exists quote_items_multiplier_range;
alter table public.quote_items drop column if exists multiplier;

alter table public.elements add column if not exists multiplier numeric(10, 2) not null default 1;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'elements_multiplier_range') then
    alter table public.elements add constraint elements_multiplier_range check (multiplier > 0 and multiplier <= 10000);
  end if;
end $$;

alter table public.elements
  add column if not exists selling_rate numeric(12, 2) generated always as (round(default_rate * multiplier, 2)) stored;

-- ---------- update_element gains p_multiplier (null = keep) ------------------------
drop function if exists public.update_element(uuid, text, text, numeric, numeric, text, numeric, text, text);

create or replace function public.update_element(
  p_id           uuid,
  p_name         text,
  p_unit         text,
  p_default_rate numeric,
  p_default_qty  numeric,
  p_image_path   text,
  p_unit_cost    numeric,
  p_reason       text default null,
  p_remarks      text default null,
  p_multiplier   numeric default null
)
returns public.elements
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v public.elements;
begin
  if p_reason is not null and length(p_reason) > 500 then
    raise exception 'Reason must be 500 characters or fewer.' using errcode = '23514';
  end if;
  perform set_config('app.rate_change_reason', coalesce(p_reason, ''), true);
  update public.elements
     set name         = btrim(p_name),
         unit         = nullif(btrim(coalesce(p_unit, '')), ''),
         default_rate = p_default_rate,
         default_qty  = p_default_qty,
         image_path   = p_image_path,
         unit_cost    = p_unit_cost,
         remarks      = nullif(btrim(coalesce(p_remarks, '')), ''),
         multiplier   = coalesce(p_multiplier, multiplier)
   where id = p_id
  returning * into v;
  perform set_config('app.rate_change_reason', '', true);
  if v.id is null then
    raise exception 'Element not found.' using errcode = 'P0002';
  end if;
  return v;
end;
$$;
revoke all on function public.update_element(uuid, text, text, numeric, numeric, text, numeric, text, text, numeric) from public, anon;
grant execute on function public.update_element(uuid, text, text, numeric, numeric, text, numeric, text, text, numeric) to authenticated;

-- ---------- Package totals use the guest rate --------------------------------------
create or replace view public.package_summaries
with (security_invoker = true) as
select
  p.id,
  p.owner_id,
  p.name,
  p.tier_id,
  t.name       as tier_name,
  t.sort_order as tier_sort,
  p.display_price,
  p.description,
  p.image_path,
  p.video_url,
  p.is_active,
  p.created_at,
  p.updated_at,
  count(pe.id)::integer as element_count,
  coalesce(sum(round(pe.default_qty * e.selling_rate, 2)), 0)::numeric(14, 2) as elements_total
from public.packages p
join public.tiers t on t.id = p.tier_id
left join public.package_elements pe on pe.package_id = p.id
left join public.elements e on e.id = pe.element_id
group by p.id, t.id;

revoke all on public.package_summaries from anon, authenticated;
grant select on public.package_summaries to authenticated;

-- ---------- save_quote: 0016 version, master rate = selling_rate ---------------------
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

  -- Packages must be the caller's.
  select count(*) into v_bad
    from jsonb_array_elements(v_packages) b
    left join public.packages p on p.id = (b ->> 'package_id')::uuid and p.owner_id = v_uid
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

  -- Elements must be the caller's.
  select count(*) into v_bad
    from jsonb_array_elements(v_all_lines) l
    left join public.elements e on e.id = (l ->> 'element_id')::uuid and e.owner_id = v_uid
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
      join public.elements e on e.id = (t.l ->> 'element_id')::uuid and e.owner_id = v_uid;
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
