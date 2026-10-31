-- =============================================================================
-- 0010_packages.sql — package save RPC (package + element mapping in one
-- transaction), list view with element count/total, write rate limit.
-- Packages stay function-independent: nothing here references functions.
-- Safe to re-run (idempotent).
-- =============================================================================

-- ---------- Rate limit on package writes ------------------------------------
create or replace function public.packages_rate_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    perform public.enforce_rate_limit('packages_write', 60, 60);
  end if;
  return new;
end;
$$;
drop trigger if exists packages_rate_limit on public.packages;
create trigger packages_rate_limit before insert or update on public.packages
  for each row execute function public.packages_rate_limit();

-- ---------- List view --------------------------------------------------------
-- security_invoker: the caller's RLS applies to every table in the view.
create or replace view public.package_summaries
with (security_invoker = true) as
select
  p.id,
  p.owner_id,
  p.name,
  p.tier_id,
  t.name       as tier_name,
  t.sort_order as tier_sort,
  p.display_price,
  p.description,
  p.image_path,
  p.video_url,
  p.is_active,
  p.created_at,
  p.updated_at,
  count(pe.id)::integer as element_count,
  coalesce(sum(round(pe.default_qty * e.default_rate, 2)), 0)::numeric(14, 2) as elements_total
from public.packages p
join public.tiers t on t.id = p.tier_id
left join public.package_elements pe on pe.package_id = p.id
left join public.elements e on e.id = pe.element_id
group by p.id, t.id;

revoke all on public.package_summaries from anon, authenticated;
grant select on public.package_summaries to authenticated;

-- ---------- Save package + elements atomically --------------------------------
-- p_items: [{ "element_id": uuid, "default_qty": number, "sort_order": int? }, ...]
-- security invoker: RLS + composite FKs keep everything inside the caller's data.
create or replace function public.save_package(
  p_id            uuid,
  p_name          text,
  p_tier_id       uuid,
  p_display_price numeric,
  p_description   text,
  p_image_path    text,
  p_video_url     text,
  p_is_active     boolean,
  p_items         jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one element to the package.' using errcode = '23514';
  end if;

  if (select count(*) from jsonb_array_elements(p_items))
     <> (select count(distinct e ->> 'element_id') from jsonb_array_elements(p_items) e) then
    raise exception 'Each element can be added only once.' using errcode = '23514';
  end if;

  if p_id is null then
    insert into public.packages (name, tier_id, display_price, description, image_path, video_url, is_active)
    values (btrim(p_name), p_tier_id, p_display_price, nullif(btrim(coalesce(p_description, '')), ''),
            p_image_path, nullif(btrim(coalesce(p_video_url, '')), ''), coalesce(p_is_active, true))
    returning id into v_id;
  else
    update public.packages
       set name          = btrim(p_name),
           tier_id       = p_tier_id,
           display_price = p_display_price,
           description   = nullif(btrim(coalesce(p_description, '')), ''),
           image_path    = p_image_path,
           video_url     = nullif(btrim(coalesce(p_video_url, '')), ''),
           is_active     = coalesce(p_is_active, is_active)
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Package not found.' using errcode = 'P0002';
    end if;
  end if;

  -- Archived elements may stay in a package they were already in, but can't be newly added.
  if exists (
    select 1
    from jsonb_array_elements(p_items) e
    join public.elements el on el.id = (e ->> 'element_id')::uuid
    where not el.is_active
      and not exists (
        select 1 from public.package_elements pe where pe.package_id = v_id and pe.element_id = el.id
      )
  ) then
    raise exception 'Archived elements can''t be added to a package.' using errcode = '23514';
  end if;

  delete from public.package_elements pe
   where pe.package_id = v_id
     and pe.element_id not in (select (e ->> 'element_id')::uuid from jsonb_array_elements(p_items) e);

  insert into public.package_elements (package_id, element_id, default_qty, sort_order)
  select v_id,
         (t.e ->> 'element_id')::uuid,
         (t.e ->> 'default_qty')::numeric,
         coalesce((t.e ->> 'sort_order')::integer, t.ord::integer)
  from jsonb_array_elements(p_items) with ordinality as t(e, ord)
  on conflict (package_id, element_id)
  do update set default_qty = excluded.default_qty, sort_order = excluded.sort_order;

  return v_id;
end;
$$;
revoke all on function public.save_package(uuid, text, uuid, numeric, text, text, text, boolean, jsonb) from public, anon;
grant execute on function public.save_package(uuid, text, uuid, numeric, text, text, text, boolean, jsonb) to authenticated;
