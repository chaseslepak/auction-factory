// Browser upload runs from inside auctionfactory.com's admin — but users may
// hit it via either the naked domain (auctionfactory.com) or the www host
// (www.auctionfactory.com). Reflect whichever allowed origin the request
// came from so both work.

const ALLOWED_ORIGINS = new Set([
  'https://auctionfactory.com',
  'https://www.auctionfactory.com',
]);

export function corsHeaders(request: Request, methods: string): Record<string, string> {
  const origin = request.headers.get('origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://www.auctionfactory.com';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}
