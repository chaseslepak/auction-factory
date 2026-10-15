import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import { computeListedPrice, syncRetailLine } from '@/lib/listing-price';
import {
  findAndVerifyStockImage,
  researchItemFacts,
  getAFArchiveMedianRetail,
} from '@/lib/stock-image-processor';
import { extractDimensionsFromText, fillBlankDimensions } from '@/lib/dimensions';

export const maxDuration = 60;

// Shared helper: pull web-search price median + dimensions + AF archive
// median, pick the best retail with sanity gates, and backfill blank
// dimensions on the lot. Used by both the stock-image-found and
// no-image branches below so the pricing/dimension flow is identical.
async function updateLotPriceAndDimensions(
  supabase: any,
  anthropic: Anthropic,
  lot: any,
  currentRetail: number,
  webstaurantPrice: number
): Promise<void> {
  const brand = (lot.brand || '').trim();
  const model = (lot.model || '').trim();
  if (!brand && !model) return;

  const facts = await researchItemFacts(anthropic, brand, model, lot.item_name || '');
  const archiveStats = await getAFArchiveMedianRetail(supabase, brand, model);

  const capAt = currentRetail > 0 ? currentRetail * 5 : Infinity;
  let newRetail = currentRetail;
  if (archiveStats && archiveStats.sampleCount >= 2 && archiveStats.median <= capAt) {
    newRetail = archiveStats.median;
  } else if (facts.priceMedian && facts.priceMedian > 0 && facts.priceMedian <= capAt) {
    newRetail = facts.priceMedian;
  } else if (webstaurantPrice > 0 && webstaurantPrice <= capAt) {
    newRetail = webstaurantPrice;
  }

  const descDims = extractDimensionsFromText(lot.auction_description);
  const dimsOut = fillBlankDimensions(lot, {
    width: facts.dimensions.width || descDims.width,
    depth: facts.dimensions.depth || descDims.depth,
    height: facts.dimensions.height || descDims.height,
  });

  const needsRetailUpdate = newRetail !== currentRetail && newRetail > 0;
  if (needsRetailUpdate || dimsOut.changed) {
    const updates: any = {};
    if (needsRetailUpdate) {
      updates.estimated_retail_new = newRetail;
      updates.listed_price = computeListedPrice(newRetail);
      if (lot.auction_description) {
        updates.auction_description = syncRetailLine(lot.auction_description, updates.listed_price);
      }
    }
    if (dimsOut.changed) {
      updates.width = dimsOut.width;
      updates.depth = dimsOut.depth;
      updates.height = dimsOut.height;
    }
    await supabase.from('lots').update(updates).eq('id', lot.id);
  }
}

export async function POST(request: NextRequest) {
  try {
    return await processRefresh(request);
  } catch (err: any) {
    console.error('Refresh stock images fatal error:', err);
    return NextResponse.json(
      { error: `Server error: ${err?.message || 'unknown'}` },
      { status: 500 }
    );
  }
}

