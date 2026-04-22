import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { requireUser, isAdmin } from "@/lib/auth";
import { InviteUserForm } from "@/components/invite-user-form";
import { UserRoleSelect } from "@/components/user-role-select";
import type { UserProfile, UserRole } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Row {
  user_id: string;
  full_name: string | null;
  role: UserRole;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
}

async function loadRows(): Promise<Row[]> {
  const service = createServiceClient();

  const { data: profiles } = await service
    .from("user_profiles")
    .select("user_id, full_name, role, created_at")
    .order("created_at", { ascending: false });

  const profileRows = (profiles ?? []) as UserProfile[] & { created_at?: string }[];
  const { data: authList } = await service.auth.admin.listUsers({ perPage: 200 });
  const usersById = new Map(
    (authList?.users ?? []).map((u) => [u.id, u])
  );

  return profileRows.map((p) => {
    const au = usersById.get(p.user_id);
    return {
      user_id: p.user_id,
      full_name: p.full_name,
      role: p.role,
      email: au?.email ?? null,
      created_at: (p as { created_at?: string }).created_at ?? null,
      last_sign_in_at: au?.last_sign_in_at ?? null
    };
  });
}

export default async function AdminUsersPage() {
  const { profile } = await requireUser();
  if (!isAdmin(profile?.role)) redirect("/");

  const rows = await loadRows();

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Users</h1>

      <InviteUserForm />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Last sign-in</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-brand-muted">No users yet. Invite someone above.</td></tr>
            ) : null}
            {rows.map((r) => (
              <tr key={r.user_id} className="border-t border-brand-border">
                <td className="px-4 py-2">{r.full_name ?? "—"}</td>
                <td className="px-4 py-2">{r.email ?? <span className="text-brand-muted">(no email)</span>}</td>
                <td className="px-4 py-2">
                  <UserRoleSelect userId={r.user_id} currentRole={r.role} currentName={r.full_name} />
                </td>
                <td className="px-4 py-2 text-brand-muted">
                  {r.last_sign_in_at ? new Date(r.last_sign_in_at).toLocaleDateString() : "never"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-brand-muted mt-3">
        Invited users get a magic-link email. Their profile is created immediately with the role you selected;
        role can be changed above anytime.
      </p>
    </div>
  );
}
