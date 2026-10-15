-- Phase 13: Auction Factory archive index.
--
-- Historical lots that have run through AF.com before are a huge, free
-- source of stock images and real retail prices. This table stores a
-- lightweight index of lots pulled from AF's public past-auctions pages
-- (archive_auction_details.php). The stock-image search queries this
-- table FIRST — a prior listing of the same brand+model is the best
-- possible match since it's the exact photo AF already used.
--
-- Populated by /api/admin/af-archive-reindex (manual, from the admin UI)
-- and /api/cron/af-archive-refresh (nightly top-page refresh).
--
-- Chase runs this once in Supabase → SQL Editor.

-- Enable pg_trgm for fuzzy ILIKE support (brand/model lookups use it).
create extension if not exists pg_trgm;

create table if not exists public.af_archive_items (
  id uuid primary key default gen_random_uuid(),
  af_auction_id int not null,
  af_item_id int not null,
  item_name text,
  brand text,
  model text,
  condition_rating text,
  retail_new int,
  image_url text,
  lot_href text,
  auction_title text,
  auction_closed_at timestamptz,
  indexed_at timestamptz default now(),
  unique(af_auction_id, af_item_id)
);

-- Primary lookup is "find lots for this brand+model." Lowercase comparison
-- plus a trigram index so ILIKE substring matches are fast at scale.
create index if not exists af_archive_items_brand_lower_idx
  on public.af_archive_items (lower(brand));
create index if not exists af_archive_items_model_lower_idx
  on public.af_archive_items (lower(model));
create index if not exists af_archive_items_brand_trgm_idx
  on public.af_archive_items using gin (brand gin_trgm_ops);
create index if not exists af_archive_items_model_trgm_idx
  on public.af_archive_items using gin (model gin_trgm_ops);
create index if not exists af_archive_items_indexed_at_idx
  on public.af_archive_items (indexed_at desc);

alter table public.af_archive_items enable row level security;

-- Any authenticated user can read the index (used by stock-image lookups).
drop policy if exists "auth_select_af_archive_items" on public.af_archive_items;
create policy "auth_select_af_archive_items" on public.af_archive_items
  for select to authenticated using (true);

-- Writes come from service-role server routes only; keep INSERT/UPDATE/DELETE
-- unexposed to authenticated users.

-- Separate table for crawl bookkeeping: one row per past AF auction we've
-- seen, so the nightly refresh can skip auctions it already fully indexed.
create table if not exists public.af_archive_auctions (
  af_auction_id int primary key,
  title text,
  closed_at timestamptz,
  first_seen_at timestamptz default now(),
  last_crawled_at timestamptz,
  item_count int default 0,
  last_crawl_error text
);

create index if not exists af_archive_auctions_last_crawled_idx
  on public.af_archive_auctions (last_crawled_at nulls first);

alter table public.af_archive_auctions enable row level security;
drop policy if exists "auth_select_af_archive_auctions" on public.af_archive_auctions;
create policy "auth_select_af_archive_auctions" on public.af_archive_auctions
  for select to authenticated using (true);
