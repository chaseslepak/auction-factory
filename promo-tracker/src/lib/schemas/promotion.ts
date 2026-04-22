import { z } from "zod";

export const PROMO_TYPES = [
  "OI_TPR",
  "SCAN_MCB",
  "AD_FEATURE",
  "DISPLAY",
  "DEMO",
  "SLOTTING",
  "NEW_ITEM_FEE"
] as const;

export const PROMO_STATUSES = [
  "draft",
  "planned",
  "active",
  "completed",
  "invoiced",
  "reconciled"
] as const;

export const CHANNELS = ["retail", "distributor", "dsd", "direct", "other"] as const;

export const PROMO_TYPE_LABEL: Record<(typeof PROMO_TYPES)[number], string> = {
  OI_TPR: "Off-Invoice / TPR",
  SCAN_MCB: "Scan / MCB",
  AD_FEATURE: "Ad / Feature",
  DISPLAY: "Display",
  DEMO: "Demo",
  SLOTTING: "Slotting",
  NEW_ITEM_FEE: "New-Item Fee"
};

export const FLAT_FEE_TYPES = new Set<(typeof PROMO_TYPES)[number]>([
  "AD_FEATURE",
  "DISPLAY",
  "DEMO",
  "SLOTTING",
  "NEW_ITEM_FEE"
]);

export const promotionItemSchema = z.object({
  id: z.string().uuid().optional(),
  product_id: z.string().uuid(),
  discount_per_unit_cents: z.number().int().nonnegative().nullable().optional(),
  scan_rate_per_unit_cents: z.number().int().nonnegative().nullable().optional(),
  baseline_weekly_units: z.number().int().nonnegative().nullable().optional(),
  expected_lift_units: z.number().int().nonnegative().default(0),
  expected_spend_cents: z.number().int().nonnegative().nullable().optional()
});

export const promotionSchema = z
  .object({
    brand_id: z.string().uuid(),
    customer_id: z.string().uuid(),
    distributor_id: z.string().uuid().nullable().optional(),
    channel: z.enum(CHANNELS).default("retail"),
    promo_type: z.enum(PROMO_TYPES),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
    status: z.enum(PROMO_STATUSES).default("draft"),
    fixed_fee_cents: z.number().int().nonnegative().nullable().optional(),
    agreement_url: z.string().url().nullable().optional(),
    notes: z.string().max(4000).nullable().optional(),
    items: z.array(promotionItemSchema).default([])
  })
  .refine((v) => v.end_date >= v.start_date, {
    path: ["end_date"],
    message: "End date must be on or after start date"
  })
  .refine(
    (v) => !FLAT_FEE_TYPES.has(v.promo_type) || (v.fixed_fee_cents ?? 0) > 0,
    { path: ["fixed_fee_cents"], message: "Flat-fee promos require a fixed fee amount" }
  )
  .refine(
    (v) => FLAT_FEE_TYPES.has(v.promo_type) || v.items.length > 0,
    { path: ["items"], message: "Add at least one SKU" }
  );

export type PromotionInput = z.infer<typeof promotionSchema>;
export type PromotionItemInput = z.infer<typeof promotionItemSchema>;
