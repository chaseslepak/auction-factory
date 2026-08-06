-- Drop unused social-automation tables that landed on main from the
-- af-social-automation merge but are not used by the lotter.
-- Safe to run: the lotter never reads or writes these tables.
-- Run once in Supabase SQL Editor.

drop table if exists public.platform_listings cascade;
drop table if exists public.platform_config cascade;
drop table if exists public.af_scraped_items cascade;
drop table if exists public.af_scraped_auctions cascade;
