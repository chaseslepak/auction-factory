-- Phase 6: Cost tracking, edit history
-- Run in Supabase SQL Editor

-- Track API usage costs
create table if not exists public.api_usage (
  id uuid primary key default gen_random_uuid(),
  service text not null,
  operation text not null,
  auction_id uuid references public.auctions(id) on delete set null,
  lot_id uuid references public.lots(id) on delete set null,
  input_tokens int default 0,
  output_tokens int default 0,
  estimated_cost_cents int default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_api_usage_created on public.api_usage(created_at desc);
create index if not exists idx_api_usage_service on public.api_usage(service);
create index if not exists idx_api_usage_auction on public.api_usage(auction_id);

alter table public.api_usage enable row level security;
create policy "auth_select_api_usage" on public.api_usage for select to authenticated using (true);
create policy "auth_insert_api_usage" on public.api_usage for insert to authenticated with check (true);

-- Edit history on lots
create table if not exists public.lot_edits (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid references public.lots(id) on delete cascade,
  user_email text,
  field text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);
create index if not exists idx_lot_edits_lot on public.lot_edits(lot_id, created_at desc);

alter table public.lot_edits enable row level security;
create policy "auth_select_lot_edits" on public.lot_edits for select to authenticated using (true);
create policy "auth_insert_lot_edits" on public.lot_edits for insert to authenticated with check (true);

-- Allowed users table (replaces env var)
create table if not exists public.allowed_users (
  email text primary key,
  role text not null default 'lotter' check (role in ('admin', 'lotter')),
  created_at timestamptz not null default now()
);

alter table public.allowed_users enable row level security;
create policy "auth_select_allowed_users" on public.allowed_users for select to authenticated using (true);
create policy "auth_insert_allowed_users" on public.allowed_users for insert to authenticated with check (true);
create policy "auth_delete_allowed_users" on public.allowed_users for delete to authenticated using (true);
create policy "auth_update_allowed_users" on public.allowed_users for update to authenticated using (true);

-- Seed the initial admin from env var (chase)
insert into public.allowed_users (email, role)
values ('chase.slepak@gmail.com', 'admin')
on conflict (email) do nothing;
