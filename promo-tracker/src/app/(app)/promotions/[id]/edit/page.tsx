import { notFound, redirect } from "next/navigation";
import { getPromotion } from "@/lib/db/promotions";
import { PromotionForm } from "@/components/promotion-form";
import { requireUser, canEditPromotions } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Brand, Customer, Distributor, Product } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EditPromotionPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requireUser();
  if (!canEditPromotions(profile?.role)) redirect("/promotions");

  const { id } = await params;
  const p = await getPromotion(id);
  if (!p) notFound();

  const supabase = await createClient();
  const [brandsR, customersR, distributorsR, productsR] = await Promise.all([
    supabase.from("brands").select("*").order("name"),
    supabase.from("customers").select("*").order("name"),
    supabase.from("distributors").select("*").order("name"),
    supabase.from("products").select("*").eq("active", true).order("sku")
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Edit promotion</h1>
      <PromotionForm
        brands={(brandsR.data ?? []) as Brand[]}
        customers={(customersR.data ?? []) as Customer[]}
        distributors={(distributorsR.data ?? []) as Distributor[]}
        products={(productsR.data ?? []) as Product[]}
        initial={{
          id: p.id,
          brand_id: p.brand_id,
          customer_id: p.customer_id,
          distributor_id: p.distributor_id,
          channel: p.channel,
          promo_type: p.promo_type,
          start_date: p.start_date,
          end_date: p.end_date,
          status: p.status,
          fixed_fee_cents: p.fixed_fee_cents ?? null,
          agreement_url: p.agreement_url,
          notes: p.notes,
          items: p.items.map((it) => ({
            id: it.id,
            product_id: it.product_id,
            discount_per_unit_cents: it.discount_per_unit_cents ?? null,
            scan_rate_per_unit_cents: it.scan_rate_per_unit_cents ?? null,
            baseline_weekly_units: it.baseline_weekly_units ?? null,
            expected_lift_units: it.expected_lift_units ?? 0,
            expected_spend_cents: it.expected_spend_cents ?? null
          }))
        }}
      />
    </div>
  );
}
