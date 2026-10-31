-- =============================================================================
-- 0017_remove_sent.sql — the "Sent" status and "Mark as sent" are removed.
-- Quotes are shared by downloading the PDF / Excel instead.
--
-- * Status flow is now: draft → confirmed | cancelled, confirmed → cancelled.
-- * Quotes that were 'sent' become 'draft' (editable again). No audit rows are written
--   for this clean-up — it isn't a real status change by the user.
-- * 'sent' can't be set any more (check constraint; enum values can't be dropped in place).
-- * mark_quote_sent() and the sent_count / last_sent_at columns are dropped.
-- Safe to re-run (idempotent).
-- =============================================================================

alter table public.quotes disable trigger quotes_before_update;
alter table public.quotes disable trigger quotes_audit_status;
update public.quotes set status = 'draft' where status = 'sent';
alter table public.quotes enable trigger quotes_before_update;
alter table public.quotes enable trigger quotes_audit_status;

alter table public.quotes drop constraint if exists quotes_status_no_sent;
alter table public.quotes add constraint quotes_status_no_sent check (status <> 'sent');

drop function if exists public.mark_quote_sent(uuid);
alter table public.quotes drop column if exists sent_count;
alter table public.quotes drop column if exists last_sent_at;

create or replace function public.quotes_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id <> old.owner_id or new.quote_no <> old.quote_no then
    raise exception 'owner and quote number cannot change';
  end if;

  if old.status in ('confirmed', 'cancelled') then
    -- package_id may be cleared when the package is deleted; the snapshot stays.
    if (to_jsonb(new) - array['status', 'notes', 'updated_at', 'package_id'])
       <> (to_jsonb(old) - array['status', 'notes', 'updated_at', 'package_id'])
       or (new.package_id is not null and new.package_id is distinct from old.package_id) then
      raise exception 'Quote % is % and can no longer be edited.', old.quote_no, old.status;
    end if;
  end if;

  if new.status <> old.status and not (
       (old.status = 'draft' and new.status in ('confirmed', 'cancelled'))
    or (old.status = 'confirmed' and new.status = 'cancelled')
  ) then
    raise exception 'Invalid status change: % -> %', old.status, new.status;
  end if;

  new.updated_at := now();
  return new;
end;
$$;
