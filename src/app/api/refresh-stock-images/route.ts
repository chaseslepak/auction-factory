import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface StockCandidate {
  imageUrl: string;
  title: string;
}

async function searchCandidates(query: string): Promise<StockCandidate[]> {
  const candidates: StockCandidate[] = [];

  // WebstaurantStore
  try {
    const url = `https://www.webstaurantstore.com/search/${encodeURIComponent(query)}.html`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    const html = await res.text();
    const cardRegex = /<img[^>]+alt="([^"]+)"[^>]+src="(\/images\/products\/[^"]+\.(jpg|png|webp))"/gi;
    let match;
    while ((match = cardRegex.exec(html)) !== null && candidates.length < 6) {
      candidates.push({
        title: match[1],
        imageUrl: `https://www.webstaurantstore.com${match[2]}`,
      });
    }
  } catch {}

  // KaTom fallback
  if (candidates.length === 0) {
    try {
      const url = `https://www.katom.com/search.html?w=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      const html = await res.text();
      const cardRegex = /<img[^>]+alt="([^"]+)"[^>]+src="(https:\/\/[^"]*katom[^"]*\.(jpg|png|webp))"/gi;
      let match;
      while ((match = cardRegex.exec(html)) !== null && candidates.length < 6) {
        candidates.push({ title: match[1], imageUrl: match[2] });
      }
    } catch {}
  }

  return candidates;
}

async function findAndVerifyStockImage(
  anthropic: Anthropic,
  brand: string,
  model: string,
  itemName: string,
  userPhotoUrls: string[]
): Promise<string | null> {
  if (!brand && !model) return null;

  // Try multiple search queries
  const queries = [
    `${brand} ${model}`.trim(),
    model?.trim(),
    `${brand} ${itemName}`.trim(),
  ].filter((q) => q && q.length > 2);

  let candidates: StockCandidate[] = [];
  for (const q of queries) {
    candidates = await searchCandidates(q);
    if (candidates.length > 0) break;
  }

  if (candidates.length === 0) return null;

  // Pre-filter by model number in title
  const modelNormalized = (model || '').replace(/[\s\-_]/g, '').toLowerCase();
  const filtered = modelNormalized
    ? candidates.filter((c) => c.title.replace(/[\s\-_]/g, '').toLowerCase().includes(modelNormalized))
    : candidates;

  const toVerify = filtered.length > 0 ? filtered : candidates;

  // If only 1 filtered match and model is in title, use it directly (high confidence)
  if (filtered.length === 1) return filtered[0].imageUrl;

  // Download user's photos as base64
  const userImagesB64: string[] = [];
  for (const photoUrl of userPhotoUrls.slice(0, 3)) {
    try {
      const res = await fetch(photoUrl);
      if (res.ok) {
        const buf = await res.arrayBuffer();
        userImagesB64.push(Buffer.from(buf).toString('base64'));
      }
    } catch {}
  }

  if (userImagesB64.length === 0) {
    // No user photos to compare against — only use if exact model match
    return filtered.length > 0 ? filtered[0].imageUrl : null;
  }

  // Download candidate images
  const candidateData: { url: string; title: string; base64: string }[] = [];
  for (const c of toVerify.slice(0, 4)) {
    try {
      const res = await fetch(c.imageUrl);
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      candidateData.push({ url: c.imageUrl, title: c.title, base64: Buffer.from(buf).toString('base64') });
    } catch {}
  }

  if (candidateData.length === 0) return null;

  // Use Claude vision to pick the best match
  try {
    const content: any[] = [];
    content.push({ type: 'text', text: `USER'S PHOTOS of the actual item (${itemName}):` });
    for (const b64 of userImagesB64) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: b64 },
      });
    }
    content.push({
      type: 'text',
      text: `\nCANDIDATE STOCK IMAGES (numbered). Which one BEST matches the user's actual item? Respond with ONLY the number (1-${candidateData.length}) or "NONE" if none match:`,
    });
    for (let i = 0; i < candidateData.length; i++) {
      content.push({ type: 'text', text: `\n${i + 1}. ${candidateData[i].title}` });
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: candidateData[i].base64 },
      });
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 20,
      messages: [{ role: 'user', content }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    const numMatch = text.match(/(\d+)/);
    if (numMatch) {
      const idx = parseInt(numMatch[1]) - 1;
      if (idx >= 0 && idx < candidateData.length) {
        return candidateData[idx].url;
      }
    }
    return null;
  } catch {
    return null;
  }
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

  // Initialize Anthropic client for verification
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 });
  }
  const anthropic = new Anthropic({ apiKey });

  let updated = 0;
  const results: { lot_number: number; item_name: string; found: boolean }[] = [];

  for (const lot of candidates) {
    try {
      // Get public URLs for user's existing photos to use for verification
      const userPhotoUrls = (lot.lot_photos || [])
        .filter((p: any) => !p.storage_path.includes('/stock_'))
        .slice(0, 3)
        .map((p: any) =>
          supabase.storage.from('lot-photos').getPublicUrl(p.storage_path).data.publicUrl
        );

      const imageUrl = await findAndVerifyStockImage(
        anthropic,
        lot.brand || '',
        lot.model || '',
        lot.item_name || '',
        userPhotoUrls
      );

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
