import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import { logApiUsage } from '@/lib/api-usage';
import { FB_CONDITIONS, suggestCategory, MAX_PHOTOS } from '@/lib/marketplace';

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are a Facebook Marketplace listing expert for Crazy Good Buy, a Cleveland, OH commercial kitchen equipment supplier that sells overstock and manufacturer-direct equipment 40-50% below typical dealer prices.

You are given a product's catalog data AND the REAL photos of the actual unit being sold (these replace the stock imagery used on the website). CAREFULLY examine the real photos and write a Marketplace-optimized listing.

Rules:
- TITLE: under 100 characters, lead with brand + model + what it is, plus a value hook. No emojis, no ALL CAPS spam.
- DESCRIPTION: plain text only (Marketplace strips HTML). Short punchy opener, then a "Features:" bullet list using "-" bullets, then a one-line condition note, then "Local pickup in Cleveland, OH (15901 Industrial Parkway)." Do NOT invent specs you can't see or that aren't in the catalog data. Keep it scannable.
- CONDITION: choose exactly one of: ${FB_CONDITIONS.join(', ')}. Base it on what the REAL photos show plus the catalog data (overstock/new-in-box => "New"; clean used => "Used - Like New", etc.).
- KEYWORDS: 5-8 short search terms buyers would use.
- PHOTOS_MATCH: set false if the real photos clearly do NOT depict the product described by the catalog title/type (e.g. wrong item, blurry/unrelated), and explain in match_note. Otherwise true.
- Never mention competitor pricing, warranties, or shipping. Pickup only.`;

export async function POST(request: NextRequest) {
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
      return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 });
    }
    const anthropic = new Anthropic({ apiKey });

    const { title, descriptionText, productType, price, imageUrls } = await request.json();
    if (!imageUrls || imageUrls.length === 0) {
      return NextResponse.json({ error: 'At least one photo is required' }, { status: 400 });
    }

    // Fetch the real photos and inline them for vision.
    const imageContent: any[] = [];
    for (const url of imageUrls.slice(0, MAX_PHOTOS)) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const buf = await res.arrayBuffer();
        imageContent.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: Buffer.from(buf).toString('base64'),
          },
        });
      } catch {}
    }
    if (imageContent.length === 0) {
      return NextResponse.json({ error: 'Could not load any photos' }, { status: 400 });
    }

    const contextText = `${SYSTEM_PROMPT}

CATALOG DATA:
- Product title: ${title || '(none)'}
- Product type: ${productType || '(none)'}
- Store price: $${price ?? '(none)'}
- Catalog description: ${(descriptionText || '').slice(0, 2000)}

The images above are the REAL photos of this exact unit.`;

    const listingTool = {
      name: 'create_marketplace_listing',
      description: 'Create a Facebook Marketplace listing from real photos and catalog data',
      input_schema: {
        type: 'object' as const,
        properties: {
          title: { type: 'string', description: 'Marketplace title, under 100 chars' },
          description: { type: 'string', description: 'Plain-text Marketplace description' },
          condition: { type: 'string', enum: FB_CONDITIONS as unknown as string[] },
          keywords: { type: 'array', items: { type: 'string' } },
          photos_match: { type: 'boolean' },
          match_note: { type: 'string', description: 'Why photos do not match, if photos_match is false' },
        },
        required: ['title', 'description', 'condition', 'keywords', 'photos_match'],
      },
    };

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1500,
      tools: [listingTool],
      tool_choice: { type: 'tool', name: 'create_marketplace_listing' },
      messages: [{ role: 'user', content: [...imageContent, { type: 'text', text: contextText }] }],
    });

    await logApiUsage(supabase, {
      service: 'anthropic',
      operation: 'marketplace_listing',
      model: 'claude-opus-4-6',
      input_tokens: response.usage?.input_tokens,
      output_tokens: response.usage?.output_tokens,
    });

    let listing: any = null;
    for (const block of response.content) {
      if (block.type === 'tool_use' && block.name === 'create_marketplace_listing') {
        listing = block.input;
        break;
      }
    }
    if (!listing) {
      return NextResponse.json({ error: 'AI did not return a listing. Try again.' }, { status: 500 });
    }

    return NextResponse.json({
      title: String(listing.title || '').slice(0, 100),
      description: listing.description || '',
      condition: FB_CONDITIONS.includes(listing.condition) ? listing.condition : 'Used - Good',
      keywords: Array.isArray(listing.keywords) ? listing.keywords : [],
      category: suggestCategory(productType || ''),
      price: Number(price) || 0,
      match_warning: listing.photos_match === false ? (listing.match_note || 'Photos may not match product') : null,
    });
  } catch (err: any) {
    const status = err?.status || 500;
    return NextResponse.json(
      { error: err?.error?.message || err?.message || 'Internal server error' },
      { status }
    );
  }
}
