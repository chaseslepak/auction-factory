import 'server-only';
import { createClient } from '@supabase/supabase-js';

export function createChaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_CHASE_SUPABASE_URL;
  const serviceKey = process.env.CHASE_SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Chase Supabase admin env vars missing');
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
