/**
 * CORS for the Android app's bundled camera studio (origin https://localhost under Capacitor).
 * Only these origins may call the endpoints that opt in; normal pages are same-origin and need nothing.
 */
export const APP_ORIGINS = ["https://localhost", "capacitor://localhost"];

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!origin || !APP_ORIGINS.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export function preflight(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export function withCors<T extends Response>(req: Request, res: T): T {
  for (const [k, v] of Object.entries(corsHeaders(req))) res.headers.set(k, v);
  return res;
}
