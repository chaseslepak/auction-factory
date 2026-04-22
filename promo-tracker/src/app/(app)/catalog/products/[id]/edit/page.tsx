import { notFound } from "next/navigation";
import { ProductForm } from "@/components/product-form";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Brand, Product } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const supabase = await createClient();
  const [productR, brandsR] = await Promise.all([
    supabase.from("products").select("*").eq("id", id).maybeSingle(),
    supabase.from("brands").select("*").order("name")
  ]);
  if (!productR.data) notFound();
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Edit product</h1>
      <ProductForm brands={(brandsR.data ?? []) as Brand[]} initial={productR.data as Product} />
    </div>
  );
}
