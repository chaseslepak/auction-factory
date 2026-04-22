import { CustomerForm } from "@/components/customer-form";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewCustomerPage() {
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("customers").select("*").order("name");
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">New customer</h1>
      <CustomerForm parents={(data ?? []) as Customer[]} />
    </div>
  );
}
