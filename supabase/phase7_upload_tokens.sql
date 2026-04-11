-- Phase 7: Upload tokens for browser-based upload workflow
-- Run in Supabase SQL Editor

create table if not exists public.upload_tokens (
  token text primary key,
  auction_id uuid references public.auctions(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index if not exists idx_upload_tokens_auction on public.upload_tokens(auction_id);
create index if not exists idx_upload_tokens_expires on public.upload_tokens(expires_at);

alter table public.upload_tokens enable row level security;

drop policy if exists "auth_select_upload_tokens" on public.upload_tokens;
drop policy if exists "auth_insert_upload_tokens" on public.upload_tokens;
drop policy if exists "auth_delete_upload_tokens" on public.upload_tokens;

create policy "auth_select_upload_tokens" on public.upload_tokens for select to authenticated using (true);
create policy "auth_insert_upload_tokens" on public.upload_tokens for insert to authenticated with check (true);
create policy "auth_delete_upload_tokens" on public.upload_tokens for delete to authenticated using (true);
