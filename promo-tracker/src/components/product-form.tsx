"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usdToCents, centsToUsd } from "@/lib/money";
import type { Brand, Product } from "@/lib/types";

export function ProductForm({
  brands,
  initial
}: {
  brands: Brand[];
  initial?: Product;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [brandId, setBrandId] = useState(initial?.brand_id ?? brands[0]?.id ?? "");
  const [sku, setSku] = useState(initial?.sku ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [line, setLine] = useState(initial?.line ?? "");
  const [upc, setUpc] = useState(initial?.upc ?? "");
  const [packSize, setPackSize] = useState(initial?.pack_size ?? "");
  const [caseCost, setCaseCost] = useState(
    initial?.case_cost_cents != null ? (initial.case_cost_cents / 100).toString() : ""
  );
  const [srp, setSrp] = useState(
    initial?.srp_cents != null ? (initial.srp_cents / 100).toString() : ""
  );
  const [active, setActive] = useState(initial?.active ?? true);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const body = {
      brand_id: brandId,
      sku,
      name,
      line: line || null,
      upc: upc || null,
      pack_size: packSize || null,
      case_cost_cents: usdToCents(caseCost),
      srp_cents: usdToCents(srp),
      active
    };

    const res = await fetch(
      initial ? `/api/products/${initial.id}` : "/api/products",
      {
        method: initial ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      }
    );
    setSaving(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b?.error ?? "Save failed");
      return;
    }
    router.push("/catalog/products");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 max-w-2xl">
      <section className="card p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Brand</label>
            <select className="input" value={brandId} onChange={(e) => setBrandId(e.target.value)} required>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Line</label>
            <input className="input" list="line-suggestions" value={line} onChange={(e) => setLine(e.target.value)} placeholder="e.g. 12oz, Mash, Heritage, BIB" />
            <datalist id="line-suggestions">
              <option value="12oz" />
              <option value="Mash" />
              <option value="Heritage" />
              <option value="BIB" />
              <option value="Pretty Tasty" />
            </datalist>
          </div>
          <div>
            <label className="label">SKU</label>
            <input className="input font-mono" value={sku} onChange={(e) => setSku(e.target.value)} required />
          </div>
          <div>
            <label className="label">UPC</label>
            <input className="input font-mono" value={upc ?? ""} onChange={(e) => setUpc(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="label">Pack size</label>
            <input className="input" value={packSize ?? ""} onChange={(e) => setPackSize(e.target.value)} placeholder="e.g. 12oz × 24" />
          </div>
          <div>
            <label className="label">Case cost (USD)</label>
            <input type="number" min="0" step="0.01" className="input" value={caseCost} onChange={(e) => setCaseCost(e.target.value)} />
            {caseCost ? <p className="text-xs text-brand-muted mt-1">{centsToUsd(usdToCents(caseCost))}</p> : null}
          </div>
          <div>
            <label className="label">SRP per unit (USD)</label>
            <input type="number" min="0" step="0.01" className="input" value={srp} onChange={(e) => setSrp(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm col-span-2">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active
          </label>
        </div>
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        <button type="button" className="btn-ghost" onClick={() => router.back()}>Cancel</button>
      </div>
    </form>
  );
}
