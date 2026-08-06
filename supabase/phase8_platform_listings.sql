-- Phase 8: Cross-platform listing automation (Craigslist, FB Marketplace, FB Business Page)
-- Run in Supabase SQL Editor

-- Stores auction metadata scraped from auctionfactory.com front-end
create table if not exists public.af_scraped_auctions (
  id uuid primary key default gen_random_uuid(),
  af_url text not null,
  af_name text,
  item_count int default 0,
  scraped_at timestamptz not null default now(),
  unique (af_url)
);

-- Stores individual items scraped from AF auction pages
create table if not exists public.af_scraped_items (
  id uuid primary key default gen_random_uuid(),
  scraped_auction_id uuid references public.af_scraped_auctions(id) on delete cascade not null,
  af_item_url text,
  lot_number int,
  title text,
  description text,
  photos jsonb default '[]',
  price text,
  condition text,
  brand text,
  model text,
  dimensions text,
  scraped_at timestamptz not null default now()
);

create index if not exists idx_scraped_items_auction on public.af_scraped_items(scraped_auction_id);

-- Tracks per-item, per-platform listing status and generated content
create table if not exists public.platform_listings (
  id uuid primary key default gen_random_uuid(),
  scraped_item_id uuid references public.af_scraped_items(id) on delete cascade not null,
  scraped_auction_id uuid references public.af_scraped_auctions(id) on delete cascade not null,
  platform text not null check (platform in ('craigslist', 'fb_marketplace', 'fb_page')),
  cl_region text,
  generated_title text,
  generated_body text,
  generated_data jsonb,
  generated_at timestamptz,
  status text not null default 'draft' check (status in (
    'draft',
    'content_ready',
    'posting',
    'posted',
    'failed',
    'manually_posted'
  )),
  external_id text,
  external_url text,
  post_error text,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique: one listing per item per platform per CL region (COALESCE handles NULL for non-CL)
create unique index if not exists idx_platform_listings_unique
  on public.platform_listings(scraped_item_id, platform, coalesce(cl_region, ''));

create index if not exists idx_platform_listings_auction on public.platform_listings(scraped_auction_id);
create index if not exists idx_platform_listings_status on public.platform_listings(status, platform);

-- Stores per-platform configuration (FB tokens, CL regions, etc.)
create table if not exists public.platform_config (
  platform text primary key,
  config jsonb not null default '{}',
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- RLS policies
alter table public.af_scraped_auctions enable row level security;
alter table public.af_scraped_items enable row level security;
alter table public.platform_listings enable row level security;
alter table public.platform_config enable row level security;

-- Scraped auctions: authenticated users can CRUD
drop policy if exists "auth_all_scraped_auctions" on public.af_scraped_auctions;
create policy "auth_all_scraped_auctions" on public.af_scraped_auctions
  for all to authenticated using (true) with check (true);

-- Scraped items: authenticated users can CRUD
drop policy if exists "auth_all_scraped_items" on public.af_scraped_items;
create policy "auth_all_scraped_items" on public.af_scraped_items
  for all to authenticated using (true) with check (true);

-- Platform listings: authenticated users can CRUD
drop policy if exists "auth_all_platform_listings" on public.platform_listings;
create policy "auth_all_platform_listings" on public.platform_listings
  for all to authenticated using (true) with check (true);

-- Platform config: authenticated users can CRUD
drop policy if exists "auth_all_platform_config" on public.platform_config;
create policy "auth_all_platform_config" on public.platform_config
  for all to authenticated using (true) with check (true);
