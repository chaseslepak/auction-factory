-- Phase 11: optional starting_bid per lot.
--
-- Nullable. Null (the default) means "no override" — the Browser Upload
-- export falls back to $1.00 (the historical hardcoded value). Set to
-- any positive dollar amount to send that instead.
--
-- Chase runs this once in Supabase → SQL Editor.

ALTER TABLE lots
  ADD COLUMN IF NOT EXISTS starting_bid NUMERIC(10, 2);
