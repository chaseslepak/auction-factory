import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { promotionSchema } from "@/lib/schemas/promotion";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await request.json();
  const parsed = promotionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const p = parsed.data;

  const { data: promo, error } = await supabase
    .from("promotions")
    .insert({
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
      notes: p.notes ?? null,
      created_by: user.id
    })
    .select("id")
    .single();

  if (error || !promo) {
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 400 });
  }

  if (p.items.length > 0) {
    const { error: itemErr } = await supabase.from("promotion_items").insert(
      p.items.map((it) => ({
        promotion_id: promo.id,
        product_id: it.product_id,
        discount_per_unit_cents: it.discount_per_unit_cents ?? null,
        scan_rate_per_unit_cents: it.scan_rate_per_unit_cents ?? null,
        baseline_weekly_units: it.baseline_weekly_units ?? null,
        expected_lift_units: it.expected_lift_units ?? 0,
        expected_spend_cents: it.expected_spend_cents ?? null
      }))
    );
    if (itemErr) {
      return NextResponse.json({ error: itemErr.message, id: promo.id }, { status: 400 });
    }
  }

  await supabase.from("activity_log").insert({
    actor_id: user.id,
    entity: "promotion",
    entity_id: promo.id,
    action: "create"
  });

  return NextResponse.json({ id: promo.id });
}
