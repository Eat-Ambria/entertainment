-- =============================================================================
-- 0022_quote_item_remarks.sql — element remarks ("where it is used") are now shown to the
-- guest: in the Studio while choosing elements, on the quotation and in the PDF / Excel.
--
-- quote_items.remarks is a snapshot taken when the line is saved (same idea as the name
-- and unit), so editing an element's remarks later doesn't change saved quotes. A draft
-- picks up the current remarks the next time it is saved.
-- Draft quotes saved before this get today's remarks once; confirmed/cancelled quotes stay
-- exactly as they were.
-- Safe to re-run (idempotent).
-- =============================================================================

alter table public.quote_items add column if not exists remarks text;

create or replace function public.quote_items_snapshot_remarks()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.element_id is not null and new.remarks is null then
    select e.remarks into new.remarks
      from public.elements e
     where e.id = new.element_id and e.owner_id = new.owner_id;
  end if;
  return new;
end;
$$;

drop trigger if exists quote_items_snapshot_remarks on public.quote_items;
create trigger quote_items_snapshot_remarks before insert on public.quote_items
  for each row execute function public.quote_items_snapshot_remarks();

-- Drafts only (the guard trigger keeps confirmed/cancelled lines frozen anyway).
update public.quote_items qi
   set remarks = e.remarks
  from public.elements e, public.quotes q
 where qi.remarks is null
   and e.id = qi.element_id and e.owner_id = qi.owner_id and e.remarks is not null
   and q.id = qi.quote_id and q.status = 'draft';
