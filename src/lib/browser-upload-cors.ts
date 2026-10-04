// Browser upload runs from inside AF admin, which AF now canonicalizes
// to the naked domain (auctionfactory.com). Keep the www variant in the
// allowlist too for robustness against browsers that still send a www
// Origin header before AF's 308 redirect takes effect.

const ALLOWED_ORIGINS = new Set([
  'https://auctionfactory.com',
  'https://www.auctionfactory.com',
]);

export function corsHeaders(request: Request, methods: string): Record<string, string> {
  const origin = request.headers.get('origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://auctionfactory.com';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}
