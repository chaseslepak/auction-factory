-- Phase 19: placeholder-on-failure flow.
--
-- When a lot fails pre-flight (missing photo/title) or AF rejection
-- during the sequential push, the lotter now pushes a minimal stub
-- item to AF at that position to preserve ordering. The lot keeps the
-- stub's af_item_id and gets af_upload_status='placeholder'. On the
-- next HQ Push, lots with status='placeholder' route to the AF edit
-- endpoint (edit_item_3.php) instead of create, overwriting the stub
-- in place with real content — no re-lot, no orphan, no shuffle.
--
-- Chase runs this once in Supabase → SQL Editor.

alter table public.lots drop constraint if exists lots_af_upload_status_check;
alter table public.lots
  add constraint lots_af_upload_status_check
  check (af_upload_status is null or af_upload_status in (
    'queued',
    'uploading',
    'uploaded',
    'failed',
    'placeholder'
  ));
