-- Phase 2: AF Upload Queue
-- Run this in the Supabase SQL Editor

-- Track AF upload status per lot
alter table public.lots add column if not exists
  af_upload_status text default null
  check (af_upload_status in (null, 'queued', 'uploading', 'uploaded', 'failed'));

alter table public.lots add column if not exists
  af_upload_error text default null;

-- Store AF session cookie (shared across all users)
create table if not exists public.af_session (
  id int primary key default 1 check (id = 1),
  session_cookie text not null,
  updated_at timestamptz not null default now()
);

alter table public.af_session enable row level security;

create policy "auth_select_af_session" on public.af_session
  for select to authenticated using (true);
create policy "auth_upsert_af_session" on public.af_session
  for insert to authenticated with check (true);
create policy "auth_update_af_session" on public.af_session
  for update to authenticated using (true);

-- Store AF auction mappings (which AF auction ID maps to which local auction)
create table if not exists public.af_auction_map (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid references public.auctions(id) on delete cascade not null unique,
  af_auction_id text not null,
  af_auction_name text,
  created_at timestamptz not null default now()
);

alter table public.af_auction_map enable row level security;

create policy "auth_select_af_auction_map" on public.af_auction_map
  for select to authenticated using (true);
create policy "auth_insert_af_auction_map" on public.af_auction_map
  for insert to authenticated with check (true);
create policy "auth_update_af_auction_map" on public.af_auction_map
  for update to authenticated using (true);
create policy "auth_delete_af_auction_map" on public.af_auction_map
  for delete to authenticated using (true);
