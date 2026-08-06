-- Peak Finance HQ — full schema
-- Run this once, in order, on a brand-new Supabase project's SQL Editor
-- (Database > SQL Editor). Creates every table the app needs: the
-- original Daily Allowance tables (receipts, settings) plus the
-- envelope budgeting extension (categories, category_logs, transfers).
--
-- This app has no login — index.html talks to Supabase directly using
-- the anon public key, so every policy below grants access to the
-- `anon` role rather than `authenticated`. Do not use this pattern for
-- an app with real multi-user data; it's appropriate here only because
-- it's a single personal instance and the anon key is meant to be
-- restricted to your own project.

-- ============================================================
-- 1. receipts — Daily Allowance: one row per day's cap, one row per
--    logged spend. A row with description = '__cap__' and amount = 0
--    marks that day's base cap; all other rows are real spend entries.
-- ============================================================
create table if not exists public.receipts (
  id           uuid primary key default gen_random_uuid(),
  date         date not null default current_date,
  cap          numeric(10,2) not null default 0,
  description  text,
  amount       numeric(10,2) not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists receipts_date_idx on public.receipts (date);

-- ============================================================
-- 2. settings — small key/value store (default_cap,
--    running_reset_anchor).
-- ============================================================
create table if not exists public.settings (
  key         text primary key,
  value       text,
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- 3. categories — envelope budgeting extension
-- ============================================================
create table if not exists public.categories (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  monthly_cap  numeric(10,2) not null check (monthly_cap >= 0),
  rollover     boolean not null default false,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ============================================================
-- 4. category_logs
-- ============================================================
create table if not exists public.category_logs (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.categories(id) on delete restrict,
  amount       numeric(10,2) not null check (amount > 0),
  date         date not null default current_date,
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists category_logs_category_date_idx
  on public.category_logs (category_id, date);

-- ============================================================
-- 5. transfers
-- ============================================================
create table if not exists public.transfers (
  id                 uuid primary key default gen_random_uuid(),
  from_category_id   uuid references public.categories(id) on delete restrict,
  to_category_id     uuid references public.categories(id) on delete restrict,
  amount             numeric(10,2) not null check (amount > 0),
  date               date not null default current_date,
  note               text,
  created_at         timestamptz not null default now(),
  constraint transfers_not_both_null check (
    from_category_id is not null or to_category_id is not null
  ),
  constraint transfers_not_self check (
    from_category_id is null
    or to_category_id is null
    or from_category_id <> to_category_id
  )
);

create index if not exists transfers_from_idx on public.transfers (from_category_id);
create index if not exists transfers_to_idx   on public.transfers (to_category_id);
create index if not exists transfers_date_idx on public.transfers (date);

-- ============================================================
-- RLS — anon full access on every table (see note at top of file)
-- ============================================================
alter table public.receipts enable row level security;
alter table public.settings enable row level security;
alter table public.categories enable row level security;
alter table public.category_logs enable row level security;
alter table public.transfers enable row level security;

create policy "anon full access" on public.receipts
  for all to anon using (true) with check (true);
create policy "anon full access" on public.settings
  for all to anon using (true) with check (true);
create policy "anon full access" on public.categories
  for all to anon using (true) with check (true);
create policy "anon full access" on public.category_logs
  for all to anon using (true) with check (true);
create policy "anon full access" on public.transfers
  for all to anon using (true) with check (true);

grant select, insert, update, delete on public.receipts to anon;
grant select, insert, update, delete on public.settings to anon;
grant select, insert, update, delete on public.categories to anon;
grant select, insert, update, delete on public.category_logs to anon;
grant select, insert, update, delete on public.transfers to anon;

-- ============================================================
-- Optional: seed a starter category so the Envelopes dashboard isn't
-- empty on first load. Delete this insert (or archive the category in
-- the Settings tab) if you don't want it.
-- ============================================================
insert into public.categories (name, monthly_cap, rollover, active)
values ('Example Category', 300.00, false, true)
on conflict do nothing;
