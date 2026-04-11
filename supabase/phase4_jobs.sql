-- Phase 4: Background job queue
-- Run this in the Supabase SQL Editor

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  auction_id uuid references public.auctions(id) on delete cascade,
  lot_id uuid references public.lots(id) on delete cascade,
  payload jsonb default '{}',
  result jsonb default null,
  error text default null,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz default null,
  completed_at timestamptz default null
);

create index if not exists idx_jobs_status on public.jobs(status, type);
create index if not exists idx_jobs_auction on public.jobs(auction_id);
create index if not exists idx_jobs_created on public.jobs(created_at desc);

alter table public.jobs enable row level security;

create policy "auth_select_jobs" on public.jobs for select to authenticated using (true);
create policy "auth_insert_jobs" on public.jobs for insert to authenticated with check (true);
create policy "auth_update_jobs" on public.jobs for update to authenticated using (true);
create policy "auth_delete_jobs" on public.jobs for delete to authenticated using (true);
