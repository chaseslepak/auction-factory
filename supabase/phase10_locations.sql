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

-- allowed_users: created here for projects that never ran the
-- af-social-automation schema. Idempotent.
create table if not exists public.allowed_users (
  email text primary key,
  role text not null default 'lotter' check (role in ('admin', 'lotter')),
  created_at timestamptz not null default now()
);

-- Seed the current admin so they don't get locked out. Adjust the email
-- if this project's admin is different.
insert into public.allowed_users (email, role)
values ('chase.slepak@gmail.com', 'admin')
on conflict (email) do update set role = 'admin';

-- Assign a location to each lotter (nullable so unassigned users can be
-- prompted to pick on first login).
alter table public.allowed_users
  add column if not exists location_id uuid references public.locations(id);

-- Every auction gets stamped with the location it belongs to. Nullable
-- for legacy rows; admins will see them and can assign retroactively.
alter table public.auctions
  add column if not exists location_id uuid references public.locations(id);

create index if not exists auctions_location_id_idx on public.auctions(location_id);

-- RLS: authenticated users can read/write both tables (matches the
-- existing pattern in phase2_schema.sql — auth gate is at the app level).
alter table public.locations enable row level security;
drop policy if exists "auth_all_locations" on public.locations;
create policy "auth_all_locations" on public.locations
  for all to authenticated using (true) with check (true);

alter table public.allowed_users enable row level security;
drop policy if exists "auth_all_allowed_users" on public.allowed_users;
create policy "auth_all_allowed_users" on public.allowed_users
  for all to authenticated using (true) with check (true);
