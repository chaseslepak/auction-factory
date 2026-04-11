import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface StockCandidate {
  imageUrl: string;
  title: string;
  source: 'webstaurant' | 'katom';
}

// Extract multiple product candidates (image + title) from search results
async function searchStockImages(
  brand: string,
  model: string
): Promise<StockCandidate[]> {
  const candidates: StockCandidate[] = [];
  const query = `${brand} ${model}`.trim();

  // WebstaurantStore
  try {
    const url = `https://www.webstaurantstore.com/search/${encodeURIComponent(query)}.html`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    const html = await res.text();

    // Extract product cards: each card has alt text (title) + src (image)
    const cardRegex = /<img[^>]+alt="([^"]+)"[^>]+src="(\/images\/products\/[^"]+\.(jpg|png|webp))"/gi;
    let match;
    while ((match = cardRegex.exec(html)) !== null && candidates.length < 6) {
      candidates.push({
        title: match[1],
        imageUrl: `https://www.webstaurantstore.com${match[2]}`,
        source: 'webstaurant',
      });
    }
  } catch {}

  // KaTom as fallback
  if (candidates.length === 0) {
    try {
      const url = `https://www.katom.com/search.html?w=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      const html = await res.text();
      const cardRegex = /<img[^>]+alt="([^"]+)"[^>]+src="(https:\/\/[^"]*katom[^"]*\.(jpg|png|webp))"/gi;
      let match;
      while ((match = cardRegex.exec(html)) !== null && candidates.length < 6) {
        candidates.push({
          title: match[1],
          imageUrl: match[2],
          source: 'katom',
        });
      }
    } catch {}
  }

  return candidates;
}

// Use Claude vision to verify which candidate matches the user's photos
async function findAndVerifyStockImage(
  anthropic: Anthropic,
  brand: string,
  model: string,
  itemName: string,
  userImages: string[]
): Promise<string | null> {
  // Step 1: Search for candidates
  const candidates = await searchStockImages(brand, model);
  if (candidates.length === 0) return null;

  // Step 2: Pre-filter by model number in title (case insensitive, strip spaces/dashes)
  const modelNormalized = model.replace(/[\s\-_]/g, '').toLowerCase();
  const filtered = candidates.filter((c) => {
    const titleNormalized = c.title.replace(/[\s\-_]/g, '').toLowerCase();
    return titleNormalized.includes(modelNormalized);
  });

  // Use filtered if any match, otherwise try all candidates
  const toVerify = filtered.length > 0 ? filtered : candidates;

  // Step 3: If only 1 candidate and it matches model in title, use it directly
  if (filtered.length === 1) {
    return filtered[0].imageUrl;
  }

  // Step 4: Download candidate images and use Claude vision to verify
  if (toVerify.length === 0) return null;

  try {
    // Download all candidate images as base64
    const candidateImages: { url: string; title: string; base64: string }[] = [];
    for (const c of toVerify.slice(0, 4)) {
      // Limit to 4 to save tokens
      try {
        const res = await fetch(c.imageUrl);
        if (!res.ok) continue;
        const buf = await res.arrayBuffer();
        const base64 = Buffer.from(buf).toString('base64');
        candidateImages.push({ url: c.imageUrl, title: c.title, base64 });
      } catch {}
    }

    if (candidateImages.length === 0) return null;
    if (candidateImages.length === 1 && filtered.length > 0) {
      return candidateImages[0].url;
    }

    // Build verification request
    const content: any[] = [];

    // User's actual photos
    content.push({ type: 'text', text: `USER'S PHOTOS of the actual item (${itemName}):` });
    for (const img of userImages.slice(0, 3)) {
      // Limit to 3 user photos
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: img.replace(/^data:image\/\w+;base64,/, ''),
        },
      });
    }

    // Candidate stock images
    content.push({
      type: 'text',
      text: `\nCANDIDATE STOCK IMAGES (numbered). Which one BEST matches the user's actual item? Respond with ONLY the number (1-${candidateImages.length}) or "NONE" if none match:`,
    });
    for (let i = 0; i < candidateImages.length; i++) {
      content.push({ type: 'text', text: `\n${i + 1}. ${candidateImages[i].title}` });
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: candidateImages[i].base64,
        },
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
      if (idx >= 0 && idx < candidateImages.length) {
        return candidateImages[idx].url;
      }
    }
    // If Claude said NONE or invalid response, reject
    return null;
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = `You are a restaurant equipment identification expert for Auction Factory Ohio in Cleveland, OH.

CAREFULLY EXAMINE every photo provided. Look for:
- Brand names, logos, model numbers, serial plates
- Physical condition: scratches, dents, rust, wear, missing parts
- Whether item is new in box, used, or refurbished
- Size, capacity, and distinguishing features
- Any text, labels, or markings visible on the equipment

From the photos, identify the equipment and return ONLY a JSON object (no markdown, no preamble, no explanation):

{
  "item_name": "Brief product name with brand and model if visible — if condition is 10, PREPEND 'NEW' to the name (e.g. 'NEW Hoshizaki Ice Machine KM-340MAJ')",
  "brand": "Manufacturer or 'Unknown'",
  "model": "Model number or 'Unknown'",
  "category": "e.g. Refrigeration, Cooking, Prep, Smallwares, Bar, Shelving",
  "confidence": "high | medium | low",
  "estimated_retail_new": 1234 (REQUIRED — this must ALWAYS be a number greater than 0. Research the item thoroughly. Find the highest available retail price for this exact item brand new, then use that number. If you cannot find an exact match, estimate based on similar items in the same category. NEVER return 0 or leave blank.),
  "width": "Estimated width in inches if determinable from photos, or empty string",
  "depth": "Estimated depth in inches if determinable from photos, or empty string",
  "height": "Estimated height in inches if determinable from photos, or empty string",
  "key_features": ["feature 1","feature 2","feature 3","feature 4","feature 5"],
  "stock_image_url": "If condition is 10 AND you can identify the exact brand+model with HIGH confidence, provide a URL to the manufacturer's or major retailer's stock/product image for this exact item. Otherwise empty string.",
  "auction_description": "Full Auction Factory listing in exact format below"
}

AUCTION DESCRIPTION FORMAT (exact line breaks):

[1-2 sentence description — reference what you actually see in the photos. If item looks new/sealed, say so. If it shows wear, be upfront. Emphasize retail value.]

FEATURES:
Retail Price: $[estimated_retail_new × 1.10, rounded — this is 10% above the highest retail you found. Do NOT mention the markup.]
• [feature — based on what you can see/verify in photos]
• [feature]
• [feature]
• [feature]
• [feature]

CONDITION: [Describe what you actually observe in the photos: scratches, dents, cleanliness, completeness. Combine your visual assessment with the user-provided 1-10 rating. Be specific — "stainless steel exterior shows minor scratching" is better than "good condition".]

[IF quantity > 1, append exactly this line at the very end:]
Bid X [quantity]

CONDITION 10 (NEW) ITEMS — SPECIAL HANDLING:
- PREPEND "NEW" to the item_name (e.g. "NEW Hoshizaki Ice Machine KM-340MAJ")
- Opening description MUST emphasize this is BRAND NEW, never used, still in original packaging if visible
- Use enthusiastic language: "Brand new!", "Factory sealed!", "Never used!", "Still in original packaging!"
- Highlight the incredible value vs. retail price
- CONDITION line should say something like: "BRAND NEW — Factory sealed, never used. Original packaging intact."
- STOCK IMAGE: If you can identify the exact brand AND model number with HIGH confidence, provide a stock_image_url — use the manufacturer's product page image URL or a major retailer (WebstaurantStore, Amazon, KaTom) product image URL for that exact make/model. This will be used as the primary listing photo. If you're not 100% sure of the exact model, leave stock_image_url as empty string.

DIMENSIONS:
- Examine photos carefully for size — look for spec labels, compare to known objects nearby
- If you can identify the exact model, use known manufacturer specs for width/depth/height
- Provide dimensions in inches as just the number (e.g. "24" not "24 inches")
- If you truly cannot determine dimensions, use empty string ""

ABSOLUTE RULES:
- DO NOT include any location, pickup, shipping, delivery, "why wait", warranty, or auction policy disclaimers anywhere — those are added at the auction level, not the lot level
- NO warranty mentions, ever
- Use "•" (bullet character) for bullets, not hyphens or asterisks
- Retail price in the listing = estimated_retail_new × 1.10, rounded. Never reference the markup. The estimated_retail_new MUST be the highest retail price you can find for this item brand new — NEVER return 0
- If you cannot identify the item confidently, set confidence to "low" and say so honestly in the description
- Be honest about condition — describe what you SEE in the photos, don't just restate the rating number
- For Gridmann items: describe as "new in box," retail $250
- For chocolate molds: include shapes, exclude quantity counts
- For "Misc" lots: encourage viewing all pictures and attending preview
- If quantity > 1, the listing represents one lot containing that many units — append "Bid X [quantity]" at the very bottom`;

