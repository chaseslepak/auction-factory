import Anthropic from '@anthropic-ai/sdk';
import { SupabaseClient } from '@supabase/supabase-js';

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

    const jsonMatch = html.match(/data-hypernova-key="SearchPage"[^>]*><!--([\s\S]*?)--><\/script>/);
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1]);
        const products = data.products || [];
        // Deep scan: return more candidates
        for (const product of products.slice(0, 15)) {
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

// Deep web search with multiple queries and Opus model for accuracy
async function deepResearchPrice(
  anthropic: Anthropic,
  brand: string,
  model: string,
  itemName: string
): Promise<{ price: number; reasoning: string }> {
  try {
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 30000)
    );

    const apiPromise = anthropic.messages.create({
      model: 'claude-opus-4-6', // Use Opus for deep scan
      max_tokens: 1024,
      tools: [
        {
          type: 'web_search_20250305' as any,
          name: 'web_search',
          max_uses: 5, // More searches allowed
        },
      ] as any,
      messages: [
        {
          role: 'user',
          content: `Thoroughly research the retail price for this specific commercial kitchen / restaurant equipment item from multiple authoritative sources:

Brand: ${brand}
Model: ${model}
Item: ${itemName}

Search the web at least 3-5 times using different queries. Look at:
- WebstaurantStore, KaTom, Central Restaurant Products
- CKitchen, Tundra Restaurant Supply
- The manufacturer's own website
- Amazon Business
- Any other US restaurant equipment retailers

Find the HIGHEST legitimate retail price for this exact model. Prefer current list prices over sale prices. Prefer authorized dealer prices over 3rd party marketplaces.

After researching, respond with ONLY the highest retail price you found, formatted like:
$3,885.00

Then on a new line, briefly explain which source had that price.

If you cannot find a verified price anywhere, respond with just: $0`,
        },
      ],
    });

    const response = await Promise.race([apiPromise, timeoutPromise]);
    if (!response) return { price: 0, reasoning: 'timeout' };

    let fullText = '';
    for (const block of (response as any).content || []) {
      if (block.type === 'text') fullText += ' ' + block.text;
    }

    // Extract all dollar amounts and take the highest (but sanity-check)
    const priceMatches = fullText.match(/\$[\d,]+(?:\.\d{2})?/g) || [];
    let maxPrice = 0;
    for (const match of priceMatches) {
      const num = Number(match.replace(/[$,]/g, ''));
      if (num > maxPrice && num < 500000) maxPrice = num;
    }

    return { price: maxPrice, reasoning: fullText.substring(0, 200) };
  } catch (err: any) {
    console.error('Deep web search failed:', err?.message || err);
    return { price: 0, reasoning: 'error' };
  }
}

