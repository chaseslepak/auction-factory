-- Auction Factory Ohio Lotter — Database Schema
-- Run this in the Supabase SQL Editor

-- Enable UUID extension (usually already enabled)
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

create table public.auctions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users not null default auth.uid(),
  created_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'closed'))
);

create table public.lots (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid references public.auctions(id) on delete cascade not null,
  lot_number int not null,
  item_name text,
  brand text,
  model text,
  category text,
  confidence text,
  condition_rating int check (condition_rating between 1 and 10),
  quantity int not null default 1,
  estimated_retail_new numeric,
  listed_price numeric,
  key_features jsonb default '[]'::jsonb,
  auction_description text,
  notes text,
  created_by uuid references auth.users not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (auction_id, lot_number)
);

create table public.lot_photos (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid references public.lots(id) on delete cascade not null,
  storage_path text not null,
  display_order int not null default 0
);

-- ============================================================
-- INDEXES
-- ============================================================

create index idx_lots_auction_id on public.lots(auction_id);
create index idx_lots_lot_number on public.lots(auction_id, lot_number);
create index idx_lot_photos_lot_id on public.lot_photos(lot_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.auctions enable row level security;
alter table public.lots enable row level security;
alter table public.lot_photos enable row level security;

-- Auctions: all authenticated users can CRUD
create policy "auth_select_auctions" on public.auctions
  for select to authenticated using (true);
create policy "auth_insert_auctions" on public.auctions
  for insert to authenticated with check (true);
create policy "auth_update_auctions" on public.auctions
  for update to authenticated using (true);
create policy "auth_delete_auctions" on public.auctions
  for delete to authenticated using (true);

-- Lots: all authenticated users can CRUD
create policy "auth_select_lots" on public.lots
  for select to authenticated using (true);
create policy "auth_insert_lots" on public.lots
  for insert to authenticated with check (true);
create policy "auth_update_lots" on public.lots
  for update to authenticated using (true);
create policy "auth_delete_lots" on public.lots
  for delete to authenticated using (true);

-- Lot photos: all authenticated users can CRUD
create policy "auth_select_lot_photos" on public.lot_photos
  for select to authenticated using (true);
create policy "auth_insert_lot_photos" on public.lot_photos
  for insert to authenticated with check (true);
create policy "auth_delete_lot_photos" on public.lot_photos
  for delete to authenticated using (true);

-- ============================================================
-- STORAGE
-- ============================================================

-- Create the lot-photos bucket (public read, auth write)
insert into storage.buckets (id, name, public)
  values ('lot-photos', 'lot-photos', true)
  on conflict (id) do nothing;

-- Anyone can view lot photos
create policy "public_select_lot_photos" on storage.objects
  for select using (bucket_id = 'lot-photos');

-- Authenticated users can upload
create policy "auth_insert_lot_photos_storage" on storage.objects
  for insert to authenticated with check (bucket_id = 'lot-photos');

-- Authenticated users can delete
create policy "auth_delete_lot_photos_storage" on storage.objects
  for delete to authenticated using (bucket_id = 'lot-photos');
