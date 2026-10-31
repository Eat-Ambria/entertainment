-- =============================================================================
-- 0005_quotes_ledger.sql — quotes (with snapshots), items, charges, per-user
-- quote numbers, rate change history, audit log.
--
-- Snapshots: quotes copy names/rates at save time, so later edits to elements,
-- packages or options never change a saved quote.
-- Once a quote leaves 'draft', its items, charges and amounts are frozen.
-- Safe to re-run (idempotent).
-- =============================================================================

-- ---------- Per-user quote numbers: ENT-2026-00001 --------------------------
create table if not exists public.quote_counters (
  owner_id uuid    not null default auth.uid() references auth.users (id) on delete cascade,
  year     integer not null,
  last_no  integer not null default 0,
  primary key (owner_id, year)
);

create or replace function public.next_quote_no()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_year integer := extract(year from (now() at time zone 'Asia/Kolkata'))::integer;
  v_no   integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  insert into public.quote_counters as c (owner_id, year, last_no)
  values (v_uid, v_year, 1)
  on conflict (owner_id, year) do update set last_no = c.last_no + 1
  returning last_no into v_no;
  return format('ENT-%s-%s', v_year, lpad(v_no::text, 5, '0'));
end;
$$;
revoke all on function public.next_quote_no() from public, anon, authenticated;

-- ---------- Quotes ----------------------------------------------------------
create table if not exists public.quotes (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quote_no          text not null,
  status            public.quote_status not null default 'draft',
  source            public.quote_source not null default 'manual',
  source_ref        text,
  source_raw        jsonb,
  -- guest / event snapshot
  guest_name        text not null check (length(btrim(guest_name)) between 1 and 120),
  guest_phone       text check (guest_phone is null or guest_phone ~ '^[6-9][0-9]{9}$'),
  venue_name        text,
  sub_venue_name    text,
  event_date        date,
  session_name      text,
  function_name     text not null check (length(btrim(function_name)) between 1 and 80),
  -- package snapshot
  package_id        uuid,
  package_name      text,
  package_tier      text,
  -- totals (recomputed server-side on save)
  elements_subtotal numeric(14, 2) not null default 0 check (elements_subtotal >= 0),
  charges_total     numeric(14, 2) not null default 0 check (charges_total >= 0),
  final_total       numeric(14, 2) not null default 0 check (final_total >= 0),
  notes             text check (notes is null or length(notes) <= 2000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (final_total = elements_subtotal + charges_total),
  unique (owner_id, id),
  unique (owner_id, quote_no),
  foreign key (owner_id, package_id) references public.packages (owner_id, id)
);
create index if not exists quotes_owner_created_idx on public.quotes (owner_id, created_at desc, id);
create index if not exists quotes_owner_status_idx on public.quotes (owner_id, status, created_at desc);
create index if not exists quotes_owner_function_idx on public.quotes (owner_id, function_name);
create index if not exists quotes_owner_package_idx on public.quotes (owner_id, package_id);
create index if not exists quotes_owner_event_date_idx on public.quotes (owner_id, event_date);
create index if not exists quotes_guest_trgm_idx on public.quotes using gin (guest_name extensions.gin_trgm_ops);
create index if not exists quotes_phone_idx on public.quotes (owner_id, guest_phone);

-- ---------- Quote items (snapshot of each element line) ---------------------
create table if not exists public.quote_items (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quote_id             uuid not null,
  element_id           uuid,
  element_name         text not null check (length(btrim(element_name)) between 1 and 120),
  unit                 text,
  image_path           text,
  master_rate_at_quote numeric(12, 2) check (master_rate_at_quote is null or master_rate_at_quote >= 0),
  qty                  numeric(10, 2) not null check (qty > 0),
  rate                 numeric(12, 2) not null check (rate >= 0),
  amount               numeric(14, 2) not null check (amount >= 0),
  is_included          boolean not null default true,
  unit_cost_at_quote   numeric(12, 2) check (unit_cost_at_quote is null or unit_cost_at_quote >= 0),
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  check (amount = round(qty * rate, 2)),
  foreign key (owner_id, quote_id) references public.quotes (owner_id, id),
  foreign key (owner_id, element_id) references public.elements (owner_id, id)
);
create index if not exists quote_items_owner_quote_idx on public.quote_items (owner_id, quote_id, sort_order);
create index if not exists quote_items_element_idx on public.quote_items (owner_id, element_id);

-- ---------- Additional charges ---------------------------------------------
create table if not exists public.quote_charges (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quote_id    uuid not null,
  description text not null check (length(btrim(description)) between 1 and 200),
  amount      numeric(14, 2) not null check (amount >= 0),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  foreign key (owner_id, quote_id) references public.quotes (owner_id, id)
);
create index if not exists quote_charges_owner_quote_idx on public.quote_charges (owner_id, quote_id, sort_order);

-- ---------- Rate change history (append-only) -------------------------------
create table if not exists public.rate_change_logs (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  change_type  public.rate_change_type not null,
  element_id   uuid,
  element_name text not null,
  package_id   uuid,
  quote_id     uuid,
  old_rate     numeric(12, 2) check (old_rate is null or old_rate >= 0),
  new_rate     numeric(12, 2) not null check (new_rate >= 0),
  reason       text check (reason is null or length(reason) <= 500),
  changed_by   uuid not null default auth.uid() references auth.users (id),
  changed_at   timestamptz not null default now(),
  check (change_type <> 'quote_override' or quote_id is not null),
  foreign key (owner_id, element_id) references public.elements (owner_id, id),
  foreign key (owner_id, package_id) references public.packages (owner_id, id),
  foreign key (owner_id, quote_id) references public.quotes (owner_id, id)
);
create index if not exists rate_logs_owner_changed_idx on public.rate_change_logs (owner_id, changed_at desc, id);
create index if not exists rate_logs_owner_element_idx on public.rate_change_logs (owner_id, element_id, changed_at desc);
create index if not exists rate_logs_owner_type_idx on public.rate_change_logs (owner_id, change_type, changed_at desc);

-- ---------- Audit log (append-only, written by triggers) --------------------
create table if not exists public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  table_name text not null,
  row_id     uuid not null,
  action     text not null,
  old_data   jsonb,
  new_data   jsonb,
  actor      uuid default auth.uid(),
  at         timestamptz not null default now()
);
create index if not exists audit_owner_at_idx on public.audit_log (owner_id, at desc, id);
create index if not exists audit_owner_row_idx on public.audit_log (owner_id, table_name, row_id);

