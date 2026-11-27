import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { isValidUsername } from "@/lib/identity";
import { badRequest, json, unauthorized } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET ?u=name — is this username free? */
export async function GET(req: Request) {
  const me = await getSessionUserId();
  const u = (new URL(req.url).searchParams.get("u") ?? "").trim().toLowerCase();
  if (!isValidUsername(u)) return json({ available: false, reason: "3–24 characters: letters, numbers, . or _" });
  const taken = await prisma.user.findUnique({ where: { username: u }, select: { id: true } });
  return json({ available: !taken || taken.id === me });
}

/** POST { username, displayName } — finishes a new account. */
export async function POST(req: Request) {
  const me = await getSessionUserId();
  if (!me) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const username = String(body.username ?? "").trim().toLowerCase().replace(/^@/, "");
  const displayName = String(body.displayName ?? "").trim().slice(0, 40);
  if (!isValidUsername(username)) return badRequest("Username must be 3–24 characters: letters, numbers, . or _");
  if (!displayName) return badRequest("Add a name people will see.");
  const taken = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (taken && taken.id !== me) return badRequest("That username is taken.");
  const user = await prisma.user.update({
    where: { id: me },
    data: { username, displayName, needsUsername: false },
    select: { id: true, username: true, displayName: true, avatarUrl: true, bio: true, needsUsername: true },
  });
  return json({ user });
}
