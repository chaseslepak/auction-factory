# Good morning! Everything I built overnight

**TL;DR:** I worked through the full "weaknesses" list and built everything I could do without external services. Branch: `claude/auction-listing-mobile-app-xEAR8`. Vercel should have auto-deployed it all.

---

## Before you test — run this SQL in Supabase

I added several new tables and columns. Paste this entire block into the Supabase SQL Editor and hit Run. It's idempotent (safe to run multiple times).

```sql
-- Jobs (background queue)
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  auction_id uuid references public.auctions(id) on delete cascade,
  lot_id uuid references public.lots(id) on delete cascade,
  payload jsonb default '{}',
  result jsonb default null,
  error text default null,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz default null,
  completed_at timestamptz default null
);
create index if not exists idx_jobs_status on public.jobs(status, type);
create index if not exists idx_jobs_auction on public.jobs(auction_id);
create index if not exists idx_jobs_created on public.jobs(created_at desc);
alter table public.jobs enable row level security;
drop policy if exists "auth_select_jobs" on public.jobs;
drop policy if exists "auth_insert_jobs" on public.jobs;
drop policy if exists "auth_update_jobs" on public.jobs;
drop policy if exists "auth_delete_jobs" on public.jobs;
create policy "auth_select_jobs" on public.jobs for select to authenticated using (true);
create policy "auth_insert_jobs" on public.jobs for insert to authenticated with check (true);
create policy "auth_update_jobs" on public.jobs for update to authenticated using (true);
create policy "auth_delete_jobs" on public.jobs for delete to authenticated using (true);

-- Soft delete + archive
alter table public.lots add column if not exists deleted_at timestamptz default null;
create index if not exists idx_lots_deleted_at on public.lots(deleted_at) where deleted_at is null;
alter table public.auctions add column if not exists archived_at timestamptz default null;
create index if not exists idx_auctions_archived on public.auctions(archived_at);

-- Activity log
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  auction_id uuid,
  details jsonb default '{}',
  created_at timestamptz not null default now()
);
create index if not exists idx_activity_log_created on public.activity_log(created_at desc);
create index if not exists idx_activity_log_auction on public.activity_log(auction_id);
create index if not exists idx_activity_log_user on public.activity_log(user_email);
alter table public.activity_log enable row level security;
drop policy if exists "auth_select_activity" on public.activity_log;
drop policy if exists "auth_insert_activity" on public.activity_log;
create policy "auth_select_activity" on public.activity_log for select to authenticated using (true);
create policy "auth_insert_activity" on public.activity_log for insert to authenticated with check (true);

-- API usage tracking
create table if not exists public.api_usage (
  id uuid primary key default gen_random_uuid(),
  service text not null,
  operation text not null,
  auction_id uuid references public.auctions(id) on delete set null,
  lot_id uuid references public.lots(id) on delete set null,
  input_tokens int default 0,
  output_tokens int default 0,
  estimated_cost_cents int default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_api_usage_created on public.api_usage(created_at desc);
create index if not exists idx_api_usage_service on public.api_usage(service);
create index if not exists idx_api_usage_auction on public.api_usage(auction_id);
alter table public.api_usage enable row level security;
drop policy if exists "auth_select_api_usage" on public.api_usage;
drop policy if exists "auth_insert_api_usage" on public.api_usage;
create policy "auth_select_api_usage" on public.api_usage for select to authenticated using (true);
create policy "auth_insert_api_usage" on public.api_usage for insert to authenticated with check (true);

-- Edit history
create table if not exists public.lot_edits (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid references public.lots(id) on delete cascade,
  user_email text,
  field text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);
create index if not exists idx_lot_edits_lot on public.lot_edits(lot_id, created_at desc);
alter table public.lot_edits enable row level security;
drop policy if exists "auth_select_lot_edits" on public.lot_edits;
drop policy if exists "auth_insert_lot_edits" on public.lot_edits;
create policy "auth_select_lot_edits" on public.lot_edits for select to authenticated using (true);
create policy "auth_insert_lot_edits" on public.lot_edits for insert to authenticated with check (true);

-- Allowed users (replaces env var)
create table if not exists public.allowed_users (
  email text primary key,
  role text not null default 'lotter' check (role in ('admin', 'lotter')),
  created_at timestamptz not null default now()
);
alter table public.allowed_users enable row level security;
drop policy if exists "auth_select_allowed_users" on public.allowed_users;
drop policy if exists "auth_insert_allowed_users" on public.allowed_users;
drop policy if exists "auth_delete_allowed_users" on public.allowed_users;
drop policy if exists "auth_update_allowed_users" on public.allowed_users;
create policy "auth_select_allowed_users" on public.allowed_users for select to authenticated using (true);
create policy "auth_insert_allowed_users" on public.allowed_users for insert to authenticated with check (true);
create policy "auth_delete_allowed_users" on public.allowed_users for delete to authenticated using (true);
create policy "auth_update_allowed_users" on public.allowed_users for update to authenticated using (true);

insert into public.allowed_users (email, role)
values ('chase.slepak@gmail.com', 'admin')
on conflict (email) do nothing;
```

