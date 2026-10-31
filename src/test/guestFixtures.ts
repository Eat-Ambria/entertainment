/**
 * Sample LMS results for tests only (the app always uses the real LMS). Fictional names and
 * numbers; LMS ids match the seeded option lists (Sangeet=20, Wedding=3, Haldi=14,
 * Mehendi=15, Reception=4; Ambria Exotica=19, Ambria Pushpanjali=3).
 */
import type { GuestLookupResult } from '../../supabase/functions/_shared/lms';

const g = (o: Partial<GuestLookupResult> & Pick<GuestLookupResult, 'sourceRef' | 'guestName'>): GuestLookupResult => ({
  source: 'lms_contract',
  phone: null,
  venueLmsId: null,
  subVenueLmsId: null,
  venueName: null,
  subVenueName: null,
  functionLmsId: null,
  eventDate: null,
  session: null,
  raw: { demo: true },
  ...o,
});

export const MOCK_GUESTS: GuestLookupResult[] = [
  g({ sourceRef: 'C-1042', guestName: 'Mehta Family', phone: '9876543210', venueLmsId: '19', functionLmsId: '20', eventDate: '2026-12-12', session: 'Dinner' }),
  g({ sourceRef: 'C-1043', guestName: 'Mehta Family', phone: '9876543210', venueLmsId: '19', functionLmsId: '3', eventDate: '2026-12-13', session: 'Dinner' }),
  g({ sourceRef: 'C-1088', guestName: 'Kapoor Wedding', phone: '9123456789', venueLmsId: '3', functionLmsId: '14', eventDate: '2027-01-20', session: 'Lunch' }),
  g({ sourceRef: 'C-1101', guestName: 'Arora Reception', phone: '9811122233', venueLmsId: '3', functionLmsId: '4', eventDate: '2027-02-05', session: 'Sundowner' }),
  g({ source: 'lms_lead', sourceRef: 'L-5531', guestName: 'Sharma Family', phone: '9899988877', venueLmsId: '19', functionLmsId: '15', eventDate: '2027-01-08', session: 'Lunch' }),
  g({ source: 'lms_lead', sourceRef: 'L-5540', guestName: 'Gupta Engagement', phone: '9700011122', functionLmsId: '22' }),
];
