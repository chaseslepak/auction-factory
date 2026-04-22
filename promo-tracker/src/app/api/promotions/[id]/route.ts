import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { promotionSchema } from "@/lib/schemas/promotion";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await request.json();
  const parsed = promotionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const p = parsed.data;

  const { error: upErr } = await supabase
    .from("promotions")
    .update({
      brand_id: p.brand_id,
      customer_id: p.customer_id,
      distributor_id: p.distributor_id ?? null,
      channel: p.channel,
      promo_type: p.promo_type,
      start_date: p.start_date,
      end_date: p.end_date,
      status: p.status,
      fixed_fee_cents: p.fixed_fee_cents ?? null,
      agreement_url: p.agreement_url ?? null,
      notes: p.notes ?? null
    })
    .eq("id", id);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  // Replace items (simple v1 approach; future: diff for activity log granularity)
  await supabase.from("promotion_items").delete().eq("promotion_id", id);
  if (p.items.length > 0) {
    const { error: itemErr } = await supabase.from("promotion_items").insert(
      p.items.map((it) => ({
        promotion_id: id,
        product_id: it.product_id,
        discount_per_unit_cents: it.discount_per_unit_cents ?? null,
        scan_rate_per_unit_cents: it.scan_rate_per_unit_cents ?? null,
        baseline_weekly_units: it.baseline_weekly_units ?? null,
        expected_lift_units: it.expected_lift_units ?? 0,
        expected_spend_cents: it.expected_spend_cents ?? null
      }))
    );
    if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 400 });
  }

  await supabase.from("activity_log").insert({
    actor_id: user.id,
    entity: "promotion",
    entity_id: id,
    action: "update"
  });

  return NextResponse.json({ id });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.from("promotions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from("activity_log").insert({
    actor_id: user.id,
    entity: "promotion",
    entity_id: id,
    action: "delete"
  });

  return NextResponse.json({ ok: true });
}
