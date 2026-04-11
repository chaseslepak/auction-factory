import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

// Use Claude's web_search tool to find retail pricing across multiple sites
async function researchRetailPrice(
  anthropic: Anthropic,
  brand: string,
  model: string,
  itemName: string
): Promise<number> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      tools: [
        {
          type: 'web_search_20250305' as any,
          name: 'web_search',
          max_uses: 3,
        },
      ] as any,
      messages: [
        {
          role: 'user',
          content: `Find the current retail price for this exact restaurant/commercial kitchen equipment from multiple retailers:

Brand: ${brand}
Model: ${model}
Item: ${itemName}

Search across WebstaurantStore, KaTom, Central Restaurant, CKitchen, Tundra Restaurant Supply, and other major US restaurant equipment retailers. Find at least 3-5 different retailer prices if possible.

Return ONLY a JSON object with this format (no markdown, no explanation):
{
  "prices": [
    { "retailer": "WebstaurantStore", "price": 1234 },
    { "retailer": "KaTom", "price": 1299 }
  ],
  "highest": 1299
}

If you can't find real prices, return {"prices": [], "highest": 0}. Only include prices you can verify from actual search results — do not make up prices.`,
        },
      ],
    });

    let fullText = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        fullText += block.text;
      }
    }

    const jsonMatch = fullText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return 0;

    const data = JSON.parse(jsonMatch[0]);
    const highest = Number(data.highest) || 0;

    let maxFromArray = 0;
    if (Array.isArray(data.prices)) {
      for (const p of data.prices) {
        const price = Number(p.price) || 0;
        if (price > maxFromArray) maxFromArray = price;
      }
    }

    return Math.max(highest, maxFromArray);
  } catch (err) {
    console.error('Web search pricing failed:', err);
    return 0;
  }
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface StockCandidate {
  imageUrl: string;
  title: string;
  price: number;
}

async function searchCandidates(query: string): Promise<StockCandidate[]> {
  const candidates: StockCandidate[] = [];

  try {
    const url = `https://www.webstaurantstore.com/search/${encodeURIComponent(query)}.html`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    const html = await res.text();

    // Parse embedded JSON from SearchPage hypernova script
    const jsonMatch = html.match(/data-hypernova-key="SearchPage"[^>]*><!--([\s\S]*?)--><\/script>/);
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1]);
        const products = data.products || [];
        for (const product of products.slice(0, 8)) {
          const price = Number(product.price?.price) || 0;
          const title = product.description || product.alt || '';
          const imagePath = product.primaryImagePath || '';
          if (title && imagePath && price > 0) {
            candidates.push({
              title,
              imageUrl: imagePath.startsWith('http')
                ? imagePath
                : `https://www.webstaurantstore.com${imagePath}`,
              price,
            });
          }
        }
      } catch {}
    }
  } catch {}

  return candidates;
}

async function findAndVerifyStockImage(
  anthropic: Anthropic,
  brand: string,
  model: string,
  itemName: string,
  userPhotoUrls: string[]
): Promise<{ imageUrl: string; price: number } | null> {
  if (!brand && !model) return null;

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

  const modelNormalized = (model || '').replace(/[\s\-_]/g, '').toLowerCase();
  const filtered = modelNormalized
    ? candidates.filter((c) => c.title.replace(/[\s\-_]/g, '').toLowerCase().includes(modelNormalized))
    : candidates;

  const toVerify = filtered.length > 0 ? filtered : candidates;

  if (filtered.length === 1) {
    return { imageUrl: filtered[0].imageUrl, price: filtered[0].price };
  }

  // Download user's photos
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
    return filtered.length > 0
      ? { imageUrl: filtered[0].imageUrl, price: filtered[0].price }
      : null;
  }

  // Download candidate images
  const candidateData: { url: string; title: string; price: number; base64: string }[] = [];
  for (const c of toVerify.slice(0, 4)) {
    try {
      const res = await fetch(c.imageUrl);
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      candidateData.push({
        url: c.imageUrl,
        title: c.title,
        price: c.price,
        base64: Buffer.from(buf).toString('base64'),
      });
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
        return { imageUrl: candidateData[idx].url, price: candidateData[idx].price };
      }
    }
    return null;
  } catch {
    return null;
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

  // Get lots that don't have a stock image yet
  let query = supabase
    .from('lots')
    .select('*, lot_photos(*)')
    .limit(1000)
    .order('lot_number', { ascending: true });

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
      totalCandidates: 0,
      updated: 0,
      skipped,
      hasMore: false,
      nextOffset: 0,
      message: `0 of ${lots.length} lots have a brand or model. AI couldn't identify them.`,
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
        .slice(0, 3)
        .map((p: any) =>
          supabase.storage.from('lot-photos').getPublicUrl(p.storage_path).data.publicUrl
        );

      const found = await findAndVerifyStockImage(
        anthropic,
        lot.brand || '',
        lot.model || '',
        lot.item_name || '',
        userPhotoUrls
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

          // Find the highest retail price from multiple sources
          const currentRetail = Number(lot.estimated_retail_new) || 0;
          const webstaurantPrice = found.price || 0;

          // Web search for prices across multiple retailers
          const webSearchPrice = await researchRetailPrice(
            anthropic,
            lot.brand || '',
            lot.model || '',
            lot.item_name || ''
          );

          const maxPrice = Math.max(currentRetail, webstaurantPrice, webSearchPrice);
          if (maxPrice > currentRetail) {
            const newRetail = Math.round(maxPrice);
            const newListed = Math.round(newRetail * 1.10);
            await supabase
              .from('lots')
              .update({
                estimated_retail_new: newRetail,
                listed_price: newListed,
              })
              .eq('id', lot.id);
          }

          updated++;
          results.push({ lot_number: lot.lot_number, item_name: lot.item_name, found: true });
        } else {
          results.push({ lot_number: lot.lot_number, item_name: lot.item_name, found: false });
        }
      } else {
        // No stock image found, but still try web search for pricing
        const currentRetail = Number(lot.estimated_retail_new) || 0;
        const webSearchPrice = await researchRetailPrice(
          anthropic,
          lot.brand || '',
          lot.model || '',
          lot.item_name || ''
        );
        if (webSearchPrice > currentRetail) {
          const newRetail = Math.round(webSearchPrice);
          const newListed = Math.round(newRetail * 1.10);
          await supabase
            .from('lots')
            .update({
              estimated_retail_new: newRetail,
              listed_price: newListed,
            })
            .eq('id', lot.id);
        }
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
