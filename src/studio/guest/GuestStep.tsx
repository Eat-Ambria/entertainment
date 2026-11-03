/**
 * Guest Studio step 1 — Guest & Event.
 * One search box looks in LMS contracts and leads together; each result is tagged Contract
 * or Lead. The user's own saved quotes for manual guests are listed too ("Saved"): Use fills
 * the form for a new quote, Edit reopens a draft. Not found? Just fill the form — it's a manual (new) guest. The form is always
 * there to review/correct (function lives here — no separate function step). Saves to the draft.
 * Shown in front of the guest: other guests' phone numbers are masked in search results,
 * and at most 5 results are listed.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { eventOptionsApi, useEventOptions } from '@/data/eventOptions';
import { activePackagesQuery, STUDIO_PAGE_SIZE } from '@/data/studioCatalog';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { SelectField } from '@/components/ui/SelectField';
import { FormAlert } from '@/components/ui/FormAlert';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { m } from 'motion/react';
import { listStagger, riseItem } from '@/lib/motion';
import { formatDate } from '@/lib/date';
import { maskPhone } from '@/lib/phone';
import { EMPTY_DRAFT, useQuoteDraft, type GuestSource } from '../quoteDraft';
import { LiveEventCard } from './LiveEventCard';
import { FIELD_MAP, getPath, venueText } from '../../../supabase/functions/_shared/lms';
import { getGuestAdapter, lookupErrorMessage, searchAllGuests, type GuestLookupResult } from './guestSources';
import { savedGuestsApi, type SavedGuestQuote } from '@/data/savedGuests';
import { useEditQuote } from '../quote/useEditQuote';
import { QuoteNotEditableError, quoteEditApi } from '@/data/quoteEdit';
import { dbErrorMessage } from '@/lib/dbErrors';
import {
  EMPTY_GUEST_FORM,
  formFromDraft,
  formFromLookup,
  todayIst,
  validateGuest,
  type GuestForm,
  type GuestFormErrors,
} from './guestValidation';

type LmsFailed = Awaited<ReturnType<typeof searchAllGuests>>['failed'];

const SOURCE_TAG: Record<GuestLookupResult['source'], { label: string; cls: string }> = {
  lms_contract: { label: 'Contract', cls: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/30' },
  lms_lead: { label: 'Lead', cls: 'bg-amber-400/10 text-amber-300 ring-amber-400/30' },
};

export function GuestStep({ onDone }: { onDone: () => void }) {
  const formId = useId();
  const { session } = useAuth();
  const userId = session?.user.id ?? 'anon';
  const [draft, updateDraft] = useQuoteDraft(userId);
  const options = useEventOptions();
  const queryClient = useQueryClient();
  const adapter = useMemo(() => getGuestAdapter(), []);

  const saved = draft.guest;
  const [form, setForm] = useState<GuestForm>(saved ? formFromDraft(saved) : EMPTY_GUEST_FORM);
  const [picked, setPicked] = useState<{ source: GuestSource; ref: string | null; raw: unknown }>(
    saved ? { source: saved.source, ref: saved.sourceRef, raw: saved.sourceRaw } : { source: 'manual', ref: null, raw: null },
  );
  const [errors, setErrors] = useState<GuestFormErrors>({});

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<GuestLookupResult[] | null>(null);
  const [savedResults, setSavedResults] = useState<SavedGuestQuote[]>([]); // own quotes for manual guests
  const edit = useEditQuote();
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null); // quote no. whose packages were loaded
  const [partial, setPartial] = useState<string | null>(null); // e.g. leads couldn't be searched
  const [searchError, setSearchError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  const opts = options.data;
  const fnName = (lmsId: string | null) => opts?.functions.find((f) => String(f.lms_id) === lmsId)?.name;
  const venueName = (lmsId: string | null) => opts?.venues.find((v) => String(v.lms_id) === lmsId)?.name;
  const subVenues = useMemo(() => (opts?.subVenues ?? []).filter((s) => s.venue_id === form.venueId), [opts, form.venueId]);

  // Warm up the Package step: its cards and images are ready by the time Continue is pressed.
  useEffect(() => {
    if (!form.functionId) return;
    void queryClient.prefetchInfiniteQuery({
      ...activePackagesQuery(queryClient, form.functionId),
      getNextPageParam: (last: { total: number }, pages: unknown[]) => (pages.length * STUDIO_PAGE_SIZE < last.total ? pages.length : undefined),
    });
  }, [form.functionId, queryClient]);

  const set = (k: keyof GuestForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value, ...(k === 'venueId' ? { subVenueId: '' } : {}) }));

  // Emptying the box (typing it away or the search field's ✕) also clears the results.
  function onQueryChange(value: string) {
    typed.current = true;
    setQuery(value);
    if (value.trim().length < 3) {
      lastRun.current++; // drop any search still on its way
      setSearching(false);
    }
    if (value.trim() === '') {
      setResults(null);
      setSavedResults([]);
      setPartial(null);
      setSearchError(null);
    }
  }

  // Only the newest search may show its results (typing fires several).
  const lastRun = useRef(0);
  const runSearch = useCallback(
    async (q: string) => {
      const run = ++lastRun.current;
      setSearching(true);
      setSearchError(null);
      setPartial(null);
      // Saved manual guests are looked up alongside LMS; either may fail without hiding the other.
      const ownQuotes = savedGuestsApi.search(q).catch(() => [] as SavedGuestQuote[]);
      try {
        const r = await searchAllGuests(adapter, q).catch(async (err: unknown) => {
          if ((await ownQuotes).length) return { results: [] as GuestLookupResult[], failed: ['contract', 'lead'] as LmsFailed };
          throw err;
        });
        const own = await ownQuotes;
        if (run !== lastRun.current) return;
        setResults(r.results);
        setSavedResults(own);
        if (r.failed.length === 2) setPartial("LMS couldn't be searched right now — showing your saved quotes.");
        else if (r.failed.length) setPartial(`${r.failed[0] === 'lead' ? 'Leads' : 'Contracts'} couldn't be searched right now — showing the rest.`);
      } catch (err) {
        if (run !== lastRun.current) return;
        setResults(null);
        setSavedResults([]);
        setSearchError(lookupErrorMessage(err, 'any'));
      } finally {
        if (run === lastRun.current) setSearching(false);
      }
    },
    [adapter],
  );

  // Suggestions while typing: searches 450 ms after the last key once there are 3+ characters.
  const typed = useRef(false);
  useEffect(() => {
    if (!typed.current || query.trim().length < 3) return;
    const t = setTimeout(() => void runSearch(query), 450);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  function search(e: FormEvent) {
    e.preventDefault();
    if (query.trim().length < 3) {
      setSearchError('Type at least 3 letters of the name, or part of the phone or booking number.');
      return;
    }
    void runSearch(query);
  }

  // A venue / location written in LMS but missing from the user's lists is added, so the form
  // always shows what LMS says (outside venues too). If that fails the field just stays blank.
  async function pickResult(r: GuestLookupResult) {
    if (!opts) return;
    let next = formFromLookup(r, opts);
    const map = FIELD_MAP[r.source === 'lms_lead' ? 'lead' : 'contract'];
    // Older deployed proxies don't send the names yet — read them from the raw LMS row.
    const lmsVenue = r.venueName ?? venueText(r.raw, map);
    const lmsSubVenue = r.subVenueName ?? (String(getPath(r.raw, map.subVenueName) ?? '').trim() || null);
    setPicking(true);
    setPickError(null);
    try {
      let added = false;
      if (!next.venueId && lmsVenue) {
        next = { ...next, venueId: await eventOptionsApi.ensureVenue(lmsVenue, r.venueLmsId), subVenueId: '' };
        added = true;
      }
      if (next.venueId && !next.subVenueId && lmsSubVenue) {
        next = { ...next, subVenueId: await eventOptionsApi.ensureSubVenue(next.venueId, lmsSubVenue, r.subVenueLmsId) };
        added = true;
      }
      if (added) await queryClient.invalidateQueries({ queryKey: ['event-options'] });
    } catch {
      if (lmsVenue && !next.venueId) setPickError(`LMS venue "${lmsVenue}" couldn't be added to your venues — choose it below.`);
    } finally {
      setPicking(false);
    }
    setForm(next);
    setPicked({ source: r.source, ref: r.sourceRef, raw: r.raw });
    setResults(null);
    setSavedResults([]);
    setErrors({});
  }

  // A saved manual guest: copy that quote — guest, event, packages and elements — into a new
  // quote (saving creates a new one). A past event date is left blank for the new event.
  async function pickSaved(s: SavedGuestQuote) {
    setPicking(true);
    setPickError(null);
    try {
      const { draft: copy, droppedLines } = await quoteEditApi.load(s.id, { asNew: true, today: todayIst() });
      updateDraft(() => copy);
      setForm(copy.guest ? formFromDraft(copy.guest) : s.form);
      setPicked({ source: 'manual', ref: null, raw: null });
      setCopiedFrom(s.quoteNo);
      setResults(null);
      setSavedResults([]);
      setErrors({});
      if (droppedLines > 0) {
        setPickError(`${droppedLines} ${droppedLines === 1 ? 'element was' : 'elements were'} deleted and left out.`);
      }
    } catch (err) {
      setPickError(err instanceof QuoteNotEditableError ? err.message : dbErrorMessage(err));
    } finally {
      setPicking(false);
    }
  }

  // Search box's Clear: empties the search, the results and the filled form.
  function clearAll() {
    onQueryChange('');
    setPicked({ source: 'manual', ref: null, raw: null });
    setForm(EMPTY_GUEST_FORM);
    setErrors({});
    setPickError(null);
    // Packages copied from a saved quote go too.
    if (copiedFrom) {
      updateDraft(() => EMPTY_DRAFT);
      setCopiedFrom(null);
    }
  }

  function onContinue(e: FormEvent) {
    e.preventDefault();
    const result = validateGuest(form, { source: picked.source, sourceRef: picked.ref, sourceRaw: picked.raw });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    updateDraft((d) => ({ ...d, guest: result.value }));
    onDone();
  }

  if (options.isLoading) return <Spinner label="Loading…" />;
  if (options.isError || !opts) return <FormAlert>We couldn't load the event options. Please refresh the page.</FormAlert>;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
      <section className="min-w-0 space-y-5 rounded-2xl border border-brand-300/25 bg-stage-900/80 p-4 sm:p-5 text-ivory shadow-2xl shadow-black/50">
        {/* Lookup */}
        <section aria-label="Search" className="space-y-2.5 rounded-xl border border-white/10 bg-white/4 p-4">
          <div className="flex items-center gap-2">
            <Icon name="search" size={16} className="text-brand-300" />
            <h2 className="text-sm font-semibold text-ivory">Find the guest</h2>
          </div>
          {/* Phones: the box on its own line, Search and Clear side by side under it. */}
          <form onSubmit={search} className="flex flex-wrap gap-2 sm:flex-nowrap" role="search">
            <label className="relative w-full min-w-0 sm:w-auto sm:flex-1">
              <span className="sr-only">Search guests</span>
              <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ivory/40" />
              <input
                type="search"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Guest name, phone or booking number"
                className="w-full rounded-lg border border-white/15 bg-white/5 py-2.5 pl-10 pr-3 text-sm text-ivory outline-none transition-colors duration-150 scheme-dark placeholder:text-ivory/35 hover:bg-white/7 focus:border-brand-300 focus:ring-2 focus:ring-brand-300/25"
              />
            </label>
            <Button type="submit" variant="gold" loading={searching} className="flex-1 sm:flex-none">
              Search
            </Button>
            {(picked.ref || query) && (
              <Button type="button" variant="outline-light" onClick={clearAll} className="flex-1 sm:flex-none">
                Clear
              </Button>
            )}
          </form>
          <p className="text-[11px] text-ivory/45">
            Searches booked contracts, enquiry leads and your saved quotes together. Not found? Fill in the details below as a new guest.
          </p>
          {searchError && <FormAlert>{searchError}</FormAlert>}
          {partial && <p className="text-xs text-amber-300">{partial}</p>}
          {results && results.length === 0 && savedResults.length === 0 && (
            <p className="rounded-lg border border-dashed border-white/15 px-4 py-6 text-center text-sm text-ivory/55">
              No contract or lead matches. Try another spelling or the phone number — or fill in the details below as a new guest.
            </p>
          )}
          {results && results.length > 0 && (
            <m.ul variants={listStagger} initial="hidden" animate="show" className="max-h-56 divide-y divide-white/10 overflow-y-auto rounded-xl border border-white/10 bg-stage-950/60" aria-label="Search results">
              {results.map((r) => (
                <m.li variants={riseItem} key={`${r.sourceRef}-${r.functionLmsId}-${r.eventDate}`} className="flex items-center justify-between gap-4 px-4 py-3 transition-colors duration-200 hover:bg-white/5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2">
                      <span className="truncate font-medium text-ivory">{r.guestName}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${SOURCE_TAG[r.source].cls}`}>
                        {SOURCE_TAG[r.source].label}
                      </span>
                    </p>
                    <p className="truncate text-sm text-ivory/55">
                      {[maskPhone(r.phone), fnName(r.functionLmsId), r.eventDate && formatDate(r.eventDate), venueName(r.venueLmsId) ?? r.venueName ?? venueText(r.raw, FIELD_MAP[r.source === 'lms_lead' ? 'lead' : 'contract'])]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <Button variant="outline-light" disabled={picking} onClick={() => void pickResult(r)} aria-label={`Use ${r.guestName} ${r.sourceRef}`}>
                    Use
                  </Button>
                </m.li>
              ))}
            </m.ul>
          )}
          {savedResults.length > 0 && (
            <m.ul variants={listStagger} initial="hidden" animate="show" className="max-h-56 divide-y divide-white/10 overflow-y-auto rounded-xl border border-white/10 bg-stage-950/60" aria-label="Saved quotes">
              {savedResults.map((s) => (
                <m.li variants={riseItem} key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors duration-200 hover:bg-white/5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2">
                      <span className="truncate font-medium text-ivory">{s.guestName}</span>
                      <span className="shrink-0 rounded-full bg-sky-400/10 px-2 py-0.5 text-xs font-semibold text-sky-300 ring-1 ring-sky-400/30">Saved</span>
                    </p>
                    <p className="truncate text-sm text-ivory/55">
                      {[s.quoteNo, s.phone && maskPhone(s.phone), s.functionName, s.eventDate && formatDate(s.eventDate), s.venueName]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {s.status === 'draft' && (
                      <Button variant="outline-light" disabled={edit.busy} onClick={() => void edit.open(s.id)} aria-label={`Edit ${s.quoteNo}`}>
                        Edit
                      </Button>
                    )}
                    <Button variant="outline-light" disabled={picking} onClick={() => void pickSaved(s)} aria-label={`Use ${s.guestName} ${s.quoteNo}`}>
                      Use
                    </Button>
                  </div>
                </m.li>
              ))}
            </m.ul>
          )}
        </section>

        {/* Form */}
        <form id={formId} onSubmit={onContinue} noValidate className="space-y-4">
          {!picked.ref && !copiedFrom && (
            <p className="flex items-center gap-2 text-sm text-ivory/55">
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-ivory/75">Manual</span>
              New guest — enter the details yourself, or search above to fill them from LMS.
            </p>
          )}
          {copiedFrom && (
            <p className="flex items-start gap-2 rounded-lg border border-sky-400/25 bg-sky-400/10 px-3 py-2 text-sm text-sky-200">
              <Icon name="check" size={16} className="mt-0.5 shrink-0" />
              Packages and elements from {copiedFrom} are loaded. Check the event details, then continue — this saves as a new quote.
            </p>
          )}
          {pickError && <p className="text-xs text-amber-300">{pickError}</p>}

          <fieldset className="space-y-3">
            <legend className="font-mono text-xs uppercase tracking-[0.22em] text-brand-300">Guest</legend>
            <div className="grid gap-3.5 sm:grid-cols-2 sm:gap-4">
              <TextField tone="dark" label="Guest name" value={form.guestName} onChange={set('guestName')} error={errors.guestName} autoComplete="name" />
              <TextField
                tone="dark"
                label="Mobile number"
                prefix="+91"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={10}
                value={form.phone}
                // Digits only, at most 10 — anything else is dropped as you type or paste.
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                error={errors.phone}
                autoComplete="tel-national"
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3 border-t border-white/10 pt-4">
            <legend className="float-left mb-3 w-full font-mono text-xs uppercase tracking-[0.22em] text-brand-300">Event</legend>
            {/* Two per row even on phones (venue gets the full row for long names) to keep the form short. */}
            <div className="clear-both grid grid-cols-2 gap-x-3 gap-y-3.5 sm:gap-4 lg:grid-cols-3">
              <SelectField
                tone="dark"
                label="Function"
                placeholder="Choose function"
                value={form.functionId}
                onChange={set('functionId')}
                error={errors.functionId}
                options={opts.functions.map((f) => ({ value: f.id, label: f.name }))}
              />
              <TextField
                tone="dark"
                label="Event date"
                type="date"
                min={todayIst()}
                value={form.eventDate}
                onChange={set('eventDate')}
                error={errors.eventDate}
              />
              <SelectField
                tone="dark"
                label="Venue"
                className="col-span-2 lg:col-span-1"
                placeholder="Choose venue"
                value={form.venueId}
                onChange={set('venueId')}
                error={errors.venueId}
                options={opts.venues.map((v) => ({ value: v.id, label: v.name }))}
              />
              <SelectField
                tone="dark"
                label="Sub-venue"
                placeholder={subVenues.length ? 'Optional' : 'None'}
                value={form.subVenueId}
                onChange={set('subVenueId')}
                disabled={!subVenues.length}
                options={subVenues.map((s) => ({ value: s.id, label: s.name }))}
              />
              <SelectField
                tone="dark"
                label="Session"
                placeholder="Choose session"
                value={form.sessionId}
                onChange={set('sessionId')}
                error={errors.sessionId}
                options={opts.sessions.map((s) => ({ value: s.id, label: s.name }))}
              />
            </div>
          </fieldset>

        </form>
      </section>
      {/* Event preview and the next action stay in view while the form is filled in. */}
      <div className="flex flex-col gap-4">
        <div className="flex-1 *:h-full">
          <LiveEventCard form={form} opts={opts} />
        </div>
        <div className="rounded-2xl border border-white/10 bg-stage-900/85 p-4 shadow-xl shadow-black/40">
          <p className="text-sm text-ivory/60">
            {picked.ref ? 'Details filled from LMS — check them before continuing.' : 'All fields except sub-venue are needed.'}
          </p>
          <Button type="submit" form={formId} variant="gold" full className="mt-3">
            Continue to packages <Icon name="arrowRight" size={18} />
          </Button>
        </div>
      </div>
    </div>
  );
}
