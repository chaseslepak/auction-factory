import { createBrowserClient } from '@supabase/ssr';

export function createChaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_CHASE_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_CHASE_SUPABASE_ANON_KEY!
  );
}
