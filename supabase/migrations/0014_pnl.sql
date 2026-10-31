-- =============================================================================
-- 0014_pnl.sql — cost tracking and Profit & Loss.
--
-- Cost rules (agreed with the owner, 26 Oct 2026):
-- * Unit cost of an element = its fixed `unit_cost` if set, otherwise the latest
--   non-voided vendor purchase rate on or before the date (by purchase date).
--   Neither -> unknown. Unknown cost is NEVER treated as zero.
-- * Cost is locked when the quote is saved (quote_items.unit_cost_at_quote + cost_source).
-- * Additional charges are pass-through: cost = amount, profit 0.
-- * Margin % = profit / elements selling × 100 (null when selling is 0 or cost unknown).
-- Safe to re-run (idempotent).
-- =============================================================================

alter table public.elements add column if not exists unit_cost numeric(12, 2)
  check (unit_cost is null or unit_cost >= 0);

alter table public.quote_items add column if not exists cost_source text
  check (cost_source is null or cost_source in ('fixed', 'vendor'));

-- ---------- Cost resolution ----------------------------------------------------
create or replace function public.element_cost(p_element_id uuid, p_on date)
returns table (unit_cost numeric, source text)
language sql
stable
set search_path = ''
as $$
  select coalesce(e.unit_cost, v.rate_per_unit),
         case when e.unit_cost is not null then 'fixed' when v.rate_per_unit is not null then 'vendor' end
    from public.elements e
    left join lateral (
      select r.rate_per_unit
        from public.vendor_rate_entries r
       where r.owner_id = e.owner_id and r.element_id = e.id and r.voided_at is null
         and r.purchase_date <= p_on
       order by r.purchase_date desc, r.logged_at desc, r.id desc
       limit 1
    ) v on true
   where e.id = p_element_id;
$$;
grant execute on function public.element_cost(uuid, date) to authenticated;

-- ---------- Lock cost when a quote line is written ------------------------------
create or replace function public.quote_items_lock_cost()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c      record;
  v_on   date := (now() at time zone 'Asia/Kolkata')::date;
  v_evt  date;
begin
  if new.element_id is not null and new.unit_cost_at_quote is null then
    -- Rates known at save time, and not later than the event itself.
    select event_date into v_evt from public.quotes where id = new.quote_id;
    if v_evt is not null and v_evt < v_on then
      v_on := v_evt;
    end if;
    select * into c from public.element_cost(new.element_id, v_on);
    new.unit_cost_at_quote := c.unit_cost;
    new.cost_source := c.source;
  end if;
  return new;
end;
$$;
drop trigger if exists quote_items_lock_cost on public.quote_items;
create trigger quote_items_lock_cost before insert on public.quote_items
  for each row execute function public.quote_items_lock_cost();

-- Back-fill quotes saved before cost tracking, using the cost as of the quote's creation day.
alter table public.quote_items disable trigger quote_items_guard;
update public.quote_items qi
   set unit_cost_at_quote = c.unit_cost, cost_source = c.source
  from (
    select x.id, ec.unit_cost, ec.source
      from public.quote_items x
      join public.quotes q on q.id = x.quote_id
      cross join lateral public.element_cost(
        x.element_id, least((q.created_at at time zone 'Asia/Kolkata')::date, coalesce(q.event_date, 'infinity'::date))
      ) ec
     where x.unit_cost_at_quote is null and x.cost_source is null and x.element_id is not null
  ) c
 where c.id = qi.id;
alter table public.quote_items enable trigger quote_items_guard;

