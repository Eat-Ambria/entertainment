# Entertainment Pricing & P&L Tool — Project Plan

A web app for the Entertainment team to build event packages from master elements, generate guest quotations, keep a rate-change and vendor-rate ledger, and report profit and loss.

Guest and event details come from the **LMS (inqcrm) Entertainment Lead and Contract APIs** (see [LMS_API_Mapping (3).md](LMS_API_Mapping%20(3).md)). Staff can also enter them manually.

> **How to use this file:** Build one day at a time (Part F). At the start of each day, inspect the repo, continue from the last verified checkpoint, and update the **Progress Log** at the bottom. Do not start the next day until the current day's acceptance criteria are verified and approved.

---

## 1. Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript (Vite) |
| Styling | Tailwind CSS |
| Routing | React Router |
| Backend / DB | Supabase (Postgres) |
| Auth | Supabase Auth (email + password) |
| Images | Supabase Storage (`element-images`, `package-images` buckets) |
| Access control | Supabase Row Level Security (RLS) |
| Server-side logic | Postgres RPC functions + Supabase Edge Functions (LMS proxy) |
| Tests | Vitest (calculation + adapter logic) |
| PDF | Done 27 Oct 2026 — PDF + Excel download on the Quotation step after save |

Money is stored as `numeric(12,2)` in **rupees**, matching LMS ("All monetary values in LMS are rupees"). Never use JS floats for stored totals — round to 2 decimals in one shared helper.

---

## 2. Application Areas

The app has **two separate sides** after login, chosen on a workspace chooser at `/`:

| Side | Route | Audience | Contains |
|---|---|---|---|
| **Guest Studio** | `/studio` | Client-facing — shown to the guest | Branded landing → step flow: Guest & Event → Package → Customise → Quotation. No sidebar, no internal data. |
| **My Workspace** | `/admin` | The logged-in user only (their own data) | Dashboard, Quote Ledger, Elements, Packages, Rate History (vendor rates), P&L Reports, Settings |

- "New Quote" in the My Workspace opens the Guest Studio flow (`/studio/new`), so a quote is always built on the client-facing screens.
- The Studio has a discreet "My workspace" link for staff; the Workspace sidebar has "Open Guest Studio".
- Studio step is kept in the URL (`?step=package`) so refresh/back never lose the guest's place.
- **Hard separation:** code in `src/studio/` cannot import `src/admin/` (ESLint `no-restricted-imports` error). Studio data hooks select only guest-safe columns; cost/vendor columns are never fetched there.

### My Workspace navigation

Workspace: Dashboard · Quote Ledger — Catalogue: Elements · Packages — Insights: Rate History · P&L Reports — System: Settings

### Accounts & data ownership (per-user workspaces)

**Every user has a completely separate workspace.** Each login owns its own elements, packages, vendors, vendor rates, function/venue/session options, quotes, rate history and P&L. No user can see or change another user's data.

- Every business table has `owner_id uuid not null default auth.uid()`; RLS on every table is `owner_id = auth.uid()` for select/insert/update (enforced in the database, not the UI).
- Cross-references can't leak between users: child tables use **composite foreign keys** `(owner_id, element_id) → elements(owner_id, id)` etc., so a package can only include the same user's elements.
- On sign-up a trigger creates the user's `profiles` row and **seeds their own copy** of the default option lists (LMS functions, venues, sessions, tiers), which they can then edit freely.
- Each user has a **business profile** (business name, logo, contact line). The Guest Studio header, guest quotation and PDF show **the user's own branding**; `src/lib/brand.ts` is only the fallback before a profile is set.
- After login the user picks **Guest Studio** or **their Workspace**; both run on that user's data only.
- No admin/staff/viewer roles inside a workspace in v1 — the owner can do everything in their own space.

---

# PART A — ADMIN / BACKEND MANAGEMENT

## 3. Elements Master List

Admins can add, view, edit and archive elements.

| Field | Notes |
|---|---|
| Name | Required, unique among active elements |
| Default selling rate | Required, ≥ 0 |
| Unit | Optional (e.g. Nos, Hour, Set, Kg, Sq ft) |
| Default quantity | Optional, > 0 |
| Image | Optional, Supabase Storage |
| Status | Active / Archived |
| Created / updated at | Automatic |

Examples: Entrance Arch, Stage Backdrop, Floral Table Centerpiece, Chair Setup, Sofa Lounge, DJ, Dhol, Anchor.

Rules:
- Archiving hides the element from new packages/quotes; it never deletes it. Old quotes and packages still show it.
- Changing the master rate writes a `master_rate` row to Rate History (with reason).
- **Editing a rate inside a guest quote never changes the master rate.**

## 4. Package Management

