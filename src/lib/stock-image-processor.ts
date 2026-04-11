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

export async function researchRetailPrice(
  anthropic: Anthropic,
  brand: string,
  model: string,
  itemName: string
): Promise<number> {
  try {
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 12000));
    const apiPromise = anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      tools: [
        {
          type: 'web_search_20250305' as any,
          name: 'web_search',
          max_uses: 2,
        },
      ] as any,
      messages: [
        {
          role: 'user',
          content: `Search the web for the current retail price of: ${brand} ${model} ${itemName}

Focus on US restaurant equipment retailers (WebstaurantStore, KaTom, Central Restaurant, CKitchen, etc).

After searching, give me JUST the highest retail price you found as a single number with a dollar sign. For example: "$3,885" or "$1,234.50" — nothing else, no explanation.

If you can't find any real price, respond with just "$0".`,
        },
      ],
    });

    const response = await Promise.race([apiPromise, timeoutPromise]);
    if (!response) return 0;

    let fullText = '';
    for (const block of (response as any).content || []) {
      if (block.type === 'text') fullText += ' ' + block.text;
    }

    const priceMatches = fullText.match(/\$[\d,]+(?:\.\d{2})?/g) || [];
    let maxPrice = 0;
    for (const match of priceMatches) {
      const num = Number(match.replace(/[$,]/g, ''));
      if (num > maxPrice && num < 100000) maxPrice = num;
    }
    return maxPrice;
  } catch (err: any) {
    console.error('Web search pricing failed:', err?.message || err);
    return 0;
  }
}

export async function findAndVerifyStockImage(
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
  if (filtered.length === 1) return { imageUrl: filtered[0].imageUrl, price: filtered[0].price };

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
    return filtered.length > 0 ? { imageUrl: filtered[0].imageUrl, price: filtered[0].price } : null;
  }

  const candidateData: { url: string; title: string; price: number; base64: string }[] = [];
  for (const c of toVerify.slice(0, 4)) {
    try {
      const res = await fetch(c.imageUrl);
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      candidateData.push({ url: c.imageUrl, title: c.title, price: c.price, base64: Buffer.from(buf).toString('base64') });
    } catch {}
  }
  if (candidateData.length === 0) return null;

  try {
    const content: any[] = [];
    content.push({ type: 'text', text: `USER'S PHOTOS of the actual item (${itemName}):` });
    for (const b64 of userImagesB64) {
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } });
    }
    content.push({
      type: 'text',
      text: `\nCANDIDATE STOCK IMAGES (numbered). Which one BEST matches the user's actual item? Respond with ONLY the number (1-${candidateData.length}) or "NONE" if none match:`,
    });
    for (let i = 0; i < candidateData.length; i++) {
      content.push({ type: 'text', text: `\n${i + 1}. ${candidateData[i].title}` });
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: candidateData[i].base64 } });
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

// Process a single lot: find stock image, update pricing, update photos
export async function processStockImageJob(
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

    const userPhotoUrls = (lot.lot_photos || [])
      .filter((p: any) => !p.storage_path.includes('/stock_'))
      .slice(0, 3)
      .map((p: any) => supabase.storage.from('lot-photos').getPublicUrl(p.storage_path).data.publicUrl);

    const found = await findAndVerifyStockImage(
      anthropic,
      lot.brand || '',
      lot.model || '',
      lot.item_name || '',
      userPhotoUrls
    );

    const currentRetail = Number(lot.estimated_retail_new) || 0;
    const webstaurantPrice = found?.price || 0;

    // Always do web search for pricing
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

    // Upload stock image if found
    if (found) {
      try {
        const imgRes = await fetch(found.imageUrl);
        if (imgRes.ok) {
          const imgBytes = new Uint8Array(await imgRes.arrayBuffer());

          // Check if a stock image already exists for this lot
          const existingStock = (lot.lot_photos || []).find((p: any) => p.storage_path.includes('/stock_'));

          if (!existingStock) {
            // Shift existing photos up by 1
            const existingPhotos = (lot.lot_photos || []).sort(
              (a: any, b: any) => a.display_order - b.display_order
            );
            for (const photo of existingPhotos) {
              await supabase
                .from('lot_photos')
                .update({ display_order: photo.display_order + 1 })
                .eq('id', photo.id);
            }
          }

          const storagePath = `${lot.auction_id}/${lot.id}/stock_0.jpg`;
          const { error: uploadError } = await supabase.storage
            .from('lot-photos')
            .upload(storagePath, imgBytes, { contentType: 'image/jpeg', upsert: true });

          if (!uploadError && !existingStock) {
            await supabase.from('lot_photos').insert({
              lot_id: lot.id,
              storage_path: storagePath,
              display_order: 0,
            });
          }
          return { success: true, found: true };
        }
      } catch (e: any) {
        console.error('Stock image upload failed:', e?.message);
      }
    }

    return { success: true, found: false };
  } catch (err: any) {
    return { success: false, found: false, error: err?.message || 'Processing failed' };
  }
}
