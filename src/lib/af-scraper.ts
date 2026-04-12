// Scrapes auction items from the public auctionfactory.com front-end

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const AF_BASE = 'https://www.auctionfactory.com';

export interface ScrapedAFItem {
  lot_number: number | null;
  title: string;
  af_item_url: string;
  af_item_id: string;
  description: string;
  photos: string[];
  condition: string;
  current_bid: string;
  brand: string;
  model: string;
  dimensions: string;
}

export interface ScrapedAFAuction {
  af_url: string;
  af_name: string;
  items: ScrapedAFItem[];
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  return res.text();
}

// Extract auction name from the page title/heading
function parseAuctionName(html: string): string {
  // Try <title> tag first
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    const title = titleMatch[1].trim();
    // Remove common suffixes like " - Auction Factory"
    return title.replace(/\s*[-|]\s*Auction Factory.*$/i, '').trim();
  }
  // Try h1/h2
  const headingMatch = html.match(/<h[12][^>]*>([^<]+)<\/h[12]>/i);
  if (headingMatch) return headingMatch[1].trim();
  return 'Unknown Auction';
}

// Parse all items from the auction listing page
function parseAuctionItems(html: string): ScrapedAFItem[] {
  const items: ScrapedAFItem[] = [];

  // Split the HTML by "Item Number:" markers to isolate each item block
  const itemBlocks = html.split(/Item\s*Number:\s*/i);

  for (let i = 1; i < itemBlocks.length; i++) {
    const block = itemBlocks[i];

    // Extract lot number (first number after the split point)
    const lotMatch = block.match(/^\s*(\d+)/);
    const lot_number = lotMatch ? parseInt(lotMatch[1]) : i;

    // Extract item detail link and item ID
    const detailMatch = block.match(/item_detail\.php\?item=(\d+)/);
    const af_item_id = detailMatch ? detailMatch[1] : '';
    const af_item_url = af_item_id ? `${AF_BASE}/item_detail.php?item=${af_item_id}` : '';

    // Extract title from the item detail link text
    // Pattern: <a href="item_detail.php?item=XXX...">TITLE HERE</a>
    const titleMatch = block.match(
      /item_detail\.php\?item=\d+[^"]*"[^>]*>\s*([^<]+)\s*<\/a>/i
    );
    let title = titleMatch ? titleMatch[1].trim() : '';

    // Fallback: try any text that looks like an item name (after the link)
    if (!title) {
      const altTitle = block.match(/<a[^>]+item_detail[^>]+>([^<]+)<\/a>/i);
      if (altTitle) title = altTitle[1].trim();
    }

    // Extract photo URL
    const photos: string[] = [];
    const imgMatch = block.match(
      /src=["'](\/uploaded_files\d*\/[^"']+)["']/gi
    );
    if (imgMatch) {
      for (const m of imgMatch) {
        const srcMatch = m.match(/src=["'](\/uploaded_files\d*\/[^"']+)["']/i);
        if (srcMatch) {
          photos.push(`${AF_BASE}${srcMatch[1]}`);
        }
      }
    }

    // Extract description - look for text content between known markers
    let description = '';
    // Try to find description text - usually the longest plain text block
    const descPatterns = [
      // After the title link, before CONDITION
      /item_detail\.php[^<]*<\/a>\s*([\s\S]*?)(?=CONDITION:|Current\s*Bid:|$)/i,
      // General text block
      /<(?:p|div|td)[^>]*>([\s\S]{50,}?)<\/(?:p|div|td)>/i,
    ];
    for (const pattern of descPatterns) {
      const match = block.match(pattern);
      if (match) {
        description = match[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (description.length > 30) break;
      }
    }

    // Extract condition
    const conditionMatch = block.match(
      /CONDITION:?\s*(?:<[^>]*>)*\s*(\d+\s*[-|]\s*[^<\n]+)/i
    );
    const condition = conditionMatch ? conditionMatch[1].trim() : '';

    // Extract current bid
    const bidMatch = block.match(
      /Current\s*Bid:?\s*(?:<[^>]*>)*\s*\$?([\d,]+\.?\d*)/i
    );
    const current_bid = bidMatch ? `$${bidMatch[1]}` : '';

    // Skip empty items
    if (!title && !af_item_id) continue;

    items.push({
      lot_number,
      title: title || `Item ${lot_number}`,
      af_item_url,
      af_item_id,
      description,
      photos,
      condition,
      current_bid,
      brand: '',
      model: '',
      dimensions: '',
    });
  }

  return items;
}

// Fetch full details from an individual item's detail page
export async function scrapeItemDetail(
  itemUrl: string
): Promise<Partial<ScrapedAFItem>> {
  const html = await fetchPage(itemUrl);
  const result: Partial<ScrapedAFItem> = {};

  // Extract all photos (main image + thumbnails)
  const photos: string[] = [];

  // Main image: <img id="mainimage" src="..."
  const mainImgMatch = html.match(
    /id=["']mainimage["'][^>]*src=["'](\/uploaded_files\d*\/[^"']+)["']/i
  );
  if (mainImgMatch) {
    photos.push(`${AF_BASE}${mainImgMatch[1]}`);
  }

  // Also get all uploaded_files images (thumbnails and others)
  const imgRegex = /src=["'](\/uploaded_files\d*\/[^"']+)["']/gi;
  let imgMatch2;
  while ((imgMatch2 = imgRegex.exec(html)) !== null) {
    const url = `${AF_BASE}${imgMatch2[1]}`;
    if (!photos.includes(url)) {
      photos.push(url);
    }
  }
  if (photos.length > 0) result.photos = photos;

  // Extract full description - look for large text blocks
  // The description is typically in the main content area
  const descBlocks: string[] = [];
  const textBlockRegex = /<(?:p|div|td)[^>]*>([\s\S]*?)<\/(?:p|div|td)>/gi;
  let textMatch;
  while ((textMatch = textBlockRegex.exec(html)) !== null) {
    const text = textMatch[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length > 50 && !text.includes('function(') && !text.includes('jQuery')) {
      descBlocks.push(text);
    }
  }
  if (descBlocks.length > 0) {
    // Use the longest text block as the description
    result.description = descBlocks.sort((a, b) => b.length - a.length)[0];
  }

  // Extract condition
  const condMatch = html.match(
    /CONDITION:?\s*(?:<[^>]*>)*\s*(\d+\s*[-|]\s*[^<\n]+)/i
  );
  if (condMatch) result.condition = condMatch[1].trim();

  // Extract brand/make
  const makeMatch = html.match(
    /(?:Make|Brand):?\s*(?:<[^>]*>)*\s*([^<|\n]+)/i
  );
  if (makeMatch) result.brand = makeMatch[1].trim();

  // Extract model
  const modelMatch = html.match(
    /Model:?\s*(?:<[^>]*>)*\s*([^<|\n]+)/i
  );
  if (modelMatch) result.model = modelMatch[1].trim();

  // Extract dimensions
  const dimPatterns = [
    /(?:Width|W):?\s*(?:<[^>]*>)*\s*([\d.]+)/i,
    /(?:Depth|D):?\s*(?:<[^>]*>)*\s*([\d.]+)/i,
    /(?:Height|H):?\s*(?:<[^>]*>)*\s*([\d.]+)/i,
  ];
  const dims: string[] = [];
  for (const p of dimPatterns) {
    const m = html.match(p);
    if (m) dims.push(m[1]);
  }
  if (dims.length > 0) result.dimensions = dims.join(' x ');

  // Fallback dimensions from description
  if (!result.dimensions) {
    const dimDescMatch = (result.description || '').match(
      /(\d+[\d\/⅛⅜½⅝¾]*[″"]\s*[Ww]?\s*x\s*\d+[\d\/⅛⅜½⅝¾]*[″"]\s*[Dd]?\s*x\s*\d+[\d\/⅛⅜½⅝¾]*[″"]\s*[Hh]?)/
    );
    if (dimDescMatch) result.dimensions = dimDescMatch[1];
  }

  return result;
}

// Main scraper: fetches all items from an AF auction URL
export async function scrapeAuction(
  auctionUrl: string,
  fetchDetails: boolean = false
): Promise<ScrapedAFAuction> {
  // Normalize URL - ensure we request max items per page
  let url = auctionUrl;
  if (!url.startsWith('http')) {
    url = `${AF_BASE}/${url.replace(/^\//, '')}`;
  }

  // Parse auction ID from URL
  const auctionIdMatch = url.match(/auction=(\d+)/);
  if (!auctionIdMatch) {
    throw new Error(
      'Invalid auction URL. Expected format: auction_details.php?auction=XXXX or full URL with auction= parameter'
    );
  }

  // Add itemsPerPage=200 to get all items at once
  const fetchUrl = new URL(url);
  fetchUrl.searchParams.set('itemsPerPage', '200');

  // Fetch the auction listing page
  const html = await fetchPage(fetchUrl.toString());
  const af_name = parseAuctionName(html);
  let items = parseAuctionItems(html);

  // Check for additional pages if items count suggests pagination
  const totalMatch = html.match(/totalRows_items=(\d+)/);
  const totalRows = totalMatch ? parseInt(totalMatch[1]) : items.length;

  if (totalRows > 200 && items.length >= 200) {
    // Fetch additional pages
    let pageNum = 1;
    while (items.length < totalRows) {
      const pageUrl = new URL(url);
      pageUrl.searchParams.set('itemsPerPage', '200');
      pageUrl.searchParams.set('pageNum_items', String(pageNum));
      pageUrl.searchParams.set('totalRows_items', String(totalRows));

      const pageHtml = await fetchPage(pageUrl.toString());
      const pageItems = parseAuctionItems(pageHtml);
      if (pageItems.length === 0) break;

      items = items.concat(pageItems);
      pageNum++;

      // Safety limit
      if (pageNum > 10) break;
    }
  }

  // Optionally fetch individual item details for full descriptions + all photos
  if (fetchDetails) {
    for (let i = 0; i < items.length; i++) {
      if (!items[i].af_item_url) continue;

      try {
        const detail = await scrapeItemDetail(items[i].af_item_url);

        // Merge detail data into the item (detail data takes priority)
        if (detail.photos && detail.photos.length > items[i].photos.length) {
          items[i].photos = detail.photos;
        }
        if (detail.description && detail.description.length > (items[i].description?.length || 0)) {
          items[i].description = detail.description;
        }
        if (detail.condition) items[i].condition = detail.condition;
        if (detail.brand) items[i].brand = detail.brand;
        if (detail.model) items[i].model = detail.model;
        if (detail.dimensions) items[i].dimensions = detail.dimensions;
      } catch {
        // Continue with listing page data if detail fetch fails
      }

      // Rate limit: 200ms between detail page fetches
      if (i < items.length - 1) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }

  return {
    af_url: auctionUrl,
    af_name,
    items,
  };
}

// Scrape list of active auctions from the AF homepage
export async function scrapeAuctionList(): Promise<
  { id: string; name: string; url: string }[]
> {
  const html = await fetchPage(AF_BASE);
  const auctions: { id: string; name: string; url: string }[] = [];

  const regex =
    /auction_details\.php\?auction=(\d+)(?:&[^"']*)?"[^>]*>\s*([^<]+)/gi;
  let match;
  const seen = new Set<string>();

  while ((match = regex.exec(html)) !== null) {
    const id = match[1];
    if (seen.has(id)) continue;
    seen.add(id);

    const name = match[2].trim();
    if (name && name !== 'Auction Terms' && name !== 'Enter Auction') {
      auctions.push({
        id,
        name,
        url: `${AF_BASE}/auction_details.php?auction=${id}`,
      });
    }
  }

  return auctions;
}
