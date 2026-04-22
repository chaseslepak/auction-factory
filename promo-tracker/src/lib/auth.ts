import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserProfile, UserRole } from "@/lib/types";

export async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle<UserProfile>();

  return { user, profile, supabase };
}

export function isAdmin(role?: UserRole | null): boolean {
  return role === "admin";
}
export function canEditPromotions(role?: UserRole | null): boolean {
  return role === "admin" || role === "sales";
}
export function canExport(role?: UserRole | null): boolean {
  return role === "admin" || role === "accounting" || role === "ops";
}
