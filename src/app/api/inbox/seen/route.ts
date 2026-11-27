import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { badRequest, json, unauthorized } from "@/lib/api";

/** POST { section: "activity" | "followers" | "system" } — marks that section as read. */
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  const { section } = await req.json().catch(() => ({}));
  const now = new Date();
  if (section === "activity") await prisma.user.update({ where: { id: userId }, data: { activitySeenAt: now } });
  else if (section === "followers") await prisma.user.update({ where: { id: userId }, data: { followersSeenAt: now } });
  else if (section === "system") await prisma.notice.updateMany({ where: { userId, readAt: null }, data: { readAt: now } });
  else return badRequest("Unknown section");
  return json({ ok: true });
}
