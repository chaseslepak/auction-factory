import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const auctionId = request.nextUrl.searchParams.get('auction_id');
  const format = request.nextUrl.searchParams.get('format') || 'csv';

  if (!auctionId) {
    return NextResponse.json({ error: 'auction_id required' }, { status: 400 });
  }

  const { data: auction } = await supabase.from('auctions').select('*').eq('id', auctionId).single();
  const { data: lots } = await supabase
    .from('lots')
    .select('*')
    .eq('auction_id', auctionId)
    .is('deleted_at', null)
    .order('lot_number', { ascending: true });

  if (!lots) {
    return NextResponse.json({ error: 'No lots found' }, { status: 404 });
  }

  if (format === 'json') {
    return NextResponse.json({ auction, lots });
  }

  // CSV format
  const headers = [
    'lot_number',
    'item_name',
    'brand',
    'model',
    'category',
    'condition_rating',
    'quantity',
    'estimated_retail_new',
    'listed_price',
    'confidence',
    'width',
    'depth',
    'height',
    'af_upload_status',
    'notes',
    'auction_description',
  ];

  const escape = (v: any) => {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = lots.map((lot: any) =>
    headers.map((h) => escape(lot[h])).join(',')
  );

  const csv = [headers.join(','), ...rows].join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${(auction?.name || 'auction').replace(/[^a-z0-9]/gi, '_')}.csv"`,
    },
  });
}
