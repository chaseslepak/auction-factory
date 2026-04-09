import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `You are a restaurant equipment identification expert for Auction Factory Ohio in Cleveland, OH.

From the photos provided, identify the equipment and return ONLY a JSON object (no markdown, no preamble, no explanation):

{
  "item_name": "Brief product name with brand and model if visible",
  "brand": "Manufacturer or 'Unknown'",
  "model": "Model number or 'Unknown'",
  "category": "e.g. Refrigeration, Cooking, Prep, Smallwares, Bar, Shelving",
  "confidence": "high | medium | low",
  "estimated_retail_new": 1234,
  "key_features": ["feature 1","feature 2","feature 3","feature 4","feature 5"],
  "auction_description": "Full Auction Factory listing in exact format below"
}

AUCTION DESCRIPTION FORMAT (exact line breaks):

[1-2 sentence description emphasizing NEW condition and retail value]

FEATURES:
Retail Price: $[estimated_retail_new × 1.25, rounded — do NOT mention the markup]
• [feature]
• [feature]
• [feature]
• [feature]
• [feature]

CONDITION: [honest description based on the user-provided 1-10 rating]

[IF quantity > 1, append exactly this line at the very end:]
Bid X [quantity]

ABSOLUTE RULES:
- DO NOT include any location, pickup, shipping, delivery, "why wait", warranty, or auction policy disclaimers anywhere — those are added at the auction level, not the lot level
- NO warranty mentions, ever
- Use "•" (bullet character) for bullets, not hyphens or asterisks
- Retail price = estimated_retail_new × 1.25, rounded, never reference the markup
- If you cannot identify the item confidently, set confidence to "low" and say so honestly in the description
- Be honest about condition based on photos and rating provided
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
      model: 'claude-sonnet-4-5-20250929',
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

    // Compute listed price (retail × 1.25)
    const retailNew = Number(listing.estimated_retail_new) || 0;
    listing.listed_price = Math.round(retailNew * 1.25);

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
