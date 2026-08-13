import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// GET  — list every archived auction with a photo/lot count so the admin
//        can see what would get purged.
// POST — with { auction_id }: purge photos + lot_photos rows for that
//        single archived auction. With { all: true }: purge every archived
//        auction. Requires admin role.

async function ensureAdmin(request: NextRequest) {
  const userClient = createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user?.email) {
    return { ok: false as const, error: 'Unauthorized', status: 401 };
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return { ok: false as const, error: 'Service role key not configured', status: 500 };
  }
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey
  );

  const { data: profile } = await supabase
    .from('allowed_users')
    .select('role')
    .eq('email', user.email.toLowerCase())
    .single();
  if (profile?.role !== 'admin') {
    return { ok: false as const, error: 'Admin only', status: 403 };
  }

  return { ok: true as const, supabase };
}

export async function GET(request: NextRequest) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const supabase = auth.supabase;

  const { data: auctions } = await supabase
    .from('auctions')
    .select('id, name, archived_at, lots(id, lot_photos(id))')
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false });

  const rows = (auctions || []).map((a: any) => {
    const lot_count = a.lots?.length ?? 0;
    const photo_count = (a.lots || []).reduce(
      (n: number, l: any) => n + (l.lot_photos?.length ?? 0),
      0
    );
    return {
      id: a.id,
      name: a.name,
      archived_at: a.archived_at,
      lot_count,
      photo_count,
    };
  });

  return NextResponse.json({
    total_archived: rows.length,
    total_photos: rows.reduce((n, r) => n + r.photo_count, 0),
    auctions: rows,
  });
}

async function purgeAuction(
  supabase: any,
  auctionId: string
): Promise<{ photos_deleted: number; error?: string }> {
  // Confirm the auction is archived — never touch active auctions.
  const { data: auction } = await supabase
    .from('auctions')
    .select('id, archived_at')
    .eq('id', auctionId)
    .single();
  if (!auction) return { photos_deleted: 0, error: 'Auction not found' };
  if (!auction.archived_at)
    return { photos_deleted: 0, error: 'Auction is not archived; refusing' };

  // Fetch every photo row for the auction's lots
  const { data: lots } = await supabase
    .from('lots')
    .select('id, lot_photos(id, storage_path)')
    .eq('auction_id', auctionId);

  const photoIds: string[] = [];
  const paths: string[] = [];
  (lots || []).forEach((l: any) => {
    (l.lot_photos || []).forEach((p: any) => {
      if (p.storage_path) paths.push(p.storage_path);
      if (p.id) photoIds.push(p.id);
    });
  });

  if (paths.length === 0) {
    return { photos_deleted: 0 };
  }

  // Storage.remove takes at most ~1000 keys per call; batch to be safe.
  const BATCH = 500;
  for (let i = 0; i < paths.length; i += BATCH) {
    const chunk = paths.slice(i, i + BATCH);
    const { error } = await supabase.storage.from('lot-photos').remove(chunk);
    if (error) {
      return {
        photos_deleted: i,
        error: `Storage delete failed at batch starting ${i}: ${error.message}`,
      };
    }
  }

  // Drop the DB rows too so the UI doesn't render broken photo tiles.
  if (photoIds.length > 0) {
    await supabase.from('lot_photos').delete().in('id', photoIds);
  }

  return { photos_deleted: paths.length };
}

export async function POST(request: NextRequest) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const supabase = auth.supabase;

  const body = await request.json().catch(() => ({}));

  if (body?.all === true) {
    const { data: archived } = await supabase
      .from('auctions')
      .select('id')
      .not('archived_at', 'is', null);
    let total = 0;
    const errors: Array<{ auction_id: string; error: string }> = [];
    for (const a of archived || []) {
      const r = await purgeAuction(supabase, a.id);
      total += r.photos_deleted;
      if (r.error) errors.push({ auction_id: a.id, error: r.error });
    }
    return NextResponse.json({
      auctions_processed: archived?.length || 0,
      photos_deleted: total,
      errors,
    });
  }

  if (!body?.auction_id) {
    return NextResponse.json(
      { error: 'Body must include either { auction_id } or { all: true }' },
      { status: 400 }
    );
  }

  const result = await purgeAuction(supabase, body.auction_id);
  if (result.error) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
