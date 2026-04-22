import Link from "next/link";
import { listPromotions } from "@/lib/db/promotions";
import { centsToUsd } from "@/lib/money";
import { PROMO_TYPE_LABEL } from "@/lib/schemas/promotion";
import { requireUser } from "@/lib/auth";
import { format, parseISO } from "date-fns";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { profile } = await requireUser();
  const role = profile?.role ?? "sales";

  const today = new Date().toISOString().slice(0, 10);
  const promos = await listPromotions({ start: today });

  const activeNow = promos.filter((p) => p.start_date <= today && p.end_date >= today);
  const upcoming = promos.filter((p) => p.start_date > today).slice(0, 10);

  const totalPlannedSpend = promos.reduce((s, p) => {
    const items = p.items.reduce((ss, it) => ss + (it.expected_spend_cents ?? 0), 0);
    return s + (p.fixed_fee_cents ?? 0) + items;
  }, 0);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6 capitalize">{role} dashboard</h1>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="card p-4">
          <div className="text-xs text-brand-muted">Active now</div>
          <div className="text-2xl font-semibold">{activeNow.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-brand-muted">Upcoming</div>
          <div className="text-2xl font-semibold">{upcoming.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-brand-muted">Planned spend (forward)</div>
          <div className="text-2xl font-semibold">{centsToUsd(totalPlannedSpend)}</div>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium">Upcoming promotions</h2>
          <Link href="/promotions" className="text-sm underline">View all</Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-brand-muted">Nothing scheduled.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-brand-muted">
              <tr>
                <th className="py-1 pr-3">Starts</th>
                <th className="py-1 pr-3">Brand</th>
                <th className="py-1 pr-3">Customer</th>
                <th className="py-1 pr-3">Type</th>
                <th className="py-1 pr-3 text-right">Lift units</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((p) => {
                const lift = p.items.reduce((s, it) => s + (it.expected_lift_units ?? 0), 0);
                return (
                  <tr key={p.id} className="border-t border-brand-border">
                    <td className="py-1 pr-3">{format(parseISO(p.start_date), "MMM d")}</td>
                    <td className="py-1 pr-3">{p.brand?.name}</td>
                    <td className="py-1 pr-3">{p.customer?.name}</td>
                    <td className="py-1 pr-3">{PROMO_TYPE_LABEL[p.promo_type]}</td>
                    <td className="py-1 pr-3 text-right">{lift.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
