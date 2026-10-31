/**
 * LMS (inqcrm) entertainment lead/contract helpers — pure TypeScript, no Deno/Node APIs,
 * so the Edge Function (Deno) and the unit tests (Vitest) share exactly this code.
 *
 * FIELD NAMES ARE NOT GUESSED: FIELD_MAP below was filled from the real list responses
 * (captured 29 Oct 2026; header eh_/ehc_, detail ehd_/ehcd_ fields come flattened in one row).
 * Note: LMS returns only its latest 10 rows per call and ignores paging params, so a search
 * only sees those until the LMS team adds search/paging to these endpoints.
 */

export type LmsSource = 'lead' | 'contract';
export type SessionName = 'Lunch' | 'Sundowner' | 'Dinner';

export interface GuestLookupResult {
  source: 'lms_lead' | 'lms_contract';
  sourceRef: string;
  guestName: string;
  phone: string | null;
  venueLmsId: string | null;
  subVenueLmsId: string | null;
  /** Venue as LMS writes it: the Ambria venue name, or an outside venue ("Radisson Blu Udhyog Vihar, Gurgaon"). */
  venueName: string | null;
  /** LMS location name ("VALENCIA GLASS HOUSE + LAWN"); contracts only. */
  subVenueName: string | null;
  functionLmsId: string | null;
  eventDate: string | null; // YYYY-MM-DD
  session: SessionName | null;
  raw: unknown;
}

/** Dot-paths into one LMS row (e.g. "ehd_function_date"). null = not mapped yet. */
export interface LmsFieldMap {
  /** Dot-path to the array of rows in the response body; '' = body itself is the array. */
  listPath: string | null;
  ref: string | null;
  guestName: string | null;
  phone: string | null;
  venueId: string | null;
  subVenueId: string | null;
  venueName: string | null;
  subVenueName: string | null;
  /** Outside (non-Ambria) venue text and its city — filled when the venue id is blank. */
  outsideVenue: string | null;
  outsideCity: string | null;
  functionId: string | null;
  eventDate: string | null;
  /** Slot timing ("12:00") — fallback when there is no session name. */
  timing: string | null;
  /** Session name as LMS writes it ("Lunch" / "Sundowner" / "Dinner"). */
  session: string | null;
  cancelRemarks: string | null;
}

const UNMAPPED: LmsFieldMap = {
  listPath: null,
  ref: null,
  guestName: null,
  phone: null,
  venueId: null,
  subVenueId: null,
  venueName: null,
  subVenueName: null,
  outsideVenue: null,
  outsideCity: null,
  functionId: null,
  eventDate: null,
  timing: null,
  session: null,
  cancelRemarks: null,
};

/**
 * From the real responses. Leads have no cancel field (only eh_status hot/warm/mild), so none
 * are dropped; contracts are dropped when ehc_cancel_remarks is filled. venue = LMS venue id,
 * address1 = LMS location id (see SUB_VENUE_LOCATIONS for how locations map to sub-venues).
 * Outside venues have a blank venue1 and the venue/city as text in venue2/address2.
 */
export const FIELD_MAP: Record<LmsSource, LmsFieldMap> = {
  lead: {
    ...UNMAPPED,
    listPath: 'leadinfo',
    ref: 'eh_entry_no',
    guestName: 'eh_guest_name',
    phone: 'eh_contact_no',
    venueId: 'ehd_venue1',
    subVenueId: 'ehd_address1',
    venueName: 'venue1',
    outsideVenue: 'ehd_venue2',
    outsideCity: 'ehd_address2',
    functionId: 'ehd_function',
    eventDate: 'ehd_date',
    timing: 'ehd_time',
    session: 'ehd_session',
  },
  contract: {
    ...UNMAPPED,
    listPath: 'Contractinfo',
    ref: 'ehc_entry_no',
    guestName: 'ehc_guest_name',
    phone: 'ehc_contact_no',
    venueId: 'ehcd_venue1',
    subVenueId: 'ehcd_address1',
    venueName: 'venue1',
    subVenueName: 'address1',
    outsideVenue: 'ehcd_venue2',
    outsideCity: 'ehcd_address2',
    functionId: 'ehcd_function',
    eventDate: 'ehcd_date',
    timing: 'ehcd_time',
    session: 'ehcd_session',
    cancelRemarks: 'ehc_cancel_remarks',
  },
};

/**
 * LMS location ids (get_location_by_selected_venue, venue 19 = Ambria Exotica) that belong to
 * each app sub-venue, matched by sub-venue name. LMS has combined locations ("AURA LAWN + PANDAL
 * AE"), so one sub-venue covers several ids.
 */
export const SUB_VENUE_LOCATIONS: Record<string, string[]> = {
  'the aura': ['36', '37', '38'],
  valencia: ['39', '46', '51'],
};

export const LMS_ENDPOINTS: Record<LmsSource, string> = {
  lead: '/api/v1/processerp_api/get_entertain_infromation_list', // spelling as in LMS
  contract: '/api/v1/processerp_api/get_entertain_contract_information_list',
};

/** Minimum fields needed before lookups can be switched on. */
export function isMappingReady(map: LmsFieldMap): boolean {
  return map.listPath !== null && Boolean(map.ref && map.guestName);
}

export function getPath(obj: unknown, path: string | null): unknown {
  if (path === null) return undefined;
  if (path === '') return obj;
  return path.split('.').reduce<unknown>(
    (acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined),
    obj,
  );
}

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

