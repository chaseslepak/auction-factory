import { createChaseServerClient } from './supabase/server';

export async function logActivity(
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown> = {},
) {
  const supabase = createChaseServerClient();
  await supabase.rpc('log_activity', {
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_metadata: metadata,
  });
}
