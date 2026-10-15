-- Phase 14: Stock-image quality pass.
--
-- Three pieces, one migration:
--
-- 1. rejected_stock_images: when Chase clicks "Wrong image — try another"
--    on a lot, the current image's source URL goes into this table keyed
--    by (brand, model, image_url). Every future stock-image search for
--    the same brand+model filters these URLs out, so we never suggest a
--    rejected image again.
--
-- 2. lot_photos.source_url: records the ORIGINAL retailer/AF-archive URL
--    a stock image was pulled from (webstaurant, af-archive, anthropic
--    web_search). Needed by the retry flow to know what to reject.
--    Nullable — existing rows have no record of where they came from.
--
-- 3. lot_photos.vision_confidence: the 1-10 confidence rating the vision
--    verify step gave this image. Low-confidence images get flagged in
--    the UI. Nullable for the same reason as source_url.
--
-- Chase runs this once in Supabase → SQL Editor.

create table if not exists public.rejected_stock_images (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  model text not null,
  image_url text not null,
  rejected_by text,
  rejected_at timestamptz default now(),
  reason text,
  unique(brand, model, image_url)
);

create index if not exists rejected_stock_images_brand_model_idx
  on public.rejected_stock_images (lower(brand), lower(model));

alter table public.rejected_stock_images enable row level security;

drop policy if exists "auth_select_rejected_stock_images" on public.rejected_stock_images;
create policy "auth_select_rejected_stock_images" on public.rejected_stock_images
  for select to authenticated using (true);
-- Writes are service-role only via /api/stock-image/retry.

alter table public.lot_photos
  add column if not exists source_url text;
alter table public.lot_photos
  add column if not exists vision_confidence smallint;
alter table public.lot_photos
  add column if not exists source_type text;
