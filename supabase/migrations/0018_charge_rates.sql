-- =============================================================================
-- 0018_charge_rates.sql — master rates for Additional charges (per user).
--
-- The Studio pre-adds these charges to every new quote:
--   * fixed        → amount = rate                         (Transportation)
--   * per_package  → amount = rate × qty_per_package × number of packages
--                    (Labour: 2 labour per package × ₹500)
-- Staff can still change the amount on a quote ("Adjust rates") or remove the line.
-- The quote keeps only description + amount (snapshot), so changing a rate here never
-- changes saved quotes.
--
-- Defaults for every user: Transportation ₹0 (set it in My Workspace → Settings —
-- it is only added once above ₹0) and Labour 2 per package × ₹500.
-- Safe to re-run (idempotent).
-- =============================================================================

create table if not exists public.charge_rates (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  code            text not null check (code ~ '^[a-z_]{2,40}$'),
  label           text not null check (length(btrim(label)) between 1 and 60),
  mode            text not null check (mode in ('fixed', 'per_package')),
  rate            numeric(12, 2) not null default 0 check (rate >= 0 and rate <= 100000000),
  qty_per_package numeric(10, 2) not null default 1 check (qty_per_package > 0 and qty_per_package <= 10000),
  auto_add        boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (owner_id, code)
);

drop trigger if exists set_updated_at on public.charge_rates;
create trigger set_updated_at before update on public.charge_rates
  for each row execute function public.set_updated_at();

drop trigger if exists charge_rates_rate_limit on public.charge_rates;
create trigger charge_rates_rate_limit before insert or update on public.charge_rates
  for each row execute function public.rate_limit_writes('charge_rates_write', '60', '60');

-- Owner and code never change (the Studio links quote lines to the code).
create or replace function public.charge_rates_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id <> old.owner_id or new.code <> old.code or new.mode <> old.mode then
    raise exception 'owner, code and mode of a charge rate cannot change';
  end if;
  return new;
end;
$$;

drop trigger if exists charge_rates_guard on public.charge_rates;
create trigger charge_rates_guard before update on public.charge_rates
  for each row execute function public.charge_rates_guard();

-- Read + edit own rows only (the defaults are seeded; no insert/delete from the app).
alter table public.charge_rates enable row level security;
revoke all on public.charge_rates from anon, authenticated;
grant select, update on public.charge_rates to authenticated;
drop policy if exists own_select on public.charge_rates;
drop policy if exists own_update on public.charge_rates;
create policy own_select on public.charge_rates for select to authenticated using (owner_id = (select auth.uid()));
create policy own_update on public.charge_rates for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- ---------- Defaults --------------------------------------------------------
create or replace function public.seed_default_charge_rates(p_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.charge_rates (owner_id, code, label, mode, rate, qty_per_package, sort_order)
  values
    (p_owner, 'transportation', 'Transportation', 'fixed', 0, 1, 1),
    (p_owner, 'labour', 'Labour', 'per_package', 500, 2, 2)
  on conflict (owner_id, code) do nothing;
end;
$$;

revoke all on function public.seed_default_charge_rates(uuid) from public, anon, authenticated;

-- New users get them too (same body as 0003 plus the charge rates).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
begin
  v_phone := coalesce(
    public.normalize_phone(new.phone),
    case when new.email ilike '%@phone.invalid' then public.normalize_phone(split_part(new.email, '@', 1)) end
  );

  insert into public.profiles (id, phone, full_name, must_change_password)
  values (new.id, v_phone, nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), true)
  on conflict (id) do nothing;

  perform public.seed_default_options(new.id);
  perform public.seed_default_charge_rates(new.id);
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Existing users.
select public.seed_default_charge_rates(p.id) from public.profiles p;
