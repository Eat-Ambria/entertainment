-- =============================================================================
-- 0006_rls.sql — Row Level Security + grants. Every user sees and changes only
-- their own rows (owner_id = auth.uid()). anon gets nothing.
--
-- No DELETE on history tables (quotes, vendor rates, rate logs, audit) — history
-- is permanent. Elements/packages/options are archived via is_active instead.
-- `(select auth.uid())` is used so Postgres evaluates it once per query.
-- Safe to re-run (idempotent).
-- =============================================================================

-- ---------- Helper: (re)create the standard owner policies ------------------
create or replace function public._apply_owner_policies(p_table text, p_ops text[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  op text;
begin
  execute format('alter table public.%I enable row level security', p_table);
  execute format('revoke all on public.%I from anon, authenticated', p_table);

  foreach op in array array['select', 'insert', 'update', 'delete'] loop
    execute format('drop policy if exists %I on public.%I', 'own_' || op, p_table);
  end loop;

  foreach op in array p_ops loop
    execute format('grant %s on public.%I to authenticated', op, p_table);
    if op = 'select' or op = 'delete' then
      execute format(
        'create policy %I on public.%I for %s to authenticated using (owner_id = (select auth.uid()))',
        'own_' || op, p_table, op);
    elsif op = 'insert' then
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (owner_id = (select auth.uid()))',
        'own_insert', p_table);
    elsif op = 'update' then
      execute format(
        'create policy %I on public.%I for update to authenticated
           using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))',
        'own_update', p_table);
    end if;
  end loop;
end;
$$;

select public._apply_owner_policies('function_options',    array['select', 'insert', 'update']);
select public._apply_owner_policies('venues',              array['select', 'insert', 'update']);
select public._apply_owner_policies('sub_venues',          array['select', 'insert', 'update']);
select public._apply_owner_policies('sessions',            array['select', 'insert', 'update']);
select public._apply_owner_policies('tiers',               array['select', 'insert', 'update']);
select public._apply_owner_policies('elements',            array['select', 'insert', 'update']);
select public._apply_owner_policies('packages',            array['select', 'insert', 'update']);
select public._apply_owner_policies('package_elements',    array['select', 'insert', 'update', 'delete']);
select public._apply_owner_policies('vendors',             array['select', 'insert', 'update']);
select public._apply_owner_policies('vendor_rate_entries', array['select', 'insert']);
select public._apply_owner_policies('quotes',              array['select', 'insert', 'update']);
select public._apply_owner_policies('quote_items',         array['select', 'insert', 'update', 'delete']);
select public._apply_owner_policies('quote_charges',       array['select', 'insert', 'update', 'delete']);
select public._apply_owner_policies('rate_change_logs',    array['select', 'insert']);
select public._apply_owner_policies('audit_log',           array['select']);
select public._apply_owner_policies('quote_counters',      array[]::text[]);

drop function public._apply_owner_policies(text, text[]);

-- ---------- Profiles: own row only; only safe columns are editable ----------
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, business_name, logo_path, contact_line, lms_logged_user_id) on public.profiles to authenticated;

drop policy if exists own_select on public.profiles;
drop policy if exists own_update on public.profiles;
create policy own_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy own_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