**Rule (changed 27 Oct 2026 at the user's request): every package is available for every function, but a package can optionally be tagged with functions** (`package_functions`, 0024). Tagged packages are shown first for those functions in the Guest Studio; nothing is ever hidden. No function = suits any function.

| Field | Notes |
|---|---|
| Name | e.g. Royal Package |
| Tier | Standard / Premium (configurable list) |
| Display price | Optional, shown on package cards |
| Image | Optional |
| Video link | Optional, validated URL |
| Status | Active / Inactive |
| Elements | Selected elements + default quantity each |

Package editor shows **all active master elements** in a table:

| Include ☑ | Image | Element | Unit | Master rate (read-only) | Default qty |
|---|---|---|---|---|---|

- Tick to include, set default qty, save → upserts `package_elements`.
- Package default rate override per element is **out of scope for v1** (packages use the master rate). If added later, its changes log as `package_default_rate` in Rate History.

## 5. Vendors & Vendor Purchase Rates (cost source)

The reference screenshot shows the Rate History view the team wants for **purchase rates from vendors**:

| Date | Vendor | Qty | Rate | Trend |
|---|---|---|---|---|
| 18 Oct 2026 · *Logged 21 Oct 2026* | DIGANI FRUITS & VEGETABLES · *by Uday Yadav* | 1 Kg | ₹180.00 | ↑ (red) |
| 15 Oct 2026 · *Logged 18 Oct 2026* | DIGANI FRUITS & VEGETABLES · *by Uday Yadav* | 1 Kg | ₹160.00 | ↓ (green) |
| 1 Oct 2026 · *Logged 2 Oct 2026* | DIGANI FRUITS & VEGETABLES · *by Uday Yadav* | 0.5 Kg | ₹190.00 | ↑ (red) |
| 21 Sept 2026 · *Logged 22 Sept 2026* | DIGANI FRUITS & VEGETABLES · *by David* | 1 Kg | ₹150.00 | NEW |

Behaviour to replicate:
- Each entry has a **purchase date** (big) and a **logged date** (small, grey) — they can differ.
- Vendor name (bold, uppercase) with **"by &lt;user&gt;"** underneath.
- Qty with unit, and **rate per unit** (₹180.00 for 1 Kg; ₹190.00 for 0.5 Kg is still per Kg).
- Trend compares the per-unit rate with the **previous entry for the same element, ordered by purchase date**: higher → red ↑, lower → green ↓, equal → grey "—", first entry → "NEW" badge.
- Newest first; the latest row is lightly highlighted.
- Entries are append-only. A correction is a new entry; the wrong one is marked void with a reason (never edited or deleted).

These entries are the **proposed cost source for P&L** (latest vendor rate on or before the event date = unit cost). **This must be confirmed with the business before Day 10** (see §14).

Vendor fields: name, contact person, phone, notes, active/inactive.

## 6. Function, Venue & Session Options (Settings)

Configurable lists, seeded from LMS master data, each storing the LMS ID for mapping:

- **Functions** — seeded from the LMS Function Type Map (Ring Ceremony = 1, Wedding = 3, Reception = 4, Haldi = 14, Mehendi = 15, Sangeet = 20, Engagement = 22, Cocktail = 9 … full list in the API file). Admin can activate/deactivate and add internal-only ones.
- **Venues** — seeded from the LMS Venue Map. Note: *The Aura* and *Valencia* both map to LMS venue 19 (Ambria Exotica) as sub-venues.
- **Sub-venues** — LMS "locations", fetched per venue via `get_location_by_selected_venue` and cached locally.
- **Sessions** — from the LMS Slot Map: Lunch (12:00), Sundowner (16:00), Dinner (18:00).
- **Tiers** — Standard, Premium (editable).

Functions are guest/event information saved on the quote, and decide the **order** of packages in the Studio (tagged ones first). They never hide packages.

---

# PART B — LMS INTEGRATION (Entertainment)

## 7. Source APIs

Base URL: `https://gyv.inqcrm.in` — every request body includes `loggeduserid` (default `"1"`).

| Purpose | Endpoint |
|---|---|
| Entertainment **leads** | `POST /api/v1/processerp_api/get_entertain_infromation_list` *(spelling as in LMS)* |
| Entertainment **contracts** | `POST /api/v1/processerp_api/get_entertain_contract_information_list` |
| Venues | `POST /api/v1/createcommon_api/get_venue_list` — body `{ "lead_type": "I" }` (empty string errors) |
| Sub-venues | `POST /api/v1/createcommon_api/get_location_by_selected_venue` — body `{ "venueid": "<id>" }` |
| Functions | `POST /api/v1/createcommon_api/get_function_detail` — body `{ "functype": "" }` |

Entertainment field prefixes:

| Lead header | Lead detail | Contract header | Contract detail |
|---|---|---|---|
| `eh_` | `ehd_` | `ehc_` | `ehcd_` |

Header = guest/booking level (name, phone, venue). Detail = one row per function/event (function, date, slot, sub-venue).

## 8. Architecture

```
Browser ──► Supabase Edge Function `lms-proxy` ──► gyv.inqcrm.in
              • holds LMS base URL + loggeduserid in env secrets
              • whitelists only the endpoints above (read-only)
              • requires a signed-in Supabase user
              • normalises the response to GuestLookupResult
```

The browser never calls LMS directly (CORS, and keeps config server-side).

Frontend adapter interface:

```ts
interface GuestSourceAdapter {
  search(query: string): Promise<GuestLookupResult[]>; // by name / phone / entry no.
}

interface GuestLookupResult {
  source: 'lms_lead' | 'lms_contract';
  sourceRef: string;        // LMS entry/contract id
  guestName: string;
  phone: string | null;
  venueLmsId: string | null;
  subVenueLmsId: string | null;
  functionLmsId: string | null;
  eventDate: string | null; // ISO date
  session: 'Lunch' | 'Sundowner' | 'Dinner' | null;
  raw: unknown;             // original row, stored for audit
}
```

Implementation: one `lmsAdapter` calling the `lms-proxy` Edge Function for both leads and contracts. **No demo/mock data in the app** (removed 29 Oct 2026); tests use `src/test/guestFixtures.ts`.

## 9. Field Mapping — to be confirmed

The API file documents prefixes, not exact column names. **Do not guess column names in code.** On Day 6:

1. Call both entertainment endpoints through the proxy and save one anonymised sample response to `docs/lms-samples/`.
2. Fill in the table below from the real response.
3. Write the mapper + a unit test against the sample.

| Our field | Lead field | Contract field |
|---|---|---|
| Guest name | `eh_…` ? | `ehc_…` ? |
| Phone | `eh_…` ? | `ehc_…` ? |
| Venue (LMS id) | `eh_…` / `ehd_…` ? | `ehc_…` / `ehcd_…` ? |
| Sub-venue / location | `ehd_…` ? | `ehcd_…` ? |
| Function type id | `ehd_…` ? | `ehcd_…` ? |
| Event / function date | `ehd_…function_date` ? | `ehcd_…function_date` ? |
| Slot / timing | `ehd_…` ? | `ehcd_…` ? |
| Cancel remarks | `*_cancel_remarks` | `*_cancel_remarks` |

Rules from the API notes:
- **Exclude** rows where `*_cancel_remarks` is filled.
- **Dedup:** when duplicates exist, prefer rows that have `function_date`.
- Timing → session: 12:00 = Lunch, 16:00 = Sundowner, 18:00 = Dinner.
- Unknown request filters (search/pagination body params) must be confirmed with the LMS team; until then, fetch the list and filter server-side in the proxy.

**Open questions for the LMS team:** exact request body/filters for the two entertainment list endpoints; response column names; whether a phone/entry-no lookup exists; real `loggeduserid` to use.

---

# PART C — GUEST PRICING TOOL

## 10. Workflow

**Guest Details + Function → All Active Packages → Select one or more Packages → Customise Elements (per package) → Additional Charges → Final Quote → Save**

Single page with stacked sections (works on tablet/mobile). No separate function-selection screen.

### 10.1 Guest Details

Source toggle: **Fetch from Contract** · **Fetch from Lead** · **Enter Manually**

- Contract / Lead: search box → results list (name, phone, function, date, venue) → select → form auto-fills → staff can correct fields.
- Manual: empty form.

Form fields: Guest name*, Phone*, Venue*, Sub-venue, Event date*, Session*, Function*.
Validation: 10-digit Indian mobile (allow +91), date required, required dropdowns.
States: loading spinner, "No results", LMS error message with retry, and manual entry always available as fallback.

### 10.2 Packages

As soon as the function is chosen, show **all active packages** — those tagged with the guest's function first, the rest under "Other packages" — as cards: image, name, tier badge, display price (if set). **A quote can include several packages** (changed 26 Oct 2026 at the user's request; originally one). Customise and the quotation show **one section per package with its own subtotal**; if the same element is in two chosen packages it appears in both sections as separate lines.

