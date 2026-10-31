-- =============================================================================
-- 0024_package_functions.sql — which functions a package is meant for (optional).
--
-- * A package can be tagged with one or more functions (Wedding, Sangeet…), or none.
--   No function = usable for any function.
-- * The Guest Studio still shows EVERY active package — never hidden by function — but
--   packages tagged with the guest's function come first; everything else follows under
--   "Other packages" (studio_packages RPC, server-paginated).
-- * set_package_functions replaces a package's functions in one call.
-- Safe to re-run (idempotent).
-- =============================================================================

create table if not exists public.package_functions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  package_id  uuid not null,
  function_id uuid not null,
  created_at  timestamptz not null default now(),
  unique (owner_id, package_id, function_id),
  constraint package_functions_package_fkey foreign key (owner_id, package_id)
    references public.packages (owner_id, id) on delete cascade,
  constraint package_functions_function_fkey foreign key (owner_id, function_id)
    references public.function_options (owner_id, id) on delete cascade
);
create index if not exists package_functions_function_idx on public.package_functions (owner_id, function_id);

drop trigger if exists package_functions_rate_limit on public.package_functions;
create trigger package_functions_rate_limit before insert on public.package_functions
  for each row execute function public.rate_limit_writes('package_functions_write', '300', '60');

alter table public.package_functions enable row level security;
revoke all on public.package_functions from anon, authenticated;
grant select, insert, delete on public.package_functions to authenticated;
drop policy if exists own_select on public.package_functions;
drop policy if exists own_insert on public.package_functions;
drop policy if exists own_delete on public.package_functions;
create policy own_select on public.package_functions for select to authenticated using (owner_id = (select auth.uid()));
create policy own_insert on public.package_functions for insert to authenticated with check (owner_id = (select auth.uid()));
create policy own_delete on public.package_functions for delete to authenticated using (owner_id = (select auth.uid()));

-- ---------- Replace a package's functions ----------------------------------------
create or replace function public.set_package_functions(p_package_id uuid, p_function_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.packages where id = p_package_id) then
    raise exception 'Package not found.' using errcode = 'P0002';
  end if;
  if coalesce(array_length(p_function_ids, 1), 0) > 50 then
    raise exception 'Too many functions.' using errcode = '23514';
  end if;
  delete from public.package_functions where package_id = p_package_id;
  insert into public.package_functions (package_id, function_id)
  select distinct p_package_id, f from unnest(coalesce(p_function_ids, '{}'::uuid[])) f;
end;
$$;
revoke all on function public.set_package_functions(uuid, uuid[]) from public, anon;
grant execute on function public.set_package_functions(uuid, uuid[]) to authenticated;

-- ---------- Guest Studio list: the guest's function first, then the rest ----------
-- Guest-safe columns only. for_function = tagged with p_function_id. total = all active.
create or replace function public.studio_packages(p_function_id uuid, p_offset integer, p_limit integer)
returns table (
  id            uuid,
  name          text,
  tier_name     text,
  display_price numeric,
  description   text,
  image_path    text,
  video_url     text,
  for_function  boolean,
  total         bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.id, s.name, s.tier_name, s.display_price, s.description, s.image_path, s.video_url,
         (p_function_id is not null and exists (
            select 1 from public.package_functions pf where pf.package_id = s.id and pf.function_id = p_function_id
         )) as for_function,
         count(*) over () as total
    from public.package_summaries s
   where s.is_active
   order by for_function desc, s.name, s.tier_sort, s.id
  offset greatest(coalesce(p_offset, 0), 0)
   limit least(greatest(coalesce(p_limit, 12), 1), 50);
$$;
revoke all on function public.studio_packages(uuid, integer, integer) from public, anon;
grant execute on function public.studio_packages(uuid, integer, integer) to authenticated;
