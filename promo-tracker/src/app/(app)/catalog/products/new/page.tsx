import { ProductForm } from "@/components/product-form";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Brand } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("brands").select("*").order("name");
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">New product</h1>
      <ProductForm brands={(data ?? []) as Brand[]} />
    </div>
  );
}
