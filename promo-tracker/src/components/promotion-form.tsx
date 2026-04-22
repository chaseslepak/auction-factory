"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PROMO_TYPES,
  PROMO_STATUSES,
  CHANNELS,
  PROMO_TYPE_LABEL,
  FLAT_FEE_TYPES,
  type PromotionInput
} from "@/lib/schemas/promotion";
import { usdToCents, centsToUsd } from "@/lib/money";
import type { Brand, Customer, Distributor, Product } from "@/lib/types";

interface Props {
  brands: Brand[];
  customers: Customer[];
  distributors: Distributor[];
  products: Product[];
  initial?: Partial<PromotionInput> & { id?: string };
}

interface ItemRow {
  product_id: string;
  discount_per_unit: string;
  scan_rate_per_unit: string;
  baseline_weekly_units: string;
  expected_lift_units: string;
  expected_spend: string;
}

function emptyRow(): ItemRow {
  return {
    product_id: "",
    discount_per_unit: "",
    scan_rate_per_unit: "",
    baseline_weekly_units: "",
    expected_lift_units: "",
    expected_spend: ""
  };
}

export function PromotionForm({ brands, customers, distributors, products, initial }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [brandId, setBrandId] = useState(initial?.brand_id ?? brands[0]?.id ?? "");
  const [customerId, setCustomerId] = useState(initial?.customer_id ?? "");
  const [distributorId, setDistributorId] = useState(initial?.distributor_id ?? "");
  const [channel, setChannel] = useState(initial?.channel ?? "retail");
  const [promoType, setPromoType] = useState(initial?.promo_type ?? "OI_TPR");
  const [startDate, setStartDate] = useState(initial?.start_date ?? "");
  const [endDate, setEndDate] = useState(initial?.end_date ?? "");
  const [status, setStatus] = useState(initial?.status ?? "draft");
  const [fixedFee, setFixedFee] = useState(
    initial?.fixed_fee_cents != null ? (initial.fixed_fee_cents / 100).toString() : ""
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [rows, setRows] = useState<ItemRow[]>(
    initial?.items?.length
      ? initial.items.map((it) => ({
          product_id: it.product_id,
          discount_per_unit: it.discount_per_unit_cents != null ? (it.discount_per_unit_cents / 100).toString() : "",
          scan_rate_per_unit: it.scan_rate_per_unit_cents != null ? (it.scan_rate_per_unit_cents / 100).toString() : "",
          baseline_weekly_units: it.baseline_weekly_units?.toString() ?? "",
          expected_lift_units: it.expected_lift_units?.toString() ?? "",
          expected_spend: it.expected_spend_cents != null ? (it.expected_spend_cents / 100).toString() : ""
        }))
      : [emptyRow()]
  );

  const isFlatFee = FLAT_FEE_TYPES.has(promoType);
  const brandProducts = useMemo(
    () => products.filter((p) => p.brand_id === brandId && p.active),
    [products, brandId]
  );

  function updateRow(i: number, patch: Partial<ItemRow>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() { setRows((rs) => [...rs, emptyRow()]); }
  function removeRow(i: number) { setRows((rs) => rs.filter((_, idx) => idx !== i)); }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload: PromotionInput = {
      brand_id: brandId,
      customer_id: customerId,
      distributor_id: distributorId || null,
      channel: channel as PromotionInput["channel"],
      promo_type: promoType as PromotionInput["promo_type"],
      start_date: startDate,
      end_date: endDate,
      status: status as PromotionInput["status"],
      fixed_fee_cents: isFlatFee ? usdToCents(fixedFee) : null,
      agreement_url: null,
      notes: notes || null,
      items: rows
        .filter((r) => r.product_id)
        .map((r) => ({
          product_id: r.product_id,
          discount_per_unit_cents: usdToCents(r.discount_per_unit),
          scan_rate_per_unit_cents: usdToCents(r.scan_rate_per_unit),
          baseline_weekly_units: r.baseline_weekly_units ? parseInt(r.baseline_weekly_units, 10) : null,
          expected_lift_units: r.expected_lift_units ? parseInt(r.expected_lift_units, 10) : 0,
          expected_spend_cents: usdToCents(r.expected_spend)
        }))
    };

    const url = initial?.id ? `/api/promotions/${initial.id}` : "/api/promotions";
    const method = initial?.id ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error ?? "Save failed");
      return;
    }
    const body = await res.json();
    router.push(`/promotions/${body.id ?? initial?.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 max-w-4xl">
      <section className="card p-5 space-y-4">
        <h2 className="font-medium">Basics</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Brand</label>
            <select className="input" value={brandId} onChange={(e) => setBrandId(e.target.value)} required>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Customer</label>
            <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
              <option value="">Select…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Distributor</label>
            <select className="input" value={distributorId ?? ""} onChange={(e) => setDistributorId(e.target.value)}>
              <option value="">None</option>
              {distributors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Channel</label>
            <select className="input" value={channel} onChange={(e) => setChannel(e.target.value as PromotionInput["channel"])}>
              {CHANNELS.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Promo type</label>
            <select className="input" value={promoType} onChange={(e) => setPromoType(e.target.value as PromotionInput["promo_type"])}>
              {PROMO_TYPES.map((t) => <option key={t} value={t}>{PROMO_TYPE_LABEL[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as PromotionInput["status"])}>
              {PROMO_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Start date</label>
            <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
          <div>
            <label className="label">End date</label>
            <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
          </div>
        </div>
      </section>

      {isFlatFee ? (
        <section className="card p-5 space-y-3">
          <h2 className="font-medium">Fixed fee</h2>
          <div>
            <label className="label">Amount (USD)</label>
            <input type="number" min="0" step="0.01" className="input max-w-xs" value={fixedFee} onChange={(e) => setFixedFee(e.target.value)} required />
            {fixedFee ? <p className="text-xs text-brand-muted mt-1">{centsToUsd(usdToCents(fixedFee))}</p> : null}
          </div>
        </section>
      ) : null}

      <section className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium">SKUs {isFlatFee ? <span className="text-xs text-brand-muted font-normal">(optional for flat-fee — add if you want lift to feed ops forecast)</span> : null}</h2>
          <button type="button" className="btn-secondary" onClick={addRow}>Add SKU</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-brand-muted">
              <tr>
                <th className="py-2 pr-3">SKU</th>
                <th className="py-2 pr-3">Disc / unit</th>
                <th className="py-2 pr-3">Scan / unit</th>
                <th className="py-2 pr-3">Baseline wk units</th>
                <th className="py-2 pr-3">Lift units</th>
                <th className="py-2 pr-3">Expected spend</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-brand-border align-top">
                  <td className="py-2 pr-3 w-[280px]">
                    <select className="input" value={r.product_id} onChange={(e) => updateRow(i, { product_id: e.target.value })}>
                      <option value="">Select…</option>
                      {brandProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} — {p.name}{p.line ? ` (${p.line})` : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-3"><input type="number" min="0" step="0.01" className="input" value={r.discount_per_unit} onChange={(e) => updateRow(i, { discount_per_unit: e.target.value })} /></td>
                  <td className="py-2 pr-3"><input type="number" min="0" step="0.01" className="input" value={r.scan_rate_per_unit} onChange={(e) => updateRow(i, { scan_rate_per_unit: e.target.value })} /></td>
                  <td className="py-2 pr-3"><input type="number" min="0" step="1" className="input" value={r.baseline_weekly_units} onChange={(e) => updateRow(i, { baseline_weekly_units: e.target.value })} /></td>
                  <td className="py-2 pr-3"><input type="number" min="0" step="1" className="input" value={r.expected_lift_units} onChange={(e) => updateRow(i, { expected_lift_units: e.target.value })} /></td>
                  <td className="py-2 pr-3"><input type="number" min="0" step="0.01" className="input" value={r.expected_spend} onChange={(e) => updateRow(i, { expected_spend: e.target.value })} /></td>
                  <td className="py-2">
                    <button type="button" className="text-sm text-brand-muted hover:text-red-600" onClick={() => removeRow(i)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5">
        <label className="label">Notes</label>
        <textarea className="input min-h-[80px]" value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} />
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        <button type="button" className="btn-ghost" onClick={() => router.back()}>Cancel</button>
      </div>
    </form>
  );
}
