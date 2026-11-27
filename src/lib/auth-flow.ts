import { NextResponse } from "next/server";

/**
 * Same-site redirect with a relative Location header. Building an absolute URL from req.url is
 * wrong behind `next start -H 0.0.0.0`: req.url then says http://0.0.0.0:3000, which a phone can't load.
 */
export const localRedirect = (path: string) => new NextResponse(null, { status: 303, headers: { Location: path, "Cache-Control": "no-store" } });

/** The origin the client used: PUBLIC_URL if set, else the forwarded/Host headers (never req.url's bind address). */
export function requestOrigin(req: Request): string {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, "");
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host")?.split(",")[0].trim() || req.headers.get("host") || url.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

/** Only same-site paths are allowed as post-login destinations (no open redirects). */
export function safeNext(raw: string | null | undefined): string {
  // Browsers drop tabs/newlines and treat "\" like "/" in URLs, so "/\t/evil.com" would become "//evil.com".
  const v = String(raw ?? "").replace(/[\u0000-\u001F\u007F]/g, "");
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return "/";
  try {
    const base = "http://same-site.invalid";
    const u = new URL(v, base);
    return u.origin === base ? u.pathname + u.search + u.hash : "/";
  } catch {
    return "/";
  }
}

/** The Android app appends "LetstalkApp" to its WebView user agent (see capacitor.config.ts). */
export const isAppRequest = (req: Request) => /\bLetstalkApp\b/.test(req.headers.get("user-agent") ?? "");

/** Where to go after signing in: new accounts pick a username first. */
export const afterSignIn = (next: string, needsUsername: boolean) => (needsUsername ? `/onboarding?next=${encodeURIComponent(next)}` : next);

export const APP_SCHEME = "com.letstalk.app";

/** A small standalone page (used in the system browser during the app's Google flow). */
export function htmlPage(title: string, body: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#000;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box}
main{max-width:360px}h1{font-size:22px;margin:0 0 8px}p{color:#aaa;line-height:1.45;margin:0 0 20px}
a.btn{display:block;background:#fe2c55;color:#fff;text-decoration:none;font-weight:700;padding:14px;border-radius:8px}</style></head>
<body><main>${body}</main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } },
  );
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
