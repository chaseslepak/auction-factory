-- Phase 15: Durable AF identity + per-attempt telemetry.
--
-- Two tables:
--
-- 1. lots.af_item_id (new column): the integer AF assigns to each item
--    on successful upload. Captured by parsing the AF response. This
--    becomes the DURABLE key the audit, relot-sync, and duplicate
--    detection all key on going forward, instead of fragile joins by
--    lot_number or normalized item_name that drift on every partial
--    failure. See deep-dive-report.md section 3 for why this is the
--    structural fix under every drift incident.
--
--    Nullable because (a) existing rows have no record of where they
--    went on AF, and (b) upload may fail and never populate it.
--    Unique per (auction_id, af_item_id) so no two lotter lots can
--    claim the same AF item.
--
-- 2. af_upload_attempts (new table): one row per upload attempt (not
--    per lot — each retry counts). Fuels post-push error histograms
--    so we can finally diagnose whether the ~7% transient failure
--    rate is CSRF rotation, PHPSESSID staleness, AF mod_security, or
--    AF 5xx. Each column is cheap to populate; the signal is huge.
--
-- Run once in Supabase → SQL Editor.

alter table public.lots
  add column if not exists af_item_id int;

-- One AF item id per auction. Prevents two lotter lots in the same
-- auction from both claiming the same AF item (would mean one of the
-- uploads double-posted and we captured the same id).
create unique index if not exists lots_auction_af_item_idx
  on public.lots (auction_id, af_item_id)
  where af_item_id is not null;

create table if not exists public.af_upload_attempts (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.lots(id) on delete cascade,
  attempt_num int not null,
  success boolean not null,
  http_status int,
  error_prefix text,
  elapsed_ms int,
  csrf_present boolean,
  cookie_rotated boolean,
  af_item_id int,
  created_at timestamptz not null default now()
);

create index if not exists af_upload_attempts_lot_id_idx
  on public.af_upload_attempts (lot_id, attempt_num);

create index if not exists af_upload_attempts_created_at_idx
  on public.af_upload_attempts (created_at desc);

alter table public.af_upload_attempts enable row level security;

drop policy if exists "auth_select_af_upload_attempts" on public.af_upload_attempts;
create policy "auth_select_af_upload_attempts" on public.af_upload_attempts
  for select to authenticated using (true);
-- Writes are service-role only via /api/af-upload.
