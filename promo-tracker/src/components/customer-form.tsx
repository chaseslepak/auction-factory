"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CUSTOMER_TYPES } from "@/lib/schemas/customer";
import type { Customer } from "@/lib/types";

export function CustomerForm({
  parents,
  initial
}: {
  parents: Customer[];
  initial?: Customer;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState(initial?.type ?? "");
  const [parentId, setParentId] = useState(initial?.parent_id ?? "");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const body = {
      name,
      type: type || null,
      parent_id: parentId || null
    };

    const res = await fetch(
      initial ? `/api/customers/${initial.id}` : "/api/customers",
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
    router.push("/catalog/customers");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 max-w-xl">
      <section className="card p-5 space-y-4">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Type</label>
            <select className="input" value={type ?? ""} onChange={(e) => setType(e.target.value)}>
              <option value="">—</option>
              {CUSTOMER_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Parent (if banner of a chain)</label>
            <select className="input" value={parentId ?? ""} onChange={(e) => setParentId(e.target.value)}>
              <option value="">—</option>
              {parents.filter((c) => c.id !== initial?.id).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
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
