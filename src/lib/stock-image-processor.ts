import Anthropic from '@anthropic-ai/sdk';
import { SupabaseClient } from '@supabase/supabase-js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface StockCandidate {
  imageUrl: string;
  title: string;
  price: number;
  source: string;
}

interface SearchDiagnostics {
  queriesTried: string[];
  webstaurantHtmlBytes: number;
  webstaurantRegexMatched: boolean;
  webstaurantCandidates: number;
  webSearchTried: boolean;
  webSearchImageFound: boolean;
  webSearchPrice: number;
  webstaurantPrice: number;
  vision: 'skipped' | 'no-user-photos' | 'model-answer' | 'model-error';
  visionPickedIndex: number | null;
  imageDownloaded: boolean;
  imageDownloadError: string | null;
  finalOutcome: 'no-brand-or-model' | 'no-candidates' | 'vision-rejected' | 'image-download-failed' | 'image-saved' | 'price-updated-only';
}

async function searchWebstaurant(
  query: string,
  diag: SearchDiagnostics
): Promise<StockCandidate[]> {
  const candidates: StockCandidate[] = [];
  try {
    const url = `https://www.webstaurantstore.com/search/${encodeURIComponent(query)}.html`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    const html = await res.text();
    diag.webstaurantHtmlBytes = html.length;

    const jsonMatch = html.match(/data-hypernova-key="SearchPage"[^>]*><!--([\s\S]*?)--><\/script>/);
    if (jsonMatch) {
      diag.webstaurantRegexMatched = true;
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
              source: 'webstaurant',
            });
          }
        }
      } catch {}
    }
  } catch {}
  return candidates;
}

// Fallback: ask Anthropic to web-search for a product image URL when
// WebstaurantStore returns 0. Uses the web_fetch-compatible URL flow:
// the model surfaces candidate URLs in text, we regex them out and use
// as candidates (no need to fetch inside the model turn).
async function searchViaAnthropic(
  anthropic: Anthropic,
  brand: string,
  model: string,
  itemName: string,
  diag: SearchDiagnostics
): Promise<StockCandidate[]> {
  diag.webSearchTried = true;
  const query = `${brand} ${model} ${itemName}`.trim();
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
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
          content: `Find product listing pages for: ${query}

Focus on US restaurant equipment retailers (WebstaurantStore, KaTom, Central Restaurant, CKitchen). For each result, output ONE line in this exact format:
IMG: <full https URL to the product's primary image, ending in .jpg/.jpeg/.png/.webp> | TITLE: <product title>

Do NOT return non-image URLs. Do NOT include commentary. If you find fewer than 3 valid product image URLs, output what you found.`,
        },
      ],
    });

    let fullText = '';
    for (const block of (response as any).content || []) {
      if (block.type === 'text') fullText += ' ' + block.text;
    }

    const lines = fullText.split(/\n/).map((l) => l.trim());
    const candidates: StockCandidate[] = [];
    for (const line of lines) {
      const m = line.match(/IMG:\s*(https?:\/\/\S+\.(?:jpe?g|png|webp))\s*\|\s*TITLE:\s*(.+)/i);
      if (m) {
        candidates.push({
          imageUrl: m[1],
          title: m[2].trim(),
          price: 0, // web search doesn't reliably give per-item price
          source: 'anthropic-web-search',
        });
      }
    }
    if (candidates.length > 0) diag.webSearchImageFound = true;
    return candidates;
  } catch (err: any) {
    console.error('Anthropic web-search fallback failed:', err?.message || err);
    return [];
  }
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
  userPhotoUrls: string[],
  diag: SearchDiagnostics
): Promise<{ imageUrl: string; price: number } | null> {
  if (!brand && !model) return null;

  const queries = [
    `${brand} ${model}`.trim(),
    model?.trim(),
    `${brand} ${itemName}`.trim(),
  ].filter((q) => q && q.length > 2);

  diag.queriesTried = queries;

  let candidates: StockCandidate[] = [];
  for (const q of queries) {
    candidates = await searchWebstaurant(q, diag);
    if (candidates.length > 0) break;
  }
  diag.webstaurantCandidates = candidates.length;

  // Fallback: if WebstaurantStore came up empty, ask Anthropic to
  // web-search for product images across retailers.
  if (candidates.length === 0) {
    candidates = await searchViaAnthropic(anthropic, brand, model, itemName, diag);
  }

  if (candidates.length === 0) return null;

  const modelNormalized = (model || '').replace(/[\s\-_]/g, '').toLowerCase();
  const filtered = modelNormalized
    ? candidates.filter((c) => c.title.replace(/[\s\-_]/g, '').toLowerCase().includes(modelNormalized))
    : candidates;

  const toVerify = filtered.length > 0 ? filtered : candidates;
  if (filtered.length === 1) {
    diag.vision = 'skipped';
    return { imageUrl: filtered[0].imageUrl, price: filtered[0].price };
  }

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
    diag.vision = 'no-user-photos';
    return filtered.length > 0
      ? { imageUrl: filtered[0].imageUrl, price: filtered[0].price }
      : { imageUrl: toVerify[0].imageUrl, price: toVerify[0].price };
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
  if (candidateData.length === 0) {
    diag.vision = 'skipped';
    // Nothing we could download from the candidate URLs — fall back to
    // the first raw candidate so the caller at least has an imageUrl.
    return { imageUrl: toVerify[0].imageUrl, price: toVerify[0].price };
  }

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
        diag.vision = 'model-answer';
        diag.visionPickedIndex = idx;
        return { imageUrl: candidateData[idx].url, price: candidateData[idx].price };
      }
    }
    diag.vision = 'model-answer';
    // Model said NONE — return the first candidate anyway (better than
    // nothing; user can delete if wrong).
    return { imageUrl: candidateData[0].url, price: candidateData[0].price };
  } catch {
    diag.vision = 'model-error';
    return { imageUrl: candidateData[0].url, price: candidateData[0].price };
  }
}

