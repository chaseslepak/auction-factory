import { redirect } from "next/navigation";
import { PromotionForm } from "@/components/promotion-form";
import { requireUser, canEditPromotions } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Brand, Customer, Distributor, Product } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewPromotionPage() {
  const { profile } = await requireUser();
  if (!canEditPromotions(profile?.role)) redirect("/promotions");

  const supabase = await createClient();
  const [brandsR, customersR, distributorsR, productsR] = await Promise.all([
    supabase.from("brands").select("*").order("name"),
    supabase.from("customers").select("*").order("name"),
    supabase.from("distributors").select("*").order("name"),
    supabase.from("products").select("*").eq("active", true).order("sku")
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">New promotion</h1>
      <PromotionForm
        brands={(brandsR.data ?? []) as Brand[]}
        customers={(customersR.data ?? []) as Customer[]}
        distributors={(distributorsR.data ?? []) as Distributor[]}
        products={(productsR.data ?? []) as Product[]}
      />
    </div>
  );
}
