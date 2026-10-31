-- =============================================================================
-- 0013_multi_package.sql — a quote can include several packages.
--
-- * quote_packages: one row per package in a quote (snapshot name/tier + subtotal).
-- * quote_items.quote_package_id: which package section a line belongs to. The same
--   element may appear in two packages (separate lines); within one package only once.
-- * quotes.package_id/name/tier stay for compatibility: first package id, and all names /
--   tiers joined with " + " (used by the ledger column).
-- * save_quote accepts { packages: [ { package_id, lines: [...] } ] }. The old single
--   package payload ({ package_id, lines }) still works.
-- * Existing quotes are back-filled into quote_packages.
-- Safe to re-run (idempotent).
-- =============================================================================

create table if not exists public.quote_packages (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quote_id     uuid not null,
  package_id   uuid,
  package_name text not null,
  package_tier text,
  subtotal     numeric(14, 2) not null default 0 check (subtotal >= 0),
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  unique (owner_id, id),
  foreign key (owner_id, quote_id) references public.quotes (owner_id, id),
  foreign key (owner_id, package_id) references public.packages (owner_id, id)
);
create index if not exists quote_packages_owner_quote_idx on public.quote_packages (owner_id, quote_id, sort_order);
create index if not exists quote_packages_owner_package_idx on public.quote_packages (owner_id, package_id);

alter table public.quote_items add column if not exists quote_package_id uuid references public.quote_packages (id) on delete cascade;
create index if not exists quote_items_package_idx on public.quote_items (quote_package_id);

-- RLS: same as other quote children (own rows; frozen once the quote leaves draft).
alter table public.quote_packages enable row level security;
revoke all on public.quote_packages from anon, authenticated;
grant select, insert, update, delete on public.quote_packages to authenticated;
drop policy if exists own_select on public.quote_packages;
drop policy if exists own_insert on public.quote_packages;
drop policy if exists own_update on public.quote_packages;
drop policy if exists own_delete on public.quote_packages;
create policy own_select on public.quote_packages for select to authenticated using (owner_id = (select auth.uid()));
create policy own_insert on public.quote_packages for insert to authenticated with check (owner_id = (select auth.uid()));
create policy own_update on public.quote_packages for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy own_delete on public.quote_packages for delete to authenticated using (owner_id = (select auth.uid()));

drop trigger if exists quote_packages_guard on public.quote_packages;
create trigger quote_packages_guard before insert or update or delete on public.quote_packages
  for each row execute function public.quote_children_guard();

-- ---------- Back-fill existing quotes (one section = the quote's package) -----------
-- Guards are paused so frozen (sent/confirmed) quotes can be back-filled; nothing else changes.
alter table public.quote_packages disable trigger quote_packages_guard;
alter table public.quote_items disable trigger quote_items_guard;

insert into public.quote_packages (owner_id, quote_id, package_id, package_name, package_tier, subtotal, sort_order)
select q.owner_id, q.id, q.package_id, coalesce(q.package_name, 'Package'), q.package_tier, q.elements_subtotal, 1
  from public.quotes q
 where not exists (select 1 from public.quote_packages qp where qp.quote_id = q.id);

update public.quote_items qi
   set quote_package_id = qp.id
  from public.quote_packages qp
 where qp.quote_id = qi.quote_id and qi.quote_package_id is null;

alter table public.quote_packages enable trigger quote_packages_guard;
alter table public.quote_items enable trigger quote_items_guard;

-- ---------- save_quote with several packages ----------------------------------------
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
      elements_subtotal, charges_total, final_total, notes
    ) values (
      v_uid, coalesce(nullif(g ->> 'source', ''), 'manual')::public.quote_source, nullif(g ->> 'source_ref', ''),
      g -> 'source_raw', btrim(g ->> 'guest_name'), v_phone, v_venue, v_sub_venue,
      (g ->> 'event_date')::date, v_session, v_function, v_first_pkg, v_names, v_tiers,
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
      package_id = v_first_pkg, package_name = v_names, package_tier = v_tiers,
      elements_subtotal = v_subtotal, charges_total = v_charges_t, final_total = v_subtotal + v_charges_t,
      notes = nullif(btrim(coalesce(p_payload ->> 'notes', '')), '')
    where id = v_quote_id;
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
    select v_uid, v_quote_id, v_qp_id, e.id, e.name, e.unit, e.image_path, e.default_rate,
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
