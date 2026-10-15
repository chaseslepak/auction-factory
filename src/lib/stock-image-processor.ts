import Anthropic from '@anthropic-ai/sdk';
import { SupabaseClient } from '@supabase/supabase-js';
import { searchAFArchiveIndex } from '@/lib/af-archive';

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
  afArchiveQueried: boolean;
  afArchiveHits: number;
  rejectedUrlsFiltered: number;
  serialOcrAttempted: boolean;
  serialOcrResult: string | null;
  webstaurantHtmlBytes: number;
  webstaurantRegexMatched: boolean;
  webstaurantCandidates: number;
  webSearchTried: boolean;
  webSearchImageFound: boolean;
  webSearchPrice: number;
  webstaurantPrice: number;
  vision:
    | 'skipped'
    | 'no-user-photos'
    | 'model-answer'
    | 'model-error'
    | 'model-none'
    | 'low-confidence';
  visionPickedIndex: number | null;
  visionPickedSource: string | null;
  visionConfidence: number | null;
  imageDownloaded: boolean;
  imageDownloadError: string | null;
  finalOutcome:
    | 'no-brand-or-model'
    | 'no-candidates'
    | 'vision-rejected'
    | 'low-confidence-skipped'
    | 'image-download-failed'
    | 'image-saved'
    | 'price-updated-only';
}

export interface StockImageResult {
  imageUrl: string;
  price: number;
  source: string;
  confidence: number | null;
}

// Minimum vision-confidence score (1-10) a candidate must earn before we
// attach it as a lot's primary photo. Chase: "accuracy > hit-rate." At 7
// vision has to be reasonably sure same brand + model + form factor;
// below that we leave the user's own photos as the primary.
const MIN_VISION_CONFIDENCE = 7;

export function emptyDiag(): SearchDiagnostics {
  return {
    queriesTried: [],
    queryResults: {},
    afArchiveQueried: false,
    afArchiveHits: 0,
    rejectedUrlsFiltered: 0,
    serialOcrAttempted: false,
    serialOcrResult: null,
    webstaurantHtmlBytes: 0,
    webstaurantRegexMatched: false,
    webstaurantCandidates: 0,
    webSearchTried: false,
    webSearchImageFound: false,
    webSearchPrice: 0,
    webstaurantPrice: 0,
    vision: 'skipped',
    visionPickedIndex: null,
    visionPickedSource: null,
    visionConfidence: null,
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
  diag: SearchDiagnostics = emptyDiag(),
  supabase?: SupabaseClient
): Promise<StockImageResult | null> {
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
  return findAndVerifyStockImageCore(anthropic, brand, model, itemName, userImagesB64, diag, supabase);
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
  diag: SearchDiagnostics = emptyDiag(),
  supabase?: SupabaseClient
): Promise<StockImageResult | null> {
  const stripped = userImagesB64
    .filter(Boolean)
    .slice(0, 5)
    .map((s) => s.replace(/^data:image\/\w+;base64,/, ''));
  return findAndVerifyStockImageCore(anthropic, brand, model, itemName, stripped, diag, supabase);
}

// Serial-plate OCR pass: look at the user's photos for a visible model
// number plate / sticker / tag and extract that exact string. Used when
// the main AI's model-identification is weak (empty / "Unknown") so we
// still have a specific query to run through the search pipeline.
export async function extractModelFromPhotos(
  anthropic: Anthropic,
  userImagesB64: string[]
): Promise<string | null> {
  if (userImagesB64.length === 0) return null;
  try {
    const content: any[] = [
      {
        type: 'text',
        text: `Look at these photos of a used piece of equipment. Find a visible model number — on a nameplate, data sticker, serial tag, or printed label. The model number is usually a short alphanumeric string like "KM-340MAJ" or "RP-241" or "L16E".

If you can clearly read a model number string, respond with ONLY that string, nothing else. Preserve dashes/spaces exactly as printed.

If you cannot clearly see any model number string, respond with ONLY "NONE".`,
      },
    ];
    for (const b64 of userImagesB64.slice(0, 5)) {
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } });
    }
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 40,
      messages: [{ role: 'user', content }],
    });
    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    if (!text || /^none/i.test(text)) return null;
    // Guard against the model echoing a long sentence instead of the
    // bare model number — take the first non-whitespace token up to 60
    // chars and reject anything that looks like prose.
    const token = text.split(/\s+/)[0]?.slice(0, 60) || '';
    if (!token || /[a-z]/.test(token) === false && /\d/.test(token) === false) return null;
    if (token.length < 2) return null;
    return token;
  } catch (err: any) {
    console.error('Serial OCR failed:', err?.message || err);
    return null;
  }
}

