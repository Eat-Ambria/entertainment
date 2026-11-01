-- =============================================================================
-- 0015_delete_catalogue.sql — permanently delete elements and packages.
--
-- Saved quotes and history keep their snapshots (names, rates, amounts); only their
-- links back to the deleted row are cleared (ON DELETE SET NULL on the id column).
-- * Package: always deletable. Its element mapping goes with it.
-- * Element: blocked while it is in any package (remove it there first) or has vendor
--   purchase history (cost records — archive instead). Quotes/rate logs keep their copy.
-- Use delete_element() / delete_package() for clear messages.
-- Safe to re-run (idempotent).
-- =============================================================================

-- ---------- Keep history rows when the element/package is deleted -------------
-- Composite FKs: null only the id column (owner_id stays) — needs PostgreSQL 15+.
-- Skipped once 0030 (shared catalogue) has replaced them with plain id FKs.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'packages_tier_id_fkey') then
    return;
  end if;
  alter table public.quote_items drop constraint if exists quote_items_owner_id_element_id_fkey;
  alter table public.quote_items add constraint quote_items_owner_id_element_id_fkey
    foreign key (owner_id, element_id) references public.elements (owner_id, id) on delete set null (element_id);

  alter table public.rate_change_logs drop constraint if exists rate_change_logs_owner_id_element_id_fkey;
  alter table public.rate_change_logs add constraint rate_change_logs_owner_id_element_id_fkey
    foreign key (owner_id, element_id) references public.elements (owner_id, id) on delete set null (element_id);

  alter table public.rate_change_logs drop constraint if exists rate_change_logs_owner_id_package_id_fkey;
  alter table public.rate_change_logs add constraint rate_change_logs_owner_id_package_id_fkey
    foreign key (owner_id, package_id) references public.packages (owner_id, id) on delete set null (package_id);

  alter table public.quotes drop constraint if exists quotes_owner_id_package_id_fkey;
  alter table public.quotes add constraint quotes_owner_id_package_id_fkey
    foreign key (owner_id, package_id) references public.packages (owner_id, id) on delete set null (package_id);

  alter table public.quote_packages drop constraint if exists quote_packages_owner_id_package_id_fkey;
  alter table public.quote_packages add constraint quote_packages_owner_id_package_id_fkey
    foreign key (owner_id, package_id) references public.packages (owner_id, id) on delete set null (package_id);
end $$;

-- package_elements → elements and vendor_rate_entries → elements stay RESTRICT (they block).

-- Frozen (sent/confirmed) quotes must still accept the link being cleared.
create or replace function public.quote_children_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status public.quote_status;
  v_quote  uuid := coalesce(new.quote_id, old.quote_id);
begin
  -- Allow ON DELETE SET NULL on element/package links; snapshots are untouched.
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - array['element_id', 'package_id']) = (to_jsonb(old) - array['element_id', 'package_id']) then
    return new;
  end if;
  select status into v_status from public.quotes where id = v_quote;
  if v_status is not null and v_status <> 'draft' then
    raise exception 'Quote is % — its lines are frozen.', v_status;
  end if;
  return coalesce(new, old);
end;
$$;

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
    -- package_id may be cleared when the package is deleted; the snapshot stays.
    if (to_jsonb(new) - array['status', 'notes', 'updated_at', 'package_id'])
       <> (to_jsonb(old) - array['status', 'notes', 'updated_at', 'package_id'])
       or (new.package_id is not null and new.package_id is distinct from old.package_id) then
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

-- ---------- Owners may delete their own elements/packages ----------------------
grant delete on public.elements, public.packages to authenticated;
drop policy if exists own_delete on public.elements;
drop policy if exists own_delete on public.packages;
create policy own_delete on public.elements for delete to authenticated using (owner_id = (select auth.uid()));
create policy own_delete on public.packages for delete to authenticated using (owner_id = (select auth.uid()));

-- ---------- RPCs with clear messages ----------------------------------------------
create or replace function public.delete_element(p_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_image text;
  v_pkgs  integer;
  v_rates integer;
begin
  select image_path into v_image from public.elements where id = p_id;
  if not found then
    raise exception 'Element not found.' using errcode = 'P0002';
  end if;
  select count(*) into v_pkgs from public.package_elements where element_id = p_id;
  if v_pkgs > 0 then
    raise exception 'This element is in % package(s). Remove it from those packages first, or archive it.', v_pkgs
      using errcode = '23503', hint = 'in_packages';
  end if;
  select count(*) into v_rates from public.vendor_rate_entries where element_id = p_id;
  if v_rates > 0 then
    raise exception 'This element has vendor purchase history, which is kept for cost records. Archive it instead.'
      using errcode = '23503', hint = 'has_vendor_rates';
  end if;
  delete from public.elements where id = p_id;
  return jsonb_build_object('image_path', v_image);
end;
$$;

create or replace function public.delete_package(p_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_image text;
begin
  select image_path into v_image from public.packages where id = p_id;
  if not found then
    raise exception 'Package not found.' using errcode = 'P0002';
  end if;
  delete from public.packages where id = p_id; -- package_elements cascade
  return jsonb_build_object('image_path', v_image);
end;
$$;

revoke all on function public.delete_element(uuid) from public, anon;
revoke all on function public.delete_package(uuid) from public, anon;
grant execute on function public.delete_element(uuid) to authenticated;
grant execute on function public.delete_package(uuid) to authenticated;
