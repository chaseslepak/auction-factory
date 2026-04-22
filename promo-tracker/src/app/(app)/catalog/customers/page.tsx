import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import type { Customer } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("customers").select("*").order("name");
  const customers = (data ?? []) as Customer[];

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Customers</h1>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Type</th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 ? (
              <tr><td colSpan={2} className="px-4 py-8 text-center text-brand-muted">No customers yet.</td></tr>
            ) : null}
            {customers.map((c) => (
              <tr key={c.id} className="border-t border-brand-border">
                <td className="px-4 py-2">{c.name}</td>
                <td className="px-4 py-2">{c.type ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-brand-muted mt-3">Add/edit UI is a follow-up; seed via Supabase for now.</p>
    </div>
  );
}
