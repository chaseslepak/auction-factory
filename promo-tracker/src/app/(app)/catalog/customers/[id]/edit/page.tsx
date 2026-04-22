import { notFound } from "next/navigation";
import { CustomerForm } from "@/components/customer-form";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const supabase = await createClient();
  const [selfR, allR] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).maybeSingle(),
    supabase.from("customers").select("*").order("name")
  ]);
  if (!selfR.data) notFound();
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Edit customer</h1>
      <CustomerForm parents={(allR.data ?? []) as Customer[]} initial={selfR.data as Customer} />
    </div>
  );
}
