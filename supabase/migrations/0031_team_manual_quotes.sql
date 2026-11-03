-- =============================================================================
-- 0031_team_manual_quotes.sql — manually entered quotes can be found and edited by the
-- whole team (e.g. when the staff member who made one is on leave), with an audit trail.
--
-- * team_manual_quotes(term, digits, all): Studio search — your own manual quotes, or
--   (all = true) every team member's, with who made each one. Guest-safe columns only.
-- * team_quote(id): one quote (own, or anyone's manual quote) for the Studio: guest view,
--   PDF and "edit in place". Option ids are mapped to the caller's own lists by name.
--   Opening someone else's quote is logged (at most once per 30 minutes per person).
-- * save_quote: can update a team member's manual draft / sent quote in place. The quote
--   stays with its owner; the change is logged with who did it and the quote as it was.
-- * Confirmed / cancelled quotes stay locked (unchanged). The Quote Ledger and P&L still
--   show only your own quotes: quotes RLS is unchanged, all access goes through these RPCs.
-- * The audit log stays append-only (no update / delete for anyone).
-- Safe to re-run (idempotent).
-- =============================================================================

-- ---------- Helpers (internal) ----------------------------------------------------------
create or replace function public._user_name(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(btrim(p.full_name), ''), 'A team member') from public.profiles p where p.id = p_id
$$;
revoke all on function public._user_name(uuid) from public, anon, authenticated;

-- The quote as the guest sees it (names, totals, lines) — kept in the audit log on edits.
create or replace function public._quote_snapshot(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', q.status, 'guest_name', q.guest_name, 'guest_phone', q.guest_phone,
    'function_name', q.function_name, 'venue_name', q.venue_name, 'sub_venue_name', q.sub_venue_name,
    'event_date', q.event_date, 'session_name', q.session_name,
    'elements_subtotal', q.elements_subtotal, 'charges_total', q.charges_total, 'final_total', q.final_total,
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'package_name', qp.package_name, 'package_tier', qp.package_tier, 'subtotal', qp.subtotal,
               'lines', coalesce((
                 select jsonb_agg(jsonb_build_object('element_name', qi.element_name, 'qty', qi.qty, 'rate', qi.rate,
                                                     'amount', qi.amount, 'is_included', qi.is_included) order by qi.sort_order)
                   from public.quote_items qi where qi.quote_package_id = qp.id), '[]'::jsonb)
             ) order by qp.sort_order)
        from public.quote_packages qp where qp.quote_id = q.id), '[]'::jsonb),
    'charges', coalesce((
      select jsonb_agg(jsonb_build_object('description', c.description, 'amount', c.amount) order by c.sort_order)
        from public.quote_charges c where c.quote_id = q.id), '[]'::jsonb)
  )
  from public.quotes q where q.id = p_id
$$;
revoke all on function public._quote_snapshot(uuid) from public, anon, authenticated;

