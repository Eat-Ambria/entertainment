-- =============================================================================
-- 0025_fill_missing_costs.sql — quote lines with a MISSING cost pick it up later.
--
-- A quote line's cost is locked when the quote is saved. If the element had no cost then
-- (no unit cost, no vendor rate), the line stays "Cost missing" and the quote is left out
-- of the P&L totals. Now:
--   * setting an element's unit cost, or logging a vendor rate for it, fills its missing
--     lines straight away (all quotes, any status — only the internal cost is written;
--     the guest's rate, amount and totals never change);
--   * every missing line today is filled once by this migration.
-- A cost that is already locked is never changed.
-- Vendor rates count if bought on or before the event date (or today if there is none).
-- Safe to re-run (idempotent).
-- =============================================================================

-- ---------- Guard: allow filling a missing cost on frozen quotes ---------------------
create or replace function public.quote_children_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status public.quote_status;
  v_quote  uuid := coalesce(new.quote_id, old.quote_id);
  v_keys   text[] := array['element_id', 'package_id', 'unit_cost_at_quote', 'cost_source'];
begin
  if tg_op = 'UPDATE' and (to_jsonb(new) - v_keys) = (to_jsonb(old) - v_keys) then
    -- Element/package links cleared by ON DELETE SET NULL; snapshots untouched.
    if (to_jsonb(new) -> 'unit_cost_at_quote') is not distinct from (to_jsonb(old) -> 'unit_cost_at_quote')
       and (to_jsonb(new) -> 'cost_source') is not distinct from (to_jsonb(old) -> 'cost_source') then
      return new;
    end if;
    -- Filling a cost that was missing (internal only — the guest's numbers don't change).
    if (to_jsonb(old) ->> 'unit_cost_at_quote') is null then
      return new;
    end if;
  end if;
  select status into v_status from public.quotes where id = v_quote;
  if v_status in ('confirmed', 'cancelled') then
    raise exception 'Quote is % — its lines are frozen.', v_status;
  end if;
  return coalesce(new, old);
end;
$$;

-- ---------- Fill missing costs ---------------------------------------------------
create or replace function public.fill_missing_quote_costs(p_owner uuid, p_element_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_n     integer;
begin
  update public.quote_items qi
     set unit_cost_at_quote = c.unit_cost, cost_source = c.source
    from (
      select x.id, ec.unit_cost, ec.source
        from public.quote_items x
        join public.quotes q on q.id = x.quote_id
        cross join lateral public.element_cost(x.element_id, least(v_today, coalesce(q.event_date, v_today))) ec
       where x.owner_id = p_owner
         and x.unit_cost_at_quote is null
         and x.element_id is not null
         and (p_element_id is null or x.element_id = p_element_id)
         and ec.unit_cost is not null
    ) c
   where c.id = qi.id;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.fill_missing_quote_costs(uuid, uuid) from public, anon, authenticated;

create or replace function public.elements_fill_missing_costs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.unit_cost is not null and new.unit_cost is distinct from old.unit_cost then
    perform public.fill_missing_quote_costs(new.owner_id, new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.elements_fill_missing_costs() from public, anon, authenticated;
drop trigger if exists elements_fill_missing_costs on public.elements;
create trigger elements_fill_missing_costs after update of unit_cost on public.elements
  for each row execute function public.elements_fill_missing_costs();

create or replace function public.vendor_rates_fill_missing_costs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fill_missing_quote_costs(new.owner_id, new.element_id);
  return new;
end;
$$;
revoke all on function public.vendor_rates_fill_missing_costs() from public, anon, authenticated;
drop trigger if exists vendor_rates_fill_missing_costs on public.vendor_rate_entries;
create trigger vendor_rates_fill_missing_costs after insert on public.vendor_rate_entries
  for each row execute function public.vendor_rates_fill_missing_costs();

-- ---------- Fill what is missing today ---------------------------------------------
select public.fill_missing_quote_costs(p.id) from public.profiles p;
