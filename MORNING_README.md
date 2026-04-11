# Good morning! Here's what was done overnight

## TL;DR

Built 3 phases of improvements. Everything is committed and pushed to `claude/auction-listing-mobile-app-xEAR8`. Vercel should have auto-deployed all of it by the time you read this.

**Before testing anything, run the SQL migrations in Supabase (see "Required SQL" section below).**

---

## What's new

### 1. Background job queue for Find Stock Images
**This was the biggest fix.** The "Find Stock Images" scan now runs entirely in the background on the server. You can close the tab, turn off your phone, go to sleep — it keeps processing.

**How it works:**
- Hit **Find Stock Images** as usual
- A job is created for every eligible lot and stored in Supabase
- The server processes jobs one at a time, self-invoking to chain batches
- You can leave the page — processing continues
- When you come back, the page automatically resumes polling for progress

**Backup:** Vercel cron runs `/api/jobs/process` every 2 hours so even if the self-invocation chain breaks, stuck jobs will resume.

### 2. Lot list improvements
On the auction detail page, above the lots you'll see:
- **Search box** — search by item name, brand, model, or lot number
- **Filter dropdown** — all / not uploaded / uploaded to AF / failed
- **Sort dropdown** — lot # / price high-to-low / price low-to-high / confidence
- **Select button** — enters bulk mode for multi-lot actions
- **Bulk delete** — when in select mode, tap lots to select, then hit Delete

### 3. Soft delete
Deleted lots are no longer permanently removed — they're marked as deleted and hidden from view. This means:
- Accidental deletes are recoverable (via SQL for now)
- You can't permanently destroy data by mistake

### 4. Archive auctions
On the auctions list page:
- **Archive** button on each auction card (hides it from main view)
- **View Archived** toggle at the top to see archived auctions
- **Restore** button on archived auctions to bring them back

### 5. Photo management on existing lots
When viewing an existing lot and entering edit mode, you can now:
- **Delete individual photos** (X button on each thumbnail)
- **Add new photos** (tap the dashed + box at the end)

This way if the AI found a bad photo or you want to add more shots, you can without recreating the lot.

### 6. AF Upload retries
Failed uploads to Auction Factory now automatically retry up to 2 times with increasing delays (1s, 2s). Session expired errors don't retry since that won't fix itself.

### 7. Activity log infrastructure
Database table and logging library are ready. Not wired into the UI yet — you'll see this in a future update.

---

## Required SQL

**Run these in your Supabase SQL Editor before testing:**

### Phase 4: Job queue
```sql
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
create policy "auth_select_jobs" on public.jobs for select to authenticated using (true);
create policy "auth_insert_jobs" on public.jobs for insert to authenticated with check (true);
create policy "auth_update_jobs" on public.jobs for update to authenticated using (true);
create policy "auth_delete_jobs" on public.jobs for delete to authenticated using (true);
```

### Phase 5: Soft delete, archive, activity log
```sql
alter table public.lots add column if not exists deleted_at timestamptz default null;
create index if not exists idx_lots_deleted_at on public.lots(deleted_at) where deleted_at is null;
alter table public.auctions add column if not exists archived_at timestamptz default null;
create index if not exists idx_auctions_archived on public.auctions(archived_at);
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
create policy "auth_select_activity" on public.activity_log for select to authenticated using (true);
create policy "auth_insert_activity" on public.activity_log for insert to authenticated with check (true);
alter table public.lots add column if not exists stock_image_manual_url text default null;
```

---

## Things to test

1. **Find Stock Images background job**
   - Go to an auction with lots
   - Click "Find Stock Images"
   - Confirm — you should see "Queued X lots — processing in background"
   - **Close the tab, walk away for 30 minutes**
   - Come back, open the auction — progress bar resumes automatically
   - When done, new stock images appear on lots

2. **Search and filter**
   - Type a brand name in the search box — lots should filter live
   - Change the filter dropdown to "Not uploaded" — should hide AF-uploaded lots
   - Change sort to "Price (high-low)" — highest priced lots first

3. **Bulk delete**
   - Hit "Select" button
   - Tap a few lots to select them (blue borders)
   - Hit "Delete" — they disappear (soft deleted, not permanent)

4. **Photo management**
   - Open an existing lot
   - Tap "Edit Listing"
   - You should see X buttons on each photo and a + box
   - Tap X on a photo to delete it
   - Tap + to add a new photo from your library

5. **Archive auction**
   - On auctions list, tap "Archive" on an auction
   - It disappears from the list
   - Tap "View Archived" at top — it reappears
   - Tap "Restore" to bring it back

---

## Known limitations

- **Bulk edit for descriptions/prices** — not yet built, only bulk delete
- **Activity log UI** — table exists but no admin panel to view it
- **Trash bin UI** — soft-deleted lots can be recovered via SQL but there's no UI for it
- **Drag-to-reorder photos** — can delete and re-add but not drag to reorder yet
- **Railway Playwright worker** — still need to set up externally (I couldn't do this autonomously)
- **Offline support** — not implemented; needs device testing

---

## Files changed

**New files:**
- `src/app/api/jobs/enqueue/route.ts`
- `src/app/api/jobs/process/route.ts`
- `src/app/api/jobs/status/route.ts`
- `src/app/api/lot-photos/route.ts`
- `src/lib/stock-image-processor.ts`
- `src/lib/activity.ts`
- `supabase/phase4_jobs.sql`
- `supabase/phase5_features.sql`

**Modified:**
- `src/app/auctions/page.tsx` (archive)
- `src/app/auctions/[id]/page.tsx` (search, filter, sort, bulk, soft delete, job polling)
- `src/app/auctions/[id]/lots/[lotId]/review/page.tsx` (photo management)
- `src/app/api/af-upload/route.ts` (retry logic)
- `vercel.json` (job processor cron)

**Commit history** on branch `claude/auction-listing-mobile-app-xEAR8`:
- Phase 1: Background job queue for stock image scanning
- Phase 2: Search, filter, sort, bulk edit, soft delete, archive
- Phase 3: Photo management + retry logic

---

## If something breaks

1. Check Vercel dashboard — did the latest deploy succeed?
2. Check Supabase SQL Editor — did the migrations run without errors?
3. Check browser console for any JS errors
4. Tell me what error you see and I'll fix it

Sleep well 🌙
