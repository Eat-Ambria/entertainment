-- =============================================================================
-- 0004_catalogue.sql — elements, packages, package-element mapping, vendors,
-- vendor purchase rates. All per user (owner_id); composite FKs stop a row from
-- pointing at another user's data.
-- Packages deliberately have NO function column — packages are function-independent.
-- Safe to re-run (idempotent).
-- =============================================================================

-- ---------- Elements --------------------------------------------------------
create table if not exists public.elements (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 120),
  unit         text check (unit is null or length(unit) <= 30),
  default_rate numeric(12, 2) not null check (default_rate >= 0),
  default_qty  numeric(10, 2) check (default_qty is null or default_qty > 0),
  image_path   text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (owner_id, id)
);
-- Name unique among a user's active elements (archived ones may repeat).
create unique index if not exists elements_owner_active_name_uq
  on public.elements (owner_id, lower(name)) where is_active;
create index if not exists elements_owner_active_name_idx on public.elements (owner_id, is_active, name);
create index if not exists elements_name_trgm_idx on public.elements using gin (name extensions.gin_trgm_ops);

-- ---------- Packages --------------------------------------------------------
create table if not exists public.packages (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null check (length(btrim(name)) between 1 and 120),
  tier_id       uuid not null,
  display_price numeric(12, 2) check (display_price is null or display_price >= 0),
  description   text check (description is null or length(description) <= 1000),
  image_path    text,
  video_url     text check (video_url is null or video_url ~* '^https?://[^\s]+$'),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (owner_id, id),
  foreign key (owner_id, tier_id) references public.tiers (owner_id, id)
);
create unique index if not exists packages_owner_active_name_tier_uq
  on public.packages (owner_id, lower(name), tier_id) where is_active;
create index if not exists packages_owner_active_idx on public.packages (owner_id, is_active, name);

-- ---------- Package ↔ element mapping --------------------------------------
create table if not exists public.package_elements (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  package_id  uuid not null,
  element_id  uuid not null,
  default_qty numeric(10, 2) not null default 1 check (default_qty > 0),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (package_id, element_id),
  foreign key (owner_id, package_id) references public.packages (owner_id, id) on delete cascade,
  foreign key (owner_id, element_id) references public.elements (owner_id, id)
);
create index if not exists package_elements_owner_package_idx on public.package_elements (owner_id, package_id, sort_order);
create index if not exists package_elements_element_idx on public.package_elements (owner_id, element_id);

-- ---------- Vendors ---------------------------------------------------------
create table if not exists public.vendors (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name           text not null check (length(btrim(name)) between 1 and 120),
  contact_person text check (contact_person is null or length(contact_person) <= 120),
  phone          text check (phone is null or length(phone) <= 20),
  notes          text check (notes is null or length(notes) <= 1000),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (owner_id, id)
);
create unique index if not exists vendors_owner_active_name_uq
  on public.vendors (owner_id, lower(name)) where is_active;

-- ---------- Vendor purchase rates (append-only; correct by voiding) ----------
create table if not exists public.vendor_rate_entries (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  element_id    uuid not null,
  vendor_id     uuid not null,
  purchase_date date not null,
  qty           numeric(10, 3) not null check (qty > 0),
  unit          text check (unit is null or length(unit) <= 30),
  rate_per_unit numeric(12, 2) not null check (rate_per_unit >= 0),
  remarks       text check (remarks is null or length(remarks) <= 500),
  logged_by     uuid not null default auth.uid() references auth.users (id),
  logged_at     timestamptz not null default now(),
  voided_at     timestamptz,
  void_reason   text,
  check ((voided_at is null) = (void_reason is null)),
  check (purchase_date <= (logged_at at time zone 'Asia/Kolkata')::date),
  unique (owner_id, id),
  foreign key (owner_id, element_id) references public.elements (owner_id, id),
  foreign key (owner_id, vendor_id) references public.vendors (owner_id, id)
);
-- Keyset pagination + trend lookups: latest entries per element by purchase date.
create index if not exists vendor_rates_owner_element_date_idx
  on public.vendor_rate_entries (owner_id, element_id, purchase_date desc, logged_at desc, id);
create index if not exists vendor_rates_owner_logged_idx
  on public.vendor_rate_entries (owner_id, logged_at desc, id);

-- Void instead of edit/delete. The only way to change an entry.
create or replace function public.void_vendor_rate_entry(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A reason is required to void an entry.';
  end if;
  update public.vendor_rate_entries
     set voided_at = now(), void_reason = btrim(p_reason)
   where id = p_id and owner_id = auth.uid() and voided_at is null;
  if not found then
    raise exception 'Entry not found or already voided.';
  end if;
end;
$$;
revoke all on function public.void_vendor_rate_entry(uuid, text) from public, anon;
grant execute on function public.void_vendor_rate_entry(uuid, text) to authenticated;

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['elements', 'packages', 'package_elements', 'vendors'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
