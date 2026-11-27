import { NextResponse } from "next/server";
import { beginGoogle, googleConfigured, OAUTH_COOKIE } from "@/lib/google";
import { safeNext, isAppRequest, localRedirect } from "@/lib/auth-flow";

export const dynamic = "force-dynamic";

/** GET ?next=/path — redirects to Google. Inside the Android app, Capacitor opens that page in the system browser. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));
  if (!googleConfigured()) return localRedirect(`/login?error=google_not_configured&next=${encodeURIComponent(next)}`);
  const app = isAppRequest(req);
  const { url: googleUrl, binding } = await beginGoogle({ req, next, app });
  const res = NextResponse.redirect(googleUrl);
  // Ties the result to this browser/WebView: checked at the callback (web) or the hand-off (app).
  res.cookies.set(OAUTH_COOKIE, binding, {
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    path: "/api/auth",
    maxAge: 15 * 60,
  });
  return res;
}
