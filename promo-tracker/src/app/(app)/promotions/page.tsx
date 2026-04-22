import Link from "next/link";
import { listPromotions } from "@/lib/db/promotions";
import { PROMO_TYPES, PROMO_STATUSES, PROMO_TYPE_LABEL } from "@/lib/schemas/promotion";
import { centsToUsd } from "@/lib/money";
import { requireUser, canEditPromotions } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Brand, Customer } from "@/lib/types";

export const dynamic = "force-dynamic";

interface SearchParams {
  brand_id?: string;
  customer_id?: string;
  status?: string;
  promo_type?: string;
  line?: string;
  start?: string;
  end?: string;
}

export default async function PromotionsPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { profile } = await requireUser();
  const filters = await searchParams;

  const supabase = await createClient();
  const [promos, brandsR, customersR, linesR] = await Promise.all([
    listPromotions(filters),
    supabase.from("brands").select("*").order("name"),
    supabase.from("customers").select("*").order("name"),
    supabase.from("products").select("line").not("line", "is", null)
  ]);

  const brands = (brandsR.data ?? []) as Brand[];
  const customers = (customersR.data ?? []) as Customer[];
  const lines = Array.from(
    new Set(((linesR.data ?? []) as { line: string | null }[]).map((r) => r.line).filter(Boolean) as string[])
  ).sort();

  const hasFilter = Object.values(filters).some((v) => v && v !== "");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Promotions</h1>
        {canEditPromotions(profile?.role) ? (
          <Link href="/promotions/new" className="btn-primary">New promotion</Link>
        ) : null}
      </div>

      <form method="get" className="card p-4 mb-4">
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="label">Brand</label>
            <select name="brand_id" defaultValue={filters.brand_id ?? ""} className="input">
              <option value="">All</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Line</label>
            <select name="line" defaultValue={filters.line ?? ""} className="input">
              <option value="">All</option>
              {lines.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Customer</label>
            <select name="customer_id" defaultValue={filters.customer_id ?? ""} className="input">
              <option value="">All</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Type</label>
            <select name="promo_type" defaultValue={filters.promo_type ?? ""} className="input">
              <option value="">All</option>
              {PROMO_TYPES.map((t) => <option key={t} value={t}>{PROMO_TYPE_LABEL[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select name="status" defaultValue={filters.status ?? ""} className="input">
              <option value="">All</option>
              {PROMO_STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Start (on/after)</label>
            <input type="date" name="start" defaultValue={filters.start ?? ""} className="input" />
          </div>
          <div>
            <label className="label">End (on/before)</label>
            <input type="date" name="end" defaultValue={filters.end ?? ""} className="input" />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn-primary">Apply</button>
            {hasFilter ? <Link href="/promotions" className="btn-ghost">Clear</Link> : null}
          </div>
        </div>
      </form>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-2">Brand</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Dates</th>
              <th className="px-4 py-2">Lines</th>
              <th className="px-4 py-2">SKUs</th>
              <th className="px-4 py-2 text-right">Spend</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {promos.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-brand-muted">
                  {hasFilter ? "No promotions match these filters." : "No promotions yet."}
                </td>
              </tr>
            ) : null}
            {promos.map((p) => {
              const itemSpend = p.items.reduce((s, it) => s + (it.expected_spend_cents ?? 0), 0);
              const total = (p.fixed_fee_cents ?? 0) + itemSpend;
              const distinctLines = Array.from(
                new Set(p.items.map((it) => it.product?.line).filter(Boolean) as string[])
              );
              return (
                <tr key={p.id} className="border-t border-brand-border hover:bg-gray-50">
                  <td className="px-4 py-2">{p.brand?.name}</td>
                  <td className="px-4 py-2">{p.customer?.name}</td>
                  <td className="px-4 py-2">{PROMO_TYPE_LABEL[p.promo_type]}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{p.start_date} → {p.end_date}</td>
                  <td className="px-4 py-2 text-xs">{distinctLines.join(", ") || "—"}</td>
                  <td className="px-4 py-2">{p.items.length}</td>
                  <td className="px-4 py-2 text-right">{centsToUsd(total)}</td>
                  <td className="px-4 py-2">
                    <Link href={`/promotions/${p.id}`} className="underline">
                      <span className="badge bg-gray-100 capitalize">{p.status}</span>
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
