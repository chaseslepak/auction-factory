export function centsToUsd(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  });
}

export function usdToCents(usd: string | number | null | undefined): number | null {
  if (usd === "" || usd == null) return null;
  const n = typeof usd === "number" ? usd : parseFloat(String(usd).replace(/[$,\s]/g, ""));
  if (!isFinite(n)) return null;
  return Math.round(n * 100);
}
