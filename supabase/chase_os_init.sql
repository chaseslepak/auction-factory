-- Chase OS init schema
-- Run against the dedicated Chase OS Supabase project (NOT the auction-factory project).

-- ============================================================================
-- Extensions
-- ============================================================================
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ============================================================================
-- Enums
-- ============================================================================
do $$ begin
  create type user_role as enum ('owner', 'admin', 'team_member', 'client');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_priority as enum ('low', 'normal', 'high', 'critical');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_urgency as enum ('whenever', 'this_week', 'today', 'now');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum ('inbox', 'triaged', 'in_progress', 'blocked', 'done', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type command_queue_status as enum ('pending', 'snoozed', 'done', 'dismissed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type deal_stage as enum ('lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost');
exception when duplicate_object then null; end $$;

do $$ begin
  create type decision_status as enum ('pending', 'approved', 'rejected', 'deferred');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- Tables
-- ============================================================================

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  email text not null,
  role user_role not null default 'client',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists companies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  domain text,
  industry text,
  status text not null default 'active', -- active | dormant | archived
  notes text,
  owner_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists people (
  id uuid primary key default uuid_generate_v4(),
  full_name text not null,
  email text,
  phone text,
  role_title text,
  company_id uuid references companies(id) on delete set null,
  owner_id uuid references profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  company_id uuid references companies(id) on delete set null,
  submitted_by uuid not null references profiles(id) on delete cascade,
  assigned_to uuid references profiles(id) on delete set null,
  priority task_priority not null default 'normal',
  urgency task_urgency not null default 'this_week',
  due_date timestamptz,
  status task_status not null default 'inbox',
  what_is_needed_from_chase text,
  client_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists task_comments (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid not null references tasks(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists task_attachments (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid not null references tasks(id) on delete cascade,
  uploaded_by uuid not null references profiles(id) on delete cascade,
  storage_path text not null,
  filename text not null,
  size_bytes bigint,
  mime_type text,
  created_at timestamptz not null default now()
);

create table if not exists decisions (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  context text,
  options jsonb not null default '[]'::jsonb,
  recommendation text,
  status decision_status not null default 'pending',
  decided_by uuid references profiles(id) on delete set null,
  company_id uuid references companies(id) on delete set null,
  client_visible boolean not null default false,
  due_date timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists deals (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete set null,
  name text not null,
  value_cents bigint not null default 0,
  stage deal_stage not null default 'lead',
  probability integer not null default 0 check (probability between 0 and 100),
  expected_close_date date,
  owner_id uuid references profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists files (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  storage_path text not null,
  bucket text not null default 'chase-files',
  size_bytes bigint,
  mime_type text,
  company_id uuid references companies(id) on delete set null,
  task_id uuid references tasks(id) on delete set null,
  uploaded_by uuid references profiles(id) on delete set null,
  client_visible boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists health_entries (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  entry_date date not null default current_date,
  energy integer check (energy between 0 and 10),
  sleep_hours numeric(4,2),
  mood integer check (mood between 0 and 10),
  notes text,
  created_at timestamptz not null default now(),
  unique (profile_id, entry_date)
);

create table if not exists client_portal_invites (
  id uuid primary key default uuid_generate_v4(),
  email text not null,
  company_id uuid references companies(id) on delete cascade,
  invited_by uuid references profiles(id) on delete set null,
  token text not null unique,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists reports (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  definition jsonb not null default '{}'::jsonb,
  schedule text,
  owner_id uuid references profiles(id) on delete set null,
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists integrations (
  id uuid primary key default uuid_generate_v4(),
  provider text not null,
  config jsonb not null default '{}'::jsonb,
  status text not null default 'disconnected',
  connected_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists command_queue_items (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  body text,
  source_type text,
  source_id uuid,
  status command_queue_status not null default 'pending',
  assigned_to uuid references profiles(id) on delete set null,
  snooze_until timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists activity_log (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Indexes
-- ============================================================================
create index if not exists idx_companies_owner on companies(owner_id);
create index if not exists idx_people_company on people(company_id);
create index if not exists idx_people_owner on people(owner_id);
create index if not exists idx_tasks_status_assigned on tasks(status, assigned_to);
create index if not exists idx_tasks_due on tasks(due_date);
create index if not exists idx_tasks_company on tasks(company_id);
create index if not exists idx_tasks_submitted_by on tasks(submitted_by);
create index if not exists idx_task_comments_task on task_comments(task_id);
create index if not exists idx_task_attachments_task on task_attachments(task_id);
create index if not exists idx_decisions_status on decisions(status);
create index if not exists idx_deals_company on deals(company_id);
create index if not exists idx_files_task on files(task_id);
create index if not exists idx_files_company on files(company_id);
create index if not exists idx_queue_status_snooze on command_queue_items(status, snooze_until);
create index if not exists idx_activity_entity on activity_log(entity_type, entity_id);

-- ============================================================================
-- Auto-create profile on auth user insert
-- ============================================================================
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    'client'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Helper: chase_role()
-- ============================================================================
create or replace function public.chase_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function public.is_chase_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role from profiles where id = auth.uid()) in ('owner','admin','team_member'), false);
$$;

create or replace function public.is_chase_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role from profiles where id = auth.uid()) in ('owner','admin'), false);
$$;

create or replace function public.client_company_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select company_id from client_portal_invites
  where lower(email) = lower(coalesce(auth.jwt()->>'email',''))
    and accepted_at is not null;
$$;

-- ============================================================================
-- Activity log helper
-- ============================================================================
create or replace function public.log_activity(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  insert into activity_log (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_metadata)
  returning id into new_id;
  return new_id;
end;
$$;

-- ============================================================================
-- Updated_at triggers
-- ============================================================================
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  for t in select unnest(array['profiles','companies','people','tasks','decisions','deals','integrations']) loop
    execute format('drop trigger if exists trg_touch_%s on %I; create trigger trg_touch_%s before update on %I for each row execute function public.touch_updated_at();', t, t, t, t);
  end loop;
end $$;

-- ============================================================================
-- Enable RLS
-- ============================================================================
alter table profiles              enable row level security;
alter table companies             enable row level security;
alter table people                enable row level security;
alter table tasks                 enable row level security;
alter table task_comments         enable row level security;
alter table task_attachments      enable row level security;
alter table decisions             enable row level security;
alter table deals                 enable row level security;
alter table files                 enable row level security;
alter table health_entries        enable row level security;
alter table client_portal_invites enable row level security;
alter table reports               enable row level security;
alter table integrations          enable row level security;
alter table command_queue_items   enable row level security;
alter table activity_log          enable row level security;

-- ============================================================================
-- Policies: profiles
-- ============================================================================
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select
  using (id = auth.uid() or is_chase_staff());

drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_admin_update on profiles;
create policy profiles_admin_update on profiles for update
  using (is_chase_admin()) with check (is_chase_admin());

-- ============================================================================
-- Policies: companies
-- ============================================================================
drop policy if exists companies_select on companies;
create policy companies_select on companies for select using (
  is_chase_staff()
  or id in (select client_company_ids())
);

drop policy if exists companies_insert on companies;
create policy companies_insert on companies for insert with check (is_chase_staff());

drop policy if exists companies_update on companies;
create policy companies_update on companies for update using (
  is_chase_admin() or owner_id = auth.uid()
) with check (
  is_chase_admin() or owner_id = auth.uid()
);

drop policy if exists companies_delete on companies;
create policy companies_delete on companies for delete using (is_chase_admin());

-- ============================================================================
-- Policies: people
-- ============================================================================
drop policy if exists people_select on people;
create policy people_select on people for select using (
  is_chase_staff()
  or company_id in (select client_company_ids())
);

drop policy if exists people_insert on people;
create policy people_insert on people for insert with check (is_chase_staff());

drop policy if exists people_update on people;
create policy people_update on people for update using (
  is_chase_admin() or owner_id = auth.uid()
) with check (
  is_chase_admin() or owner_id = auth.uid()
);

drop policy if exists people_delete on people;
create policy people_delete on people for delete using (is_chase_admin());

-- ============================================================================
-- Policies: tasks
-- ============================================================================
drop policy if exists tasks_select on tasks;
create policy tasks_select on tasks for select using (
  is_chase_staff()
  or submitted_by = auth.uid()
  or (client_visible and company_id in (select client_company_ids()))
);

drop policy if exists tasks_insert on tasks;
create policy tasks_insert on tasks for insert with check (
  submitted_by = auth.uid()
);

drop policy if exists tasks_update on tasks;
create policy tasks_update on tasks for update using (
  is_chase_admin()
  or assigned_to = auth.uid()
  or (submitted_by = auth.uid() and chase_role() = 'team_member')
  or (submitted_by = auth.uid() and chase_role() = 'client' and status = 'inbox')
) with check (
  is_chase_admin()
  or assigned_to = auth.uid()
  or (submitted_by = auth.uid() and chase_role() = 'team_member')
  or (submitted_by = auth.uid() and chase_role() = 'client' and status = 'inbox')
);

drop policy if exists tasks_delete on tasks;
create policy tasks_delete on tasks for delete using (is_chase_admin());

-- ============================================================================
-- Policies: task_comments
-- ============================================================================
drop policy if exists task_comments_select on task_comments;
create policy task_comments_select on task_comments for select using (
  exists (select 1 from tasks t where t.id = task_id)
);

drop policy if exists task_comments_insert on task_comments;
create policy task_comments_insert on task_comments for insert with check (
  author_id = auth.uid()
  and exists (select 1 from tasks t where t.id = task_id)
);

drop policy if exists task_comments_update on task_comments;
create policy task_comments_update on task_comments for update using (
  author_id = auth.uid() or is_chase_admin()
);

drop policy if exists task_comments_delete on task_comments;
create policy task_comments_delete on task_comments for delete using (
  author_id = auth.uid() or is_chase_admin()
);

-- ============================================================================
-- Policies: task_attachments
-- ============================================================================
drop policy if exists task_attachments_select on task_attachments;
create policy task_attachments_select on task_attachments for select using (
  exists (select 1 from tasks t where t.id = task_id)
);

drop policy if exists task_attachments_insert on task_attachments;
create policy task_attachments_insert on task_attachments for insert with check (
  uploaded_by = auth.uid()
);

drop policy if exists task_attachments_delete on task_attachments;
create policy task_attachments_delete on task_attachments for delete using (
  uploaded_by = auth.uid() or is_chase_admin()
);

-- ============================================================================
-- Policies: decisions
-- ============================================================================
drop policy if exists decisions_select on decisions;
create policy decisions_select on decisions for select using (
  is_chase_staff()
  or (client_visible and company_id in (select client_company_ids()))
);

drop policy if exists decisions_insert on decisions;
create policy decisions_insert on decisions for insert with check (is_chase_staff());

drop policy if exists decisions_update on decisions;
create policy decisions_update on decisions for update using (
  is_chase_admin() or decided_by = auth.uid()
) with check (
  is_chase_admin() or decided_by = auth.uid()
);

drop policy if exists decisions_delete on decisions;
create policy decisions_delete on decisions for delete using (is_chase_admin());

-- ============================================================================
-- Policies: deals
-- ============================================================================
drop policy if exists deals_select on deals;
create policy deals_select on deals for select using (is_chase_staff());

drop policy if exists deals_insert on deals;
create policy deals_insert on deals for insert with check (is_chase_staff());

drop policy if exists deals_update on deals;
create policy deals_update on deals for update using (
  is_chase_admin() or owner_id = auth.uid()
) with check (
  is_chase_admin() or owner_id = auth.uid()
);

drop policy if exists deals_delete on deals;
create policy deals_delete on deals for delete using (is_chase_admin());

-- ============================================================================
-- Policies: files
-- ============================================================================
drop policy if exists files_select on files;
create policy files_select on files for select using (
  is_chase_staff()
  or (client_visible and (
    company_id in (select client_company_ids())
    or task_id in (select id from tasks where submitted_by = auth.uid())
  ))
);

drop policy if exists files_insert on files;
create policy files_insert on files for insert with check (
  uploaded_by = auth.uid() and is_chase_staff()
);

drop policy if exists files_delete on files;
create policy files_delete on files for delete using (
  is_chase_admin() or uploaded_by = auth.uid()
);

-- ============================================================================
-- Policies: health_entries (strictly private)
-- ============================================================================
drop policy if exists health_self on health_entries;
create policy health_self on health_entries for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ============================================================================
-- Policies: client_portal_invites
-- ============================================================================
drop policy if exists invites_admin_all on client_portal_invites;
create policy invites_admin_all on client_portal_invites for all
  using (is_chase_admin()) with check (is_chase_admin());

-- ============================================================================
-- Policies: reports
-- ============================================================================
drop policy if exists reports_admin_all on reports;
create policy reports_admin_all on reports for all
  using (is_chase_admin()) with check (is_chase_admin());

-- ============================================================================
-- Policies: integrations
-- ============================================================================
drop policy if exists integrations_admin_all on integrations;
create policy integrations_admin_all on integrations for all
  using (is_chase_admin()) with check (is_chase_admin());

-- ============================================================================
-- Policies: command_queue_items
-- ============================================================================
drop policy if exists queue_select on command_queue_items;
create policy queue_select on command_queue_items for select using (
  is_chase_admin() or assigned_to = auth.uid()
);

drop policy if exists queue_insert on command_queue_items;
create policy queue_insert on command_queue_items for insert with check (is_chase_staff());

drop policy if exists queue_update on command_queue_items;
create policy queue_update on command_queue_items for update using (
  is_chase_admin() or assigned_to = auth.uid()
) with check (
  is_chase_admin() or assigned_to = auth.uid()
);

drop policy if exists queue_delete on command_queue_items;
create policy queue_delete on command_queue_items for delete using (is_chase_admin());

-- ============================================================================
-- Policies: activity_log (read-only for staff; insert via security definer)
-- ============================================================================
drop policy if exists activity_select on activity_log;
create policy activity_select on activity_log for select using (is_chase_admin());

-- ============================================================================
-- Storage buckets
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('chase-files', 'chase-files', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('chase-avatars', 'chase-avatars', true)
on conflict (id) do nothing;

drop policy if exists chase_files_read on storage.objects;
create policy chase_files_read on storage.objects for select
  using (
    bucket_id = 'chase-files'
    and (
      public.is_chase_staff()
      or exists (
        select 1 from public.files f
        where f.bucket = 'chase-files'
          and f.storage_path = storage.objects.name
          and f.client_visible
          and (f.company_id in (select public.client_company_ids())
               or f.task_id in (select id from public.tasks where submitted_by = auth.uid()))
      )
    )
  );

drop policy if exists chase_files_write on storage.objects;
create policy chase_files_write on storage.objects for insert
  with check (bucket_id = 'chase-files' and public.is_chase_staff());

drop policy if exists chase_avatars_read on storage.objects;
create policy chase_avatars_read on storage.objects for select
  using (bucket_id = 'chase-avatars');

drop policy if exists chase_avatars_write on storage.objects;
create policy chase_avatars_write on storage.objects for insert
  with check (bucket_id = 'chase-avatars' and auth.uid() is not null);
