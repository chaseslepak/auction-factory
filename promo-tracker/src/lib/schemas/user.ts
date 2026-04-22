import { z } from "zod";

export const USER_ROLES = ["sales", "accounting", "ops", "admin"] as const;

export const inviteUserSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1).max(120).nullable().optional(),
  role: z.enum(USER_ROLES)
});

export const updateUserSchema = z.object({
  full_name: z.string().min(1).max(120).nullable().optional(),
  role: z.enum(USER_ROLES)
});
