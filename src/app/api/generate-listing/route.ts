import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import { logApiUsage } from '@/lib/api-usage';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface StockCandidate {
  imageUrl: string;
  title: string;
  price: number;
  source: 'webstaurant';
}

// Extract WebstaurantStore product data from their embedded JSON
async function searchStockImages(
  brand: string,
  model: string
): Promise<StockCandidate[]> {
  const candidates: StockCandidate[] = [];
  const query = `${brand} ${model}`.trim();

  try {
    const url = `https://www.webstaurantstore.com/search/${encodeURIComponent(query)}.html`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    const html = await res.text();

    // WebstaurantStore embeds search results as JSON in a script tag
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
              source: 'webstaurant',
            });
          }
        }
      } catch {}
    }

    // Fallback: regex extraction if JSON parsing fails
    if (candidates.length === 0) {
      const cardRegex = /<img[^>]+alt="([^"]+)"[^>]+src="(\/images\/products\/[^"]+\.(jpg|png|webp))"/gi;
      let match;
      while ((match = cardRegex.exec(html)) !== null && candidates.length < 6) {
        candidates.push({
          title: match[1],
          imageUrl: `https://www.webstaurantstore.com${match[2]}`,
          price: 0,
          source: 'webstaurant',
        });
      }
    }
  } catch {}

  return candidates;
}

// Use Claude vision to verify which candidate matches the user's photos
async function findAndVerifyStockImage(
  anthropic: Anthropic,
  brand: string,
  model: string,
  itemName: string,
  userImages: string[]
): Promise<{ imageUrl: string; price: number } | null> {
  // Step 1: Search for candidates
  const candidates = await searchStockImages(brand, model);
  if (candidates.length === 0) return null;

  // Step 2: Pre-filter by model number in title (strip spaces/dashes)
  const modelNormalized = model.replace(/[\s\-_]/g, '').toLowerCase();
  const filtered = candidates.filter((c) => {
    const titleNormalized = c.title.replace(/[\s\-_]/g, '').toLowerCase();
    return titleNormalized.includes(modelNormalized);
  });

  const toVerify = filtered.length > 0 ? filtered : candidates;

  // Step 3: If only 1 exact match, use it directly
  if (filtered.length === 1) {
    return { imageUrl: filtered[0].imageUrl, price: filtered[0].price };
  }

  if (toVerify.length === 0) return null;

  try {
    // Download candidate images
    const candidateData: { url: string; title: string; price: number; base64: string }[] = [];
    for (const c of toVerify.slice(0, 4)) {
      try {
        const res = await fetch(c.imageUrl);
        if (!res.ok) continue;
        const buf = await res.arrayBuffer();
        const base64 = Buffer.from(buf).toString('base64');
        candidateData.push({ url: c.imageUrl, title: c.title, price: c.price, base64 });
      } catch {}
    }

    if (candidateData.length === 0) return null;
    if (candidateData.length === 1) {
      return { imageUrl: candidateData[0].url, price: candidateData[0].price };
    }

    // Use Claude vision to pick the best match
    const content: any[] = [];
    content.push({ type: 'text', text: `USER'S PHOTOS of the actual item (${itemName}):` });
    for (const img of userImages.slice(0, 3)) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: img.replace(/^data:image\/\w+;base64,/, ''),
        },
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
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: candidateData[i].base64,
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
      if (idx >= 0 && idx < candidateData.length) {
        return { imageUrl: candidateData[idx].url, price: candidateData[idx].price };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Use Claude's native web_search tool to research retail pricing across multiple sites
async function researchRetailPrice(
  anthropic: Anthropic,
  brand: string,
  model: string,
  itemName: string
): Promise<number> {
  try {
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 25000)
    );

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
      if (block.type === 'text') {
        fullText += ' ' + block.text;
      }
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
- item_name MUST be under 200 characters (AF form has 255 char limit)
- auction_description MUST be under 3500 characters
- DO NOT include any location, pickup, shipping, delivery, "why wait", warranty, or auction policy disclaimers anywhere — those are added at the auction level, not the lot level
- NO warranty mentions, ever
- NO HTML tags, NO script tags, NO suspicious patterns
- Use "•" (bullet character) for bullets, not hyphens or asterisks
- Use straight quotes (' and ") not smart quotes
- Use regular dashes (-) not em-dashes (—)
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

    // Use tool_use to force structured JSON output (eliminates parsing errors)
    const listingTool = {
      name: 'create_listing',
      description: 'Create a structured auction listing for restaurant equipment',
      input_schema: {
        type: 'object' as const,
        properties: {
          item_name: { type: 'string', description: 'Product name with brand and model (max 200 chars)' },
          brand: { type: 'string' },
          model: { type: 'string' },
          category: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          estimated_retail_new: { type: 'number' },
          width: { type: 'string' },
          depth: { type: 'string' },
          height: { type: 'string' },
          key_features: { type: 'array', items: { type: 'string' } },
          auction_description: { type: 'string', description: 'Full formatted listing with features and condition' },
        },
        required: ['item_name', 'brand', 'model', 'category', 'confidence', 'estimated_retail_new', 'key_features', 'auction_description'],
      },
    };

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2000,
      tools: [listingTool],
      tool_choice: { type: 'tool', name: 'create_listing' },
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

    // Track API usage cost
    await logApiUsage(supabase, {
      service: 'anthropic',
      operation: 'identify_item',
      model: 'claude-opus-4-6',
      input_tokens: response.usage?.input_tokens,
      output_tokens: response.usage?.output_tokens,
    });

    // Extract the tool_use block (guaranteed valid JSON)
    let listing: any = null;
    for (const block of response.content) {
      if (block.type === 'tool_use' && block.name === 'create_listing') {
        listing = block.input;
        break;
      }
    }

    if (!listing) {
      return NextResponse.json(
        { error: 'AI did not return structured listing. Try regenerating.' },
        { status: 500 }
      );
    }

    // Search for stock image AND real retail price
    const hasBrand = listing.brand && listing.brand !== 'Unknown' && listing.brand.trim() !== '';
    const hasModel = listing.model && listing.model !== 'Unknown' && listing.model.trim() !== '';

    let webstaurantPrice = 0;
    if (hasBrand && hasModel) {
      const found = await findAndVerifyStockImage(
        anthropic,
        listing.brand,
        listing.model,
        listing.item_name,
        images
      );
      if (found) {
        listing.stock_image_url = found.imageUrl;
        webstaurantPrice = found.price || 0;
      }
    }

    // Use Claude web search to find prices across the internet (5+ sites)
    let webSearchMaxPrice = 0;
    if (hasBrand && hasModel) {
      try {
        const maxFound = await researchRetailPrice(anthropic, listing.brand, listing.model, listing.item_name);
        if (maxFound > 0) webSearchMaxPrice = maxFound;
      } catch (e) {
        console.error('Price research error:', e);
      }
    }

    // Take the highest of: AI estimate, WebstaurantStore price, web search max
    const aiEstimate = Number(listing.estimated_retail_new) || 0;
    listing.estimated_retail_new = Math.max(aiEstimate, webstaurantPrice, webSearchMaxPrice);

    // Compute listed price (retail + 10%)
    const retailNew = Number(listing.estimated_retail_new) || 0;
    listing.listed_price = Math.round(retailNew * 1.10);

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
