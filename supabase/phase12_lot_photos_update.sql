-- Phase 12: missing UPDATE policy on lot_photos.
--
-- lot_photos had SELECT/INSERT/DELETE policies but no UPDATE policy.
-- With RLS enabled this means user-scoped Supabase clients get their
-- .update() silently rejected (0 rows affected, no error). Reordering
-- photos and shifting display_order therefore never persisted.
--
-- /api/lot-photos is now using the service-role client so it works
-- regardless of this migration, but adding the policy here is the
-- proper fix for any other code path that updates lot_photos through
-- a user-scoped client.
--
-- Chase runs this once in Supabase → SQL Editor.

drop policy if exists "auth_update_lot_photos" on public.lot_photos;
create policy "auth_update_lot_photos" on public.lot_photos
  for update to authenticated using (true) with check (true);
