-- =============================================================================
-- 0019_charge_venue_rates.sql — Additional charge rates per venue.
--
-- A venue row overrides the default rate in charge_rates for quotes at that venue
-- (e.g. Transportation ₹2,000 at Exotica, ₹3,500 at Pushpanjali). For Labour the venue
-- row can also override "labour per package" (null = use the default).
-- No row for a venue → the default applies. A venue rate of ₹0 = not charged there.
--
-- save_charge_rate(...) saves the default and every venue row in one transaction.
-- Safe to re-run (idempotent).
-- =============================================================================

-- Composite FK target so venue rows can only point at the owner's own charge rate.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'charge_rates_owner_id_id_key') then
    alter table public.charge_rates add constraint charge_rates_owner_id_id_key unique (owner_id, id);
  end if;
end $$;

create table if not exists public.charge_venue_rates (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  charge_rate_id  uuid not null,
  venue_id        uuid not null,
  rate            numeric(12, 2) not null check (rate >= 0 and rate <= 100000000),
  qty_per_package numeric(10, 2) check (qty_per_package is null or (qty_per_package > 0 and qty_per_package <= 10000)),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (owner_id, charge_rate_id, venue_id),
  constraint charge_venue_rates_charge_fkey foreign key (owner_id, charge_rate_id)
    references public.charge_rates (owner_id, id) on delete cascade,
  constraint charge_venue_rates_venue_fkey foreign key (owner_id, venue_id)
    references public.venues (owner_id, id) on delete cascade
);

drop trigger if exists set_updated_at on public.charge_venue_rates;
create trigger set_updated_at before update on public.charge_venue_rates
  for each row execute function public.set_updated_at();

drop trigger if exists charge_venue_rates_rate_limit on public.charge_venue_rates;
create trigger charge_venue_rates_rate_limit before insert or update on public.charge_venue_rates
  for each row execute function public.rate_limit_writes('charge_rates_write', '120', '60');

alter table public.charge_venue_rates enable row level security;
revoke all on public.charge_venue_rates from anon, authenticated;
grant select, insert, update, delete on public.charge_venue_rates to authenticated;
drop policy if exists own_select on public.charge_venue_rates;
drop policy if exists own_insert on public.charge_venue_rates;
drop policy if exists own_update on public.charge_venue_rates;
drop policy if exists own_delete on public.charge_venue_rates;
create policy own_select on public.charge_venue_rates for select to authenticated using (owner_id = (select auth.uid()));
create policy own_insert on public.charge_venue_rates for insert to authenticated with check (owner_id = (select auth.uid()));
create policy own_update on public.charge_venue_rates for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy own_delete on public.charge_venue_rates for delete to authenticated using (owner_id = (select auth.uid()));

-- ---------- Save a charge's default + venue rates in one go -------------------
-- p_venues: [{ "venue_id": uuid, "rate": number, "qty_per_package": number|null }, ...]
-- Venues left out of the list go back to the default. Runs as the caller (RLS applies).
create or replace function public.save_charge_rate(
  p_id              uuid,
  p_rate            numeric,
  p_qty_per_package numeric,
  p_venues          jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if jsonb_typeof(coalesce(p_venues, '[]'::jsonb)) <> 'array' then
    raise exception 'p_venues must be an array' using errcode = '22023';
  end if;

  update public.charge_rates
     set rate = p_rate,
         qty_per_package = coalesce(p_qty_per_package, qty_per_package)
   where id = p_id;
  if not found then
    raise exception 'Charge rate not found' using errcode = 'P0002';
  end if;

  delete from public.charge_venue_rates where charge_rate_id = p_id;

  insert into public.charge_venue_rates (charge_rate_id, venue_id, rate, qty_per_package)
  select p_id, (v ->> 'venue_id')::uuid, (v ->> 'rate')::numeric, nullif(v ->> 'qty_per_package', '')::numeric
  from jsonb_array_elements(coalesce(p_venues, '[]'::jsonb)) v;
end;
$$;

revoke all on function public.save_charge_rate(uuid, numeric, numeric, jsonb) from public, anon;
grant execute on function public.save_charge_rate(uuid, numeric, numeric, jsonb) to authenticated;