async function processRefresh(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { auction_id, lot_ids, offset = 0, batchSize = 5 } = await request.json();
  // When explicit lot_ids are provided (per-lot manual trigger) we skip the
  // condition gate so users can force a search for any lot.
  const explicitLots = Array.isArray(lot_ids) && lot_ids.length > 0;

  // Get lots that don't have a stock image yet
  let query = supabase
    .from('lots')
    .select('*, lot_photos(*)')
    .limit(1000)
    .order('lot_number', { ascending: true });

  if (explicitLots) {
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

  // Bulk refresh only fetches stock images for new-in-box items (condition 10).
  // Per-lot manual triggers (explicit lot_ids) bypass this gate.
  const candidates = lots.filter((lot: any) => {
    const hasBrand = lot.brand && lot.brand !== 'Unknown' && lot.brand.trim() !== '';
    const hasModel = lot.model && lot.model !== 'Unknown' && lot.model.trim() !== '';
    if (!(hasBrand || hasModel)) return false;
    if (!explicitLots && Number(lot.condition_rating) !== 10) return false;
    return true;
  });

  const skipped = {
    noBrandOrModel: lots.filter((l: any) => {
      const hasBrand = l.brand && l.brand !== 'Unknown' && l.brand.trim() !== '';
      const hasModel = l.model && l.model !== 'Unknown' && l.model.trim() !== '';
      return !(hasBrand || hasModel);
    }).length,
    notNewInBox: explicitLots
      ? 0
      : lots.filter((l: any) => {
          const hasBrand = l.brand && l.brand !== 'Unknown' && l.brand.trim() !== '';
          const hasModel = l.model && l.model !== 'Unknown' && l.model.trim() !== '';
          return (hasBrand || hasModel) && Number(l.condition_rating) !== 10;
        }).length,
  };

  if (candidates.length === 0) {
    return NextResponse.json({
      totalLots: lots.length,
      totalCandidates: 0,
      updated: 0,
      skipped,
      hasMore: false,
      nextOffset: 0,
      message: explicitLots
        ? `None of the selected lots have a brand or model.`
        : `0 of ${lots.length} lots are eligible (need brand/model + condition 10 "New in box").`,
    });
  }

  // Slice to just this batch
  const totalCandidates = candidates.length;
  const batchCandidates = candidates.slice(offset, offset + batchSize);
  const nextOffset = offset + batchCandidates.length;
  const hasMore = nextOffset < totalCandidates;

  // Initialize Anthropic client for verification
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 });
  }
  const anthropic = new Anthropic({ apiKey });

  let updated = 0;
  const results: { lot_number: number; item_name: string; found: boolean }[] = [];

  for (const lot of batchCandidates) {
    try {
      // Get public URLs for user's existing photos to use for verification
      const userPhotoUrls = (lot.lot_photos || [])
        .filter((p: any) => !p.storage_path.includes('/stock_'))
        .slice(0, 5)
        .map((p: any) =>
          supabase.storage.from('lot-photos').getPublicUrl(p.storage_path).data.publicUrl
        );

      const found = await findAndVerifyStockImage(
        anthropic,
        lot.brand || '',
        lot.model || '',
        lot.item_name || '',
        userPhotoUrls,
        undefined,
        supabase
      );

      if (found) {
        // Download the stock image
        let imgBytes: Uint8Array;
        try {
          const imgRes = await fetch(found.imageUrl);
          if (!imgRes.ok) {
            results.push({ lot_number: lot.lot_number, item_name: lot.item_name, found: false });
            continue;
          }
          imgBytes = new Uint8Array(await imgRes.arrayBuffer());
        } catch (e: any) {
          console.error('Image download failed:', e?.message);
          results.push({ lot_number: lot.lot_number, item_name: lot.item_name, found: false });
          continue;
        }

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
          .upload(storagePath, imgBytes, {
            contentType: 'image/jpeg',
            upsert: true,
          });

        if (uploadError) {
          console.error('Storage upload error:', uploadError.message);
        }

        if (!uploadError) {
          await supabase.from('lot_photos').insert({
            lot_id: lot.id,
            storage_path: storagePath,
            display_order: 0,
          });

          const currentRetail = Number(lot.estimated_retail_new) || 0;
          const webstaurantPrice = found.price || 0;
          await updateLotPriceAndDimensions(supabase, anthropic, lot, currentRetail, webstaurantPrice);

          updated++;
          results.push({ lot_number: lot.lot_number, item_name: lot.item_name, found: true });
        } else {
          results.push({ lot_number: lot.lot_number, item_name: lot.item_name, found: false });
        }
      } else {
        const currentRetail = Number(lot.estimated_retail_new) || 0;
        await updateLotPriceAndDimensions(supabase, anthropic, lot, currentRetail, 0);
        results.push({ lot_number: lot.lot_number, item_name: lot.item_name, found: false });
      }
    } catch (err: any) {
      console.error('Lot processing error:', err?.message, 'lot:', lot.id);
      results.push({ lot_number: lot.lot_number, item_name: lot.item_name, found: false });
    }
  }

  const notFoundCount = results.filter((r) => !r.found).length;
  return NextResponse.json({
    totalLots: lots.length,
    totalCandidates,
    batchSize: batchCandidates.length,
    offset,
    nextOffset,
    hasMore,
    updated,
    notFound: notFoundCount,
    skipped,
    results,
    message: `${updated} updated in this batch (${nextOffset}/${totalCandidates} candidates processed)`,
  });
}
