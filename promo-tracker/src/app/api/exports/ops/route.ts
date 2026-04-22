import { type NextRequest } from "next/server";
import { listPromotions } from "@/lib/db/promotions";
import { csvResponse, toCsv } from "@/lib/csv";
import { PROMO_TYPE_LABEL } from "@/lib/schemas/promotion";
import { allocateByDays, sliceIntoIsoWeeks } from "@/lib/weeks";

const COLUMNS = [
  "iso_year", "iso_week", "week_start",
  "brand", "customer", "sku", "upc", "product_name",
  "promo_type", "expected_units_this_week",
  "discount_per_unit", "discount_depth_pct",
  "promo_id"
] as const;

type Row = Record<(typeof COLUMNS)[number], string | number>;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const filters = {
    brand_id: url.searchParams.get("brand_id") ?? undefined,
    customer_id: url.searchParams.get("customer_id") ?? undefined,
    promo_type: url.searchParams.get("promo_type") ?? undefined,
    start: url.searchParams.get("start") ?? undefined,
    end: url.searchParams.get("end") ?? undefined
  };

  const promos = await listPromotions(filters);
  const rows: Row[] = [];

  for (const p of promos) {
    const slices = sliceIntoIsoWeeks(p.start_date, p.end_date);
    for (const it of p.items) {
      if (!it.expected_lift_units || it.expected_lift_units <= 0) continue;
      const allocated = allocateByDays(it.expected_lift_units, slices);
      const depthPct =
        it.product?.srp_cents && it.product.srp_cents > 0 && it.discount_per_unit_cents
          ? ((it.discount_per_unit_cents / it.product.srp_cents) * 100).toFixed(1)
          : "";
      slices.forEach((w, i) => {
        if (allocated[i] === 0) return;
        rows.push({
          iso_year: w.isoYear,
          iso_week: w.isoWeek,
          week_start: w.weekStart,
          brand: p.brand?.name ?? "",
          customer: p.customer?.name ?? "",
          sku: it.product?.sku ?? "",
          upc: it.product?.upc ?? "",
          product_name: it.product?.name ?? "",
          promo_type: PROMO_TYPE_LABEL[p.promo_type],
          expected_units_this_week: allocated[i],
          discount_per_unit: it.discount_per_unit_cents != null ? (it.discount_per_unit_cents / 100).toFixed(2) : "",
          discount_depth_pct: depthPct,
          promo_id: p.id
        });
      });
    }
  }

  const csv = toCsv(rows, COLUMNS as unknown as (keyof Row)[]);
  const stamp = new Date().toISOString().slice(0, 10);
  return csvResponse(csv, `promo-ops-${stamp}.csv`);
}
