// CORS: the app calls functions natively (no CORS). Only the public web viewer
// (SITE_ORIGIN) may call public-report from a browser.

export function corsHeaders(req: Request): Record<string, string> {
  const allowed = Deno.env.get('SITE_ORIGIN') ?? '';
  const origin = req.headers.get('Origin') ?? '';
  if (!allowed || origin !== allowed) return {};
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    Vary: 'Origin',
  };
}

export function preflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}
