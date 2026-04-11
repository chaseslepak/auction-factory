import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 60;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function findStockImage(brand: string, model: string, itemName: string): Promise<string | null> {
  const queries = [
    `${brand} ${model}`.trim(),
    model?.trim(),
    `${brand} ${itemName}`.trim(),
    brand?.trim(),
    itemName?.trim(),
  ].filter((q) => q && q.length > 2);

  for (const query of queries) {
    // Try WebstaurantStore
    try {
      const url = `https://www.webstaurantstore.com/search/${encodeURIComponent(query)}.html`;
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      const html = await res.text();
      const match = html.match(/src="(\/images\/products\/[^"]+\.(jpg|png|webp))"/i);
      if (match) return `https://www.webstaurantstore.com${match[1]}`;
    } catch {}

    // Try KaTom
    try {
      const url = `https://www.katom.com/search.html?w=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      const html = await res.text();
      const match = html.match(/src="(https:\/\/[^"]*katom[^"]*\.(jpg|png|webp))"/i);
      if (match) return match[1];
    } catch {}
  }

  return null;
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { auction_id, lot_ids } = await request.json();

  // Get lots that don't have a stock image yet
  let query = supabase
    .from('lots')
    .select('*, lot_photos(*)')
    .limit(1000);

  if (lot_ids?.length) {
    query = query.in('id', lot_ids);
  } else if (auction_id) {
    query = query.eq('auction_id', auction_id);
  } else {
    return NextResponse.json({ error: 'auction_id or lot_ids required' }, { status: 400 });
  }

  const { data: lots, error } = await query;

  if (error || !lots) {
    return NextResponse.json({ error: error?.message || 'No lots found' }, { status: 404 });
  }

  // Filter to lots with at least brand OR model — removed stock image exclusion
  const candidates = lots.filter((lot: any) => {
    const hasBrand = lot.brand && lot.brand !== 'Unknown' && lot.brand.trim() !== '';
    const hasModel = lot.model && lot.model !== 'Unknown' && lot.model.trim() !== '';
    return hasBrand || hasModel;
  });

  // Count skip reasons
  const skipped = {
    noBrandOrModel: lots.length - candidates.length,
  };

  if (candidates.length === 0) {
    return NextResponse.json({
      totalLots: lots.length,
      candidates: 0,
      updated: 0,
      skipped,
      message: `0 of ${lots.length} lots have a brand or model. AI couldn't identify them.`,
    });
  }

  let updated = 0;
  const results: { lot_number: number; item_name: string; found: boolean }[] = [];

  for (const lot of candidates) {
    try {
      const imageUrl = await findStockImage(lot.brand || '', lot.model || '', lot.item_name || '');

      if (imageUrl) {
        // Download the stock image
        const imgRes = await fetch(imageUrl);
        if (!imgRes.ok) {
          results.push({ lot_number: lot.lot_number, item_name: lot.item_name, found: false });
          continue;
        }

        const buffer = await imgRes.arrayBuffer();
        const blob = new Blob([buffer], { type: 'image/jpeg' });

        // Shift existing photos up by 1
        const existingPhotos = (lot.lot_photos || []).sort((a: any, b: any) => a.display_order - b.display_order);
        for (const photo of existingPhotos) {
          await supabase
            .from('lot_photos')
            .update({ display_order: photo.display_order + 1 })
            .eq('id', photo.id);
        }

        // Upload new stock image as display_order 0
        const storagePath = `${lot.auction_id}/${lot.id}/stock_0.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('lot-photos')
          .upload(storagePath, blob, {
            contentType: 'image/jpeg',
            upsert: true,
          });

        if (!uploadError) {
          await supabase.from('lot_photos').insert({
            lot_id: lot.id,
            storage_path: storagePath,
            display_order: 0,
          });
          updated++;
          results.push({ lot_number: lot.lot_number, item_name: lot.item_name, found: true });
        } else {
          results.push({ lot_number: lot.lot_number, item_name: lot.item_name, found: false });
        }
      } else {
        results.push({ lot_number: lot.lot_number, item_name: lot.item_name, found: false });
      }
    } catch {
      results.push({ lot_number: lot.lot_number, item_name: lot.item_name, found: false });
    }
  }

  const notFoundCount = results.filter((r) => !r.found).length;
  return NextResponse.json({
    totalLots: lots.length,
    candidates: candidates.length,
    updated,
    notFound: notFoundCount,
    skipped,
    results,
    message: `${updated} updated out of ${candidates.length} searched (${lots.length} total lots, ${skipped.noBrandOrModel} skipped — no brand/model)`,
  });
}
