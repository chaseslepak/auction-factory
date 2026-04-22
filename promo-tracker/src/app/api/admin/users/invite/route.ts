import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { inviteUserSchema } from "@/lib/schemas/user";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = await request.json();
  const parsed = inviteUserSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { email, full_name, role } = parsed.data;

  const service = createServiceClient();
  const origin = new URL(request.url).origin;

  const { data: invited, error: inviteErr } = await service.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/auth/callback`
  });
  if (inviteErr || !invited?.user) {
    return NextResponse.json({ error: inviteErr?.message ?? "Invite failed" }, { status: 400 });
  }

  const { error: profileErr } = await service.from("user_profiles").upsert(
    { user_id: invited.user.id, full_name: full_name ?? null, role },
    { onConflict: "user_id" }
  );
  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 400 });
  }

  return NextResponse.json({ user_id: invited.user.id });
}
