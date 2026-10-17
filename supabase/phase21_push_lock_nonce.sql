-- Phase 21: per-invocation nonce on auction push locks.
--
-- Previously the "same holder" lock check used only locked_by (user
-- email). That lets two of Chase's own tabs bypass the lock and race
-- the push: cookie thrash, duplicate idempotency scrapes, overlapping
-- verify passes. Add a nonce that's unique per invocation; same-user-
-- different-nonce now refuses the lock.
--
-- Chase runs this once in Supabase → SQL Editor.

alter table public.auction_push_locks
  add column if not exists nonce text;
