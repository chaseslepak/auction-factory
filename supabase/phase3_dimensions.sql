-- Add dimension columns to lots table
alter table public.lots add column if not exists width text default null;
alter table public.lots add column if not exists depth text default null;
alter table public.lots add column if not exists height text default null;
