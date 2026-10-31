# Ambria Entertainment — Pricing & Quotations

Package builder, guest quotation tool, rate ledger and P&L reports for the Entertainment team.
Client-facing: quotes are shown to guests, so guest views never expose cost, margin or vendor data.

Stack: React 19 + TypeScript (Vite 8), Tailwind CSS v4, Supabase (Auth, Postgres, Storage, RLS), TanStack Query, Vitest.

- Full spec and day-wise plan: [PROJECT_PLAN.md](PROJECT_PLAN.md)
- Decisions, gotchas, current status: [MEMORY.md](MEMORY.md)
- LMS API reference: [LMS_API_Mapping (3).md](LMS_API_Mapping%20(3).md)

## Setup

```bash
npm install
cp .env.example .env    # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev             # http://localhost:5174
```

Without `.env` the app still runs and shows a "Supabase is not configured" banner.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Type-check + production build to `dist/` |
| `npm run typecheck` | TypeScript only |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest, once) |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run db:bundle` | Rebuild `supabase/APPLY_ALL.sql` from `supabase/migrations/` |
| `npm run pwa:icons` | Regenerate app icons from `public/app-icon.svg` |

## Installable app (PWA)

The app installs like a native app on phones, tablets and laptops. The service worker only works in a
production build: `npm run build && npm run preview`, then open the printed URL and use **Install app**
(user menu or login screen). Only the app shell is cached — user data always comes from Supabase.

## Environment variables

| Name | Where | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | frontend | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | frontend | Public anon key only — never the service-role key |
| `LMS_BASE_URL` | Edge Function secret | `https://gyv.inqcrm.in` |
| `LMS_LOGGED_USER_ID` | Edge Function secret | `loggeduserid` sent to LMS |

## Project layout

Two sides after login (chooser at `/`):

- **Guest Studio** `/studio` — client-facing quotation flow. Never shows cost, margin or vendor data.
- **My Workspace** `/admin` — internal catalogue, rates, ledger, P&L, settings.

```
src/
  studio/              Guest Studio (client-facing) — may NOT import src/admin (lint-enforced)
  admin/               My Workspace (internal): layout, sidebar, nav, pages
  pages/               Shared pages: workspace chooser, 404
  components/ui/       Shared UI: Icon, BrandMark, Pagination, PageHeader, EmptyState, Spinner, ConfigBanner
  lib/                 env, brand, supabase client, query client, money, date, pagination (+ tests)
  routes/              Route tree, ProtectedRoute (+ tests)
  test/                Vitest setup
```

Database setup, creating users and resetting passwords: [supabase/README.md](supabase/README.md).
Deployment steps are added on Day 12.
