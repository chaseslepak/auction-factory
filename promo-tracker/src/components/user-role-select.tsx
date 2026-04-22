"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { USER_ROLES } from "@/lib/schemas/user";
import type { UserRole } from "@/lib/types";

export function UserRoleSelect({
  userId,
  currentRole,
  currentName
}: {
  userId: string;
  currentRole: UserRole;
  currentName: string | null;
}) {
  const router = useRouter();
  const [role, setRole] = useState<UserRole>(currentRole);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(next: UserRole) {
    setRole(next);
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: next, full_name: currentName })
    });
    setSaving(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b?.error ?? "Failed");
      setRole(currentRole);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <select
        className="input py-1"
        value={role}
        disabled={saving}
        onChange={(e) => onChange(e.target.value as UserRole)}
      >
        {USER_ROLES.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
      </select>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
