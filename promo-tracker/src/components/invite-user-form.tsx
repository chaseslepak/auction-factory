"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { USER_ROLES } from "@/lib/schemas/user";

export function InviteUserForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<(typeof USER_ROLES)[number]>("sales");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    const res = await fetch("/api/admin/users/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, full_name: fullName || null, role })
    });
    setSaving(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b?.error ?? "Invite failed");
      return;
    }
    setSuccess(`Invitation sent to ${email}.`);
    setEmail("");
    setFullName("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card p-4 mb-6 space-y-3">
      <h2 className="font-medium">Invite user</h2>
      <div className="grid grid-cols-4 gap-3">
        <div className="col-span-2">
          <label className="label">Email</label>
          <input type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label">Full name</label>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as (typeof USER_ROLES)[number])}>
            {USER_ROLES.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Inviting…" : "Send invite"}</button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {success ? <p className="text-sm text-green-700">{success}</p> : null}
      </div>
    </form>
  );
}
