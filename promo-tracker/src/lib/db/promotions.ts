import { createClient } from "@/lib/supabase/server";
import type { PromotionWithRelations } from "@/lib/types";

const PROMOTION_SELECT = `
  *,
  brand:brands(*),
  customer:customers(*),
  distributor:distributors(*),
  items:promotion_items(*, product:products(*))
`;

export async function listPromotions(filters: {
  brand_id?: string;
  customer_id?: string;
  status?: string;
  promo_type?: string;
  start?: string;
  end?: string;
} = {}): Promise<PromotionWithRelations[]> {
  const supabase = await createClient();
  let q = supabase.from("promotions").select(PROMOTION_SELECT).order("start_date", { ascending: false });

  if (filters.brand_id) q = q.eq("brand_id", filters.brand_id);
  if (filters.customer_id) q = q.eq("customer_id", filters.customer_id);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.promo_type) q = q.eq("promo_type", filters.promo_type);
  if (filters.start) q = q.gte("end_date", filters.start);
  if (filters.end) q = q.lte("start_date", filters.end);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as PromotionWithRelations[];
}

export async function getPromotion(id: string): Promise<PromotionWithRelations | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("promotions")
    .select(PROMOTION_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as PromotionWithRelations) ?? null;
}
