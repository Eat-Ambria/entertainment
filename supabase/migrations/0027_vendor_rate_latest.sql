-- =============================================================================
-- 0027_vendor_rate_latest.sql — simple "old → new" view of vendor purchase rates.
--
-- One row per element + vendor: the latest purchase (new rate) and the one before it
-- (old rate), how many purchases there are, and whether the rate went up or down.
-- Voided entries are ignored. The full list stays in vendor_rate_history.
-- Safe to re-run (idempotent).
-- =============================================================================

create or replace view public.vendor_rate_latest
with (security_invoker = true) as
with ranked as (
  select
    r.*,
    row_number() over w                          as rn,
    lead(r.rate_per_unit) over w                  as old_rate,
    lead(r.purchase_date) over w                  as old_date,
    count(*) over (partition by r.owner_id, r.element_id, r.vendor_id) as purchases
  from public.vendor_rate_entries r
  where r.voided_at is null
  window w as (partition by r.owner_id, r.element_id, r.vendor_id order by r.purchase_date desc, r.logged_at desc, r.id desc)
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
