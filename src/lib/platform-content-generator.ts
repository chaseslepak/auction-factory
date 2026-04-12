// Generates platform-specific marketing content using Claude Sonnet 4.6

import Anthropic from '@anthropic-ai/sdk';
import type {
  ScrapedItem,
  GeneratedPlatformContent,
  CraigslistContent,
  FbMarketplaceContent,
  FbPageContent,
  PlatformType,
} from './platform-types';

const CL_SYSTEM_PROMPT = `You are a marketing copywriter creating Craigslist listings for restaurant equipment auctions.

Generate a FREE Craigslist "for sale by owner" listing that is:
- Compliant with Craigslist posting guidelines (no spam, no misleading claims, no ALL CAPS titles)
- Search-optimized with brand, model, and equipment type in the title
- Honest about condition - never exaggerate
- Clear that this is an AUCTION item (bidding, not fixed price)
- Professional but conversational tone

TITLE RULES:
- Max 70 characters
- Front-load: Brand Model - Equipment Type - Condition
- Include "AUCTION" somewhere in the title
- No ALL CAPS except brand names/acronyms
- No excessive punctuation

BODY RULES:
- Start with a 1-2 sentence hook about the item and the auction opportunity
- List key specs and features with bullet points
- State condition honestly
- Include the current bid if available
- End with auction details: "Bid now at auctionfactory.com" and mention preview/pickup info
- No spam phrases, no "CALL NOW", no fake urgency
- Plain text only (no HTML)`;

const FB_MARKETPLACE_SYSTEM_PROMPT = `You are creating a Facebook Marketplace listing for restaurant equipment from an auction.

Generate a listing that is:
- Compliant with Facebook Commerce Policies (accurate condition, real photos, truthful description)
- Optimized for Marketplace search and discovery
- Clear that this item is available via AUCTION (bidding required)
- Professional and informative

TITLE: Max 150 characters. Include brand, model, equipment type.
DESCRIPTION: 2-3 paragraphs. Specs, condition details, auction bidding info.
CONDITION: Must accurately map to Facebook's condition options.
PRICE: Use the current bid or starting price. Note this is an auction starting price.`;

const FB_PAGE_SYSTEM_PROMPT = `You are a social media manager for Auction Factory, a restaurant equipment auction company.

Create an engaging Facebook Business Page post that:
- Drives engagement (likes, comments, shares) and auction participation
- Uses a professional but exciting tone
- Highlights the value/deal opportunity
- Includes relevant hashtags for reach
- Has a clear call to action (bid, share, attend preview)
- Is appropriate for a business page audience
- Mentions the auction website (auctionfactory.com) for bidding

POST STYLE:
- 2-3 short paragraphs (not walls of text)
- Use line breaks for readability
- 5-8 relevant hashtags at the end
- Include emoji sparingly for visual appeal (1-3 max)
- Ask an engaging question or use a hook in the opening`;

