-- =============================================================================
-- 0012_ledger.sql — Rate History support.
-- * vendor_rate_history view: each vendor purchase entry with element/vendor names and
--   its trend vs the previous (non-voided) purchase of the same element, ordered by
--   purchase date: 'new' (first), 'up', 'down', 'same'. Voided entries are listed with
--   trend 'void' and are ignored when computing others' trends.
-- * Write rate limits on vendors and vendor purchase entries (60 / minute / user).
-- Safe to re-run (idempotent).
-- =============================================================================

-- ---------- Generic per-user write limit trigger ----------------------------
-- Usage: ... execute function public.rate_limit_writes('<action>', '<limit>', '<window seconds>')
create or replace function public.rate_limit_writes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    perform public.enforce_rate_limit(tg_argv[0], tg_argv[1]::integer, tg_argv[2]::integer);
  end if;
  return new;
end;
$$;

drop trigger if exists vendors_rate_limit on public.vendors;
create trigger vendors_rate_limit before insert or update on public.vendors
  for each row execute function public.rate_limit_writes('vendors_write', '60', '60');

drop trigger if exists vendor_rates_rate_limit on public.vendor_rate_entries;
create trigger vendor_rates_rate_limit before insert or update on public.vendor_rate_entries
  for each row execute function public.rate_limit_writes('vendor_rates_write', '60', '60');

-- ---------- Vendor purchase history with trend -------------------------------
create or replace view public.vendor_rate_history
with (security_invoker = true) as
with ordered as (
  select
    r.*,
    lag(r.rate_per_unit) over (
      partition by r.owner_id, r.element_id
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
