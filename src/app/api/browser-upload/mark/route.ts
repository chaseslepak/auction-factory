import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { corsHeaders } from '@/lib/browser-upload-cors';

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request, 'POST, OPTIONS') });
}

// Mark a lot as uploaded (called by the browser upload script)
export async function POST(request: NextRequest) {
  const CORS_HEADERS = corsHeaders(request, 'POST, OPTIONS');
  const { token, lot_id, status, error } = await request.json();

  if (!token || !lot_id) {
    return NextResponse.json({ error: 'token and lot_id required' }, { status: 400, headers: CORS_HEADERS });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500, headers: CORS_HEADERS });
  }
  const supabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  // Validate token
  const { data: tokenRow } = await supabase
    .from('upload_tokens')
    .select('auction_id')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (!tokenRow) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: CORS_HEADERS });
  }

  // Update lot status
  await supabase
    .from('lots')
    .update({
      af_upload_status: status || 'uploaded',
      af_upload_error: error || null,
    })
    .eq('id', lot_id)
    .eq('auction_id', tokenRow.auction_id);

  return NextResponse.json({ success: true }, { headers: CORS_HEADERS });
}
