-- Promo Tracker: initial schema, RLS, seed
-- Money: integer cents. Dates: `date` (day-granular).

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Enums
-- ------------------------------------------------------------
create type user_role as enum ('sales', 'accounting', 'ops', 'admin');

create type promo_type as enum (
  'OI_TPR',
  'SCAN_MCB',
  'AD_FEATURE',
  'DISPLAY',
  'DEMO',
  'SLOTTING',
  'NEW_ITEM_FEE'
);

create type promo_status as enum (
  'draft',
  'planned',
  'active',
  'completed',
  'invoiced',
  'reconciled'
);

create type channel as enum ('retail', 'distributor', 'dsd', 'direct', 'other');

-- ------------------------------------------------------------
-- Catalog
-- ------------------------------------------------------------
create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete restrict,
  sku text not null,
  upc text,
  name text not null,
  pack_size text,
  case_cost_cents integer,
  srp_cents integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, sku)
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text,                  -- 'chain' | 'banner' | 'independent' | 'broker' | etc.
  parent_id uuid references customers(id) on delete set null,
  created_at timestamptz not null default now()
);

create table distributors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Users / access
-- ------------------------------------------------------------
create table user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role user_role not null default 'sales',
  default_brand_id uuid references brands(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_brand_access (
  user_id uuid references user_profiles(user_id) on delete cascade,
  brand_id uuid references brands(id) on delete cascade,
  primary key (user_id, brand_id)
);

-- ------------------------------------------------------------
-- Promotions
-- ------------------------------------------------------------
create table promotions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete restrict,
  customer_id uuid not null references customers(id) on delete restrict,
  distributor_id uuid references distributors(id) on delete set null,
  channel channel not null default 'retail',
  promo_type promo_type not null,
  start_date date not null,
  end_date date not null,
  status promo_status not null default 'draft',
  fixed_fee_cents integer,
  agreement_url text,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index promotions_brand_idx on promotions(brand_id);
create index promotions_customer_idx on promotions(customer_id);
create index promotions_dates_idx on promotions(start_date, end_date);
create index promotions_status_idx on promotions(status);

create table promotion_items (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references promotions(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  discount_per_unit_cents integer,
  scan_rate_per_unit_cents integer,
  baseline_weekly_units integer,
  expected_lift_units integer not null default 0,
  expected_spend_cents integer,
  created_at timestamptz not null default now(),
  unique (promotion_id, product_id)
);

create index promotion_items_promotion_idx on promotion_items(promotion_id);
create index promotion_items_product_idx on promotion_items(product_id);

-- ------------------------------------------------------------
-- Audit
-- ------------------------------------------------------------
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  entity text not null,
  entity_id uuid,
  action text not null,
  diff_json jsonb,
  created_at timestamptz not null default now()
);

create index activity_log_entity_idx on activity_log(entity, entity_id);
create index activity_log_actor_idx on activity_log(actor_id);

-- ------------------------------------------------------------
-- updated_at triggers
-- ------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trg_products_updated before update on products
  for each row execute function set_updated_at();
create trigger trg_user_profiles_updated before update on user_profiles
  for each row execute function set_updated_at();
create trigger trg_promotions_updated before update on promotions
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table brands enable row level security;
alter table products enable row level security;
alter table customers enable row level security;
alter table distributors enable row level security;
alter table user_profiles enable row level security;
alter table user_brand_access enable row level security;
alter table promotions enable row level security;
alter table promotion_items enable row level security;
alter table activity_log enable row level security;

-- role helper (security definer so policies can call it without recursion)
create or replace function current_user_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from user_profiles where user_id = auth.uid()
$$;

create or replace function user_has_brand(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_brand_access
    where user_id = auth.uid() and brand_id = b
  ) or current_user_role() in ('accounting', 'ops', 'admin')
$$;

-- brands / catalog: any authenticated user can read
create policy brands_read on brands for select using (auth.uid() is not null);
create policy brands_admin_write on brands for all
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

create policy products_read on products for select using (auth.uid() is not null);
create policy products_write on products for all
  using (current_user_role() in ('admin', 'ops'))
  with check (current_user_role() in ('admin', 'ops'));

create policy customers_read on customers for select using (auth.uid() is not null);
create policy customers_write on customers for all
  using (current_user_role() in ('admin', 'sales'))
  with check (current_user_role() in ('admin', 'sales'));

create policy distributors_read on distributors for select using (auth.uid() is not null);
create policy distributors_admin_write on distributors for all
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

-- user_profiles: users can read their own row; admins can read/write all
create policy profiles_self_read on user_profiles for select
  using (user_id = auth.uid() or current_user_role() = 'admin');
create policy profiles_admin_write on user_profiles for all
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

create policy brand_access_read on user_brand_access for select
  using (user_id = auth.uid() or current_user_role() = 'admin');
create policy brand_access_admin_write on user_brand_access for all
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

-- promotions: sales see/edit promos on their assigned brands;
-- accounting/ops/admin see all; accounting can update status; only admin+sales create.
create policy promotions_read on promotions for select
  using (
    current_user_role() in ('accounting', 'ops', 'admin')
    or user_has_brand(brand_id)
  );

create policy promotions_sales_insert on promotions for insert
  with check (
    current_user_role() in ('sales', 'admin')
    and user_has_brand(brand_id)
  );

create policy promotions_sales_update on promotions for update
  using (
    current_user_role() = 'admin'
    or (current_user_role() = 'sales' and user_has_brand(brand_id))
    or current_user_role() = 'accounting'  -- accounting can update status
  )
  with check (
    current_user_role() = 'admin'
    or (current_user_role() = 'sales' and user_has_brand(brand_id))
    or current_user_role() = 'accounting'
  );

create policy promotions_admin_delete on promotions for delete
  using (current_user_role() = 'admin');

-- promotion_items: follow parent promo
create policy promotion_items_read on promotion_items for select
  using (
    exists (
      select 1 from promotions p
      where p.id = promotion_id
        and (current_user_role() in ('accounting', 'ops', 'admin') or user_has_brand(p.brand_id))
    )
  );

create policy promotion_items_write on promotion_items for all
  using (
    exists (
      select 1 from promotions p
      where p.id = promotion_id
        and (current_user_role() = 'admin'
             or (current_user_role() = 'sales' and user_has_brand(p.brand_id)))
    )
  )
  with check (
    exists (
      select 1 from promotions p
      where p.id = promotion_id
        and (current_user_role() = 'admin'
             or (current_user_role() = 'sales' and user_has_brand(p.brand_id)))
    )
  );

-- activity_log: read by admin + accounting + ops; insert by anyone authenticated (server-side only)
create policy activity_read on activity_log for select
  using (current_user_role() in ('admin', 'accounting', 'ops'));
create policy activity_insert on activity_log for insert
  with check (auth.uid() is not null);

-- ------------------------------------------------------------
-- Seed
-- ------------------------------------------------------------
insert into brands (name, code) values
  ('Boylan Bottling', 'BOYLAN'),
  ('Pretty Tasty', 'PRETTY_TASTY')
on conflict (code) do nothing;

insert into distributors (name) values
  ('UNFI'), ('KeHE'), ('DSD'), ('Direct'), ('Other')
on conflict (name) do nothing;
