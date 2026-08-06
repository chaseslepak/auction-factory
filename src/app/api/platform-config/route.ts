import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encrypt, decrypt } from '@/lib/crypto';

// Fields that should be encrypted before storage
const SENSITIVE_FIELDS = ['page_access_token', 'access_token', 'app_secret'];

function encryptSensitive(config: Record<string, any>): Record<string, any> {
  const result = { ...config };
  for (const field of SENSITIVE_FIELDS) {
    if (result[field] && typeof result[field] === 'string' && !result[field].startsWith('enc:')) {
      result[field] = encrypt(result[field]);
    }
  }
  return result;
}

function maskSensitive(config: Record<string, any>): Record<string, any> {
  const result = { ...config };
  for (const field of SENSITIVE_FIELDS) {
    if (result[field]) {
      let val = result[field];
      try { val = decrypt(val); } catch {}
      result[field] = val.substring(0, 8) + '...' + val.substring(val.length - 4);
    }
  }
  return result;
}

// GET: fetch config for a platform (or all platforms)
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const platform = request.nextUrl.searchParams.get('platform');

  if (platform) {
    const { data } = await supabase
      .from('platform_config')
      .select('*')
      .eq('platform', platform)
      .single();

    if (!data) {
      return NextResponse.json({ platform, config: {}, enabled: false });
    }

    return NextResponse.json({
      ...data,
      config: maskSensitive(data.config),
    });
  }

  // Return all platform configs
  const { data } = await supabase.from('platform_config').select('*');
  const configs = (data || []).map((c) => ({
    ...c,
    config: maskSensitive(c.config),
  }));

  return NextResponse.json({ configs });
}

// POST: save config for a platform
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { platform, config, enabled } = await request.json();
  if (!platform) {
    return NextResponse.json({ error: 'platform is required' }, { status: 400 });
  }

  const encryptedConfig = encryptSensitive(config || {});

  const { error } = await supabase.from('platform_config').upsert(
    {
      platform,
      config: encryptedConfig,
      enabled: enabled ?? true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'platform' }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