-- ---------- update_element now also takes the unit cost ------------------------
drop function if exists public.update_element(uuid, text, text, numeric, numeric, text, text);
create or replace function public.update_element(
  p_id           uuid,
  p_name         text,
  p_unit         text,
  p_default_rate numeric,
  p_default_qty  numeric,
  p_image_path   text,
  p_unit_cost    numeric,
  p_reason       text default null
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
         unit_cost    = p_unit_cost
   where id = p_id
  returning * into v;
  perform set_config('app.rate_change_reason', '', true);
  if v.id is null then
    raise exception 'Element not found.' using errcode = 'P0002';
  end if;
  return v;
end;
$$;
revoke all on function public.update_element(uuid, text, text, numeric, numeric, text, numeric, text) from public, anon;
grant execute on function public.update_element(uuid, text, text, numeric, numeric, text, numeric, text) to authenticated;

-- ---------- P&L views ------------------------------------------------------------
-- One row per included quote line.
create or replace view public.quote_item_pnl
with (security_invoker = true) as
select
  qi.id,
  qi.owner_id,
  qi.quote_id,
  qi.quote_package_id,
  qi.element_name,
  qi.unit,
  qi.qty,
  qi.rate,
  qi.amount                                   as selling,
  qi.unit_cost_at_quote                       as unit_cost,
  qi.cost_source,
  round(qi.qty * qi.unit_cost_at_quote, 2)    as cost,
  qi.amount - round(qi.qty * qi.unit_cost_at_quote, 2) as profit,
  case when qi.amount > 0 and qi.unit_cost_at_quote is not null
       then round((qi.amount - round(qi.qty * qi.unit_cost_at_quote, 2)) / qi.amount * 100, 2) end as margin_pct,
  qi.sort_order
from public.quote_items qi
where qi.is_included;

-- One row per quote. Costs/profit are null while any included line has no cost.
create or replace view public.quote_pnl
with (security_invoker = true) as
select
  q.id,
  q.owner_id,
  q.quote_no,
  q.status,
  q.created_at,
  q.event_date,
  q.guest_name,
  q.function_name,
  q.package_name,
  q.elements_subtotal                                   as elements_selling,
  q.charges_total,
  q.final_total,
  coalesce(l.known_cost, 0)                             as known_cost,
  coalesce(l.missing, 0)::integer                       as missing_cost_lines,
  case when coalesce(l.missing, 0) = 0 then coalesce(l.known_cost, 0) end as elements_cost,
  case when coalesce(l.missing, 0) = 0 then q.elements_subtotal - coalesce(l.known_cost, 0) end as profit,
  case when coalesce(l.missing, 0) = 0 and q.elements_subtotal > 0
       then round((q.elements_subtotal - coalesce(l.known_cost, 0)) / q.elements_subtotal * 100, 2) end as margin_pct
from public.quotes q
left join lateral (
  select sum(round(qi.qty * qi.unit_cost_at_quote, 2)) filter (where qi.unit_cost_at_quote is not null) as known_cost,
         count(*) filter (where qi.unit_cost_at_quote is null) as missing
    from public.quote_items qi
   where qi.quote_id = q.id and qi.is_included
) l on true;

revoke all on public.quote_item_pnl, public.quote_pnl from anon, authenticated;
grant select on public.quote_item_pnl, public.quote_pnl to authenticated;

-- ---------- Totals for the report header (respects RLS: security invoker) --------
create or replace function public.pnl_totals(
  p_statuses   public.quote_status[] default array['confirmed']::public.quote_status[],
  p_from       date default null,
  p_to         date default null,
  p_function   text default null,
  p_package_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with f as (
    select p.*
      from public.quote_pnl p
     where p.status = any (p_statuses)
       and (p_from is null or p.event_date >= p_from)
       and (p_to is null or p.event_date <= p_to)
       and (p_function is null or p.function_name = p_function)
       and (p_package_id is null or exists (
             select 1 from public.quote_packages qp where qp.quote_id = p.id and qp.package_id = p_package_id))
  )
  select jsonb_build_object(
    'quotes',            count(*),
    'complete_quotes',   count(*) filter (where missing_cost_lines = 0),
    'incomplete_quotes', count(*) filter (where missing_cost_lines > 0),
    'elements_selling',  coalesce(sum(elements_selling) filter (where missing_cost_lines = 0), 0),
    'elements_cost',     coalesce(sum(elements_cost) filter (where missing_cost_lines = 0), 0),
    'profit',            coalesce(sum(profit) filter (where missing_cost_lines = 0), 0),
    'margin_pct',        case when coalesce(sum(elements_selling) filter (where missing_cost_lines = 0), 0) > 0
                              then round(sum(profit) filter (where missing_cost_lines = 0)
                                         / sum(elements_selling) filter (where missing_cost_lines = 0) * 100, 2) end,
    'charges_total',     coalesce(sum(charges_total), 0),
    'all_selling',       coalesce(sum(elements_selling), 0)
  )
  from f;
$$;
revoke all on function public.pnl_totals(public.quote_status[], date, date, text, uuid) from public, anon;
grant execute on function public.pnl_totals(public.quote_status[], date, date, text, uuid) to authenticated;
