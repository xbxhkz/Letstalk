import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { badRequest, json, unauthorized } from "@/lib/api";

export async function PATCH(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const displayName = String(body.displayName ?? "").trim();
  const bio = String(body.bio ?? "").trim();
  if (!displayName) return badRequest("Name can't be empty");
  const user = await prisma.user.update({
    where: { id: userId },
    data: { displayName: displayName.slice(0, 40), bio: bio.slice(0, 160) },
    select: { id: true, username: true, displayName: true, bio: true, avatarUrl: true },
  });
  return json({ user });
}
