-- Phase 17: hammer-price capture for pricing feedback loop.
--
-- Adds sold_price to af_archive_items. When the nightly archive crawler
-- revisits a closed auction, it now extracts the hammer bid ("Current
-- Bid: $X" on the public archive_auction_details.php page) alongside
-- retail_new. This gives us real sold-vs-listed data over time.
--
-- Admin page /admin/pricing-feedback joins against this column to show
-- Chase which brands/categories he's chronically mispricing. The
-- pickBestRetail picker in stock-image-processor also uses this when a
-- brand+model has 3+ sold datapoints — the sold median beats any
-- web_search estimate at predicting what the item will actually hammer
-- for.
--
-- Chase runs this once in Supabase → SQL Editor.

alter table public.af_archive_items
  add column if not exists sold_price int;

create index if not exists af_archive_items_sold_price_idx
  on public.af_archive_items (sold_price)
  where sold_price is not null;