---

## What's new

### Background job queue for Find Stock Images
The "Find Stock Images" button now enqueues each candidate lot as a job and the server processes them in the background, one at a time. You can **close the tab and the processing continues**. When you come back, the progress bar picks up automatically.

Self-invoking chain with fallback: if the chain breaks, the client polling detects stalls and kicks the processor back into action. A daily Vercel cron runs as a last resort.

### Admin panel at `/admin`
Accessible via the "Admin" link on the auctions page. Contains:

- **Trash** — see all soft-deleted lots, restore individual or empty the whole trash
- **Users** — add/remove authorized emails, toggle admin vs lotter role
- **Activity Log** — see what happened and when, filter by user
- **API Costs** — Anthropic spending dashboard with per-operation breakdown and 24h/all-time totals
- **AF Connection** — shortcut to the Settings page for AF cookie management

### Lot list improvements (on auction detail page)
- **Search box** — filter by name, brand, model, or lot number
- **Status filter** — all / not uploaded / uploaded to AF / failed
- **Sort** — lot #, price (high→low or low→high), confidence
- **Select mode** — bulk selection with multi-select
- **Bulk delete** — soft-delete many lots at once
- **Bulk edit** — apply price multiplier (e.g. 1.1 = +10%), change category, or change condition for all selected lots

### Photo management (on existing lots in edit mode)
- **Delete individual photos** — X button on each
- **Add new photos** — tap the + button
- **Drag to reorder** — drag photos on desktop
- **Left/right arrow buttons** — reorder on mobile (touch-friendly)
- **"PRIMARY" label** on the first photo

### Edit history (on existing lots)
After editing a lot, a **History** button appears showing all past edits with:
- Who made the edit (email)
- When it happened
- Which fields changed (with before → after values)

### Duplicate detection
When reviewing a newly-generated lot, if the AI identified the same brand+model as another lot in the same auction, you'll see a yellow warning banner listing the potential duplicates.

### Retry logic
AF uploads now automatically retry up to 2 times with exponential backoff. Session-expired errors don't retry.

### AF session cookie encryption
The AF session cookie is now AES-256-GCM encrypted before being stored in Supabase. Existing plaintext cookies still work (backward compatible).

### Cost tracking
Anthropic API calls log token usage and estimated cost. View it at `/admin/costs` — shows total spent, last 24h, and per-operation breakdown.

### Archive auctions
On the auction list, each auction has an "Archive" button. Archived auctions are hidden from the main view. Toggle "View Archived" to see and restore them.

### Failed upload tooltips
Failed AF upload badges show the error reason when you hover (desktop) or long-press (mobile).

---

## Things to test

1. **Background stock image scan**
   - Go into an auction → click "Find Stock Images"
   - Close the tab
   - Come back 20 min later → progress resumed automatically
   - Lots should have new stock images as primary photo

2. **Admin panel** — visit `/admin` and click through each section

3. **Search + filter** on the lot list — type a brand name, change filters, sort

4. **Bulk edit** — enable Select mode, tap a few lots, hit Edit, apply a 1.1 price multiplier

5. **Photo management** — edit an existing lot, delete a photo, add a new one, reorder with arrow buttons

6. **Trash recovery** — delete a lot, go to `/admin/trash`, restore it

7. **Archive** — archive an auction, see it in the archived view, restore it

8. **Edit history** — edit a lot field, save, then tap "History" button to see the change

---

## Still not done (couldn't do autonomously)

- **Railway Playwright worker** — needs external Railway account setup and deployment
- **True offline PWA support** — needs real device testing with photo queue sync
- **Automated tests** — I can write them but can't verify they pass without running them

---

## If something is broken

The most likely issue is an unrun SQL migration. Check if you ran the full SQL block above. If not, run it and refresh the app.

Other common issues:
- **Stock image scan stuck** — open `/admin/trash` to verify Supabase connection works. If yes, manually kick the processor in the browser console: `fetch('/api/jobs/process', {method:'POST'})`
- **Admin pages show redirects** — hard refresh (Cmd+Shift+R) to get the latest middleware
- **Encryption errors** — set `ENCRYPTION_SECRET` env var in Vercel (falls back to service role key if not set)

Sleep well.
