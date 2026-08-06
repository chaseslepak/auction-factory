-- af-social-automation: Complete database schema
-- Run this ENTIRE block in Supabase SQL Editor in one go

------------------------------------------------------------
-- 1. CORE: Scraped auction data from auctionfactory.com
------------------------------------------------------------

create table if not exists public.af_scraped_auctions (
  id uuid primary key default gen_random_uuid(),
  af_url text not null,
  af_name text,
  item_count int default 0,
  scraped_at timestamptz not null default now(),
  unique (af_url)
);

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

------------------------------------------------------------
-- 2. PLATFORM: Cross-platform listing tracking
------------------------------------------------------------

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
    'draft', 'content_ready', 'posting', 'posted', 'failed', 'manually_posted'
  )),
  external_id text,
  external_url text,
  post_error text,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_platform_listings_unique
  on public.platform_listings(scraped_item_id, platform, coalesce(cl_region, ''));
create index if not exists idx_platform_listings_auction on public.platform_listings(scraped_auction_id);
create index if not exists idx_platform_listings_status on public.platform_listings(status, platform);

------------------------------------------------------------
-- 3. CONFIG: Platform credentials (FB tokens, CL regions)
------------------------------------------------------------

create table if not exists public.platform_config (
  platform text primary key,
  config jsonb not null default '{}',
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

------------------------------------------------------------
-- 4. JOBS: Background job queue (standalone, no FK deps)
------------------------------------------------------------

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  auction_id uuid default null,
  lot_id uuid default null,
  payload jsonb default '{}',
  result jsonb default null,
  error text default null,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz default null,
  completed_at timestamptz default null
);

create index if not exists idx_jobs_status on public.jobs(status, type);
create index if not exists idx_jobs_created on public.jobs(created_at desc);

------------------------------------------------------------
-- 5. API USAGE: Cost tracking (standalone, no FK deps)
------------------------------------------------------------

create table if not exists public.api_usage (
  id uuid primary key default gen_random_uuid(),
  service text not null,
  operation text not null,
  model text,
  auction_id uuid default null,
  lot_id uuid default null,
  input_tokens int default 0,
  output_tokens int default 0,
  estimated_cost_cents int default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_api_usage_created on public.api_usage(created_at desc);

------------------------------------------------------------
-- 6. ACTIVITY LOG
------------------------------------------------------------

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  auction_id uuid,
  details jsonb default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_activity_log_created on public.activity_log(created_at desc);

------------------------------------------------------------
-- 7. ALLOWED USERS
------------------------------------------------------------

create table if not exists public.allowed_users (
  email text primary key,
  role text not null default 'admin' check (role in ('admin', 'lotter')),
  created_at timestamptz not null default now()
);

-- Seed your admin account
insert into public.allowed_users (email, role)
values ('chase.slepak@gmail.com', 'admin')
on conflict (email) do nothing;

------------------------------------------------------------
-- 8. ROW LEVEL SECURITY
------------------------------------------------------------

alter table public.af_scraped_auctions enable row level security;
alter table public.af_scraped_items enable row level security;
alter table public.platform_listings enable row level security;
alter table public.platform_config enable row level security;
alter table public.jobs enable row level security;
alter table public.api_usage enable row level security;
alter table public.activity_log enable row level security;
alter table public.allowed_users enable row level security;

-- All tables: authenticated users can do everything
create policy "auth_all" on public.af_scraped_auctions for all to authenticated using (true) with check (true);
create policy "auth_all" on public.af_scraped_items for all to authenticated using (true) with check (true);
create policy "auth_all" on public.platform_listings for all to authenticated using (true) with check (true);
create policy "auth_all" on public.platform_config for all to authenticated using (true) with check (true);
create policy "auth_all" on public.jobs for all to authenticated using (true) with check (true);
create policy "auth_all" on public.api_usage for all to authenticated using (true) with check (true);
create policy "auth_all" on public.activity_log for all to authenticated using (true) with check (true);
create policy "auth_all" on public.allowed_users for all to authenticated using (true) with check (true);
