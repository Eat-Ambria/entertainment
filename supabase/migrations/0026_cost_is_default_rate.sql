-- =============================================================================
-- 0026_cost_is_default_rate.sql — the element's Default rate IS the cost.
--
-- The guest pays rate × multiplier (elements.selling_rate, 0023); the Default rate before
-- the multiplier is what it costs us. So for P&L:
--   cost per unit = elements.default_rate   (cost_source 'base_rate')
-- The separate "unit cost" and vendor purchase rates are no longer used for P&L (vendor
-- rates stay as purchase history). Cost is still locked on each quote line when saved.
--
-- At the user's request every saved quote line is re-costed once from its element's
-- current Default rate (internal only — the guest's rate, amounts and totals don't change).
-- Lines whose element was deleted keep what they had.
-- Safe to re-run (idempotent).
-- =============================================================================

alter table public.quote_items drop constraint if exists quote_items_cost_source_check;
alter table public.quote_items add constraint quote_items_cost_source_check
  check (cost_source is null or cost_source in ('fixed', 'vendor', 'base_rate'));

-- Used when a quote line is saved (quote_items_lock_cost) and to fill missing costs.
create or replace function public.element_cost(p_element_id uuid, p_on date)
returns table (unit_cost numeric, source text)
language sql
stable
set search_path = ''
as $$
  select e.default_rate, 'base_rate'::text
    from public.elements e
   where e.id = p_element_id;
$$;

-- The unit cost / vendor rate no longer decide the cost, so these triggers go.
drop trigger if exists elements_fill_missing_costs on public.elements;
drop trigger if exists vendor_rates_fill_missing_costs on public.vendor_rate_entries;

-- Re-cost every saved line once (frozen quotes included — internal cost only).
alter table public.quote_items disable trigger quote_items_guard;
update public.quote_items qi
   set unit_cost_at_quote = e.default_rate, cost_source = 'base_rate'
  from public.elements e
 where e.id = qi.element_id and e.owner_id = qi.owner_id
   and (qi.unit_cost_at_quote is distinct from e.default_rate or qi.cost_source is distinct from 'base_rate');
alter table public.quote_items enable trigger quote_items_guard;