// Process a single lot: find stock image, update pricing, update photos
export async function processStockImageJob(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  lotId: string
): Promise<{ success: boolean; found: boolean; error?: string; diag?: SearchDiagnostics }> {
  const diag: SearchDiagnostics = {
    queriesTried: [],
    webstaurantHtmlBytes: 0,
    webstaurantRegexMatched: false,
    webstaurantCandidates: 0,
    webSearchTried: false,
    webSearchImageFound: false,
    webSearchPrice: 0,
    webstaurantPrice: 0,
    vision: 'skipped',
    visionPickedIndex: null,
    imageDownloaded: false,
    imageDownloadError: null,
    finalOutcome: 'no-candidates',
  };

  try {
    const { data: lot, error: lotError } = await supabase
      .from('lots')
      .select('*, lot_photos(*)')
      .eq('id', lotId)
      .single();

    if (lotError || !lot) {
      return { success: false, found: false, error: 'Lot not found', diag };
    }

    if (!lot.brand && !lot.model) {
      diag.finalOutcome = 'no-brand-or-model';
      return { success: true, found: false, diag };
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
      userPhotoUrls,
      diag
    );

    const currentRetail = Number(lot.estimated_retail_new) || 0;
    diag.webstaurantPrice = found?.price || 0;

    // Always do web search for pricing
    const webSearchPrice = await researchRetailPrice(
      anthropic,
      lot.brand || '',
      lot.model || '',
      lot.item_name || ''
    );
    diag.webSearchPrice = webSearchPrice;

    const maxPrice = Math.max(currentRetail, diag.webstaurantPrice, webSearchPrice);
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
      diag.finalOutcome = 'price-updated-only';
    }

    // Upload stock image if found
    if (found) {
      try {
        const imgRes = await fetch(found.imageUrl);
        if (imgRes.ok) {
          const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
          diag.imageDownloaded = true;

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
          diag.finalOutcome = 'image-saved';
          return { success: true, found: true, diag };
        } else {
          diag.imageDownloadError = `HTTP ${imgRes.status} fetching image`;
          diag.finalOutcome = 'image-download-failed';
        }
      } catch (e: any) {
        console.error('Stock image upload failed:', e?.message);
        diag.imageDownloadError = e?.message || String(e);
        diag.finalOutcome = 'image-download-failed';
      }
    } else {
      diag.finalOutcome = diag.webstaurantCandidates === 0 ? 'no-candidates' : 'vision-rejected';
    }

    return { success: true, found: false, diag };
  } catch (err: any) {
    return { success: false, found: false, error: err?.message || 'Processing failed', diag };
  }
}
