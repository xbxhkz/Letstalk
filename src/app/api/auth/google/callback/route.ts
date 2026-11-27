import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { completeGoogle, createHandoff, GoogleError, OAUTH_COOKIE, sha256 } from "@/lib/google";
import { afterSignIn, APP_SCHEME, escapeHtml, htmlPage, localRedirect } from "@/lib/auth-flow";

export const dynamic = "force-dynamic";

/** Google redirects here with ?code&state (or ?error). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  const row = state ? await prisma.oAuthState.findUnique({ where: { state } }) : null;

  const fail = (message: string) => {
    if (row?.app) {
      return htmlPage("Sign-in failed", `<h1>Sign-in didn't finish</h1><p>${escapeHtml(message)}</p><a class="btn" href="${APP_SCHEME}://auth?error=1">Back to Letstalk</a>`, 400);
    }
    return localRedirect(`/login?error=${encodeURIComponent(message)}&next=${encodeURIComponent(row?.next ?? "/")}`);
  };

  if (!row || row.consumedAt || row.expiresAt.getTime() < Date.now()) return fail("That sign-in link expired. Please try again.");
  if (url.searchParams.get("error")) {
    await prisma.oAuthState.update({ where: { state }, data: { consumedAt: new Date() } });
    return fail(url.searchParams.get("error") === "access_denied" ? "Google sign-in was cancelled." : "Google sign-in failed.");
  }
  // In a normal browser the callback must come back to the same browser that started it (stops login CSRF).
  // The app flow finishes in the system browser instead; there the check happens at the hand-off.
  if (!row.app) {
    const binding = (await cookies()).get(OAUTH_COOKIE)?.value;
    if (!binding || sha256(binding) !== row.bindingHash) return fail("Sign-in was started in a different browser. Please try again.");
  }
  // Use the state exactly once.
  const { count } = await prisma.oAuthState.updateMany({ where: { state, consumedAt: null }, data: { consumedAt: new Date() } });
  if (count !== 1) return fail("That sign-in link was already used.");

  let user;
  try {
    user = await completeGoogle(row, url.searchParams.get("code") ?? "", req);
  } catch (e) {
    if (e instanceof GoogleError) return fail(e.message);
    throw e;
  }

  if (row.app) {
    const token = await createHandoff(state, user.id);
    const back = `${APP_SCHEME}://auth?token=${encodeURIComponent(token)}`;
    return htmlPage(
      "Signed in",
      `<h1>Signed in with Google</h1><p>Returning you to Letstalk…</p><a class="btn" id="back" href="${back}">Open Letstalk</a>
<script>setTimeout(function(){location.href=${JSON.stringify(back)}},300)</script>`,
    );
  }

  await createSession(user.id);
  const res = localRedirect(afterSignIn(row.next, user.needsUsername));
  res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/auth" });
  return res;
}
