// Pricing is computed in code so it stays consistent across the listing's
// retail_new number, listed_price number, and the narrative "Retail Price:
// $X" line inside auction_description. The AI's arithmetic is unreliable;
// web-search can override retail server-side after generation; and the
// review page lets users edit retail directly. All three paths funnel
// through these helpers.

// Markup over retail that becomes the shown listing price. 10% today.
export const LISTED_PRICE_MARKUP = 1.1;

export function computeListedPrice(retailNew: number): number {
  const r = Number(retailNew) || 0;
  return Math.round(r * LISTED_PRICE_MARKUP);
}

export function formatMoney(amount: number): string {
  return `$${Math.round(Number(amount) || 0).toLocaleString('en-US')}`;
}

// Replace any existing "[prefix] Retail Price: $N[,.decimals]" line in the
// description with the correct amount, or inject one after FEATURES: if the
// AI forgot it. Idempotent — repeated calls with the same price are a no-op.
export function syncRetailLine(
  description: string,
  listedPrice: number
): string {
  if (!description) return description;
  const money = formatMoney(listedPrice);
  const replacement = `Retail Price: ${money}`;

  // Match "Retail Price: $..." in the middle of a line (also handles
  // leading whitespace or a bullet). Captures the whole price token
  // including commas and optional decimals.
  const retailLineRx =
    /(^|\n)([ \t]*(?:[•\-*]\s*)?)retail\s*price\s*:\s*\$?[\d,]+(?:\.\d{1,2})?/gi;

  if (retailLineRx.test(description)) {
    return description.replace(retailLineRx, (_m, lineStart, leading) =>
      `${lineStart}${leading}${replacement}`
    );
  }

  // No Retail Price line present — try to inject it right after the
  // FEATURES: label if that's there. If no FEATURES: either, append
  // at the end.
  const featuresRx = /(^|\n)FEATURES:\s*/i;
  if (featuresRx.test(description)) {
    return description.replace(
      featuresRx,
      (_m, lineStart) => `${lineStart}FEATURES:\n${replacement}\n`
    );
  }
  return `${description.trimEnd()}\n\n${replacement}\n`;
}
