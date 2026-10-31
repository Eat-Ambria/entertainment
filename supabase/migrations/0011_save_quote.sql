-- =============================================================================
-- 0011_save_quote.sql — save a quotation in one transaction.
--
-- save_quote(p_payload jsonb) -> jsonb { id, quote_no }
-- * The SERVER builds the snapshot: function/venue/sub-venue/session names come from the
--   caller's own option tables, package name/tier and element name/unit/image/master rate
--   from the caller's catalogue. The client only sends ids, qty, rate, charges.
-- * The SERVER computes every amount: line = round(qty*rate,2), subtotal = Σ included,
--   final = subtotal + charges. Client totals are never trusted.
-- * Rates that differ from the element's master rate are logged as 'quote_override'
--   (only when new or changed since the last save of that quote — history is append-only).
-- * Re-saving a DRAFT quote updates it in place; sent/confirmed/cancelled quotes are frozen.
-- * security definer (needed to write rate history) — every reference is pinned to
--   auth.uid() through owner_id + composite foreign keys, so no other user's data can be used.
--
-- Payload:
-- { "quote_id": uuid|null,
--   "guest": { "source": "manual|lms_lead|lms_contract", "source_ref": text|null, "source_raw": json|null,
--              "guest_name": text, "guest_phone": text, "function_id": uuid, "venue_id": uuid,
--              "sub_venue_id": uuid|null, "event_date": "YYYY-MM-DD", "session_id": uuid },
--   "package_id": uuid,
--   "lines":   [ { "element_id": uuid, "qty": number, "rate": number, "included": bool } ],
--   "charges": [ { "description": text, "amount": number } ],
--   "notes": text|null }
-- Safe to re-run (idempotent).
-- =============================================================================

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
  v_lines     jsonb := coalesce(p_payload -> 'lines', '[]'::jsonb);
  v_charges   jsonb := coalesce(p_payload -> 'charges', '[]'::jsonb);
  v_phone     text;
  v_function  text;
  v_venue     text;
  v_sub_venue text;
  v_session   text;
  v_pkg_name  text;
  v_pkg_tier  text;
  v_subtotal  numeric(14, 2);
  v_charges_t numeric(14, 2);
  v_status    public.quote_status;
  v_no        text;
  v_bad       integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  perform public.enforce_rate_limit('quote_save', 20, 60);

  if g is null or jsonb_typeof(g) <> 'object' then
    raise exception 'Guest details are missing.' using errcode = '23514';
  end if;
  if jsonb_typeof(v_lines) <> 'array' or jsonb_typeof(v_charges) <> 'array' then
    raise exception 'Invalid quote payload.' using errcode = '22023';
  end if;
  if jsonb_array_length(v_lines) > 300 or jsonb_array_length(v_charges) > 30 then
    raise exception 'Too many lines in this quote.' using errcode = '23514';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_lines) l where coalesce((l ->> 'included')::boolean, true)) then
    raise exception 'Include at least one element.' using errcode = '23514';
  end if;
  if (select count(*) from jsonb_array_elements(v_lines))
     <> (select count(distinct l ->> 'element_id') from jsonb_array_elements(v_lines) l) then
    raise exception 'Each element can appear only once.' using errcode = '23514';
  end if;

  v_phone := public.normalize_phone(g ->> 'guest_phone');
  if v_phone is null then
    raise exception 'Enter a valid 10-digit mobile number.' using errcode = '23514';
  end if;
  if nullif(g ->> 'event_date', '') is null then
    raise exception 'Choose the event date.' using errcode = '23514';
  end if;

  -- Snapshot names, all from the caller's own rows (RLS is bypassed, so filter by owner explicitly).
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

  select p.name, t.name into v_pkg_name, v_pkg_tier
    from public.packages p join public.tiers t on t.id = p.tier_id
   where p.id = (p_payload ->> 'package_id')::uuid and p.owner_id = v_uid;
  if v_pkg_name is null then
    raise exception 'Choose the package again.' using errcode = '23514';
  end if;

  -- Every element must be the caller's.
  select count(*) into v_bad
    from jsonb_array_elements(v_lines) l
    left join public.elements e on e.id = (l ->> 'element_id')::uuid and e.owner_id = v_uid
   where e.id is null;
  if v_bad > 0 then
    raise exception 'One of the elements is no longer available.' using errcode = '23503';
  end if;

  -- Server-side totals (qty/rate range checks are enforced by quote_items constraints).
  select coalesce(sum(round((l ->> 'qty')::numeric * (l ->> 'rate')::numeric, 2)), 0)
    into v_subtotal
    from jsonb_array_elements(v_lines) l
   where coalesce((l ->> 'included')::boolean, true);
  select coalesce(sum((c ->> 'amount')::numeric), 0) into v_charges_t from jsonb_array_elements(v_charges) c;

  if v_quote_id is null then
    insert into public.quotes (
      owner_id, source, source_ref, source_raw, guest_name, guest_phone, venue_name, sub_venue_name,
      event_date, session_name, function_name, package_id, package_name, package_tier,
      elements_subtotal, charges_total, final_total, notes
    ) values (
      v_uid, coalesce(nullif(g ->> 'source', ''), 'manual')::public.quote_source, nullif(g ->> 'source_ref', ''),
      g -> 'source_raw', btrim(g ->> 'guest_name'), v_phone, v_venue, v_sub_venue,
      (g ->> 'event_date')::date, v_session, v_function, (p_payload ->> 'package_id')::uuid, v_pkg_name, v_pkg_tier,
      v_subtotal, v_charges_t, v_subtotal + v_charges_t, nullif(btrim(coalesce(p_payload ->> 'notes', '')), '')
    )
    returning id, quote_no into v_quote_id, v_no;
  else
    select status, quote_no into v_status, v_no from public.quotes where id = v_quote_id and owner_id = v_uid for update;
    if v_status is null then
      raise exception 'Quote not found.' using errcode = 'P0002';
    end if;
    if v_status <> 'draft' then
      raise exception 'Quote % is % and can no longer be edited.', v_no, v_status using errcode = '23514';
    end if;
    update public.quotes set
      source = coalesce(nullif(g ->> 'source', ''), 'manual')::public.quote_source,
      source_ref = nullif(g ->> 'source_ref', ''), source_raw = g -> 'source_raw',
      guest_name = btrim(g ->> 'guest_name'), guest_phone = v_phone,
      venue_name = v_venue, sub_venue_name = v_sub_venue, event_date = (g ->> 'event_date')::date,
      session_name = v_session, function_name = v_function,
      package_id = (p_payload ->> 'package_id')::uuid, package_name = v_pkg_name, package_tier = v_pkg_tier,
      elements_subtotal = v_subtotal, charges_total = v_charges_t, final_total = v_subtotal + v_charges_t,
      notes = nullif(btrim(coalesce(p_payload ->> 'notes', '')), '')
    where id = v_quote_id;
    delete from public.quote_items where quote_id = v_quote_id;
    delete from public.quote_charges where quote_id = v_quote_id;
  end if;

  insert into public.quote_items (
    owner_id, quote_id, element_id, element_name, unit, image_path, master_rate_at_quote,
    qty, rate, amount, is_included, sort_order
  )
  select v_uid, v_quote_id, e.id, e.name, e.unit, e.image_path, e.default_rate,
         (t.l ->> 'qty')::numeric, (t.l ->> 'rate')::numeric,
         round((t.l ->> 'qty')::numeric * (t.l ->> 'rate')::numeric, 2),
         coalesce((t.l ->> 'included')::boolean, true), t.ord::integer
    from jsonb_array_elements(v_lines) with ordinality as t(l, ord)
    join public.elements e on e.id = (t.l ->> 'element_id')::uuid and e.owner_id = v_uid;

  insert into public.quote_charges (owner_id, quote_id, description, amount, sort_order)
  select v_uid, v_quote_id, btrim(t.c ->> 'description'), (t.c ->> 'amount')::numeric, t.ord::integer
    from jsonb_array_elements(v_charges) with ordinality as t(c, ord);

  -- Quote-specific rate overrides -> Rate History (new or changed since this quote's last log).
  insert into public.rate_change_logs (owner_id, change_type, element_id, element_name, quote_id, old_rate, new_rate, reason, changed_by)
  select v_uid, 'quote_override', qi.element_id, qi.element_name, v_quote_id, qi.master_rate_at_quote, qi.rate,
         'Rate changed for quote ' || v_no, v_uid
    from public.quote_items qi
   where qi.quote_id = v_quote_id
     and qi.is_included
     and qi.rate is distinct from qi.master_rate_at_quote
     and qi.rate is distinct from (
       select r.new_rate from public.rate_change_logs r
        where r.quote_id = v_quote_id and r.element_id = qi.element_id and r.change_type = 'quote_override'
        order by r.changed_at desc, r.id desc limit 1
     );

  return jsonb_build_object('id', v_quote_id, 'quote_no', v_no);
end;
$$;
revoke all on function public.save_quote(jsonb) from public, anon;
grant execute on function public.save_quote(jsonb) to authenticated;
