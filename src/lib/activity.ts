import { SupabaseClient } from '@supabase/supabase-js';

export async function logActivity(
  supabase: SupabaseClient,
  params: {
    user_email: string;
    action: string;
    entity_type: string;
    entity_id?: string;
    auction_id?: string;
    details?: Record<string, any>;
  }
) {
  try {
    await supabase.from('activity_log').insert(params);
  } catch {
    // Don't fail if logging fails
  }
}
