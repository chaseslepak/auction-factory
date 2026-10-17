-- Phase 20: lot_group_id for "created together" sibling tracking.
--
-- When Chase creates multiples of the same item in the lotter (range
-- mode, e.g. "create 3 lots of this"), all inserted rows share a
-- single lot_group_id uuid. Single-lot creates leave it null.
--
-- Photo add/delete propagation uses this as the ONLY trigger: siblings
-- = other rows with the same lot_group_id. Replaces the brand+model
-- heuristic which could false-positive across lots that happened to
-- share a name.
--
-- Chase runs this once in Supabase → SQL Editor.

alter table public.lots
  add column if not exists lot_group_id uuid;

create index if not exists lots_lot_group_id_idx
  on public.lots (lot_group_id)
  where lot_group_id is not null;
