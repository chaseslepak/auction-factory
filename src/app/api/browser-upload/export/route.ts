import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { corsHeaders } from '@/lib/browser-upload-cors';

export const maxDuration = 60;

// AF condition labels matching their dropdown
const CONDITION_MAP: Record<number, string> = {
  10: '10 - New in box',
  9: '9 - Like New',
  8: '8 - Excellent',
  7: '7 - Good',
  6: '6 - Average',
  5: '5 - Well used',
  4: '4 - Functions',
  3: '3 - Needs parts',
  2: '2 - Repairable',
  1: '1 - Broken',
};

function sanitizeForAF(text: string, maxLength?: number): string {
  if (!text) return '';
  let result = text
    .replace(/<[^>]*>/g, '')
    .replace(/\bunion\s+select\b/gi, 'union-select')
    .replace(/\bselect\s+\*\s+from\b/gi, 'select-from')
    .replace(/<script/gi, '[script]')
    .replace(/javascript:/gi, 'js-')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2022\u25AA\u25CF\u2043]/g, '•')
    .trim();
  if (maxLength && result.length > maxLength) {
    result = result.substring(0, maxLength - 3) + '...';
  }
  return result;
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request, 'GET, POST, OPTIONS') });
}

export async function GET(request: NextRequest) {
  const CORS_HEADERS = corsHeaders(request, 'GET, POST, OPTIONS');
  const token = request.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'token required' }, { status: 400, headers: CORS_HEADERS });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500, headers: CORS_HEADERS });
  }
  const supabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  // Validate token
  const { data: tokenRow } = await supabase
    .from('upload_tokens')
    .select('*')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (!tokenRow) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: CORS_HEADERS });
  }

  // Get the AF auction mapping
  const { data: mapping } = await supabase
    .from('af_auction_map')
    .select('af_auction_id')
    .eq('auction_id', tokenRow.auction_id)
    .single();

  if (!mapping) {
    return NextResponse.json({ error: 'No AF auction linked' }, { status: 400, headers: CORS_HEADERS });
  }

  // Get all lots that haven't been uploaded yet, sorted by lot_number
  const { data: lots } = await supabase
    .from('lots')
    .select('*, lot_photos(*)')
    .eq('auction_id', tokenRow.auction_id)
    .is('deleted_at', null)
    .neq('af_upload_status', 'uploaded')
    .order('lot_number', { ascending: true });

  // Shape data for the browser script
  const shaped = (lots || []).map((lot: any) => ({
    id: lot.id,
    lot_number: lot.lot_number,
    fields: {
      title: sanitizeForAF(lot.item_name || '', 255),
      name: sanitizeForAF(lot.auction_description || '', 4000),
      condition: CONDITION_MAP[lot.condition_rating] || '5 - Well used',
      make: sanitizeForAF(lot.brand || '', 255),
      model: sanitizeForAF(lot.model || '', 255),
      qty: String(lot.quantity || 1),
      original_price: String(lot.estimated_retail_new || ''),
      start: '1.00',
      reserve: '0.00',
      buyitnow: '0.00',
      taxable: 'yes',
      width: lot.width || '',
      depth: lot.depth || '',
      height: lot.height || '',
      youtube: '',
    },
    photos: (lot.lot_photos || [])
      .slice()
      .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
      .slice(0, 10)
      .map((p: any) => supabase.storage.from('lot-photos').getPublicUrl(p.storage_path).data.publicUrl),
  }));

  return NextResponse.json(
    {
      af_auction_id: mapping.af_auction_id,
      total: shaped.length,
      lots: shaped,
    },
    { headers: CORS_HEADERS }
  );
}