-- ---------- Studio search: own manual quotes, or the whole team's ------------------------
-- p_term is matched literally by the caller (LIKE wildcards escaped); p_digits = phone digits.
create or replace function public.team_manual_quotes(p_term text, p_digits text, p_all boolean)
returns table (
  id uuid, quote_no text, status public.quote_status, guest_name text, guest_phone text,
  function_name text, venue_name text, event_date date, owner_name text, mine boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if length(btrim(coalesce(p_term, ''))) < 3 then
    return;
  end if;
  return query
    select q.id, q.quote_no, q.status, q.guest_name, q.guest_phone, q.function_name, q.venue_name, q.event_date,
           public._user_name(q.owner_id), q.owner_id = v_uid
      from public.quotes q
     where q.source = 'manual'
       and (q.owner_id = v_uid or coalesce(p_all, false))
       and (q.guest_name ilike '%' || p_term || '%'
            or q.quote_no ilike '%' || p_term || '%'
            or (length(coalesce(p_digits, '')) >= 3 and q.guest_phone like '%' || p_digits || '%'))
     order by q.created_at desc
     limit 8;
end;
$$;
revoke all on function public.team_manual_quotes(text, text, boolean) from public, anon;
grant execute on function public.team_manual_quotes(text, text, boolean) to authenticated;

-- ---------- One quote for the Studio (own, or a team member's manual quote) ---------------
create or replace function public.team_quote(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  q      public.quotes;
  v_fn   uuid;
  v_ven  uuid;
  v_sub  uuid;
  v_sess uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into q from public.quotes where id = p_id and (owner_id = v_uid or source = 'manual');
  if q.id is null then
    raise exception 'Quote not found.' using errcode = 'P0002';
  end if;

  -- Option lists are per user: the caller's option with the same id, else the same name.
  v_fn := coalesce(
    (select o.id from public.function_options o where o.id = q.function_id and o.owner_id = v_uid),
    (select o.id from public.function_options o where o.owner_id = v_uid and lower(o.name) = lower(q.function_name) order by o.is_active desc limit 1));
  v_ven := coalesce(
    (select o.id from public.venues o where o.id = q.venue_id and o.owner_id = v_uid),
    (select o.id from public.venues o where o.owner_id = v_uid and lower(o.name) = lower(q.venue_name) order by o.is_active desc limit 1));
  v_sub := coalesce(
    (select o.id from public.sub_venues o where o.id = q.sub_venue_id and o.owner_id = v_uid and o.venue_id = v_ven),
    (select o.id from public.sub_venues o where o.owner_id = v_uid and o.venue_id = v_ven and lower(o.name) = lower(q.sub_venue_name) order by o.is_active desc limit 1));
  v_sess := coalesce(
    (select o.id from public.sessions o where o.id = q.session_id and o.owner_id = v_uid),
    (select o.id from public.sessions o where o.owner_id = v_uid and lower(o.name) = lower(q.session_name) order by o.is_active desc limit 1));

  if q.owner_id <> v_uid and not exists (
    select 1 from public.audit_log a
     where a.owner_id = q.owner_id and a.table_name = 'quotes' and a.row_id = q.id and a.actor = v_uid
       and a.action in ('viewed_by_other', 'edited_by_other') and a.at > now() - interval '30 minutes'
  ) then
    insert into public.audit_log (owner_id, table_name, row_id, action, old_data, new_data, actor)
    values (q.owner_id, 'quotes', q.id, 'viewed_by_other', null,
            jsonb_build_object('status', q.status, 'actor_name', public._user_name(v_uid)), v_uid);
  end if;

  return jsonb_build_object(
    'id', q.id, 'quote_no', q.quote_no, 'status', q.status, 'created_at', q.created_at,
    'source', q.source, 'source_ref', q.source_ref,
    'guest_name', q.guest_name, 'guest_phone', q.guest_phone,
    'function_name', q.function_name, 'venue_name', q.venue_name, 'sub_venue_name', q.sub_venue_name,
    'event_date', q.event_date, 'session_name', q.session_name,
    'package_name', q.package_name, 'package_tier', q.package_tier,
    'elements_subtotal', q.elements_subtotal, 'charges_total', q.charges_total, 'final_total', q.final_total,
    'function_id', v_fn, 'venue_id', v_ven, 'sub_venue_id', v_sub, 'session_id', v_sess,
    'mine', q.owner_id = v_uid, 'owner_name', public._user_name(q.owner_id),
    'quote_packages', coalesce((
      select jsonb_agg(jsonb_build_object('id', qp.id, 'package_id', qp.package_id, 'package_name', qp.package_name,
                                          'package_tier', qp.package_tier, 'subtotal', qp.subtotal, 'sort_order', qp.sort_order))
        from public.quote_packages qp where qp.quote_id = q.id), '[]'::jsonb),
    'quote_items', coalesce((
      select jsonb_agg(jsonb_build_object('quote_package_id', qi.quote_package_id, 'element_id', qi.element_id,
                                          'element_name', qi.element_name, 'unit', qi.unit, 'image_path', qi.image_path,
                                          'remarks', qi.remarks, 'qty', qi.qty, 'rate', qi.rate, 'amount', qi.amount,
                                          'is_included', qi.is_included, 'sort_order', qi.sort_order))
        from public.quote_items qi where qi.quote_id = q.id), '[]'::jsonb),
    'quote_charges', coalesce((
      select jsonb_agg(jsonb_build_object('description', c.description, 'amount', c.amount, 'sort_order', c.sort_order))
        from public.quote_charges c where c.quote_id = q.id), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.team_quote(uuid) from public, anon;
grant execute on function public.team_quote(uuid) to authenticated;

-- ---------- save_quote: 0030 version; may update a team member's manual quote ------------
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
  v_owner     uuid := v_uid; -- whose quote it is; lines are stored under the owner
  v_old       jsonb;
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
    -- Own quotes, or any team member's manually entered quote.
    select status, quote_no, owner_id into v_status, v_no, v_owner
      from public.quotes where id = v_quote_id and (owner_id = v_uid or source = 'manual') for update;
    if v_status is null then
      raise exception 'Quote not found.' using errcode = 'P0002';
    end if;
    if v_status not in ('draft', 'sent') then
      raise exception 'Quote % is % and can no longer be edited.', v_no, v_status using errcode = '23514';
    end if;
    if v_owner <> v_uid then
      v_old := public._quote_snapshot(v_quote_id);
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
      values (v_owner, 'quotes', v_quote_id, 'edited', jsonb_build_object('status', v_status), jsonb_build_object('status', v_status));
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
      v_owner, v_quote_id, v_block.pid, v_block.pname, v_block.ptier,
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
    select v_owner, v_quote_id, v_qp_id, e.id, e.name, e.unit, e.image_path, e.selling_rate,
           (t.l ->> 'qty')::numeric, (t.l ->> 'rate')::numeric,
           round((t.l ->> 'qty')::numeric * (t.l ->> 'rate')::numeric, 2),
           coalesce((t.l ->> 'included')::boolean, true), (v_block.ord * 1000 + t.ord)::integer
      from jsonb_array_elements(coalesce(v_block.b -> 'lines', '[]'::jsonb)) with ordinality as t(l, ord)
      join public.elements e on e.id = (t.l ->> 'element_id')::uuid;
  end loop;

  insert into public.quote_charges (owner_id, quote_id, description, amount, sort_order)
  select v_owner, v_quote_id, btrim(t.c ->> 'description'), (t.c ->> 'amount')::numeric, t.ord::integer
    from jsonb_array_elements(v_charges) with ordinality as t(c, ord);

  -- Quote-specific rate overrides -> Rate History (each element+rate logged once per quote).
  insert into public.rate_change_logs (owner_id, change_type, element_id, element_name, quote_id, old_rate, new_rate, reason, changed_by)
  select distinct on (qi.element_id, qi.rate)
         v_owner, 'quote_override', qi.element_id, qi.element_name, v_quote_id, qi.master_rate_at_quote, qi.rate,
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

  -- Someone else changed this quote: keep who, when, and the quote as it was before.
  if v_old is not null then
    insert into public.audit_log (owner_id, table_name, row_id, action, old_data, new_data, actor)
    values (v_owner, 'quotes', v_quote_id, 'edited_by_other', v_old,
            public._quote_snapshot(v_quote_id) || jsonb_build_object('actor_name', public._user_name(v_uid)), v_uid);
  end if;

  return jsonb_build_object('id', v_quote_id, 'quote_no', v_no);
end;
$$;
revoke all on function public.save_quote(jsonb) from public, anon;
grant execute on function public.save_quote(jsonb) to authenticated;
