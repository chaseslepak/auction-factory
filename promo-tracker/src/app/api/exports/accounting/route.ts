import { type NextRequest } from "next/server";
import { listPromotions } from "@/lib/db/promotions";
import { csvResponse, toCsv } from "@/lib/csv";
import { PROMO_TYPE_LABEL, FLAT_FEE_TYPES } from "@/lib/schemas/promotion";

const COLUMNS = [
  "promo_id", "brand", "customer", "distributor", "channel", "promo_type",
  "start_date", "end_date", "status", "line_kind",
  "sku", "upc", "product_name", "product_line", "pack_size",
  "discount_per_unit", "scan_rate_per_unit", "fixed_fee",
  "expected_units", "expected_spend", "notes"
] as const;

type Row = Record<(typeof COLUMNS)[number], string | number>;

function dollars(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

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
    const base = {
      promo_id: p.id,
      brand: p.brand?.name ?? "",
      customer: p.customer?.name ?? "",
      distributor: p.distributor?.name ?? "",
      channel: p.channel,
      promo_type: PROMO_TYPE_LABEL[p.promo_type],
      start_date: p.start_date,
      end_date: p.end_date,
      status: p.status,
      notes: (p.notes ?? "").replace(/\s+/g, " ")
    };

    if (FLAT_FEE_TYPES.has(p.promo_type) && p.fixed_fee_cents) {
      rows.push({
        ...base,
        line_kind: "fixed_fee",
        sku: "",
        upc: "",
        product_name: "",
        product_line: "",
        pack_size: "",
        discount_per_unit: "",
        scan_rate_per_unit: "",
        fixed_fee: dollars(p.fixed_fee_cents),
        expected_units: "",
        expected_spend: dollars(p.fixed_fee_cents)
      });
    }

    for (const it of p.items) {
      rows.push({
        ...base,
        line_kind: "sku",
        sku: it.product?.sku ?? "",
        upc: it.product?.upc ?? "",
        product_name: it.product?.name ?? "",
        product_line: it.product?.line ?? "",
        pack_size: it.product?.pack_size ?? "",
        discount_per_unit: dollars(it.discount_per_unit_cents),
        scan_rate_per_unit: dollars(it.scan_rate_per_unit_cents),
        fixed_fee: "",
        expected_units: it.expected_lift_units ?? 0,
        expected_spend: dollars(it.expected_spend_cents)
      });
    }
  }

  const csv = toCsv(rows, COLUMNS as unknown as (keyof Row)[]);
  const stamp = new Date().toISOString().slice(0, 10);
  return csvResponse(csv, `promo-accounting-${stamp}.csv`);
}
