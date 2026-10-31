-- =============================================================================
-- 0001_base.sql — extensions, enums, shared helpers, rate limiting
-- Safe to re-run (idempotent).
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------- Enums ----------------------------------------------------------
do $$ begin
  create type public.quote_status as enum ('draft', 'sent', 'confirmed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.quote_source as enum ('manual', 'lms_lead', 'lms_contract');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.rate_change_type as enum ('master_rate', 'package_default_rate', 'quote_override');
exception when duplicate_object then null; end $$;

-- ---------- updated_at trigger --------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- Rate limiting ---------------------------------------------------
-- Fixed-window counter per (user, action). Only reachable through the functions
-- below (RLS on, no policies), so clients can't reset their own counters.
create table if not exists public.rate_limits (
  key          text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Returns true when the call is allowed, false when the limit is reached.
create or replace function public.check_rate_limit(p_action text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_window timestamptz;
  v_hits   integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit config';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits as r (key, window_start, hits)
  values (v_uid::text || ':' || p_action, v_window, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;

  -- Opportunistic cleanup of old windows for this key.
  delete from public.rate_limits
  where key = v_uid::text || ':' || p_action and window_start < v_window;

  return v_hits <= p_limit;
end;
$$;

-- Same check, but raises SQLSTATE P0429 so RPCs can just call it and stop.
create or replace function public.enforce_rate_limit(p_action text, p_limit integer, p_window_seconds integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.check_rate_limit(p_action, p_limit, p_window_seconds) then
    raise exception 'Too many requests. Please wait a moment and try again.'
      using errcode = 'P0429', hint = 'rate_limited';
  end if;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public, anon;
revoke all on function public.enforce_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.check_rate_limit(text, integer, integer) to authenticated;
grant execute on function public.enforce_rate_limit(text, integer, integer) to authenticated;
