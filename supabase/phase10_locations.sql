-- Phase 10: per-location scoping.
-- Each AF location gets a row in `locations`. Lotters are assigned a
-- location and see only that location's auctions by default (with an
-- "All locations" toggle). Admins see everything.
-- Filter-only enforcement (no RLS change): auction visibility is enforced
-- client-side. Sufficient for internal-tool use; matches existing model.
-- Run once in Supabase SQL Editor.

-- Locations table
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- Seed 13 placeholder locations. Rename in the Supabase Table Editor.
insert into public.locations (name)
select 'Location ' || i
from generate_series(1, 13) as i
on conflict (name) do nothing;

-- Assign a location to each lotter (nullable so unassigned users can be
-- prompted to pick on first login).
alter table public.allowed_users
  add column if not exists location_id uuid references public.locations(id);

-- Every auction gets stamped with the location it belongs to. Nullable
-- for legacy rows; admins will see them and can assign retroactively.
alter table public.auctions
  add column if not exists location_id uuid references public.locations(id);

create index if not exists auctions_location_id_idx on public.auctions(location_id);