async function fetchRejectedUrlsFor(
  supabase: SupabaseClient,
  brand: string,
  model: string
): Promise<Set<string>> {
  if (!brand || !model) return new Set();
  try {
    const { data } = await supabase
      .from('rejected_stock_images')
      .select('image_url')
      .ilike('brand', brand)
      .ilike('model', model)
      .limit(200);
    return new Set((data || []).map((r: any) => r.image_url).filter(Boolean));
  } catch {
    return new Set();
  }
}

async function findAndVerifyStockImageCore(
  anthropic: Anthropic,
  brand: string,
  model: string,
  itemName: string,
  userImagesB64: string[],
  diag: SearchDiagnostics,
  supabase?: SupabaseClient
): Promise<StockImageResult | null> {
  if (!brand && !model) return null;

  // Serial OCR assist: when the main AI couldn't pin down a model, try a
  // tightly-scoped vision pass over the user photos looking only for a
  // visible model-number plate/sticker. If we find one, use it as the
  // model string for the search pipeline below.
  const modelIsWeak =
    !model || /^(unknown|n\/a|none|)$/i.test(model.trim());
  if (modelIsWeak && userImagesB64.length > 0) {
    diag.serialOcrAttempted = true;
    const ocrd = await extractModelFromPhotos(anthropic, userImagesB64);
    if (ocrd) {
      diag.serialOcrResult = ocrd;
      model = ocrd;
    }
  }

  // Pull the list of previously-rejected image URLs for this brand+model
  // so we never resurrect a bad match the user clicked "Wrong — try
  // another" on.
  const rejected = supabase ? await fetchRejectedUrlsFor(supabase, brand, model) : new Set<string>();

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

  // STEP 1: Query the AF archive FIRST. A prior AF listing of the same
  // brand+model is the best possible match — same photo quality, same
  // framing convention, and if the retail is set it's already been
  // verified by a human. These candidates are given to vision first so
  // they're preferred when they match.
  if (supabase && brand && model) {
    diag.afArchiveQueried = true;
    try {
      const archiveHits = await searchAFArchiveIndex(supabase, brand, model);
      diag.afArchiveHits = archiveHits.length;
      for (const hit of archiveHits) {
        if (!hit.image_url || seen.has(hit.image_url)) continue;
        seen.add(hit.image_url);
        candidates.push({
          imageUrl: hit.image_url,
          title: hit.item_name || `${brand} ${model}`,
          price: hit.retail_new || 0,
          source: 'af-archive',
        });
      }
    } catch (err) {
      // Archive lookup is best-effort — never let a schema/perm issue
      // block the WebstaurantStore + Anthropic pipeline below.
      console.error('AF archive lookup failed:', err);
    }
  }

  let webstaurantAdded = 0;
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
        webstaurantAdded++;
      }
    }
  }
  diag.webstaurantCandidates = webstaurantAdded;

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

  // Drop any URL the user has previously rejected for this brand+model
  // — nothing worse than seeing the same bad image appear on every retry.
  if (rejected.size > 0) {
    const before = candidates.length;
    candidates = candidates.filter((c) => !rejected.has(c.imageUrl));
    diag.rejectedUrlsFiltered = before - candidates.length;
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
    diag.visionPickedSource = strictFiltered[0].source;
    return {
      imageUrl: strictFiltered[0].imageUrl,
      price: strictFiltered[0].price,
      source: strictFiltered[0].source,
      confidence: null,
    };
  } else if (strictFiltered.length >= 2) {
    toVerify = strictFiltered;
  } else {
    // Strict filter killed everything — vision picks from the full set.
    toVerify = candidates;
  }

  if (userImagesB64.length === 0) {
    diag.vision = 'no-user-photos';
    diag.visionPickedSource = toVerify[0].source;
    return {
      imageUrl: toVerify[0].imageUrl,
      price: toVerify[0].price,
      source: toVerify[0].source,
      confidence: null,
    };
  }

  // Download candidate images. 6 (was 4). Skip tiny / failed fetches.
  // Prefer AF-archive hits — they lead `toVerify` already (push order),
  // but if we trim to 6 we want to be sure at least the top AF hits
  // survive. Keep the order as-is since AF came first in the aggregation.
  const candidateData: { url: string; title: string; price: number; base64: string; mediaType: string; source: string }[] = [];
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
        source: c.source,
      });
    } catch {}
  }
  if (candidateData.length === 0) {
    diag.vision = 'skipped';
    diag.visionPickedSource = toVerify[0].source;
    return {
      imageUrl: toVerify[0].imageUrl,
      price: toVerify[0].price,
      source: toVerify[0].source,
      confidence: null,
    };
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
      text: `\nNow here are ${candidateData.length} CANDIDATE stock images from retailer product pages. For each one, judge whether it depicts the SAME product (same brand, same model, same form factor) as the user's item.

Pick the single best match and rate how confident you are, 1-10:
  10 = certain same brand+model, confirmed by visible model number/nameplate
  8-9 = clearly same brand, model, form factor and all visible features line up
  7   = very likely same product; minor differences could be angle or revision
  5-6 = probably same product family but can't confirm the exact model
  3-4 = ambiguous; could be the same or could be a sibling product
  1-2 = probably not the same product
  0   = clearly not the same product

Respond with EXACTLY one of:
- "N conf:C"   where N is the 1-${candidateData.length} candidate number and C is 0-10
- "NONE"       if no candidate plausibly depicts the same product

Examples: "3 conf:9", "1 conf:5", "NONE". No other text.`,
    });
    for (let i = 0; i < candidateData.length; i++) {
      content.push({
        type: 'text',
        text: `\nCandidate ${i + 1} — source: ${candidateData[i].source} — title: "${candidateData[i].title}":`,
      });
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: candidateData[i].mediaType as any, data: candidateData[i].base64 },
      });
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 40,
      messages: [{ role: 'user', content }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    if (/^none/i.test(text)) {
      diag.vision = 'model-none';
      return null;
    }

    // Expected format: "N conf:C". Be forgiving — accept just "N" (back-
    // compat) with confidence null, or "N:C" / "N confidence C" variants.
    const combo = text.match(/(\d+)\D+(?:conf(?:idence)?\s*[:=]?\s*)?(\d+)/i);
    const bareNum = text.match(/^\s*(\d+)/);
    let pickedIdx: number | null = null;
    let confidence: number | null = null;
    if (combo) {
      pickedIdx = parseInt(combo[1], 10) - 1;
      confidence = parseInt(combo[2], 10);
      if (confidence > 10) confidence = 10;
      if (confidence < 0) confidence = 0;
    } else if (bareNum) {
      pickedIdx = parseInt(bareNum[1], 10) - 1;
    }

    if (pickedIdx == null || pickedIdx < 0 || pickedIdx >= candidateData.length) {
      // Unparseable response — treat as NONE rather than forcing a wrong
      // match. Chase said accuracy matters more than hit-rate on bad data.
      diag.vision = 'model-none';
      return null;
    }

    diag.visionPickedIndex = pickedIdx;
    diag.visionPickedSource = candidateData[pickedIdx].source;
    diag.visionConfidence = confidence;

    // Confidence gate: a candidate below MIN_VISION_CONFIDENCE is treated
    // as "no good match found" — the user's own photos stay primary.
    if (confidence != null && confidence < MIN_VISION_CONFIDENCE) {
      diag.vision = 'low-confidence';
      return null;
    }

    diag.vision = 'model-answer';
    return {
      imageUrl: candidateData[pickedIdx].url,
      price: candidateData[pickedIdx].price,
      source: candidateData[pickedIdx].source,
      confidence,
    };
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
  const diag: SearchDiagnostics = emptyDiag();

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
          .select('id, estimated_retail_new, lot_photos(storage_path, display_order, source_url)')
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
                source_type: 'af-sibling',
                source_url: sibStock.source_url || null,
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
      diag,
      supabase
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
              source_type: found.source,
              source_url: found.imageUrl,
              vision_confidence: found.confidence,
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
      // Distinguish the "we had candidates but none scored high enough"
      // case from "we literally found nothing" and "vision outright said
      // NONE" so the admin UI can show the right status.
      if (diag.vision === 'low-confidence') {
        diag.finalOutcome = 'low-confidence-skipped';
      } else if ((diag.webstaurantCandidates + diag.afArchiveHits) === 0) {
        diag.finalOutcome = 'no-candidates';
      } else {
        diag.finalOutcome = 'vision-rejected';
      }
    }

    return { success: true, found: false, diag };
  } catch (err: any) {
    return { success: false, found: false, error: err?.message || 'Processing failed', diag };
  }
}

