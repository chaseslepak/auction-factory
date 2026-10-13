import Anthropic from '@anthropic-ai/sdk';
import { SupabaseClient } from '@supabase/supabase-js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface StockCandidate {
  imageUrl: string;
  title: string;
  price: number;
  source: string;
}

export interface SearchDiagnostics {
  queriesTried: string[];
  queryResults: Record<string, number>;
  webstaurantHtmlBytes: number;
  webstaurantRegexMatched: boolean;
  webstaurantCandidates: number;
  webSearchTried: boolean;
  webSearchImageFound: boolean;
  webSearchPrice: number;
  webstaurantPrice: number;
  vision: 'skipped' | 'no-user-photos' | 'model-answer' | 'model-error' | 'model-none';
  visionPickedIndex: number | null;
  imageDownloaded: boolean;
  imageDownloadError: string | null;
  finalOutcome:
    | 'no-brand-or-model'
    | 'no-candidates'
    | 'vision-rejected'
    | 'image-download-failed'
    | 'image-saved'
    | 'price-updated-only';
}

export function emptyDiag(): SearchDiagnostics {
  return {
    queriesTried: [],
    queryResults: {},
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
}

// WebstaurantStore embeds search results in a hypernova <script> blob.
// We also fall back to a plain <img> regex if their markup changes.
async function searchWebstaurant(query: string): Promise<StockCandidate[]> {
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
          // Previously required price > 0 — that dropped a lot of real
          // candidates (out-of-stock SKUs, "call for price", etc). Pricing
          // comes from researchRetailPrice separately now.
          if (title && imagePath) {
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

    if (candidates.length === 0) {
      const cardRegex = /<img[^>]+alt="([^"]+)"[^>]+src="(\/images\/products\/[^"]+\.(jpg|png|webp))"/gi;
      let match;
      while ((match = cardRegex.exec(html)) !== null && candidates.length < 6) {
        candidates.push({
          title: match[1],
          imageUrl: `https://www.webstaurantstore.com${match[2]}`,
          price: 0,
          source: 'webstaurant-regex',
        });
      }
    }
  } catch {}
  return candidates;
}

// Broaden coverage: ask Claude's web_search to surface product-image URLs
// across major US retailers (restaurant equipment AND general — a lot of
// what Chase lots is not restaurant-only). Returns up to ~6 candidates.
async function searchViaAnthropic(
  anthropic: Anthropic,
  brand: string,
  model: string,
  itemName: string
): Promise<StockCandidate[]> {
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

Search major US retailers — WebstaurantStore, KaTom, Central Restaurant, CKitchen, Amazon, Home Depot, Lowe's, Wayfair, Grainger, Target, Walmart, and the manufacturer's own site. The exact brand+model match matters more than the retailer.

For each result, output ONE line in this exact format (nothing else):
IMG: <full https URL to the product's primary image, ending in .jpg/.jpeg/.png/.webp> | TITLE: <product title>

Rules:
- Image URL MUST end in .jpg/.jpeg/.png/.webp (not a page URL, not a thumbnail route).
- Do NOT include commentary, bullet points, or non-image URLs.
- Return up to 6 lines. If you only find 1–2, return those.`,
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
          price: 0,
          source: 'anthropic-web-search',
        });
      }
    }
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

Focus on US retailers including WebstaurantStore, KaTom, Central Restaurant, CKitchen, Amazon, Home Depot, Lowe's, Wayfair, Grainger.

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

// Normalize a model/title string for loose comparison: strip spaces,
// dashes, underscores, slashes, dots, and lowercase.
function normalizeForMatch(s: string): string {
  return (s || '').replace(/[\s\-_./]/g, '').toLowerCase();
}

export async function findAndVerifyStockImage(
  anthropic: Anthropic,
  brand: string,
  model: string,
  itemName: string,
  userPhotoUrls: string[],
  diag: SearchDiagnostics = emptyDiag()
): Promise<{ imageUrl: string; price: number } | null> {
  // Download user photos ourselves and delegate to the shared core.
  const userImagesB64: string[] = [];
  for (const photoUrl of userPhotoUrls.slice(0, 5)) {
    try {
      const res = await fetch(photoUrl);
      if (res.ok) {
        const buf = await res.arrayBuffer();
        userImagesB64.push(Buffer.from(buf).toString('base64'));
      }
    } catch {}
  }
  return findAndVerifyStockImageCore(anthropic, brand, model, itemName, userImagesB64, diag);
}

// Variant for callers that already have user photos as base64 strings
// (e.g. the new-lot flow, where the images are fresh client uploads not
// yet in Supabase storage). Accepts raw base64 or data URLs — strips the
// prefix if present.
export async function findAndVerifyStockImageFromB64(
  anthropic: Anthropic,
  brand: string,
  model: string,
  itemName: string,
  userImagesB64: string[],
  diag: SearchDiagnostics = emptyDiag()
): Promise<{ imageUrl: string; price: number } | null> {
  const stripped = userImagesB64
    .filter(Boolean)
    .slice(0, 5)
    .map((s) => s.replace(/^data:image\/\w+;base64,/, ''));
  return findAndVerifyStockImageCore(anthropic, brand, model, itemName, stripped, diag);
}

async function findAndVerifyStockImageCore(
  anthropic: Anthropic,
  brand: string,
  model: string,
  itemName: string,
  userImagesB64: string[],
  diag: SearchDiagnostics
): Promise<{ imageUrl: string; price: number } | null> {
  if (!brand && !model) return null;

  const queries = [
    `${brand} ${model}`.trim(),
    model?.trim(),
    `${brand} ${itemName}`.trim(),
  ]
    .filter((q) => q && q.length > 2)
    // Dedupe queries (brand+model vs model alone may collide when brand
    // is empty).
    .filter((q, i, arr) => arr.indexOf(q) === i);

  diag.queriesTried = queries;
  diag.queryResults = {};

  // Aggregate candidates across ALL queries (previous code short-circuited
  // on first hit — that threw away perfectly good candidates whenever the
  // first query returned noise).
  const seen = new Set<string>();
  let candidates: StockCandidate[] = [];
  for (const q of queries) {
    const found = await searchWebstaurant(q);
    diag.queryResults[q] = found.length;
    // The hypernova-regex / html-bytes fields are per-query; retain the
    // first query's numbers for backward-compatible diag display.
    if (diag.webstaurantHtmlBytes === 0) {
      diag.webstaurantRegexMatched = found.some((c) => c.source === 'webstaurant');
    }
    for (const c of found) {
      if (!seen.has(c.imageUrl)) {
        seen.add(c.imageUrl);
        candidates.push(c);
      }
    }
  }
  diag.webstaurantCandidates = candidates.length;

  // Always widen with Anthropic web-search when restaurant-only coverage
  // is thin. Previously this ran ONLY when WebstaurantStore returned
  // zero, so categories like tools / furniture / electronics never got
  // non-restaurant candidates.
  if (candidates.length < 3) {
    diag.webSearchTried = true;
    const anth = await searchViaAnthropic(anthropic, brand, model, itemName);
    for (const c of anth) {
      if (!seen.has(c.imageUrl)) {
        seen.add(c.imageUrl);
        candidates.push(c);
      }
    }
    if (anth.length > 0) diag.webSearchImageFound = true;
  }

  if (candidates.length === 0) return null;

  // Loose model-match filter: keep candidates whose title contains the
  // model number (normalized). Only apply if it leaves 2+ matches,
  // otherwise fall back to all candidates (vision will adjudicate).
  const modelNormalized = normalizeForMatch(model);
  const strictFiltered = modelNormalized
    ? candidates.filter((c) => normalizeForMatch(c.title).includes(modelNormalized))
    : candidates;

  let toVerify: StockCandidate[];
  if (strictFiltered.length === 1) {
    diag.vision = 'skipped';
    return { imageUrl: strictFiltered[0].imageUrl, price: strictFiltered[0].price };
  } else if (strictFiltered.length >= 2) {
    toVerify = strictFiltered;
  } else {
    // Strict filter killed everything — vision picks from the full set.
    toVerify = candidates;
  }

  if (userImagesB64.length === 0) {
    diag.vision = 'no-user-photos';
    return { imageUrl: toVerify[0].imageUrl, price: toVerify[0].price };
  }

  // Download candidate images. 6 (was 4). Skip tiny / failed fetches.
  const candidateData: { url: string; title: string; price: number; base64: string; mediaType: string }[] = [];
  for (const c of toVerify.slice(0, 6)) {
    try {
      const res = await fetch(c.imageUrl);
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      // Skip tiny placeholders / 1x1 pixels / spacers.
      if (buf.byteLength < 4000) continue;
      // Honor the actual content-type where present — forcing image/jpeg
      // on a .webp made Claude choke.
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      let mediaType = 'image/jpeg';
      if (ct.includes('png')) mediaType = 'image/png';
      else if (ct.includes('webp')) mediaType = 'image/webp';
      else if (ct.includes('gif')) mediaType = 'image/gif';
      candidateData.push({
        url: c.imageUrl,
        title: c.title,
        price: c.price,
        base64: Buffer.from(buf).toString('base64'),
        mediaType,
      });
    } catch {}
  }
  if (candidateData.length === 0) {
    diag.vision = 'skipped';
    return { imageUrl: toVerify[0].imageUrl, price: toVerify[0].price };
  }

  try {
    const content: any[] = [];
    content.push({
      type: 'text',
      text: `You are verifying stock images for an auction listing. The user is listing a ${itemName} (brand: ${brand || 'Unknown'}, model: ${model || 'Unknown'}).

Below are the USER'S PHOTOS of the actual physical item they're selling:`,
    });
    for (const b64 of userImagesB64) {
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } });
    }
    content.push({
      type: 'text',
      text: `\nNow here are ${candidateData.length} CANDIDATE stock images from retailer product pages. Pick the single candidate that is clearly the SAME product (same brand, same model, same form factor) as the user's item.

Only answer "NONE" if NO candidate plausibly depicts the same product — different form factor, wrong product category, obviously unrelated. If several candidates could match, pick the single best one — do NOT answer NONE just because the colors or background differ.

Respond with ONLY the number (1-${candidateData.length}) or the word NONE. No other text.`,
    });
    for (let i = 0; i < candidateData.length; i++) {
      content.push({ type: 'text', text: `\nCandidate ${i + 1} — "${candidateData[i].title}":` });
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: candidateData[i].mediaType as any, data: candidateData[i].base64 },
      });
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 20,
      messages: [{ role: 'user', content }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    if (/^none/i.test(text)) {
      diag.vision = 'model-none';
      return null;
    }
    const numMatch = text.match(/(\d+)/);
    if (numMatch) {
      const idx = parseInt(numMatch[1]) - 1;
      if (idx >= 0 && idx < candidateData.length) {
        diag.vision = 'model-answer';
        diag.visionPickedIndex = idx;
        return { imageUrl: candidateData[idx].url, price: candidateData[idx].price };
      }
    }
    // Unparseable response — treat as NONE rather than forcing a wrong
    // match. Chase said accuracy matters more than hit-rate on bad data.
    diag.vision = 'model-none';
    return null;
  } catch {
    diag.vision = 'model-error';
    return null;
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
    queryResults: {},
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

    // Dedupe shortcut: if another lot in the same auction already has
    // a stock image + known retail for this exact brand+model, reuse
    // it instead of hitting WebstaurantStore + Anthropic web search.
    // Points a new lot_photos row at the same storage object so no new
    // storage space is used. The retail/listed_price bump still runs
    // through the normal path below (so the user's description retail
    // line also syncs).
    if (lot.brand && lot.model) {
      try {
        const { data: siblings } = await supabase
          .from('lots')
          .select('id, estimated_retail_new, lot_photos(storage_path, display_order)')
          .eq('auction_id', lot.auction_id)
          .ilike('brand', lot.brand)
          .ilike('model', lot.model)
          .neq('id', lot.id)
          .is('deleted_at', null)
          .limit(5);
        for (const sib of siblings || []) {
          const sibStock = ((sib as any).lot_photos || []).find((p: any) =>
            (p.storage_path || '').includes('/stock_')
          );
          const sibRetail = Number((sib as any).estimated_retail_new) || 0;
          if (sibStock && sibRetail > 0) {
            // Check if THIS lot already has a stock photo; if so, skip
            // the insert to avoid double rows (the shortcut is for
            // first-time fetch, not re-fetch).
            const existingStock = ((lot as any).lot_photos || []).find((p: any) =>
              (p.storage_path || '').includes('/stock_')
            );
            if (!existingStock) {
              // Shift existing photos up by 1 to make room at
              // display_order=0, same as the normal path.
              const existingPhotos = ((lot as any).lot_photos || []).sort(
                (a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0)
              );
              for (const photo of existingPhotos) {
                await supabase
                  .from('lot_photos')
                  .update({ display_order: (photo.display_order ?? 0) + 1 })
                  .eq('id', photo.id);
              }
              await supabase.from('lot_photos').insert({
                lot_id: lot.id,
                storage_path: sibStock.storage_path,
                display_order: 0,
              });
            }
            // Price bump + description sync, same shape as the normal
            // path below.
            const currentRetail = Number(lot.estimated_retail_new) || 0;
            if (sibRetail > currentRetail) {
              const { computeListedPrice, syncRetailLine } = await import('@/lib/listing-price');
              const newRetail = Math.round(sibRetail);
              const newListed = computeListedPrice(newRetail);
              const updates: any = {
                estimated_retail_new: newRetail,
                listed_price: newListed,
              };
              if (lot.auction_description) {
                updates.auction_description = syncRetailLine(
                  lot.auction_description,
                  newListed
                );
              }
              await supabase.from('lots').update(updates).eq('id', lot.id);
            }
            diag.finalOutcome = 'image-saved';
            diag.imageDownloaded = true;
            return { success: true, found: true, diag };
          }
        }
      } catch (e) {
        console.error('Sibling-lot stock image reuse lookup failed:', e);
      }
    }

    const userPhotoUrls = (lot.lot_photos || [])
      .filter((p: any) => !p.storage_path.includes('/stock_'))
      .slice(0, 5)
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
      const { computeListedPrice, syncRetailLine } = await import('@/lib/listing-price');
      const newRetail = Math.round(maxPrice);
      const newListed = computeListedPrice(newRetail);
      const updates: any = {
        estimated_retail_new: newRetail,
        listed_price: newListed,
      };
      // Keep the "Retail Price: $X" line inside the description in sync
      // with the new listed_price so the two don't drift apart.
      if (lot.auction_description) {
        updates.auction_description = syncRetailLine(lot.auction_description, newListed);
      }
      await supabase.from('lots').update(updates).eq('id', lot.id);
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
