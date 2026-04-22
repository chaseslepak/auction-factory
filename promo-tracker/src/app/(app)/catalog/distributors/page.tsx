import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import type { Distributor } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DistributorsPage() {
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("distributors").select("*").order("name");
  const distributors = (data ?? []) as Distributor[];

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Distributors</h1>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-2">Name</th>
            </tr>
          </thead>
          <tbody>
            {distributors.map((d) => (
              <tr key={d.id} className="border-t border-brand-border">
                <td className="px-4 py-2">{d.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-brand-muted mt-3">Seeded with UNFI, KeHE, DSD, Direct, Other. Add more via Supabase.</p>
    </div>
  );
}
