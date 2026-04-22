import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { PROMO_STATUSES } from "@/lib/schemas/promotion";

const bodySchema = z.object({ status: z.enum(PROMO_STATUSES) });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await request.json();
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const { error } = await supabase
    .from("promotions")
    .update({ status: parsed.data.status })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from("activity_log").insert({
    actor_id: user.id,
    entity: "promotion",
    entity_id: id,
    action: "status_change",
    diff_json: { status: parsed.data.status }
  });

  return NextResponse.json({ ok: true });
}
