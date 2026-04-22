export type UserRole = "sales" | "accounting" | "ops" | "admin";

export interface Brand {
  id: string;
  name: string;
  code: string;
}

export interface Product {
  id: string;
  brand_id: string;
  sku: string;
  upc: string | null;
  name: string;
  pack_size: string | null;
  case_cost_cents: number | null;
  srp_cents: number | null;
  active: boolean;
}

export interface Customer {
  id: string;
  name: string;
  type: string | null;
  parent_id: string | null;
}

export interface Distributor {
  id: string;
  name: string;
}

export interface UserProfile {
  user_id: string;
  full_name: string | null;
  role: UserRole;
  default_brand_id: string | null;
}

export type PromoType =
  | "OI_TPR" | "SCAN_MCB" | "AD_FEATURE" | "DISPLAY" | "DEMO" | "SLOTTING" | "NEW_ITEM_FEE";

export type PromoStatus =
  | "draft" | "planned" | "active" | "completed" | "invoiced" | "reconciled";

export type Channel = "retail" | "distributor" | "dsd" | "direct" | "other";

export interface Promotion {
  id: string;
  brand_id: string;
  customer_id: string;
  distributor_id: string | null;
  channel: Channel;
  promo_type: PromoType;
  start_date: string;
  end_date: string;
  status: PromoStatus;
  fixed_fee_cents: number | null;
  agreement_url: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PromotionItem {
  id: string;
  promotion_id: string;
  product_id: string;
  discount_per_unit_cents: number | null;
  scan_rate_per_unit_cents: number | null;
  baseline_weekly_units: number | null;
  expected_lift_units: number;
  expected_spend_cents: number | null;
}

export interface PromotionWithRelations extends Promotion {
  brand: Brand;
  customer: Customer;
  distributor: Distributor | null;
  items: (PromotionItem & { product: Product })[];
}