### 10.3 Customise Elements

Loads only the elements mapped to the selected package.

| Include ☑ | Image | Element | Qty | Rate (₹) | Amount (₹) |
|---|---|---|---|---|---|

- Qty and rate are editable per quote; amount recalculates instantly.
- Overridden rates are highlighted and show the master rate as a hint; a reason field is optional (required if the rate is lowered by more than a configurable %, decision pending).
- Changing qty/rate here never touches the master element or package defaults.

### 10.4 Additional Charges

Repeatable rows: description + amount (e.g. Transportation, Labour, Additional services). Add / remove before saving.

### 10.5 Final Quote

Shows: Quote ID (after save), guest, phone, function, venue + sub-venue, date + session, package + tier, included elements with qty/rate/amount, elements subtotal, charges, **final total**, status.

Actions:
- **Save Quote** (Day 8) — priority.
- **Download PDF / Download Excel** — shown only once the quote is saved; built from the saved snapshot (not the unsaved draft). There is no "Sent" status: status flow is Draft → Confirmed / Cancelled (0017).
- **Share with Guest** — hidden until a delivery method (WhatsApp/email provider) is chosen and configured. No fake success messages.

## 11. Calculations (single shared module `src/lib/pricing.ts`, unit tested)

```
lineAmount            = qty × rate
elementsSubtotal      = Σ lineAmount   (included rows only)
chargesTotal          = Σ charge.amount
finalTotal            = elementsSubtotal + chargesTotal

lineCost              = qty × unitCost            (null if unitCost unknown)
lineProfit            = lineAmount − lineCost
marginPct             = sellingAmount = 0 ? null : profit / sellingAmount × 100
```

- All results rounded to 2 decimals with one `roundMoney()` helper.
- Inputs validated: qty > 0, rate ≥ 0, charge amount ≥ 0, finite numbers only.
- The same totals are **recomputed in the database** by the `save_quote` RPC; the client value is not trusted.