// Deep stock image search: tries multiple queries, more candidates, uses Opus for verification
async function deepFindStockImage(
  anthropic: Anthropic,
  brand: string,
  model: string,
  itemName: string,
  userPhotoUrls: string[]
): Promise<{ imageUrl: string; price: number } | null> {
  if (!brand && !model) return null;

  // Try many different queries for deeper coverage
  const queries = [
    `${brand} ${model}`.trim(),
    model?.trim(),
    `${brand} ${itemName}`.trim(),
    `${brand} ${model} commercial`.trim(),
    itemName?.trim(),
  ].filter((q, i, arr) => q && q.length > 2 && arr.indexOf(q) === i);

  // Collect ALL candidates from all queries
  const allCandidates: StockCandidate[] = [];
  for (const q of queries) {
    const results = await searchCandidates(q);
    for (const r of results) {
      if (!allCandidates.some((c) => c.imageUrl === r.imageUrl)) {
        allCandidates.push(r);
      }
    }
    if (allCandidates.length >= 20) break;
  }

  if (allCandidates.length === 0) return null;

  // Pre-filter by model number match
  const modelNormalized = (model || '').replace(/[\s\-_]/g, '').toLowerCase();
  const exactMatches = modelNormalized
    ? allCandidates.filter((c) => c.title.replace(/[\s\-_]/g, '').toLowerCase().includes(modelNormalized))
    : [];

  const toVerify = exactMatches.length > 0 ? exactMatches : allCandidates;

  // Download user photos
  const userImagesB64: string[] = [];
  for (const photoUrl of userPhotoUrls.slice(0, 4)) {
    try {
      const res = await fetch(photoUrl);
      if (res.ok) {
        const buf = await res.arrayBuffer();
        userImagesB64.push(Buffer.from(buf).toString('base64'));
      }
    } catch {}
  }

  // Download up to 6 candidate images for verification
  const candidateData: { url: string; title: string; price: number; base64: string }[] = [];
  for (const c of toVerify.slice(0, 6)) {
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
  if (candidateData.length === 1 && exactMatches.length > 0) {
    return { imageUrl: candidateData[0].url, price: candidateData[0].price };
  }

  // Use Opus 4.6 for verification (more accurate than Sonnet)
  if (userImagesB64.length === 0) {
    return exactMatches.length > 0
      ? { imageUrl: exactMatches[0].imageUrl, price: exactMatches[0].price }
      : null;
  }

  try {
    const content: any[] = [];
    content.push({
      type: 'text',
      text: `You are comparing USER PHOTOS of an actual item (${itemName}, brand ${brand}, model ${model}) against candidate stock images from retailers. Be very strict — only match if the candidate is the EXACT same product (same brand, same model, same physical form factor).

USER'S PHOTOS:`,
    });
    for (const b64 of userImagesB64) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: b64 },
      });
    }

    content.push({
      type: 'text',
      text: `\n\nCANDIDATES (numbered). Which one BEST matches the user's actual item? Be strict. Respond with ONLY the number (1-${candidateData.length}) or "NONE" if nothing is an exact match:`,
    });
    for (let i = 0; i < candidateData.length; i++) {
      content.push({
        type: 'text',
        text: `\n${i + 1}. ${candidateData[i].title} — $${candidateData[i].price}`,
      });
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: candidateData[i].base64 },
      });
    }

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 50,
      messages: [{ role: 'user', content }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    if (text.toUpperCase().includes('NONE')) return null;
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

// Main deep rescan: re-identifies the item from photos with Opus, finds best stock image, finds best price
export async function processDeepRescanJob(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  lotId: string
): Promise<{ success: boolean; found: boolean; error?: string }> {
  try {
    const { data: lot, error: lotError } = await supabase
      .from('lots')
      .select('*, lot_photos(*)')
      .eq('id', lotId)
      .single();

    if (lotError || !lot) {
      return { success: false, found: false, error: 'Lot not found' };
    }

    // Get user photos (excluding existing stock images)
    const userPhotos = (lot.lot_photos || []).filter(
      (p: any) => !p.storage_path.includes('/stock_')
    );
    const userPhotoUrls = userPhotos
      .slice(0, 4)
      .map((p: any) => supabase.storage.from('lot-photos').getPublicUrl(p.storage_path).data.publicUrl);

    if (userPhotoUrls.length === 0) {
      return { success: false, found: false, error: 'No user photos to analyze' };
    }

    // Step 1: Re-identify the item with Opus 4.6 (more accurate)
    // Download user photos as base64 for identification
    const userPhotosB64: string[] = [];
    for (const url of userPhotoUrls) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const buf = await res.arrayBuffer();
          userPhotosB64.push(Buffer.from(buf).toString('base64'));
        }
      } catch {}
    }

    let newBrand = lot.brand;
    let newModel = lot.model;
    let newItemName = lot.item_name;

    if (userPhotosB64.length > 0) {
      try {
        const idContent: any[] = [];
        idContent.push({
          type: 'text',
          text: `Carefully examine these photos of commercial kitchen / restaurant equipment. Identify the EXACT brand and model number. Look for brand logos, model plates, serial numbers, and any text markings.

Previous identification: Brand=${lot.brand}, Model=${lot.model}, Name=${lot.item_name}

If the previous identification looks correct, confirm it. If you can see a more accurate brand/model, provide that instead.

Respond with ONLY a JSON object, no other text:
{"brand": "...", "model": "...", "item_name": "..."}`,
        });
        for (const b64 of userPhotosB64) {
          idContent.push({
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: b64 },
          });
        }

        const idResponse = await anthropic.messages.create({
          model: 'claude-opus-4-6',
          max_tokens: 300,
          messages: [{ role: 'user', content: idContent }],
        });

        const idText = idResponse.content[0].type === 'text' ? idResponse.content[0].text : '';
        const jsonMatch = idText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.brand && parsed.brand !== 'Unknown') newBrand = parsed.brand;
            if (parsed.model && parsed.model !== 'Unknown') newModel = parsed.model;
            if (parsed.item_name) newItemName = parsed.item_name;
          } catch {}
        }
      } catch {}
    }

    // Step 2: Deep stock image search with Opus verification
    const imageResult = await deepFindStockImage(
      anthropic,
      newBrand || '',
      newModel || '',
      newItemName || '',
      userPhotoUrls
    );

    // Step 3: Deep price research
    const priceResult = await deepResearchPrice(
      anthropic,
      newBrand || '',
      newModel || '',
      newItemName || ''
    );

    // Update lot with new identification
    const updates: any = {};
    if (newBrand !== lot.brand) updates.brand = newBrand;
    if (newModel !== lot.model) updates.model = newModel;
    if (newItemName !== lot.item_name) updates.item_name = newItemName;

    // Pick highest price
    const currentRetail = Number(lot.estimated_retail_new) || 0;
    const webstaurantPrice = imageResult?.price || 0;
    const deepPrice = priceResult.price || 0;
    const maxPrice = Math.max(currentRetail, webstaurantPrice, deepPrice);
    if (maxPrice > currentRetail) {
      updates.estimated_retail_new = Math.round(maxPrice);
      updates.listed_price = Math.round(Math.round(maxPrice) * 1.10);
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from('lots').update(updates).eq('id', lot.id);
    }

    // Replace stock image if we found a better one
    if (imageResult) {
      try {
        const imgRes = await fetch(imageResult.imageUrl);
        if (imgRes.ok) {
          const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
          const storagePath = `${lot.auction_id}/${lot.id}/stock_0.jpg`;
          const { error: uploadError } = await supabase.storage
            .from('lot-photos')
            .upload(storagePath, imgBytes, { contentType: 'image/jpeg', upsert: true });

          if (!uploadError) {
            // Check if stock_0.jpg already exists in lot_photos
            const existingStock = (lot.lot_photos || []).find((p: any) =>
              p.storage_path.includes('/stock_')
            );
            if (!existingStock) {
              // Shift existing photos up
              const existingPhotos = (lot.lot_photos || []).sort(
                (a: any, b: any) => a.display_order - b.display_order
              );
              for (const photo of existingPhotos) {
                await supabase
                  .from('lot_photos')
                  .update({ display_order: photo.display_order + 1 })
                  .eq('id', photo.id);
              }
              await supabase.from('lot_photos').insert({
                lot_id: lot.id,
                storage_path: storagePath,
                display_order: 0,
              });
            }
            return { success: true, found: true };
          }
        }
      } catch {}
    }

    return { success: true, found: false };
  } catch (err: any) {
    return { success: false, found: false, error: err?.message || 'Deep rescan failed' };
  }
}
