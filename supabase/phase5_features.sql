-- Phase 5: Soft delete, archive, activity log
-- Run this in the Supabase SQL Editor

-- Soft delete on lots
alter table public.lots add column if not exists deleted_at timestamptz default null;
create index if not exists idx_lots_deleted_at on public.lots(deleted_at) where deleted_at is null;

-- Archive on auctions
alter table public.auctions add column if not exists archived_at timestamptz default null;
create index if not exists idx_auctions_archived on public.auctions(archived_at);

-- Activity log
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
create index if not exists idx_activity_log_auction on public.activity_log(auction_id);
create index if not exists idx_activity_log_user on public.activity_log(user_email);

alter table public.activity_log enable row level security;
create policy "auth_select_activity" on public.activity_log for select to authenticated using (true);
create policy "auth_insert_activity" on public.activity_log for insert to authenticated with check (true);

-- Rejected stock images tracking (for manual overrides)
alter table public.lots add column if not exists stock_image_manual_url text default null;