---

# PART D — DATABASE (Supabase)

All business tables: `id uuid primary key default gen_random_uuid()`, **`owner_id uuid not null default auth.uid() references auth.users on delete cascade`**, `created_at`, `updated_at` (trigger), plus `unique (owner_id, id)` so children can use composite FKs. Every index on a business table starts with `owner_id`.

| Table | Key columns |
|---|---|
| `profiles` | id = `auth.users.id`, full_name, business_name, logo_path, contact_line, lms_logged_user_id (nullable) |
| `elements` | name, unit, default_rate, default_qty, image_path, is_active |
| `packages` | name, tier, display_price, image_path, video_url, is_active; optional functions via `package_functions` (0024) |
| `package_elements` | package_id, element_id, default_qty — unique (package_id, element_id) |
| `function_options` | name, lms_id, sort_order, is_active |
| `venues` / `sub_venues` | name, lms_id, venue_id (for sub-venues), is_active |
| `sessions` | name, lms_timing (12:00 / 16:00 / 18:00) |
| `vendors` | name, contact, phone, notes, is_active |
| `vendor_rate_entries` | element_id, vendor_id, purchase_date, qty, unit, rate_per_unit, logged_by, logged_at, voided_at, void_reason |
| `quotes` | quote_no (e.g. `ENT-2026-00001`, from a **per-user counter** so each user's numbering starts at 1; unique (owner_id, quote_no)), status, source (`manual`/`lms_lead`/`lms_contract`), source_ref, source_raw jsonb, **snapshot**: guest_name, phone, venue_name, sub_venue_name, event_date, session, function_name, package_name, package_tier; elements_subtotal, charges_total, final_total |
| `quote_items` | quote_id, element_id (nullable ref), **snapshot**: element_name, unit, image_path, master_rate_at_quote, qty, rate, amount, is_included, unit_cost_at_quote (nullable) |
| `quote_charges` | quote_id, description, amount |
| `rate_change_logs` | change_type (`master_rate` / `package_default_rate` / `quote_override`), element_id, element_name, package_id, quote_id, old_rate, new_rate, reason, changed_by, changed_at |
| `audit_log` | table_name, row_id, action, old_data jsonb, new_data jsonb, actor, at |

Constraints & indexes:
- `check (rate >= 0)`, `check (qty > 0)`, `check (amount >= 0)` on money/qty columns.
- `quote_status` enum: `draft`, `sent`, `confirmed`, `cancelled`.
- Indexes on `quotes(created_at)`, `quotes(status)`, `quotes(function_name)`, `quotes(package_name)`, `quote_items(quote_id)`, `vendor_rate_entries(element_id, purchase_date desc)`, `rate_change_logs(element_id, changed_at desc)`.

Snapshots: quotes copy names, rates and labels at save time, so later edits to elements/packages/functions never change saved quotes.

Append-only: `rate_change_logs`, `vendor_rate_entries`, `audit_log` — RLS allows insert + select only; no update/delete (vendor entries can only be voided via an RPC).

Server-side logic:
- `save_quote(payload jsonb)` RPC — one transaction: validate, recompute totals, insert quote + items + charges, write `quote_override` logs for rates that differ from master, return quote_no.
- Trigger on `elements` rate update → `master_rate` log (reason passed via RPC `update_element_rate`).

RLS summary (per-user isolation):
- Every business table: `select / insert / update` only where `owner_id = auth.uid()`; insert forces `owner_id = auth.uid()` (a user can't create rows for someone else).
- No `delete` policy on quotes, logs, vendor rate entries or audit rows (history is permanent); elements/packages are archived, not deleted.
- `profiles`: a user reads/updates only their own row.
- No `anon` access to any table. All policies are `to authenticated`.
- RPCs (`save_quote`, `update_element_rate`, …) are `security invoker` and re-check `owner_id = auth.uid()` for every referenced row.
- SQL tests prove user A cannot read, update or reference user B's rows.

Storage: per-user folders `{user_id}/elements/…`, `{user_id}/packages/…`, `{user_id}/brand/…`; policies allow read/write only where `(storage.foldername(name))[1] = auth.uid()::text`. File type (jpg/png/webp) and size (≤ 2 MB) checked in UI and bucket policy. Guest Studio images are served via short-lived signed URLs.

---

# PART E — LEDGERS, P&L, UI, SECURITY

## 12. Rate History

Tabs:
1. **Vendor Purchase Rates** — per element, the screenshot layout (§5).
2. **Master Rate Changes** — date/time, element, old → new, by, reason.
3. **Quote Overrides** — date/time, element, master rate, quote rate, quote no (link), by, reason.
4. **Package Default Rates** — only if that feature is enabled later.

Filters: element, vendor, date range, changed by. Never overwrite history.

## 13. Quote Ledger

Searchable table: Quote No · Guest · Function · Package · Total · Status · Created by · Created date.
Filters: date range, function, package, status, created by. Search by quote no / guest / phone.
Open a quote → read-only snapshot view; status change (draft → sent → confirmed / cancelled) logged in `audit_log`.

## 14. P&L Reports

Per quote and aggregated (date range, function, package, status = confirmed by default):

| Element | Qty | Selling rate | Unit cost | Total selling | Total cost | Profit | Margin % |
|---|---|---|---|---|---|---|---|

- Cost is kept separate from selling rate. **Missing cost → show "Cost not available"** and mark the quote's P&L as incomplete; never treat it as 0.
- Margin when total selling = 0 → "—".
- Additional charges: treated as pass-through (no cost) **unless the business says otherwise** — to confirm.

**To confirm before Day 10:**
1. Is the unit cost = latest vendor purchase rate on/before event date, or an agreed standard cost per element?
2. Which vendor wins if several vendors supply the same element?
3. Do additional charges have a cost side?
4. Should P&L use the cost at quote time (snapshot) or at event date?

## 15. UI

### Client-facing (critical)
The app is opened **in front of guests/clients**, so it must look premium and professional at all times.
- **Guest View (presentation mode):** a toggle on New Quote and on a saved quote that shows a clean, branded quotation — guest/event details, package, included elements, qty, rate, amount, charges, total. It **never** shows unit cost, profit, margin, master rate hints, override highlights, vendor names or internal remarks.
- Internal-only data (P&L, Rate History, vendor rates, cost columns) lives on separate screens and is never rendered inside the guest view, not just hidden with CSS.
- Polished visuals everywhere: brand header, consistent typography (Inter), generous whitespace, aligned numbers (tabular figures), no debug text, no raw error dumps, no "lorem"/placeholder data in front of guests.
- Package cards and element images are shown large and clean in guest view; missing images get a tasteful neutral placeholder.
- Works full-screen on a tablet/laptop held up to the guest.

### General
- Clean SaaS dashboard: left sidebar (collapsible on mobile), top bar with user + sign-out.
- Tailwind only, consistent spacing, Inter-style sans font, ₹ formatting via `Intl.NumberFormat('en-IN')`, dates like "18 Oct 2026".
- Every list: loading skeleton, empty state, error with retry.
- Forms: inline validation messages; success toasts only for real successes.
- Confirm dialog before archive, delete charge row, cancel quote, void vendor entry.
- SVG icons only (no emoji), one shared `Icon` component.
- Admin screens desktop-first; New Quote flow must work on tablet and phone.
- No decorative animation.

### PWA (installable app)
- Installable on Android, iPhone/iPad, Windows and Mac (`vite-plugin-pwa`): standalone window, app icon, splash colours.
- "Install app" in the user menu and on the login screen (native prompt on Chrome/Edge/Android; Share → Add to Home Screen steps on iOS).
- Service worker precaches **only the app shell** (JS, CSS, HTML, icons, fonts). **Supabase data, auth and signed image URLs are never cached** — nothing from one user stays on a shared device.
- "A new version is available — Reload" toast when a deploy lands; offline banner when the network drops (no offline data editing in v1).
- Icons generated from `public/app-icon.svg` (`npm run pwa:icons`). The home-screen icon is the app's, not each user's logo (browsers allow one icon per app).
- Requires HTTPS in production (localhost works for testing).

## 16. Security

- Only the Supabase **anon** key and URL in the frontend. Service-role key and LMS settings live in Edge Function secrets.
- `.env.example` with placeholders; `.env` in `.gitignore`.
- Validate money/qty in UI **and** in DB (checks + RPC).
- Quotes, logs and audit rows are never hard-deleted.
- Edge Function verifies the caller's JWT and only proxies whitelisted LMS endpoints.

### 16.1 Accounts & passwords (invite-only)

- **No public sign-up.** Supabase → Authentication → "Allow new users to sign up" is **off**. The login screen has no "Create account" link.
- **Accounts are created by the owner** in Supabase Dashboard → Authentication → Users → *Add user* (email + default password (kept by the owner, not written here), "Auto confirm" on).
- The sign-up trigger creates the user's `profiles` row with `must_change_password = true` and seeds their own option lists.
- **First login:** if `must_change_password` is true, every route redirects to `/change-password`. The form asks for the current password, a new password and confirmation. **No password rules** (user's choice) — only Supabase Auth's own minimum length (6 characters by default) applies. The current password is verified by re-signing in; then `supabase.auth.updateUser({ password })` and RPC `mark_password_changed()` clears the flag.
- **Later changes:** Settings → *Change password* — same form.
- **Forgot password:** v1 = owner resets it in Supabase Dashboard back to the default and runs `select reset_must_change_password('<email>')` so the user is forced to change it again. Email-based reset only if SMTP is configured later.
- Passwords are stored only by Supabase Auth (bcrypt). The app never stores, logs or hard-codes passwords.
- **Risk to know:** everyone knows the default, so an account is exposed between creation and first login. Create an account only when handing it to that person, and ask them to log in and change it the same day.
- Supabase Auth's built-in login rate limit stays on; after repeated failures the UI shows "Too many attempts, try again later".

`.env.example`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Edge Function secrets (set with `supabase secrets set`, never in the frontend)
LMS_BASE_URL=https://gyv.inqcrm.in
LMS_LOGGED_USER_ID=1
```

## 17. Testing, Pagination, Rate Limiting & Performance

These apply to **every day**, not a single phase.

### Unit testing (written alongside each feature)
- Vitest + React Testing Library from Day 1; `npm test` must pass before a day is closed.
- Every day adds tests for what it builds: pure logic (pricing, trend, mappers, validators, pagination helpers) at near-100% coverage, plus key component behaviour (forms validate, buttons disabled while saving, empty/error states).
- Supabase is mocked in unit tests; RLS and RPCs are tested with SQL scripts in `supabase/tests/` against the local Supabase stack.
- Each day's Progress Log row records the real test count and result.

### Pagination
- All list screens (Elements, Packages, Quote Ledger, Rate History, Vendors, P&L detail) use **server-side pagination**: Supabase `.range()` + `count: 'exact'` (or `'estimated'` for large tables); page size 25 default, options 25/50/100.
- Append-only, fast-growing tables (`rate_change_logs`, `vendor_rate_entries`, `audit_log`) use **keyset pagination** on `(created_at, id)` to stay fast at scale.
- Filters, search and page live in the URL query string so views are shareable and survive refresh.
- One reusable `usePaginatedQuery` hook + `<Pagination>` component; no per-page duplicate logic.
- LMS lookups: the proxy returns paged results (default 20) and the UI shows "Load more".

### Rate limiting
- **LMS proxy (Edge Function):** per-user limit (proposed 30 requests/min) using a `rate_limits` table with an atomic `check_rate_limit(key, limit, window)` RPC; returns HTTP 429 with `Retry-After`. Also protects LMS from bursts.
- **Write RPCs** (`save_quote`, `update_element_rate`, vendor rate entry): per-user limit (proposed 20/min) checked inside the RPC.
- **Auth:** Supabase Auth's built-in sign-in rate limits stay enabled; login UI shows a clear "Too many attempts, try again later" message.
- **Client side:** search inputs debounced (300 ms); submit buttons disabled while a request is in flight (no double-saves); 429 responses show the retry time instead of a generic error.
- Exact limits are config values, adjustable without code changes.

### Performance
- Route-level code splitting (`React.lazy` + `Suspense`) so each page loads only its own code.
- TanStack Query for caching, request de-duplication and background refetch; master data (functions, venues, sessions, tiers) cached for long periods.
- Select only the needed columns (no `select('*')` in lists); counts and totals computed in SQL views/RPCs, not by fetching all rows.
- Indexes for every filter/sort column used by lists (see Part D) plus `pg_trgm` index for name/phone search.
- Images: Supabase Storage image transforms for thumbnails, `loading="lazy"`, fixed size to avoid layout shift.
- Memoised row components and derived totals in the pricing table so editing one row doesn't re-render the whole quote.
- Bundle size checked at each build; target initial JS < 200 KB gzip.

---

# PART F — DAY-WISE PLAN

| Day | Scope | Acceptance criteria |
|---|---|---|
| **1 — Setup** | Vite + React + TS + Tailwind, React Router with lazy routes, sidebar layout, all nav routes as placeholders, Supabase client, TanStack Query, Vitest + Testing Library, shared `Pagination` component + helpers, `.env.example`, README, MEMORY.md | `npm run dev` starts; `npm run build`, `tsc --noEmit`, `npm test` pass |
| **2 — Database** | Migrations for all tables in §D with `owner_id`, composite FKs, enums, checks, indexes, triggers, per-user RLS, per-user storage folders, sign-up trigger that seeds the user's own functions/venues/sessions/tiers | Migrations apply cleanly; `packages` has no function link; anon reads nothing; **user A cannot read/write/reference user B's rows** (SQL tests) |
| **3 — Auth** | Login, logout, session persistence, protected routes, **forced password change on first login**, change-password in Settings, business profile (name, logo) used as Studio branding (§16.1) | Logged-out user redirected; new user with default password cannot reach any screen until the change-password step is done; new user gets own seeded options; two test users see only their own data |
| **4 — Elements** | List, search, create/edit form, rate validation, image upload, archive/restore, master-rate change log | CRUD works; archive hides from pickers; rate change creates log row |
| **5 — Packages** | Package list/cards, editor with element table, include + default qty, tier, image, video link, active toggle | Mappings persist and reload; no function field anywhere |
| **6 — Guest details + LMS** | `lms-proxy` Edge Function, lead/contract adapters, mocks, capture real sample, field mapper + tests, manual form, validation | Search works on mock; real call tested if LMS reachable; cancelled rows excluded; manual entry always works |
| **7 — Packages + pricing** | All active packages shown after function chosen, select package, element table with include/qty/rate, `pricing.ts` + Vitest | Changing function does not change package list; calc tests pass |
| **8 — Save quotes** | Additional charges, summary, **Guest View presentation mode** (§15), `save_quote` RPC, quote numbers, snapshots, reopen, override logs | Edit an element after saving → saved quote unchanged; totals match DB recompute |
| **9 — Ledgers + vendor rates** | Quote Ledger with filters, Rate History tabs, vendor CRUD, vendor rate entry form, trend arrows (§5), void flow | Screenshot layout reproduced; trend logic unit-tested; history append-only |
| **10 — P&L** | Confirm cost rules (§14), cost lookup, per-quote + aggregate report, filters, missing-cost handling | Test cases for profit/margin incl. zero selling and missing cost |
| **11 — PDF + sharing** | Quote PDF, sharing via chosen provider (if credentials provided), responsive + accessibility pass | PDF matches saved snapshot; no share button without a configured provider |
| **12 — Final** | Lint, typecheck, tests, build, RLS review, README (setup, env, migrations, deploy) | All checks green and reported with real output |

## Development Rules

1. One day at a time; explain the day's scope before coding.
2. Inspect the repo first and reuse what works.
3. Write real code in the repo, not chat snippets.
4. Run the checks and report real results; never claim untested features work.
5. Missing API docs / credentials / business rules → safe mock or interface + clearly list what is needed.
6. Never invent endpoints, field names, prices, costs or credentials.
7. Calculations live in one tested module; components stay small and reusable.
8. All DB changes via migrations; all access control via RLS.
9. Update this file's Progress Log and the README as work completes.
10. Unit tests are written in the same day as the feature; a day is not done until `npm test` passes.
11. Every list is paginated server-side; every write/LMS path is rate limited (§17).
12. Record decisions, gotchas and current status in `MEMORY.md` at the end of each day.
13. The app is client-facing: every screen must look professional, and guest-facing views must never expose cost, margin or vendor data (§15).

---

## Open Items (need answers from the business / LMS team)

- [x] Sign-up: **invite-only** — accounts created in Supabase with default password, forced change on first login (§16.1)
- [x] Login ID: **phone number** (mapped to internal `<phone>@phone.invalid`)
- [x] LMS `loggeduserid`: **per user**, stored in `profiles.lms_logged_user_id`
- [ ] Request body / filters and response column names for `get_entertain_infromation_list` and `get_entertain_contract_information_list`
- [ ] Real `loggeduserid` for API calls
- [ ] P&L cost source and rules (§14)
- [ ] Rate-reduction threshold that requires a reason (§10.3)
- [ ] Guest sharing channel (WhatsApp / email) and credentials
- [ ] Quote number format (`ENT-YYYY-#####` proposed)

## Progress Log

| Day | Status | Date | Checks run | Notes |
|---|---|---|---|---|
| 0 — Plan | Done | 23 Oct 2026 | — | This file created |
| 1 — Setup | Done (awaiting approval) | 24 Oct 2026 | typecheck ✓ · lint 0 ✓ · 39/39 tests ✓ · build ✓ | Workspace chooser, Guest Studio (client-facing step flow), My Workspace (sidebar), lazy routes, pagination, query client |
| 2 — Database | Done (awaiting approval + apply in Supabase) | 24 Oct 2026 | typecheck ✓ · lint 0 ✓ · 71/71 tests ✓ (31 DB tests on PGlite) · build ✓ | 7 migrations + `APPLY_ALL.sql`, per-user RLS, composite FKs, phone-login helpers, rate limit, storage |
| 3 — Auth (+ PWA) | Done — approved, real login tested by user | 24 Oct 2026 | typecheck ✓ · lint 0 ✓ · 116/116 tests ✓ · build ✓ (~172 KB gzip initial) | PWA install + update toast + offline banner; Phone login, forced password change, sign-out clears cache, guards, Settings (business name, logo, contact, LMS id), DB sign-up lock (0008) |
| 4 — Elements | Done — approved, tested by user on live DB | 24 Oct 2026 | typecheck ✓ · lint 0 ✓ · 145/145 tests ✓ (38 DB) · build ✓ | List (search, Active/Archived, sort, server pagination), add/edit dialog with image + rate-change reason + recent history, archive/restore with confirm, toasts. DB: rate history trigger, update_element RPC, 60/min write limit, rate logs server-written only |
| 5 — Packages | Done — approved, tested by user on live DB | 26 Oct 2026 | typecheck ✓ · lint 0 ✓ · 170/170 tests ✓ (43 DB) · build ✓ | Cards list (search, tier filter, Active/Inactive, pagination), editor page (details, image, video, active switch, element picker with qty + live total, unsaved-changes guard). DB: save_package RPC (atomic), package_summaries view (security_invoker), 60/min write limit. Shared lib/pricing.ts (exact BigInt line amounts) |
| 6 — Guest details | Done — approved (tested with mock LMS); LMS field mapping pending | 26 Oct 2026 | typecheck ✓ · lint 0 ✓ · 199/199 tests ✓ · build ✓ | Studio step 1: Find contract / Find lead / Enter manually, masked phones in results (max 5), form with function/venue/sub-venue/date/session + validation, per-user session draft (cleared on sign-out), later steps guarded. lms-proxy Edge Function (auth, 30/min, whitelisted endpoints, cancelled rows dropped, dedupe) + shared tested helpers; FIELD_MAP intentionally unmapped → 501 lms_mapping_pending. No migration |
| 7 — Package selection + pricing | Done — tested by user on live DB | 26 Oct 2026 | typecheck ✓ · lint 0 ✓ · 213/213 tests ✓ · build ✓ | Studio step 2: all active packages as cards (no function filter, 12 per page + Show more, video link, guest summary). Step 3: package elements with include/qty, rates behind staff-only "Adjust rates", live amounts + subtotal via lib/pricing, reset to package, confirm before switching package; draft keeps package + lines; step guard (reachable()). Guest-safe catalogue reads in src/data/studioCatalog.ts. No migration |
| 8 — Saving quotations | Done — approved; 0011 confirmed live | 26 Oct 2026 | typecheck ✓ · lint 0 ✓ · 236/236 tests ✓ (58 DB) · build ✓ | Studio step 4: additional charges (quick-add + rows), branded QuoteDocument, Final = subtotal + charges, Save quote / Save changes (draft re-save in place), full-screen Guest View, PDF button disabled "soon", no share button. Saved quote page /studio/quotes/:id from snapshot. DB: save_quote RPC — server-built snapshot names, server totals, quote_override logs (deduped), draft-only re-save, 20/min |
| 9 — Ledger | Done — 0012 + 0013 confirmed live; + multi-package quotes | 26 Oct 2026 | typecheck ✓ · lint 0 ✓ · 256/256 tests ✓ (60 DB) · build ✓ | Quote Ledger (search quote no/guest/phone, status/function/package/date-range filters, pagination), quote detail (document + status actions with confirm, status history, overrides, source). Rate History tabs: vendor purchase rates (screenshot layout, trend via SQL view, log entry w/ inline vendor, void w/ reason), master rate changes + quote overrides (keyset Load more). DB: vendor_rate_history view, rate limits on vendors/vendor entries |
| 10 — P&L | Done (awaiting approval + apply 0014) | 26 Oct 2026 | typecheck ✓ · lint 0 ✓ · 291 tests ✓ (71 DB) · build ✓ | Cost = element unit_cost (internal) else latest non-void vendor rate up to min(save date, event date); locked on save (unit_cost_at_quote + cost_source); back-filled old quotes. quote_pnl / quote_item_pnl views + pnl_totals RPC. P&L page: status (default Confirmed), event-date range, function, package; KPIs; per-quote rows with "Cost missing"; expandable line P&L. Charges pass-through. Guard test: guest-facing data modules never select cost columns |
| 10b — Delete elements / packages | Done (awaiting apply 0015) | 27 Oct 2026 | 298 tests ✓ (78 DB) · build ✓ | Permanent delete with confirm; package always deletable; element blocked while in a package or with vendor history; quotes + rate logs keep snapshots (ON DELETE SET NULL on id column only); image cleaned up |
| 10c — Editable quotes + repeat send | Done (awaiting apply 0016) | 27 Oct 2026 | 306 tests ✓ (79 DB) · build ✓ | Draft + Sent quotes editable (Edit quote → Studio, re-save in place; Sent stays Sent + 'Edited after sending' log); Confirmed/Cancelled locked. mark_quote_sent repeatable (sent_count, last_sent_at, 'Sent again' history). Quotes store option ids for reopening |
| 10d — Remove Sent + PDF/Excel | Done (awaiting apply 0017) | 27 Oct 2026 | typecheck ✓ · lint 0 ✓ · 321/321 tests ✓ (81 DB) · build ✓ | Sent status and Mark as sent removed everywhere (0017: old Sent → Draft without audit rows, check constraint, mark_quote_sent + sent_count/last_sent_at dropped). Only drafts are editable. Quotation step: Download PDF (pdfmake, Roboto with ₹) + Download Excel (exceljs, real numbers, Indian ₹ format) once saved, from the saved snapshot, branded with the user's business name/contact. Libraries lazy-loaded, kept out of the PWA precache |
| 10e — Charge master rates | Done (awaiting apply 0018) | 27 Oct 2026 | typecheck ✓ · lint 0 ✓ · 340/340 tests ✓ (84 DB) · build ✓ | `charge_rates` master table per user (0018): Transportation = fixed amount (default ₹0, set in Settings), Labour = ₹500 × 2 per package × packages. Customise step pre-adds them, read-only until Adjust rates (adjusted amount stops following the package count); removed lines stay removed, chip brings them back. Reopened quotes keep saved charges. Catalogue → Additional charges page (/admin/charges). Also: one combined guest search, package cards without price, elements start unticked, Go to home after save |
| 10f — Charge rates per venue | Done (awaiting apply 0019) | 27 Oct 2026 | 346 tests ✓ (87 DB) · build ✓ | `charge_venue_rates` + `save_charge_rate` RPC; Additional charges page has Default + one row per venue (Exotica, Pushpanjali, Manaktala — renamed from Emerald Green in 0020 — Restro); blank = default, ₹0 = not charged. Studio uses the quote venue's rate |
| 10g — Remarks + multiplier | Done (awaiting apply 0021–0023) | 27 Oct 2026 | 353 tests ✓ (92 DB) · build ✓ | Element remarks (Elements column; guest-facing under the element name on Customise, quotation, PDF, Excel; snapshot in quote_items). Element multiplier in the workspace element form (guest rate = rate × multiplier via elements.selling_rate); Studio never sees the multiplier |
| 10h — Package functions | Done (awaiting apply 0024) | 27 Oct 2026 | 358 tests ✓ (94 DB) · build ✓ | Optional functions per package (chips in the editor); Studio lists the guest's function packages first ("For Sangeet"), then "Other packages" — studio_packages RPC, still server-paginated, nothing hidden. Also: digits-only 10-digit phone, no confirm when removing a package |
| 11 — Sharing | Not started (PDF done in 10d) | | | |
