import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchAuctionLots } from '@/lib/af-archive';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// POST { af_auction_id: number }
// Returns the full lot list (lot_number, af_item_id, title, brand, model,
// condition, retail, thumbnail) from AF's public archive page for the
// import-from-archive picker. Login-gated to lotter users.
export async function POST(req: NextRequest) {
  const userClient = createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const af_auction_id = Number(body?.af_auction_id);
  if (!Number.isFinite(af_auction_id) || af_auction_id <= 0) {
    return NextResponse.json({ error: 'af_auction_id required' }, { status: 400 });
  }

  try {
    const lots = await fetchAuctionLots(af_auction_id);
    return NextResponse.json({ lots });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Failed to scan AF archive auction ${af_auction_id}: ${err?.message || err}` },
      { status: 502 },
    );
  }
}
