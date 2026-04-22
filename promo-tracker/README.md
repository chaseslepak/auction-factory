# Promo Tracker

Desktop web app for CPG sales reps (Boylan Bottling, Pretty Tasty) to log
promotional activity for accounting (invoicing / billbacks) and operations
(forecast / demand planning).

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind · Supabase (Postgres + Auth +
Storage) · react-hook-form + zod · @tanstack/react-table · papaparse.

## Getting started

```bash
cp .env.example .env.local   # fill in from Supabase project settings
npm install
npm run dev
```

Then run the migration on your Supabase project:

```bash
# from supabase/migrations/0001_init.sql
# paste into the Supabase SQL editor, or use the Supabase CLI:
supabase db push
```

## Roles

- `sales` — create/edit promos on their assigned brands (via `user_brand_access`)
- `accounting` — read all, update status, export
- `ops` — read all, export
- `admin` — full including catalog + user management

Roles live on `user_profiles.role`. Policies are enforced at the database via RLS.

## Data model

- `brands`, `products`, `customers`, `distributors`
- `promotions` + `promotion_items` (one row per SKU × promo)
- `user_profiles`, `user_brand_access`
- `activity_log`

See `supabase/migrations/0001_init.sql` for the full schema.

## Exports

Two CSVs, both accessible via `/exports`:

- **Accounting** — one row per promotion item (plus flat-fee promo rows).
  Columns tuned for deduction reconciliation / billback buildout.
- **Ops** — one row per SKU × ISO week inside the promo date range.
  Feeds demand planner forecast adjustment.

## Project layout

```
src/app/(app)/            authenticated app shell
src/app/login/            magic-link login
src/app/api/              server routes (promotions CRUD, exports, uploads)
src/lib/supabase/         SSR-friendly Supabase clients
src/lib/schemas/          zod schemas shared client + server
src/lib/db/               typed query helpers
supabase/migrations/      schema + RLS
```
