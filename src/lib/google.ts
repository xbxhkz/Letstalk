import crypto from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { prisma } from "./prisma";
import { generateUsername } from "./identity";
import { requestOrigin } from "./auth-flow";

/**
 * "Sign in with Google" (OAuth 2.0 authorization code flow + PKCE + OpenID Connect ID token).
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET — from Google Cloud Console → Credentials → OAuth client (Web application)
 *   PUBLIC_URL (optional) — the server's public origin, used to build the redirect URI
 *   GOOGLE_AUTH_URL / GOOGLE_TOKEN_URL / GOOGLE_JWKS_URL / GOOGLE_ISSUER — only to point at a test server
 */
const cfg = () => ({
  clientId: process.env.GOOGLE_CLIENT_ID ?? "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  authUrl: process.env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token",
  jwksUrl: process.env.GOOGLE_JWKS_URL || "https://www.googleapis.com/oauth2/v3/certs",
  issuers: process.env.GOOGLE_ISSUER ? [process.env.GOOGLE_ISSUER] : ["https://accounts.google.com", "accounts.google.com"],
});

export const googleConfigured = () => !!(cfg().clientId && cfg().clientSecret);

export const OAUTH_COOKIE = "lt_oauth";
const STATE_TTL_MS = 15 * 60 * 1000;
const HANDOFF_TTL_MS = 5 * 60 * 1000;

const b64url = (buf: Buffer) => buf.toString("base64url");
export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
export const randomToken = () => b64url(crypto.randomBytes(32));

export function redirectUri(req: Request) {
  return `${requestOrigin(req)}/api/auth/google/callback`;
}

/** Creates the state row and returns the Google URL plus the binding value for the lt_oauth cookie. */
export async function beginGoogle(opts: { req: Request; next: string; app: boolean }) {
  const c = cfg();
  const state = randomToken();
  const codeVerifier = randomToken();
  const nonce = randomToken();
  const binding = randomToken();
  await prisma.oAuthState.create({
    data: { state, codeVerifier, nonce, bindingHash: sha256(binding), next: opts.next, app: opts.app, expiresAt: new Date(Date.now() + STATE_TTL_MS) },
  });
  // Old rows are useless after they expire.
  prisma.oAuthState.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } } }).catch(() => {});
  const url = new URL(c.authUrl);
  url.search = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: redirectUri(opts.req),
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: b64url(crypto.createHash("sha256").update(codeVerifier).digest()),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { url: url.toString(), binding };
}

export class GoogleError extends Error {}

type GoogleClaims = JWTPayload & { email?: string; email_verified?: boolean; name?: string; given_name?: string; picture?: string; nonce?: string };

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksFor = "";

/** Exchanges the code, verifies the ID token, and returns the Letstalk user (linking or creating it). */
export async function completeGoogle(row: { codeVerifier: string; nonce: string }, code: string, req: Request) {
  const c = cfg();
  const res = await fetch(c.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: redirectUri(req), grant_type: "authorization_code", code_verifier: row.codeVerifier }),
  }).catch(() => null);
  if (!res || !res.ok) {
    console.error("[letstalk] Google token exchange failed:", res?.status, res ? (await res.text().catch(() => "")).slice(0, 300) : "network error");
    throw new GoogleError("Google sign-in failed. Please try again.");
  }
  const { id_token: idToken } = (await res.json()) as { id_token?: string };
  if (!idToken) throw new GoogleError("Google didn't return an identity token.");

  if (!jwks || jwksFor !== c.jwksUrl) {
    jwks = createRemoteJWKSet(new URL(c.jwksUrl));
    jwksFor = c.jwksUrl;
  }
  let claims: GoogleClaims;
  try {
    ({ payload: claims } = await jwtVerify<GoogleClaims>(idToken, jwks, { issuer: c.issuers, audience: c.clientId }));
  } catch (e) {
    console.error("[letstalk] Google ID token rejected:", (e as Error).message);
    throw new GoogleError("Google sign-in couldn't be verified.");
  }
  if (claims.nonce !== row.nonce) throw new GoogleError("Google sign-in couldn't be verified.");
  if (!claims.sub) throw new GoogleError("Google didn't identify the account.");
  return linkGoogleUser(claims);
}

async function linkGoogleUser(claims: GoogleClaims) {
  const googleId = claims.sub!;
  const email = claims.email_verified && claims.email ? claims.email.toLowerCase() : null;

  const byGoogle = await prisma.user.findUnique({ where: { googleId } });
  if (byGoogle) return byGoogle;
  // Same verified email as an existing account (email code or earlier Google sign-in): link them.
  if (email) {
    const byEmail = await prisma.user.findUnique({ where: { email } });
    if (byEmail) return prisma.user.update({ where: { id: byEmail.id }, data: { googleId, avatarUrl: byEmail.avatarUrl ?? claims.picture ?? null } });
  }
  const seed = claims.given_name || claims.name || email?.split("@")[0] || "user";
  return prisma.user.create({
    data: {
      username: await generateUsername(seed),
      displayName: (claims.name || seed).slice(0, 40),
      avatarUrl: claims.picture ?? null,
      googleId,
      email,
      needsUsername: true,
    },
  });
}

/** App flow: after Google, give the app a one-time token it trades for a session inside its WebView. */
export async function createHandoff(state: string, userId: string) {
  const token = randomToken();
  await prisma.oAuthState.update({ where: { state }, data: { userId, handoffHash: sha256(token), expiresAt: new Date(Date.now() + HANDOFF_TTL_MS) } });
  return token;
}
