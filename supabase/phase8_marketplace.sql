-- Phase 8: Crazy Good Buy → Facebook Marketplace assisted poster
-- Run in the Supabase SQL Editor

-- ============================================================
-- TABLES
-- ============================================================

-- One draft listing per Shopify product (keyed by handle).
create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  handle text not null unique,
  product_id text,
  product_type text,
  title text,
  price numeric,
  category text,         -- suggested Facebook Marketplace category
  condition text,        -- New | Used - Like New | Used - Good | Used - Fair
  description text,
  keywords jsonb not null default '[]'::jsonb,
  photo_paths jsonb not null default '[]'::jsonb,  -- paths in marketplace-photos bucket
  match_warning text,    -- set when Claude vision thinks photos don't match the product
  status text not null default 'draft' check (status in ('draft', 'approved', 'posted')),
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  posted_at timestamptz
);

create index if not exists idx_marketplace_listings_status on public.marketplace_listings(status);

-- Per-user/device tokens the Chrome extension uses to pull approved listings.
create table if not exists public.marketplace_tokens (
  token text primary key,
  created_by uuid references auth.users default auth.uid(),
  label text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

create index if not exists idx_marketplace_tokens_expires on public.marketplace_tokens(expires_at);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.marketplace_listings enable row level security;
alter table public.marketplace_tokens enable row level security;

drop policy if exists "auth_all_marketplace_listings" on public.marketplace_listings;
create policy "auth_all_marketplace_listings" on public.marketplace_listings
  for all to authenticated using (true) with check (true);

drop policy if exists "auth_all_marketplace_tokens" on public.marketplace_tokens;
create policy "auth_all_marketplace_tokens" on public.marketplace_tokens
  for all to authenticated using (true) with check (true);

-- Note: the extension's /api/marketplace/export endpoint reads listings via the
-- service-role key after validating a token, so it is not subject to these policies.

-- ============================================================
-- STORAGE
-- ============================================================

insert into storage.buckets (id, name, public)
  values ('marketplace-photos', 'marketplace-photos', true)
  on conflict (id) do nothing;

drop policy if exists "public_select_marketplace_photos" on storage.objects;
create policy "public_select_marketplace_photos" on storage.objects
  for select using (bucket_id = 'marketplace-photos');

drop policy if exists "auth_insert_marketplace_photos" on storage.objects;
create policy "auth_insert_marketplace_photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'marketplace-photos');

drop policy if exists "auth_delete_marketplace_photos" on storage.objects;
create policy "auth_delete_marketplace_photos" on storage.objects
  for delete to authenticated using (bucket_id = 'marketplace-photos');
