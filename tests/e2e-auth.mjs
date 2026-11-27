// End-to-end sign-in check: runs Letstalk (next dev) against a fake Google OAuth server and drives
// the HTTP flows directly. Usage: node tests/e2e-auth.mjs
import http from "node:http";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { PrismaClient } from "@prisma/client";

const APP_PORT = 3100;
const G_PORT = 4455;
const APP = `http://localhost:${APP_PORT}`;
const G = `http://localhost:${G_PORT}`;
const CLIENT_ID = "test-client.apps.googleusercontent.com";
const CLIENT_SECRET = "test-secret";

// ---------------- fake Google ----------------
const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
let currentUser = { sub: "g-111", email: "gina@test.example", email_verified: true, name: "Gina Google", given_name: "Gina" };
const codes = new Map();
const fake = http.createServer(async (req, res) => {
  const u = new URL(req.url, G);
  if (u.pathname === "/jwks") return res.end(JSON.stringify({ keys: [jwk] }));
  if (u.pathname === "/auth") {
    const p = u.searchParams;
    if (p.get("client_id") !== CLIENT_ID || p.get("code_challenge_method") !== "S256") { res.writeHead(400); return res.end("bad auth request"); }
    const code = crypto.randomBytes(16).toString("hex");
    codes.set(code, { nonce: p.get("nonce"), challenge: p.get("code_challenge"), redirect: p.get("redirect_uri"), user: { ...currentUser } });
    res.writeHead(302, { Location: `${p.get("redirect_uri")}?code=${code}&state=${encodeURIComponent(p.get("state"))}` });
    return res.end();
  }
  if (u.pathname === "/token" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const f = new URLSearchParams(body);
    const entry = codes.get(f.get("code"));
    codes.delete(f.get("code"));
    const challenge = crypto.createHash("sha256").update(f.get("code_verifier") ?? "").digest("base64url");
    if (!entry || f.get("client_secret") !== CLIENT_SECRET || f.get("redirect_uri") !== entry.redirect || challenge !== entry.challenge) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: "invalid_grant" }));
    }
    const idToken = await new SignJWT({ ...entry.user, nonce: entry.nonce })
      .setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(G).setAudience(CLIENT_ID).setSubject(entry.user.sub).setIssuedAt().setExpirationTime("5m").sign(privateKey);
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ id_token: idToken, access_token: "x", token_type: "Bearer" }));
  }
  res.writeHead(404);
  res.end();
});
await new Promise((r) => fake.listen(G_PORT, r));

// ---------------- Letstalk dev server ----------------
const env = {
  ...process.env,
  GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET,
  GOOGLE_AUTH_URL: `${G}/auth`, GOOGLE_TOKEN_URL: `${G}/token`, GOOGLE_JWKS_URL: `${G}/jwks`, GOOGLE_ISSUER: G,
  PORT: String(APP_PORT),
  NEXT_DIST_DIR: ".next-e2e", // don't touch the production build in .next
};
const server = spawn("npx", ["next", "dev", "-p", String(APP_PORT)], { env, shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
const stop = () => {
  fake.close();
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"]);
  else server.kill();
};
for (let i = 0; i < 90; i++) {
  try { if ((await fetch(`${APP}/api/trending`)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 1000));
}

// ---------------- tiny cookie-jar client ----------------
class Client {
  constructor(ua = "Mozilla/5.0 test") { this.jar = new Map(); this.ua = ua; }
  async req(url, init = {}) {
    const headers = { "User-Agent": this.ua, ...(init.headers ?? {}) };
    if (this.jar.size && url.startsWith(APP)) headers.Cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetch(url, { ...init, headers, redirect: "manual" });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i), v = pair.slice(i + 1);
      if (!v || /max-age=0|expires=thu, 01 jan 1970/i.test(c)) this.jar.delete(k); else this.jar.set(k, v);
    }
    return res;
  }
  async json(url, body) {
    const r = await this.req(url, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }
}
// Location as a same-site path (NextResponse.redirect sends absolute URLs).
const loc = (r) => (r.headers.get("location") ?? "").replace(APP, "");
const abs = (l) => (l.startsWith("http") ? l : APP + l);

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  -> ${detail}`}`);
  if (!ok) failed++;
};

