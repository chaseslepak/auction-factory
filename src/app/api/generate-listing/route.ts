import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import { logApiUsage } from '@/lib/api-usage';
import { computeListedPrice, syncRetailLine, formatLotTitle } from '@/lib/listing-price';
import {
  findAndVerifyStockImageFromB64,
  researchItemFacts,
  getAFArchiveMedianRetail,
} from '@/lib/stock-image-processor';
import { extractDimensionsFromText, fillBlankDimensions } from '@/lib/dimensions';

const SYSTEM_PROMPT = `You are a restaurant equipment identification expert for Auction Factory Ohio in Cleveland, OH.

CAREFULLY EXAMINE every photo provided. Look for:
- Brand names, logos, model numbers, serial plates
- Physical condition: scratches, dents, rust, wear, missing parts
- Whether item is new in box, used, or refurbished
- Size, capacity, and distinguishing features
- Any text, labels, or markings visible on the equipment

From the photos, identify the equipment and return ONLY a JSON object (no markdown, no preamble, no explanation):

{
  "item_name": "Brief product name with brand and model if visible. The server WILL append ' ($PRICE)' automatically and prepend 'NEW ' for condition-10 lots — DO NOT include either yourself. Just the clean product name (e.g. 'Hoshizaki Ice Machine KM-340MAJ').",
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

[1-2 sentence description — reference what you actually see in the photos. If item looks new/sealed, say so. If it shows wear, be upfront. Describe the item objectively. DO NOT speculate about what it might sell for at auction or hint at a "deal" / "value" / "savings vs retail".]

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
- DO NOT prepend "NEW" to item_name yourself — the server does that. Return the clean product name (e.g. "Hoshizaki Ice Machine KM-340MAJ") and the server will output "NEW Hoshizaki Ice Machine KM-340MAJ ($1,999)".
- Opening description MUST emphasize this is BRAND NEW, never used, still in original packaging if visible
- Describe the new-in-box condition factually: "Brand new.", "Factory sealed.", "Never used.", "Still in original packaging."
- DO NOT add any phrasing about value, savings, "fraction of the price," or what a bidder might pay — this is an auction, the market sets the price.
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
- THIS IS AN AUCTION — never speculate about, hint at, or compare against what the item may sell for. BANNED phrases include but are not limited to: "fraction of the price," "fraction of retail," "incredible value," "great value," "huge savings," "save big," "below retail," "buy it for less," "steal," "deal," "bargain," "snag this," "won't last," "act fast," "compare to retail and save," anything beginning with "Why pay…", and any other language suggesting the buyer will pay less than retail. The retail price line in the listing is provided as informational reference only — do not editorialize about it.
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

    const { images, condition, quantity, notes, auction_name, auction_id } =
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
    // Stock images are only auto-fetched for items in new-in-box condition (10).
    const hasBrand = listing.brand && listing.brand !== 'Unknown' && listing.brand.trim() !== '';
    const hasModel = listing.model && listing.model !== 'Unknown' && listing.model.trim() !== '';
    const isNewInBox = Number(condition) === 10;

    // Dedupe shortcut: if THIS auction already has another lot with the
    // same brand+model that already has a stock image + a known retail,
    // reuse that instead of hitting WebstaurantStore + Anthropic web
    // search again. Saves API cost + wall-clock on big batches where the
    // lister is cloning identical items. Guarded on brand+model so we
    // never cross-pollute dissimilar items.
    let webstaurantPrice = 0;
    let reusedSibling = false;
    if (hasBrand && hasModel && auction_id) {
      try {
        const { data: siblings } = await supabase
          .from('lots')
          .select('id, brand, model, estimated_retail_new, lot_photos(storage_path, display_order)')
          .eq('auction_id', auction_id)
          .ilike('brand', listing.brand)
          .ilike('model', listing.model)
          .is('deleted_at', null)
          .limit(5);
        for (const sib of siblings || []) {
          const stockPhoto = ((sib as any).lot_photos || []).find((p: any) =>
            (p.storage_path || '').includes('/stock_')
          );
          const sibRetail = Number((sib as any).estimated_retail_new) || 0;
          if (stockPhoto && sibRetail > 0) {
            // Hand back a Supabase public URL for the sibling's stock
            // image. The caller (new-lot page) will persist a new
            // lot_photos row pointing at the same storage path when the
            // lot is saved, so storage usage stays flat.
            const publicUrl = supabase.storage
              .from('lot-photos')
              .getPublicUrl(stockPhoto.storage_path).data.publicUrl;
            listing.stock_image_url = publicUrl;
            // Also hand back the raw storage_path so the review-page save
            // path can skip the download+reupload and just point a new
            // lot_photos row at the existing object.
            (listing as any).stock_image_storage_path = stockPhoto.storage_path;
            listing.estimated_retail_new = sibRetail;
            webstaurantPrice = sibRetail; // flag so we skip the web calls below
            reusedSibling = true;
            break;
          }
        }
      } catch (e) {
        console.error('Sibling-lot stock image reuse lookup failed:', e);
      }
    }

    if (!reusedSibling && hasBrand && hasModel && isNewInBox) {
      const found = await findAndVerifyStockImageFromB64(
        anthropic,
        listing.brand,
        listing.model,
        listing.item_name,
        images,
        undefined,
        supabase
      );
      if (found) {
        listing.stock_image_url = found.imageUrl;
        webstaurantPrice = found.price || 0;
      }
    }

    // Research price + dimensions via Anthropic web_search. We ask for
    // the MEDIAN across 3-5 reputable retailers rather than the max —
    // the old max-biased strategy produced wild outliers (a one-off
    // $12k Amazon listing when real retail was $2.5k) and the lotter
    // trusted them. Chase: "retail prices are off dramatically."
    //
    // Skip when we reused a sibling's known-good retail — the shortcut
    // exists specifically to avoid this call for duplicate items.
    let webMedianPrice: number | null = null;
    let factsDims = { width: '', depth: '', height: '' };
    if (!reusedSibling && hasBrand && hasModel) {
      try {
        const facts = await researchItemFacts(
          anthropic,
          listing.brand,
          listing.model,
          listing.item_name
        );
        webMedianPrice = facts.priceMedian;
        factsDims = facts.dimensions;
      } catch (e) {
        console.error('Price research error:', e);
      }
    }

    // Also check AF archive for prior listings of this exact brand+model.
    // 2+ prior AF retails is the single strongest signal.
    let afArchiveMedian: { median: number; sampleCount: number } | null = null;
    if (!reusedSibling && hasBrand && hasModel && auction_id) {
      try {
        afArchiveMedian = await getAFArchiveMedianRetail(
          supabase,
          listing.brand,
          listing.model
        );
      } catch (e) {
        console.error('AF archive median lookup failed:', e);
      }
    }

    const aiEstimate = Number(listing.estimated_retail_new) || 0;

    // Priority: AF archive median (2+ samples) > web median > WebstaurantStore
    // single hit > AI estimate. Each candidate is sanity-capped at 5x the AI
    // estimate so an outlier can never drive the final number.
    const capAt = aiEstimate > 0 ? aiEstimate * 5 : Infinity;
    let finalRetail = aiEstimate;
    if (afArchiveMedian && afArchiveMedian.sampleCount >= 2 && afArchiveMedian.median <= capAt) {
      finalRetail = afArchiveMedian.median;
    } else if (webMedianPrice && webMedianPrice > 0 && webMedianPrice <= capAt) {
      finalRetail = webMedianPrice;
    } else if (webstaurantPrice > 0 && webstaurantPrice <= capAt) {
      finalRetail = webstaurantPrice;
    }
    listing.estimated_retail_new = finalRetail;

    // Compute listed price (retail + markup). Lives in @/lib/listing-price.
    listing.listed_price = computeListedPrice(listing.estimated_retail_new);

    // Enforce price consistency in the description text. The AI puts a
    // "Retail Price: $X" line in auction_description, but its arithmetic
    // can drift AND the server may have just overridden estimated_retail_new
    // via web search — either way, listed_price is the ground truth and
    // the narrative must match. Replace any Retail Price line (with or
    // without the "Retail " prefix, and handling comma/decimal values)
    // with the computed listed_price.
    if (listing.auction_description && listing.listed_price > 0) {
      listing.auction_description = syncRetailLine(
        listing.auction_description,
        listing.listed_price
      );
    }

    // Enforce title format: "NEW" prefix on condition-10 lots, "($price)"
    // suffix on all lots. formatLotTitle is idempotent — strips any
    // existing NEW prefix / (retail) suffix the AI already added before
    // reapplying with authoritative values.
    if (listing.item_name) {
      listing.item_name = formatLotTitle(
        listing.item_name,
        condition,
        listing.listed_price
      );
    }

    // Backfill width/depth/height from (a) the web_search spec-sheet
    // lookup, falling back to (b) parsing dimensions out of the
    // auction_description text the AI generated. Only fills blanks —
    // never overwrites values the AI's vision pass of the user's actual
    // photos extracted.
    const descDims = extractDimensionsFromText(listing.auction_description);
    const dimsOut = fillBlankDimensions(listing as any, {
      width: factsDims.width || descDims.width,
      depth: factsDims.depth || descDims.depth,
      height: factsDims.height || descDims.height,
    });
    listing.width = dimsOut.width;
    listing.depth = dimsOut.depth;
    listing.height = dimsOut.height;

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
