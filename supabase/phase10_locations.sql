-- Phase 10: Locations + user→location mapping
-- Run this in the Supabase SQL Editor.
--
-- Introduces physical auction locations as real data (the 13-location
-- rollout) and attaches each authorized user to their location. This is
-- the foundation both the "isolate per location" and "shared but labeled"
-- models build on — on its own it changes no existing access rules, it
-- only adds the ability to record which location a user belongs to.

-- ============================================================
-- locations
-- ============================================================
create table if not exists public.locations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.locations enable row level security;

create policy "auth_select_locations" on public.locations
  for select to authenticated using (true);
create policy "auth_insert_locations" on public.locations
  for insert to authenticated with check (true);
create policy "auth_update_locations" on public.locations
  for update to authenticated using (true);
create policy "auth_delete_locations" on public.locations
  for delete to authenticated using (true);

-- ============================================================
-- allowed_users.location_id — which location a user belongs to.
-- Nullable: admins/HQ staff and not-yet-assigned users have none.
-- on delete set null so archiving/removing a location never deletes users.
-- ============================================================
alter table public.allowed_users
  add column if not exists location_id uuid
  references public.locations(id) on delete set null;

create index if not exists idx_allowed_users_location
  on public.allowed_users(location_id);

-- ============================================================
-- FOLLOW-UP (do NOT run yet — pending the isolate-vs-label decision):
-- To scope auctions to locations, add a column and backfill, then either
-- just use it for labeling/filtering, or rewrite the auctions/lots RLS
-- policies to restrict lotters to their own location while admins keep
-- full access. Left commented so this migration stays access-neutral.
--
--   alter table public.auctions
--     add column if not exists location_id uuid
--     references public.locations(id) on delete set null;
--   create index if not exists idx_auctions_location
--     on public.auctions(location_id);
-- ============================================================
