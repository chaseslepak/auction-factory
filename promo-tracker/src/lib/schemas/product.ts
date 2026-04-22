import { z } from "zod";

export const productSchema = z.object({
  brand_id: z.string().uuid(),
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  line: z.string().max(64).nullable().optional(),
  upc: z.string().max(20).nullable().optional(),
  pack_size: z.string().max(40).nullable().optional(),
  case_cost_cents: z.number().int().nonnegative().nullable().optional(),
  srp_cents: z.number().int().nonnegative().nullable().optional(),
  active: z.boolean().default(true)
});

export type ProductInput = z.infer<typeof productSchema>;
