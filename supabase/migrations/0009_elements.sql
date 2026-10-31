-- =============================================================================
-- 0009_elements.sql — element rate history, write rate limit, update RPC.
--
-- * Every element insert logs its initial rate; every default_rate change logs
--   old -> new (+ reason) to rate_change_logs as 'master_rate'. Done by trigger,
--   so no code path can change a rate without leaving history.
-- * rate_change_logs is now written ONLY by database code (triggers / RPCs);
--   users can read their history but not insert fake rows.
-- * Element writes are rate limited per user (60 / minute).
-- Safe to re-run (idempotent).
-- =============================================================================

-- ---------- History is server-written only ---------------------------------
drop policy if exists own_insert on public.rate_change_logs;
revoke insert on public.rate_change_logs from authenticated;

-- ---------- Rate limit on element writes ------------------------------------
create or replace function public.elements_rate_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- auth.uid() is null for SQL Editor / server jobs — those aren't rate limited.
  if auth.uid() is not null then
    perform public.enforce_rate_limit('elements_write', 60, 60);
  end if;
  return new;
end;
$$;
drop trigger if exists elements_rate_limit on public.elements;
create trigger elements_rate_limit before insert or update on public.elements
  for each row execute function public.elements_rate_limit();

-- ---------- Master rate history ---------------------------------------------
create or replace function public.elements_log_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.rate_change_logs (owner_id, change_type, element_id, element_name, old_rate, new_rate, reason, changed_by)
    values (new.owner_id, 'master_rate', new.id, new.name, null, new.default_rate, 'Initial rate',
            coalesce(auth.uid(), new.owner_id));
  elsif new.default_rate is distinct from old.default_rate then
    insert into public.rate_change_logs (owner_id, change_type, element_id, element_name, old_rate, new_rate, reason, changed_by)
    values (new.owner_id, 'master_rate', new.id, new.name, old.default_rate, new.default_rate,
            nullif(btrim(coalesce(current_setting('app.rate_change_reason', true), '')), ''),
            coalesce(auth.uid(), new.owner_id));
  end if;
  return null;
end;
$$;
revoke all on function public.elements_log_rate() from public, anon, authenticated;

drop trigger if exists elements_log_rate on public.elements;
create trigger elements_log_rate after insert or update on public.elements
  for each row execute function public.elements_log_rate();

-- ---------- Update with an optional reason for the rate change ---------------
-- security invoker: RLS still decides which rows the caller can update.
create or replace function public.update_element(
  p_id           uuid,
  p_name         text,
  p_unit         text,
  p_default_rate numeric,
  p_default_qty  numeric,
  p_image_path   text,
  p_reason       text default null
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
         image_path   = p_image_path
   where id = p_id
  returning * into v;

  perform set_config('app.rate_change_reason', '', true);

  if v.id is null then
    raise exception 'Element not found.' using errcode = 'P0002';
  end if;
  return v;
end;
$$;
revoke all on function public.update_element(uuid, text, text, numeric, numeric, text, text) from public, anon;
grant execute on function public.update_element(uuid, text, text, numeric, numeric, text, text) to authenticated;
