-- Phase 18: auto AF session renewal timestamp.
--
-- Adds last_renewed_at to af_session so /api/af-session/renew can
-- rate-limit itself to one attempt per 10 minutes. Prevents AF
-- account lockout when auto-renewal races on a stale cookie.
--
-- Chase runs this once in Supabase → SQL Editor; the route tolerates
-- the column being absent (falls back to upserting without it).

alter table public.af_session
  add column if not exists last_renewed_at timestamptz;