export async function POST(request: NextRequest) {
  // Auth check
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Anthropic API key not configured' },
        { status: 500 }
      );
    }
    const anthropic = new Anthropic({ apiKey });

    const { images, condition, quantity, notes, auction_name } =
      await request.json();

    if (!images || images.length === 0) {
      return NextResponse.json(
        { error: 'At least one image is required' },
        { status: 400 }
      );
    }

    // Build image content blocks
    const imageContent = images.map((img: string) => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: 'image/jpeg' as const,
        data: img.replace(/^data:image\/\w+;base64,/, ''),
      },
    }));

    // Build context text
    let contextText = SYSTEM_PROMPT;
    contextText += `\n\nCONTEXT FOR THIS LOT:`;
    contextText += `\n- Auction: ${auction_name}`;
    contextText += `\n- Condition rating: ${condition}/10`;
    contextText += `\n- Quantity: ${quantity}`;
    if (notes) contextText += `\n- Staff notes: ${notes}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            ...imageContent,
            { type: 'text', text: contextText },
          ],
        },
      ],
    });

    // Extract JSON from response
    const text =
      response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return NextResponse.json(
        { error: 'Failed to parse AI response' },
        { status: 500 }
      );
    }

    const listing = JSON.parse(jsonMatch[0]);

    // Compute listed price (retail + 10%)
    const retailNew = Number(listing.estimated_retail_new) || 0;
    listing.listed_price = Math.round(retailNew * 1.10);

    // Search for stock image when we have a known brand+model
    const hasBrand = listing.brand && listing.brand !== 'Unknown' && listing.brand.trim() !== '';
    const hasModel = listing.model && listing.model !== 'Unknown' && listing.model.trim() !== '';

    if (hasBrand && hasModel) {
      const found = await findAndVerifyStockImage(
        anthropic,
        listing.brand,
        listing.model,
        listing.item_name,
        images // user's actual photos for verification
      );
      if (found) listing.stock_image_url = found;
    }

    // Ensure stock_image_url exists in response
    if (!listing.stock_image_url) {
      listing.stock_image_url = '';
    }

    return NextResponse.json(listing);
  } catch (err: any) {
    console.error('Generate listing error:', err);
    const status = err?.status || 500;
    const message = err?.error?.message || err?.message || 'Internal server error';
    return NextResponse.json(
      { error: message, status },
      { status }
    );
  }
}
