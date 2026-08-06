-- Phase 9: HQ upload queue
-- Locations lot items in the app, then mark an auction "Ready for HQ Upload".
-- The central HQ team pulls the ready queue and pushes each auction to its
-- own AF admin account via the existing browser-upload flow.
--
-- Status transitions:
--   null       -- default; locations still working on it
--   'ready'    -- location clicked "Mark ready for HQ upload"
--   'uploading' -- HQ started pushing to AF (optional intermediate state)
--   'done'     -- every lot in the auction has af_upload_status='uploaded'

alter table public.auctions
  add column if not exists hq_upload_status text default null
  check (hq_upload_status in (null, 'ready', 'uploading', 'done'));

alter table public.auctions
  add column if not exists hq_ready_at timestamptz default null;

create index if not exists idx_auctions_hq_upload_status
  on public.auctions(hq_upload_status)
  where hq_upload_status is not null;