-- ---------- Triggers --------------------------------------------------------
-- Quote number is always server-generated.
create or replace function public.quotes_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.quote_no := public.next_quote_no();
  new.status := 'draft';
  return new;
end;
$$;
drop trigger if exists quotes_before_insert on public.quotes;
create trigger quotes_before_insert before insert on public.quotes
  for each row execute function public.quotes_before_insert();

-- After a quote leaves draft only status/notes may change; status moves forward only.
create or replace function public.quotes_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id <> old.owner_id or new.quote_no <> old.quote_no then
    raise exception 'owner and quote number cannot change';
  end if;

  if old.status <> 'draft' then
    if (to_jsonb(new) - array['status', 'notes', 'updated_at'])
       <> (to_jsonb(old) - array['status', 'notes', 'updated_at']) then
      raise exception 'Quote % is % and can no longer be edited.', old.quote_no, old.status;
    end if;
  end if;

  if new.status <> old.status and not (
       (old.status = 'draft' and new.status in ('sent', 'confirmed', 'cancelled'))
    or (old.status = 'sent' and new.status in ('confirmed', 'cancelled'))
    or (old.status = 'confirmed' and new.status = 'cancelled')
  ) then
    raise exception 'Invalid status change: % -> %', old.status, new.status;
  end if;

  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists quotes_before_update on public.quotes;
create trigger quotes_before_update before update on public.quotes
  for each row execute function public.quotes_before_update();

-- Status changes go to the audit log.
create or replace function public.quotes_audit_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.audit_log (owner_id, table_name, row_id, action, old_data, new_data)
    values (new.owner_id, 'quotes', new.id, 'status_change',
            jsonb_build_object('status', old.status), jsonb_build_object('status', new.status));
  end if;
  return new;
end;
$$;
drop trigger if exists quotes_audit_status on public.quotes;
create trigger quotes_audit_status after update on public.quotes
  for each row execute function public.quotes_audit_status();

-- Items and charges can only change while the parent quote is a draft.
create or replace function public.quote_children_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status public.quote_status;
  v_quote  uuid := coalesce(new.quote_id, old.quote_id);
begin
  select status into v_status from public.quotes where id = v_quote;
  if v_status is not null and v_status <> 'draft' then
    raise exception 'Quote is % — its lines are frozen.', v_status;
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists quote_items_guard on public.quote_items;
create trigger quote_items_guard before insert or update or delete on public.quote_items
  for each row execute function public.quote_children_guard();
drop trigger if exists quote_charges_guard on public.quote_charges;
create trigger quote_charges_guard before insert or update or delete on public.quote_charges
  for each row execute function public.quote_children_guard();

revoke all on function public.quotes_before_insert() from public, anon, authenticated;
revoke all on function public.quotes_audit_status() from public, anon, authenticated;