// Add a (brand, model, image_url) tuple to the rejected list so future
// stock-image searches for the same brand+model never resurface this URL.
// Used by the retry endpoint when Chase clicks "Wrong — try another".
export async function recordRejectedStockImage(
  supabase: SupabaseClient,
  args: { brand: string; model: string; image_url: string; rejected_by?: string; reason?: string }
): Promise<void> {
  const { brand, model, image_url } = args;
  if (!brand || !model || !image_url) return;
  try {
    await supabase.from('rejected_stock_images').upsert(
      {
        brand,
        model,
        image_url,
        rejected_by: args.rejected_by ?? null,
        reason: args.reason ?? null,
        rejected_at: new Date().toISOString(),
      },
      { onConflict: 'brand,model,image_url', ignoreDuplicates: false }
    );
  } catch (err) {
    console.error('recordRejectedStockImage failed:', err);
  }
}

// Delete the stock-image lot_photos row(s) for a lot and shift the user's
// own photos down to fill display_order 0..N. Used by:
//   - The explicit "Use my photos" revert button
//   - The retry flow, after the user has rejected the current image
//     (we strip the bad one before searching for a replacement so the UI
//     never shows the wrong image while the retry runs)
// Does NOT delete the underlying storage object — a different lot may
// still reference the same object via sibling-lot dedupe. Storage
// reclamation is handled by /admin/storage separately.
export async function revertLotToUserPhotos(
  supabase: SupabaseClient,
  lotId: string
): Promise<{ removed: number; kept: number }> {
  const { data: photos } = await supabase
    .from('lot_photos')
    .select('id, storage_path, display_order')
    .eq('lot_id', lotId)
    .order('display_order', { ascending: true });

  if (!photos || photos.length === 0) return { removed: 0, kept: 0 };

  const stockRows = photos.filter((p: any) =>
    (p.storage_path || '').includes('/stock_')
  );
  const userRows = photos.filter(
    (p: any) => !(p.storage_path || '').includes('/stock_')
  );

  for (const s of stockRows) {
    await supabase.from('lot_photos').delete().eq('id', s.id);
  }

  // Resequence the surviving user photos to display_order 0..N so the
  // first one becomes the primary image.
  for (let i = 0; i < userRows.length; i++) {
    if ((userRows[i] as any).display_order === i) continue;
    await supabase
      .from('lot_photos')
      .update({ display_order: i })
      .eq('id', (userRows[i] as any).id);
  }

  return { removed: stockRows.length, kept: userRows.length };
}
