import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser, isAdmin } from "@/lib/auth";
import type { Brand, UserProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const { profile } = await requireUser();
  if (!isAdmin(profile?.role)) redirect("/");

  const supabase = await createClient();
  const [profilesR, brandsR, accessR] = await Promise.all([
    supabase.from("user_profiles").select("*").order("created_at", { ascending: false }),
    supabase.from("brands").select("*"),
    supabase.from("user_brand_access").select("*")
  ]);

  const brands = (brandsR.data ?? []) as Brand[];
  const brandById = new Map(brands.map((b) => [b.id, b]));
  const access = (accessR.data ?? []) as Array<{ user_id: string; brand_id: string }>;
  const accessByUser = new Map<string, string[]>();
  for (const a of access) {
    const arr = accessByUser.get(a.user_id) ?? [];
    arr.push(brandById.get(a.brand_id)?.name ?? a.brand_id);
    accessByUser.set(a.user_id, arr);
  }

  const profiles = (profilesR.data ?? []) as UserProfile[];

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Users</h1>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Brands</th>
            </tr>
          </thead>
          <tbody>
            {profiles.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-brand-muted">No users yet. Invite via Supabase Auth, then add a row to <code>user_profiles</code>.</td></tr>
            ) : null}
            {profiles.map((u) => (
              <tr key={u.user_id} className="border-t border-brand-border">
                <td className="px-4 py-2">{u.full_name ?? u.user_id}</td>
                <td className="px-4 py-2 capitalize">{u.role}</td>
                <td className="px-4 py-2">{(accessByUser.get(u.user_id) ?? []).join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-brand-muted mt-3">
        Invite/edit UI is a v1.5 follow-up. For now: invite users via Supabase Dashboard, then insert their
        profile and brand-access rows via SQL editor.
      </p>
    </div>
  );
}
