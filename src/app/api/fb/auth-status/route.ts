import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { testFbConnection } from '@/lib/facebook-page-poster';
import { decrypt } from '@/lib/crypto';

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch FB config
  const { data: config } = await supabase
    .from('platform_config')
    .select('config, enabled')
    .eq('platform', 'fb_page')
    .single();

  if (!config?.config?.page_id || !config?.config?.page_access_token) {
    return NextResponse.json({
      connected: false,
      enabled: config?.enabled || false,
      error: 'Facebook page not configured. Add your Page ID and Access Token in Settings.',
    });
  }

  // Decrypt token
  let accessToken = config.config.page_access_token;
  try {
    accessToken = decrypt(accessToken);
  } catch {}

  const result = await testFbConnection(config.config.page_id, accessToken);

  return NextResponse.json({
    connected: result.valid,
    enabled: config.enabled,
    pageName: result.pageName,
    pageId: config.config.page_id,
    error: result.error,
  });
}