export async function generatePlatformContent(
  anthropic: Anthropic,
  item: ScrapedItem,
  platforms: PlatformType[],
  auctionName: string,
): Promise<GeneratedPlatformContent> {
  const result: GeneratedPlatformContent = {};

  // Build context about the item
  const itemContext = [
    `Auction: ${auctionName}`,
    `Item: ${item.title || 'Unknown'}`,
    item.brand ? `Brand: ${item.brand}` : null,
    item.model ? `Model: ${item.model}` : null,
    item.condition ? `Condition: ${item.condition}` : null,
    item.current_bid ? `Current Bid: ${item.current_bid}` : null,
    item.dimensions ? `Dimensions: ${item.dimensions}` : null,
    item.description ? `Description: ${item.description}` : null,
    item.photos.length > 0 ? `Photos available: ${item.photos.length}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  // Define tools for each platform
  const tools: Anthropic.Tool[] = [];

  if (platforms.includes('craigslist')) {
    tools.push({
      name: 'create_craigslist_listing',
      description: 'Create a Craigslist-optimized listing for restaurant equipment',
      input_schema: {
        type: 'object' as const,
        properties: {
          title: {
            type: 'string',
            description: 'CL title, max 70 chars. Format: Brand Model - Type - Condition - AUCTION',
          },
          body: {
            type: 'string',
            description: 'Full listing body in plain text with bullet points',
          },
          suggested_price: {
            type: 'number',
            description: 'Suggested CL listing price (current bid or estimated value)',
          },
          category: {
            type: 'string',
            description: 'Best CL category: "business" for commercial equipment or "appliances" for consumer',
          },
        },
        required: ['title', 'body', 'suggested_price', 'category'],
      },
    });
  }

  if (platforms.includes('fb_marketplace')) {
    tools.push({
      name: 'create_marketplace_listing',
      description: 'Create a Facebook Marketplace listing for restaurant equipment',
      input_schema: {
        type: 'object' as const,
        properties: {
          title: {
            type: 'string',
            description: 'Marketplace title, max 150 chars',
          },
          description: {
            type: 'string',
            description: 'Full listing description, 2-3 paragraphs',
          },
          price: {
            type: 'number',
            description: 'Listing price in dollars',
          },
          condition: {
            type: 'string',
            enum: ['new', 'used_like_new', 'used_good', 'used_fair'],
            description: 'Facebook condition enum',
          },
          category: {
            type: 'string',
            description: 'Best FB Marketplace category for this item',
          },
        },
        required: ['title', 'description', 'price', 'condition', 'category'],
      },
    });
  }

  if (platforms.includes('fb_page')) {
    tools.push({
      name: 'create_social_post',
      description: 'Create a Facebook Business Page post for restaurant equipment',
      input_schema: {
        type: 'object' as const,
        properties: {
          post_text: {
            type: 'string',
            description: 'Full post text with line breaks, 2-3 paragraphs',
          },
          hashtags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of 5-8 relevant hashtags (without # prefix)',
          },
        },
        required: ['post_text', 'hashtags'],
      },
    });
  }

  if (tools.length === 0) return result;

  // Build system prompt combining all platform instructions
  const systemParts: string[] = [];
  if (platforms.includes('craigslist')) systemParts.push(CL_SYSTEM_PROMPT);
  if (platforms.includes('fb_marketplace')) systemParts.push(FB_MARKETPLACE_SYSTEM_PROMPT);
  if (platforms.includes('fb_page')) systemParts.push(FB_PAGE_SYSTEM_PROMPT);

  const systemPrompt = systemParts.join('\n\n---\n\n');

  const userMessage = `Generate listings for the following restaurant equipment auction item. Call ALL the provided tools - one for each platform.

${itemContext}

IMPORTANT: Call every tool provided. Generate unique, platform-appropriate content for each.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    system: systemPrompt,
    tools,
    messages: [{ role: 'user', content: userMessage }],
  });

  // Extract tool_use blocks
  for (const block of response.content) {
    if (block.type !== 'tool_use') continue;

    if (block.name === 'create_craigslist_listing') {
      result.craigslist = block.input as CraigslistContent;
    } else if (block.name === 'create_marketplace_listing') {
      result.fb_marketplace = block.input as FbMarketplaceContent;
    } else if (block.name === 'create_social_post') {
      result.fb_page = block.input as FbPageContent;
    }
  }

  // If not all tools were called (model sometimes does this), make a follow-up call
  const missing: PlatformType[] = [];
  if (platforms.includes('craigslist') && !result.craigslist) missing.push('craigslist');
  if (platforms.includes('fb_marketplace') && !result.fb_marketplace) missing.push('fb_marketplace');
  if (platforms.includes('fb_page') && !result.fb_page) missing.push('fb_page');

  if (missing.length > 0) {
    const missingTools = tools.filter((t) => {
      if (t.name === 'create_craigslist_listing') return missing.includes('craigslist');
      if (t.name === 'create_marketplace_listing') return missing.includes('fb_marketplace');
      if (t.name === 'create_social_post') return missing.includes('fb_page');
      return false;
    });

    if (missingTools.length > 0) {
      const retry = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: systemPrompt,
        tools: missingTools,
        messages: [
          { role: 'user', content: userMessage },
          { role: 'assistant', content: response.content },
          {
            role: 'user',
            content: `Please also call these remaining tools: ${missingTools.map((t) => t.name).join(', ')}`,
          },
        ],
      });

      for (const block of retry.content) {
        if (block.type !== 'tool_use') continue;
        if (block.name === 'create_craigslist_listing') {
          result.craigslist = block.input as CraigslistContent;
        } else if (block.name === 'create_marketplace_listing') {
          result.fb_marketplace = block.input as FbMarketplaceContent;
        } else if (block.name === 'create_social_post') {
          result.fb_page = block.input as FbPageContent;
        }
      }
    }
  }

  return result;
}