/** Last 10 digits of an Indian mobile, or null. Mirrors public.normalize_phone(). */
export function normalizePhone(input: unknown): string | null {
  const d = String(input ?? '').replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(d)) return d;
  if (/^91[6-9]\d{9}$/.test(d)) return d.slice(2);
  if (/^0[6-9]\d{9}$/.test(d)) return d.slice(1);
  return null;
}

/** LMS session name -> session (case-insensitive). */
export function toSession(value: unknown): SessionName | null {
  const v = String(value ?? '').trim().toLowerCase();
  return v === 'lunch' ? 'Lunch' : v === 'sundowner' ? 'Sundowner' : v === 'dinner' ? 'Dinner' : null;
}

/** LMS slot timing -> session (12:00 Lunch, 16:00 Sundowner, 18:00 Dinner). */
export function timingToSession(timing: unknown): SessionName | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(timing ?? '').trim());
  if (!m) return null;
  const hhmm = `${m[1]!.padStart(2, '0')}:${m[2]}`;
  return ({ '12:00': 'Lunch', '16:00': 'Sundowner', '18:00': 'Dinner' } as const)[hhmm as '12:00'] ?? null;
}

/** Accepts YYYY-MM-DD, DD-MM-YYYY or DD/MM/YYYY (optionally with a time) -> YYYY-MM-DD. */
export function toIsoDate(value: unknown): string | null {
  const s = String(value ?? '').trim();
  let y: string, mo: string, d: string;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) [, y, mo, d] = m as unknown as [string, string, string, string];
  else if ((m = /^(\d{2})[-/](\d{2})[-/](\d{4})/.exec(s))) [, d, mo, y] = m as unknown as [string, string, string, string];
  else return null;
  const date = new Date(`${y}-${mo}-${d}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(d) ? null : `${y}-${mo}-${d}`;
}

/** "radisson blu udhyog vihar" -> "Radisson Blu Udhyog Vihar". */
const titleCase = (s: string) => s.replace(/\s+/g, ' ').replace(/(^|[\s(+-])(\p{L})/gu, (_, p: string, c: string) => p + c.toUpperCase());

/** Ambria venue name, or "<outside venue>, <city>" when the LMS venue id is blank. */
export function venueText(row: unknown, map: LmsFieldMap): string | null {
  if (str(getPath(row, map.venueId))) return str(getPath(row, map.venueName));
  const outside = str(getPath(row, map.outsideVenue));
  if (!outside) return null;
  const city = str(getPath(row, map.outsideCity));
  return titleCase(city ? `${outside}, ${city}` : outside);
}

export function extractRows(body: unknown, map: LmsFieldMap): unknown[] {
  const list = getPath(body, map.listPath);
  return Array.isArray(list) ? list : [];
}

export function isCancelled(row: unknown, map: LmsFieldMap): boolean {
  return str(getPath(row, map.cancelRemarks)) !== null;
}

export function normalizeRow(row: unknown, map: LmsFieldMap, source: LmsSource): GuestLookupResult | null {
  const ref = str(getPath(row, map.ref));
  const guestName = str(getPath(row, map.guestName));
  if (!ref || !guestName) return null;
  return {
    source: source === 'lead' ? 'lms_lead' : 'lms_contract',
    sourceRef: ref,
    guestName,
    phone: normalizePhone(getPath(row, map.phone)),
    venueLmsId: str(getPath(row, map.venueId)),
    subVenueLmsId: str(getPath(row, map.subVenueId)),
    venueName: venueText(row, map),
    subVenueName: str(getPath(row, map.subVenueName)),
    functionLmsId: str(getPath(row, map.functionId)),
    eventDate: toIsoDate(getPath(row, map.eventDate)),
    session: toSession(getPath(row, map.session)) ?? timingToSession(getPath(row, map.timing)),
    raw: row,
  };
}

/** One result per (ref, function, date); when duplicated prefer the row that has an event date. */
export function dedupe(results: GuestLookupResult[]): GuestLookupResult[] {
  const best = new Map<string, GuestLookupResult>();
  for (const r of results) {
    const key = `${r.sourceRef}|${r.functionLmsId ?? ''}|${r.eventDate ?? ''}`;
    const loose = `${r.sourceRef}|${r.functionLmsId ?? ''}|`;
    if (r.eventDate && best.has(loose)) best.delete(loose);
    if (!r.eventDate && [...best.keys()].some((k) => k.startsWith(loose) && k !== loose)) continue;
    if (!best.has(key)) best.set(key, r);
  }
  return [...best.values()];
}

/** Digits -> phone/ref match; text -> name contains (case-insensitive). Needs >= 3 chars. */
export function matchesQuery(r: GuestLookupResult, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return false;
  const digits = q.replace(/\D/g, '');
  if (digits.length >= 3 && digits.length === q.replace(/[\s+-]/g, '').length) {
    return (r.phone ?? '').includes(digits) || r.sourceRef.toLowerCase().includes(digits);
  }
  return r.guestName.toLowerCase().includes(q) || r.sourceRef.toLowerCase() === q;
}

export const MAX_RESULTS = 5;

/** Full pipeline used by the proxy: rows -> drop cancelled -> normalise -> dedupe -> search -> cap. */
export function lookup(body: unknown, map: LmsFieldMap, source: LmsSource, query: string): GuestLookupResult[] {
  const rows = extractRows(body, map).filter((row) => !isCancelled(row, map));
  const normalized = rows.map((row) => normalizeRow(row, map, source)).filter((r): r is GuestLookupResult => r !== null);
  return dedupe(normalized)
    .filter((r) => matchesQuery(r, query))
    .slice(0, MAX_RESULTS);
}
