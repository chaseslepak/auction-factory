-- 0002: add product line, seed placeholder SKUs, open up brand access.
--
-- Change: staff is shared across both brands, so we no longer gate reads/writes
-- by user_brand_access. The table remains for future use. user_has_brand() is
-- redefined to always return true for authenticated users, which keeps every
-- existing policy valid without rewriting them.

alter table products add column if not exists line text;
create index if not exists products_line_idx on products(line);

create or replace function user_has_brand(_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
$$;

-- Placeholder SKUs so the app has something to click through on day one.
-- The team will replace names/SKUs in place.
with to_seed(brand_code, line, sku, name) as (
  values
    ('BOYLAN',       '12oz',         'BYL-12-COLA',    'Cane Sugar Cola 12oz'),
    ('BOYLAN',       '12oz',         'BYL-12-RB',      'Root Beer 12oz'),
    ('BOYLAN',       '12oz',         'BYL-12-BC',      'Black Cherry 12oz'),
    ('BOYLAN',       'Mash',         'BYL-MSH-ORG',    'Orange Mash'),
    ('BOYLAN',       'Mash',         'BYL-MSH-GRP',    'Grape Mash'),
    ('BOYLAN',       'Heritage',     'BYL-HTG-COLA',   'Heritage Cola'),
    ('BOYLAN',       'Heritage',     'BYL-HTG-GA',     'Heritage Ginger Ale'),
    ('BOYLAN',       'BIB',          'BYL-BIB-COLA',   'Cola BIB 5gal'),
    ('BOYLAN',       'BIB',          'BYL-BIB-RB',     'Root Beer BIB 5gal'),
    ('PRETTY_TASTY', 'Pretty Tasty', 'PT-FLAV-01',     'Flavor 1'),
    ('PRETTY_TASTY', 'Pretty Tasty', 'PT-FLAV-02',     'Flavor 2')
)
insert into products (brand_id, line, sku, name, active)
select b.id, s.line, s.sku, s.name, true
from to_seed s
join brands b on b.code = s.brand_code
on conflict (brand_id, sku) do nothing;

-- Placeholder customers so reps can create a test promo immediately.
insert into customers (name, type) values
  ('Retailer A', 'chain'),
  ('Retailer B', 'chain'),
  ('Retailer C', 'independent')
on conflict do nothing;
