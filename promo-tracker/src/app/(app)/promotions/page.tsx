import Link from "next/link";
import { listPromotions } from "@/lib/db/promotions";
import { PROMO_TYPE_LABEL } from "@/lib/schemas/promotion";
import { centsToUsd } from "@/lib/money";
import { requireUser } from "@/lib/auth";
import { canEditPromotions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PromotionsPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; brand_id?: string; promo_type?: string }>;
}) {
  const { profile } = await requireUser();
  const filters = await searchParams;
  const promos = await listPromotions(filters);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Promotions</h1>
        {canEditPromotions(profile?.role) ? (
          <Link href="/promotions/new" className="btn-primary">New promotion</Link>
        ) : null}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-2">Brand</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Dates</th>
              <th className="px-4 py-2">SKUs</th>
              <th className="px-4 py-2 text-right">Spend</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {promos.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-brand-muted">
                  No promotions yet.
                </td>
              </tr>
            ) : null}
            {promos.map((p) => {
              const itemSpend = p.items.reduce((s, it) => s + (it.expected_spend_cents ?? 0), 0);
              const total = (p.fixed_fee_cents ?? 0) + itemSpend;
              return (
                <tr key={p.id} className="border-t border-brand-border hover:bg-gray-50">
                  <td className="px-4 py-2">{p.brand?.name}</td>
                  <td className="px-4 py-2">{p.customer?.name}</td>
                  <td className="px-4 py-2">{PROMO_TYPE_LABEL[p.promo_type]}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{p.start_date} → {p.end_date}</td>
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