/** Runs the browser part of the Google flow; returns the callback response. */
async function googleWeb(client, next = "/") {
  const start = await client.req(`${APP}/api/auth/google/start?next=${encodeURIComponent(next)}`);
  const auth = await client.req(loc(start)); // fake Google -> 302 to our callback
  return client.req(abs(loc(auth)));
}

try {
  // 1. Email code sign-up -> onboarding -> username
  const email = `e2e-${Date.now()}@test.example`;
  const a = new Client();
  const s1 = await a.json(`${APP}/api/auth/otp/start`, { channel: "email", target: email });
  check("email: code sent (dev mode returns it)", s1.status === 200 && /^\d{6}$/.test(s1.body.devCode ?? ""), JSON.stringify(s1));
  const bad = await a.json(`${APP}/api/auth/otp/verify`, { channel: "email", target: email, code: s1.body.devCode === "000000" ? "111111" : "000000" });
  check("email: wrong code rejected", bad.status === 400, JSON.stringify(bad));
  const v1 = await a.json(`${APP}/api/auth/otp/verify`, { channel: "email", target: email, code: s1.body.devCode });
  check("email: right code signs in a new account", v1.status === 200 && v1.body.created === true && v1.body.needsUsername === true, JSON.stringify(v1));
  const handle = `e2e${Date.now() % 1e8}`;
  const un = await a.json(`${APP}/api/auth/username`, { username: handle, displayName: "E2E Person" });
  check("email: username chosen", un.status === 200 && un.body.user?.username === handle && un.body.user?.needsUsername === false, JSON.stringify(un));
  const me1 = await a.json(`${APP}/api/auth/me`);
  check("email: session is the new account", me1.body.user?.username === handle);

  // 2. Phone code
  const p = new Client();
  const phone = `+1555${String(Date.now()).slice(-7)}`;
  const s2 = await p.json(`${APP}/api/auth/otp/start`, { channel: "sms", target: phone.replace("+1", "") });
  check("phone: number without country code normalised to +1", s2.body.target === phone, JSON.stringify(s2));
  const v2 = await p.json(`${APP}/api/auth/otp/verify`, { channel: "sms", target: phone, code: s2.body.devCode });
  check("phone: code signs in", v2.status === 200 && v2.body.needsUsername === true, JSON.stringify(v2));
  const again = await p.json(`${APP}/api/auth/otp/start`, { channel: "sms", target: phone });
  check("phone: immediate resend is rate-limited", again.status === 429, JSON.stringify(again));

  // 3. Google in a normal browser
  currentUser = { sub: `g-${Date.now()}`, email: `gina-${Date.now()}@test.example`, email_verified: true, name: "Gina Google", given_name: "Gina" };
  const g = new Client();
  const cb = await googleWeb(g, "/discover");
  check("google web: callback redirects to onboarding (new account)", cb.status === 303 && loc(cb).startsWith("/onboarding?next=%2Fdiscover"), `${cb.status} ${loc(cb)}`);
  const me3 = await g.json(`${APP}/api/auth/me`);
  check("google web: signed in, name from Google", me3.body.user?.displayName === "Gina Google" && me3.body.user?.needsUsername === true, JSON.stringify(me3.body));

  // 4. Login CSRF: a callback URL replayed in a browser that didn't start the flow is refused
  const attacker = new Client();
  const start4 = await attacker.req(`${APP}/api/auth/google/start`);
  const auth4 = await attacker.req(loc(start4));
  const victim = new Client();
  const cb4 = await victim.req(abs(loc(auth4)));
  check("google web: callback without the starting browser's cookie is refused", cb4.status === 303 && loc(cb4).startsWith("/login?error="), `${cb4.status} ${loc(cb4)}`);
  check("google web: victim not signed in", !(await victim.json(`${APP}/api/auth/me`)).body.user);

  // 5. Same verified email as an existing email-code account -> linked, not duplicated
  currentUser = { sub: `g-link-${Date.now()}`, email, email_verified: true, name: "Linked", given_name: "Linked" };
  const l = new Client();
  const cb5 = await googleWeb(l);
  const me5 = await l.json(`${APP}/api/auth/me`);
  check("google: same email links to the existing account", me5.body.user?.username === handle && loc(cb5) === "/", `${loc(cb5)} ${JSON.stringify(me5.body)}`);

  // 6. Unverified Google email must NOT take over an account
  currentUser = { sub: `g-unverified-${Date.now()}`, email, email_verified: false, name: "Mallory", given_name: "Mallory" };
  const m = new Client();
  await googleWeb(m);
  const me6 = await m.json(`${APP}/api/auth/me`);
  check("google: unverified email does not link to the existing account", !!me6.body.user && me6.body.user.username !== handle, JSON.stringify(me6.body));

  // 7. Android app flow: start in the app WebView, finish in the system browser, hand back
  currentUser = { sub: `g-app-${Date.now()}`, email: `app-${Date.now()}@test.example`, email_verified: true, name: "App User", given_name: "Appy" };
  const webview = new Client("Mozilla/5.0 (Linux; Android 16) Chrome/140 Mobile LetstalkApp");
  const chrome = new Client("Mozilla/5.0 (Linux; Android 16) Chrome/140 Mobile");
  const start7 = await webview.req(`${APP}/api/auth/google/start`);
  check("app: start sets the binding cookie in the WebView", webview.jar.has("lt_oauth"));
  const auth7 = await chrome.req(loc(start7));
  const cb7 = await chrome.req(abs(loc(auth7)));
  const html = await cb7.text();
  const token = /com\.letstalk\.app:\/\/auth\?token=([A-Za-z0-9_-]+)/.exec(html)?.[1];
  check("app: browser gets a page that returns to the app with a token", cb7.status === 200 && !!token, html.slice(0, 200));
  check("app: the system browser is NOT signed in", !(await chrome.json(`${APP}/api/auth/me`)).body.user);
  const stolen = await new Client().req(`${APP}/api/auth/handoff?token=${token}`);
  check("app: token without the WebView's cookie is refused", loc(stolen).startsWith("/login?error="), loc(stolen));
  // Absolute redirects built from req.url say http://0.0.0.0:3000 under `start:lan`, which phones can't load.
  check("redirects are relative paths", (stolen.headers.get("location") ?? "").startsWith("/"), stolen.headers.get("location"));
  const ho = await webview.req(`${APP}/api/auth/handoff?token=${token}`);
  check("app: hand-off signs in the WebView", ho.status === 303 && loc(ho).startsWith("/onboarding"), `${ho.status} ${loc(ho)}`);
  check("app: WebView session is the Google account", (await webview.json(`${APP}/api/auth/me`)).body.user?.displayName === "App User");
  const replay = await webview.req(`${APP}/api/auth/handoff?token=${token}`);
  check("app: token can't be used twice", loc(replay).startsWith("/login?error="), loc(replay));

  // 8. Password login still works; passwordless accounts can't be logged into with a password
  const d = await new Client().json(`${APP}/api/auth/login`, { username: "maya.moves", password: "password123" });
  check("password: demo login still works", d.status === 200);
  const nopw = await new Client().json(`${APP}/api/auth/login`, { username: handle, password: "" });
  check("password: account without a password can't log in by password", nopw.status === 401);
} catch (e) {
  console.error(e);
  failed++;
} finally {
  if (failed) console.log("\n--- server log tail ---\n" + serverLog.split("\n").slice(-30).join("\n"));
  // Remove the accounts this run created (test.example emails, fictional +1555 numbers, fake Google ids).
  const db = new PrismaClient();
  await db.user.deleteMany({ where: { OR: [{ email: { endsWith: "@test.example" } }, { phone: { startsWith: "+1555" } }, { googleId: { startsWith: "g-" } }] } }).catch(() => {});
  await db.otpCode.deleteMany({ where: { OR: [{ target: { endsWith: "@test.example" } }, { target: { startsWith: "+1555" } }] } }).catch(() => {});
  await db.$disconnect();
  console.log(failed ? `\n${failed} check(s) failed` : "\nAll sign-in checks passed");
  stop();
  setTimeout(() => process.exit(failed ? 1 : 0), 500);
}
