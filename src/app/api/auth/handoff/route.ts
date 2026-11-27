import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { OAUTH_COOKIE, sha256 } from "@/lib/google";
import { afterSignIn, localRedirect } from "@/lib/auth-flow";

export const dynamic = "force-dynamic";

/**
 * GET ?token= — the Android app loads this in its WebView after Google sign-in finished in the
 * system browser. The token is single-use and short-lived, and it only works together with the
 * lt_oauth cookie set in this same WebView when sign-in started, so an intercepted token is useless.
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const fail = (msg: string) => localRedirect(`/login?error=${encodeURIComponent(msg)}`);
  if (!token) return fail("Sign-in didn't finish. Please try again.");

  const row = await prisma.oAuthState.findFirst({ where: { handoffHash: sha256(token) } });
  if (!row || !row.userId || row.expiresAt.getTime() < Date.now()) return fail("That sign-in link expired or was already used. Please try again.");
  const binding = (await cookies()).get(OAUTH_COOKIE)?.value;
  if (!binding || sha256(binding) !== row.bindingHash) return fail("Sign-in was started on a different device. Please try again.");
  const { count } = await prisma.oAuthState.updateMany({ where: { state: row.state, handoffHash: row.handoffHash }, data: { handoffHash: null } });
  if (count !== 1) return fail("That sign-in was already used.");

  const user = await prisma.user.findUnique({ where: { id: row.userId }, select: { id: true, needsUsername: true } });
  if (!user) return fail("That account no longer exists.");
  await createSession(user.id);
  const res = localRedirect(afterSignIn(row.next, user.needsUsername));
  res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/auth" });
  return res;
}
