// Parse width/depth/height out of free-form description text.
//
// The AI generator writes dimensions into the description like
// "24W x 28D x 36H" but doesn't always populate the dedicated
// width/depth/height columns on the lot. This utility extracts them so
// they can be backfilled.
//
// Returns a partial — only fields confidently detected are set. All
// values are string representations of inches to match the existing
// lots.width/depth/height column shape (text).

export interface ParsedDimensions {
  width?: string;
  depth?: string;
  height?: string;
}

// Match any of:
//   24W x 28D x 36H
//   24"W x 28"D x 36"H
//   24W × 28D × 36H  (unicode ×)
//   24 W x 28 D x 36 H
// Captures numbers; W/D/H labels can be bracketed by " or ' marks.
const LABELED_WDH_RE =
  /(\d+(?:\.\d+)?)\s*["']?\s*[Ww]\s*[x×]\s*(\d+(?:\.\d+)?)\s*["']?\s*[Dd]\s*[x×]\s*(\d+(?:\.\d+)?)\s*["']?\s*[Hh]/;

// "Width: 24 inches" style, each on its own line or any delimiter
const WIDTH_RE = /\b(?:Width|W)\s*[:=]\s*(\d+(?:\.\d+)?)/i;
const DEPTH_RE = /\b(?:Depth|D)\s*[:=]\s*(\d+(?:\.\d+)?)/i;
const HEIGHT_RE = /\b(?:Height|H)\s*[:=]\s*(\d+(?:\.\d+)?)/i;

// 24" x 28" x 36" with NO W/D/H labels — assume W x D x H order (the
// convention everywhere in restaurant equipment specs).
const BARE_WDH_RE =
  /(\d+(?:\.\d+)?)\s*(?:["']|in|inches)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:["']|in|inches)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:["']|in|inches)?/;

export function extractDimensionsFromText(text: string | null | undefined): ParsedDimensions {
  if (!text) return {};
  const result: ParsedDimensions = {};

  // 1. Labeled WDH (highest confidence).
  const labeled = text.match(LABELED_WDH_RE);
  if (labeled) {
    result.width = labeled[1];
    result.depth = labeled[2];
    result.height = labeled[3];
    return result;
  }

  // 2. Width:/Depth:/Height: labeled values anywhere in the text.
  const w = text.match(WIDTH_RE);
  const d = text.match(DEPTH_RE);
  const h = text.match(HEIGHT_RE);
  if (w) result.width = w[1];
  if (d) result.depth = d[1];
  if (h) result.height = h[1];
  if (result.width || result.depth || result.height) return result;

  // 3. Bare N x N x N — assume W x D x H. Only trust it if all three
  // numbers are plausible inches (2–120). This filters things like
  // "6 x 4 x 2 oz" that aren't dimensions at all.
  const bare = text.match(BARE_WDH_RE);
  if (bare) {
    const [, bw, bd, bh] = bare;
    const n = (s: string) => Number(s);
    if (
      n(bw) >= 1 && n(bw) <= 240 &&
      n(bd) >= 1 && n(bd) <= 240 &&
      n(bh) >= 1 && n(bh) <= 240
    ) {
      result.width = bw;
      result.depth = bd;
      result.height = bh;
    }
  }
  return result;
}

// Apply parsed dimensions to a lot's fields, filling only blanks. A
// field is "blank" if null/undefined/empty-string. Existing values are
// never overwritten — the AI's vision pass on the user's actual photos
// is treated as more trustworthy than text parsing.
export function fillBlankDimensions<T extends { width?: unknown; depth?: unknown; height?: unknown }>(
  existing: T,
  parsed: ParsedDimensions
): { width: string; depth: string; height: string; changed: boolean } {
  const isBlank = (v: unknown) => v == null || v === '' || String(v).trim() === '';
  const curW = isBlank((existing as any).width) ? '' : String((existing as any).width);
  const curD = isBlank((existing as any).depth) ? '' : String((existing as any).depth);
  const curH = isBlank((existing as any).height) ? '' : String((existing as any).height);
  const nextW = curW || parsed.width || '';
  const nextD = curD || parsed.depth || '';
  const nextH = curH || parsed.height || '';
  return {
    width: nextW,
    depth: nextD,
    height: nextH,
    changed: nextW !== curW || nextD !== curD || nextH !== curH,
  };
}
