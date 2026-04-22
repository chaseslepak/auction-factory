import { z } from "zod";

export const CUSTOMER_TYPES = ["chain", "banner", "independent", "broker"] as const;

export const customerSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(CUSTOMER_TYPES).nullable().optional(),
  parent_id: z.string().uuid().nullable().optional()
});

export type CustomerInput = z.infer<typeof customerSchema>;
