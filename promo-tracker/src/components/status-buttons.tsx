"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { PROMO_STATUSES } from "@/lib/schemas/promotion";
import type { PromoStatus } from "@/lib/types";

export function StatusButtons({
  promotionId,
  current
}: {
  promotionId: string;
  current: PromoStatus;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<PromoStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(next: PromoStatus) {
    if (next === current || saving) return;
    setSaving(next);
    setError(null);
    const res = await fetch(`/api/promotions/${promotionId}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next })
    });
    setSaving(null);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b?.error ?? "Failed to update");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {PROMO_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            disabled={saving !== null}
            className={clsx(
              "badge border capitalize",
              s === current
                ? "bg-brand-ink text-white border-brand-ink"
                : "bg-white text-brand-ink border-brand-border hover:bg-gray-50"
            )}
          >
            {saving === s ? "…" : s}
          </button>
        ))}
      </div>
      {error ? <p className="text-xs text-red-600 mt-1">{error}</p> : null}
    </div>
  );
}
