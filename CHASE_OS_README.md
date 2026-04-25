# Chase OS

A multi-tenant executive operating system mounted at `/chase-os` inside the
existing `auction-factory` Next.js app. Auction-factory routes (root `/`,
`/auctions`, `/admin`, etc.) are unchanged; Chase OS uses a separate Supabase
project so the two products' auth and data never collide.

## Modules

| Module | Status | Path |
|---|---|---|
| Today dashboard | Built | `/chase-os` |
| Command Queue | Built | `/chase-os/queue` |
| Tasks | Built (list, new, detail, comments, status) | `/chase-os/tasks` |
| Companies | Built (list, new, detail w/ tasks/people/deals tabs) | `/chase-os/companies` |
| People | Schema + read-only list | `/chase-os/people` |
| Decisions | Schema + read-only list | `/chase-os/decisions` |
| Deals | Schema + read-only list | `/chase-os/deals` |
| Files | Schema + storage bucket | `/chase-os/files` |
| Health | Schema (private RLS) | `/chase-os/health` |
| Client portal | Schema + invite list (admin) | `/chase-os/clients` |
| Reports | Schema (admin) | `/chase-os/reports` |
| Integrations | Schema + provider list (admin) | `/chase-os/integrations` |

## Roles

`owner` · `admin` · `team_member` · `client` — enforced by Postgres RLS via the
`chase_role()`, `is_chase_staff()`, `is_chase_admin()`, and
`client_company_ids()` helper functions.

## Setup

1. Provision a **new Supabase project** dedicated to Chase OS. Copy the URL,
   anon key, and service-role key.
2. Add to `.env.local`:
   ```
   NEXT_PUBLIC_CHASE_SUPABASE_URL=https://xxx.supabase.co
   NEXT_PUBLIC_CHASE_SUPABASE_ANON_KEY=...
   CHASE_SUPABASE_SERVICE_KEY=...
   # Optional: comma-separated allowlist
   CHASE_ALLOWED_EMAILS=chase@chaseos.dev,admin@chaseos.dev
   ```
3. In the Chase Supabase project's SQL editor, run:
   - `supabase/chase_os_init.sql` (schema, enums, RLS, triggers, storage)
   - `supabase/chase_os_seed.sql` (companies, tasks, decisions, queue, etc.)
4. Create the four seed auth users:
   ```
   npx tsx scripts/chase-seed-users.ts
   ```
   Seeded accounts:
   - `chase@chaseos.dev` — Owner
   - `admin@chaseos.dev` — Admin
   - `tm@chaseos.dev` — Team member
   - `jordan@acme.com` — Client (sees only Acme)
5. `npm run dev`, visit `http://localhost:3000/chase-os` — magic-link in.

## Architecture notes

- **Routing**: `src/app/chase-os/(app)/...` is the auth-gated shell;
  `src/app/chase-os/login` and `src/app/chase-os/auth/callback` sit outside
  the route group so the layout-level auth check doesn't loop them.
- **Auth boundary**: `src/middleware.ts` branches on `/chase-os` and delegates
  to `chaseUpdateSession` (`src/lib/chase/supabase/middleware.ts`). All other
  paths still use the original auction-factory middleware logic.
- **Supabase clients**: `src/lib/chase/supabase/{client,server,middleware,admin}.ts`.
  Cookies are namespaced by Supabase project ref so the two products' sessions
  coexist on the same host.
- **Mutations**: Server Actions in `src/lib/chase/actions/{auth,tasks,companies,queue}.ts`.
  Each mutation calls `logActivity()` so `activity_log` reflects all writes.
- **Components**: `src/components/chase/...` — fully isolated from existing
  auction-factory components. Reuses Tailwind brand colors only.

## Verification checklist

- `npx tsc --noEmit` — clean
- `npx next lint --dir src/app/chase-os --dir src/components/chase --dir src/lib/chase` — clean
- `npx next build` — both apps compile
- Visit `/` → still routes to existing auction-factory login (regression check)
- Visit `/chase-os` → routes to `/chase-os/login`
- Sign in as each role and verify RLS-shaped views

## Risks / TODO

- File upload UI (storage put + `task_attachments` insert) is not yet wired.
- Decision approve/reject actions and Deal CRUD are read-only in this drop.
- People/Reports/Integrations/Files/Clients have read views and stubs but no
  write UI yet.
- The `tasks_update` RLS policy uses subquery-style checks; if you observe
  permission anomalies under heavy concurrency, replace with row-locking.
