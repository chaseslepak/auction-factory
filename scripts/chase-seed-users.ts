/**
 * Seed the four Chase OS auth users with fixed UUIDs that match chase_os_seed.sql.
 *
 * Usage:
 *   NEXT_PUBLIC_CHASE_SUPABASE_URL=... CHASE_SUPABASE_SERVICE_KEY=... \
 *     npx tsx scripts/chase-seed-users.ts
 *
 * Requires: tsx (or ts-node) and @supabase/supabase-js (already in deps).
 * Idempotent: re-running is safe; existing users are skipped.
 */
import { createClient } from '@supabase/supabase-js';

type SeedUser = {
  id: string;
  email: string;
  display_name: string;
  role: 'owner' | 'admin' | 'team_member' | 'client';
};

const USERS: SeedUser[] = [
  { id: '11111111-1111-1111-1111-111111111111', email: 'chase@chaseos.dev',  display_name: 'Chase',          role: 'owner' },
  { id: '22222222-2222-2222-2222-222222222222', email: 'admin@chaseos.dev',  display_name: 'Avery (Admin)',  role: 'admin' },
  { id: '33333333-3333-3333-3333-333333333333', email: 'tm@chaseos.dev',     display_name: 'Taylor (TM)',    role: 'team_member' },
  { id: '44444444-4444-4444-4444-444444444444', email: 'jordan@acme.com',    display_name: 'Jordan (Acme)',  role: 'client' },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_CHASE_SUPABASE_URL;
  const serviceKey = process.env.CHASE_SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_CHASE_SUPABASE_URL or CHASE_SUPABASE_SERVICE_KEY');
    process.exit(1);
  }
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const u of USERS) {
    const { data: existing } = await admin.auth.admin.getUserById(u.id);
    if (existing?.user) {
      console.log(`= ${u.email} already exists (${u.id})`);
    } else {
      const { error } = await admin.auth.admin.createUser({
        id: u.id,
        email: u.email,
        email_confirm: true,
        user_metadata: { display_name: u.display_name },
      });
      if (error) {
        console.error(`x ${u.email}: ${error.message}`);
        continue;
      }
      console.log(`+ created ${u.email} (${u.id})`);
    }

    // Ensure profile row exists with correct role (trigger may have set 'client').
    await admin.from('profiles').upsert(
      {
        id: u.id,
        email: u.email,
        display_name: u.display_name,
        role: u.role,
      },
      { onConflict: 'id' },
    );
  }

  console.log('done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
