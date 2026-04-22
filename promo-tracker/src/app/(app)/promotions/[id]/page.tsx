import Link from "next/link";
import { notFound } from "next/navigation";
import { getPromotion } from "@/lib/db/promotions";
import { PROMO_TYPE_LABEL } from "@/lib/schemas/promotion";
import { centsToUsd } from "@/lib/money";
import { requireUser, canEditPromotions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PromotionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requireUser();
  const { id } = await params;
  const p = await getPromotion(id);
  if (!p) notFound();

  const itemSpend = p.items.reduce((s, it) => s + (it.expected_spend_cents ?? 0), 0);
  const total = (p.fixed_fee_cents ?? 0) + itemSpend;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-sm text-brand-muted">{p.brand?.name} · {p.customer?.name}</div>
          <h1 className="text-2xl font-semibold">{PROMO_TYPE_LABEL[p.promo_type]}</h1>
          <div className="text-sm text-brand-muted">{p.start_date} → {p.end_date}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge bg-gray-100 capitalize">{p.status}</span>
          {canEditPromotions(profile?.role) ? (
            <Link href={`/promotions/${p.id}/edit`} className="btn-secondary">Edit</Link>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="card p-4">
          <div className="text-xs text-brand-muted">Distributor</div>
          <div>{p.distributor?.name ?? "—"}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-brand-muted">Channel</div>
          <div className="capitalize">{p.channel}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-brand-muted">Fixed fee</div>
          <div>{p.fixed_fee_cents ? centsToUsd(p.fixed_fee_cents) : "—"}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-brand-muted">Total expected spend</div>
          <div>{centsToUsd(total)}</div>
        </div>
      </div>

      <div className="card p-4 mb-6">
        <h2 className="font-medium mb-3">SKUs</h2>
        {p.items.length === 0 ? (
          <p className="text-sm text-brand-muted">No SKUs.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-brand-muted">
              <tr>
                <th className="py-1 pr-3">SKU</th>
                <th className="py-1 pr-3">Product</th>
                <th className="py-1 pr-3 text-right">Disc/unit</th>
                <th className="py-1 pr-3 text-right">Scan/unit</th>
                <th className="py-1 pr-3 text-right">Lift units</th>
                <th className="py-1 pr-3 text-right">Spend</th>
              </tr>
            </thead>
            <tbody>
              {p.items.map((it) => (
                <tr key={it.id} className="border-t border-brand-border">
                  <td className="py-1 pr-3">{it.product?.sku}</td>
                  <td className="py-1 pr-3">{it.product?.name}</td>
                  <td className="py-1 pr-3 text-right">{centsToUsd(it.discount_per_unit_cents)}</td>
                  <td className="py-1 pr-3 text-right">{centsToUsd(it.scan_rate_per_unit_cents)}</td>
                  <td className="py-1 pr-3 text-right">{it.expected_lift_units}</td>
                  <td className="py-1 pr-3 text-right">{centsToUsd(it.expected_spend_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {p.notes ? (
        <div className="card p-4 mb-6">
          <h2 className="font-medium mb-2">Notes</h2>
          <p className="text-sm whitespace-pre-wrap">{p.notes}</p>
        </div>
      ) : null}
    </div>
  );
}
