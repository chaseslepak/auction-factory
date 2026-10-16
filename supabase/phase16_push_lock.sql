-- Phase 16: per-auction HQ Push lock.
--
-- Prevents two concurrent HQ Pushes on the same auction (two browser
-- tabs, two users) from racing. Without this, both batches can claim
-- different lots that happened to be in different states on fetch, and
-- when they fail/retry independently the atomic claim predicate at
-- /api/af-upload gets confused.
--
-- Lock is held for the duration of a push; stale locks (older than
-- 15 minutes) are reclaimable by any client — covers the case where
-- a client died without releasing.
--
-- Chase runs this once in Supabase → SQL Editor.

create table if not exists public.auction_push_locks (
  auction_id uuid primary key references public.auctions(id) on delete cascade,
  locked_by text,
  locked_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes')
);

create index if not exists auction_push_locks_expires_idx
  on public.auction_push_locks (expires_at);

alter table public.auction_push_locks enable row level security;

-- Reads are open to any authenticated user so the UI can show "locked"
-- state. Writes are service-role only (via /api/af-upload) so a user
-- can't manually acquire or release someone else's lock.
drop policy if exists "auth_select_push_locks" on public.auction_push_locks;
create policy "auth_select_push_locks" on public.auction_push_locks
  for select to authenticated using (true);
