import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import type { Customer } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("customers").select("*").order("name");
  const customers = (data ?? []) as Customer[];
  const byId = new Map(customers.map((c) => [c.id, c]));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Customers</h1>
        <Link href="/catalog/customers/new" className="btn-primary">New customer</Link>
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Parent</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-brand-muted">No customers yet. Add one.</td></tr>
            ) : null}
            {customers.map((c) => (
              <tr key={c.id} className="border-t border-brand-border">
                <td className="px-4 py-2">{c.name}</td>
                <td className="px-4 py-2 capitalize">{c.type ?? "—"}</td>
                <td className="px-4 py-2">{c.parent_id ? byId.get(c.parent_id)?.name ?? "—" : "—"}</td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/catalog/customers/${c.id}/edit`} className="underline">Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
