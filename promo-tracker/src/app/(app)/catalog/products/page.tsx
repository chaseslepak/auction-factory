import { createClient } from "@/lib/supabase/server";
import { centsToUsd } from "@/lib/money";
import { requireUser } from "@/lib/auth";
import type { Product, Brand } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  await requireUser();
  const supabase = await createClient();
  const [productsR, brandsR] = await Promise.all([
    supabase.from("products").select("*").order("sku"),
    supabase.from("brands").select("*")
  ]);

  const brands = (brandsR.data ?? []) as Brand[];
  const brandById = new Map(brands.map((b) => [b.id, b]));
  const products = (productsR.data ?? []) as Product[];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Products</h1>
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-2">SKU</th>
              <th className="px-4 py-2">Brand</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Pack</th>
              <th className="px-4 py-2">UPC</th>
              <th className="px-4 py-2 text-right">Case cost</th>
              <th className="px-4 py-2 text-right">SRP</th>
              <th className="px-4 py-2">Active</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-brand-muted">No products. Bulk-import via Supabase or add rows here once the admin UI lands.</td></tr>
            ) : null}
            {products.map((p) => (
              <tr key={p.id} className="border-t border-brand-border">
                <td className="px-4 py-2 font-mono">{p.sku}</td>
                <td className="px-4 py-2">{brandById.get(p.brand_id)?.name}</td>
                <td className="px-4 py-2">{p.name}</td>
                <td className="px-4 py-2">{p.pack_size ?? "—"}</td>
                <td className="px-4 py-2 font-mono text-xs">{p.upc ?? "—"}</td>
                <td className="px-4 py-2 text-right">{centsToUsd(p.case_cost_cents)}</td>
                <td className="px-4 py-2 text-right">{centsToUsd(p.srp_cents)}</td>
                <td className="px-4 py-2">{p.active ? "yes" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-brand-muted mt-3">SKU add/edit UI is a follow-up; for now populate via Supabase SQL editor or CSV import.</p>
    </div>
  );
}
