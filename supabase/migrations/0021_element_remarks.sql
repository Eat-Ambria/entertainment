-- =============================================================================
-- 0021_element_remarks.sql — internal remarks on an element (where it is used, e.g.
-- "Entrance gate, Exotica lawn"). Workspace only; never sent to the Guest Studio.
-- update_element gains p_remarks (the old 8-argument version is replaced).
-- Safe to re-run (idempotent).
-- =============================================================================

alter table public.elements add column if not exists remarks text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'elements_remarks_len') then
    alter table public.elements add constraint elements_remarks_len check (remarks is null or length(remarks) <= 500);
  end if;
end $$;

drop function if exists public.update_element(uuid, text, text, numeric, numeric, text, numeric, text);

create or replace function public.update_element(
  p_id           uuid,
  p_name         text,
  p_unit         text,
  p_default_rate numeric,
  p_default_qty  numeric,
  p_image_path   text,
  p_unit_cost    numeric,
  p_reason       text default null,
  p_remarks      text default null
)
returns public.elements
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v public.elements;
begin
  if p_reason is not null and length(p_reason) > 500 then
    raise exception 'Reason must be 500 characters or fewer.' using errcode = '23514';
  end if;
  perform set_config('app.rate_change_reason', coalesce(p_reason, ''), true);
  update public.elements
     set name         = btrim(p_name),
         unit         = nullif(btrim(coalesce(p_unit, '')), ''),
         default_rate = p_default_rate,
         default_qty  = p_default_qty,
         image_path   = p_image_path,
         unit_cost    = p_unit_cost,
         remarks      = nullif(btrim(coalesce(p_remarks, '')), '')
   where id = p_id
  returning * into v;
  perform set_config('app.rate_change_reason', '', true);
  if v.id is null then
    raise exception 'Element not found.' using errcode = 'P0002';
  end if;
  return v;
end;
$$;
revoke all on function public.update_element(uuid, text, text, numeric, numeric, text, numeric, text, text) from public, anon;
grant execute on function public.update_element(uuid, text, text, numeric, numeric, text, numeric, text, text) to authenticated;
