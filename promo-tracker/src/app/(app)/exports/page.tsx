"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PROMO_TYPES, PROMO_TYPE_LABEL } from "@/lib/schemas/promotion";
import type { Brand, Customer } from "@/lib/types";

type Target = "accounting" | "ops";

export default function ExportsPage() {
  const [target, setTarget] = useState<Target>("accounting");
  const [brands, setBrands] = useState<Brand[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [brandId, setBrandId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [promoType, setPromoType] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  useEffect(() => {
    const sb = createClient();
    sb.from("brands").select("*").order("name").then((r) => setBrands((r.data ?? []) as Brand[]));
    sb.from("customers").select("*").order("name").then((r) => setCustomers((r.data ?? []) as Customer[]));
  }, []);

  function href() {
    const params = new URLSearchParams();
    if (brandId) params.set("brand_id", brandId);
    if (customerId) params.set("customer_id", customerId);
    if (promoType) params.set("promo_type", promoType);
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    return `/api/exports/${target}?${params.toString()}`;
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold mb-6">Exports</h1>

      <div className="card p-4 mb-6">
        <div className="flex items-center gap-2 mb-4">
          {(["accounting", "ops"] as Target[]).map((t) => (
            <button
              key={t}
              type="button"
              className={t === target ? "btn-primary" : "btn-secondary"}
              onClick={() => setTarget(t)}
            >
              {t === "accounting" ? "Accounting" : "Ops / Demand planning"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Brand</label>
            <select className="input" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              <option value="">All brands</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Customer</label>
            <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">All customers</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Promo type</label>
            <select className="input" value={promoType} onChange={(e) => setPromoType(e.target.value)}>
              <option value="">All types</option>
              {PROMO_TYPES.map((t) => <option key={t} value={t}>{PROMO_TYPE_LABEL[t]}</option>)}
            </select>
          </div>
          <div />
          <div>
            <label className="label">Start (on/after)</label>
            <input type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="label">End (on/before)</label>
            <input type="date" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>

        <div className="mt-5">
          <a href={href()} className="btn-primary" download>
            Download {target} CSV
          </a>
        </div>
      </div>

      <div className="text-sm text-brand-muted space-y-2">
        <p><strong>Accounting CSV</strong> — one row per promo SKU (plus flat-fee rows). Built for deduction reconciliation and billback buildout.</p>
        <p><strong>Ops CSV</strong> — one row per SKU × ISO-week inside the promo date range, with expected lift allocated by days-in-promo. Feeds demand planner.</p>
      </div>
    </div>
  );
}
