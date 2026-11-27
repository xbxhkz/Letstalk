import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { badRequest, json, notFound, unauthorized } from "@/lib/api";

/** POST toggles follow; body { follow?: boolean } forces a state. */
export async function POST(req: Request, { params }: { params: Promise<{ username: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  const { username } = await params;
  const target = await prisma.user.findUnique({ where: { username: decodeURIComponent(username).toLowerCase() }, select: { id: true } });
  if (!target) return notFound("User not found");
  if (target.id === userId) return badRequest("You can't follow yourself");
  const body = await req.json().catch(() => ({}));
  const key = { followerId_followingId: { followerId: userId, followingId: target.id } };
  const existing = await prisma.follow.findUnique({ where: key });
  const want = typeof body.follow === "boolean" ? body.follow : !existing;
  if (want && !existing) await prisma.follow.create({ data: { followerId: userId, followingId: target.id } });
  if (!want && existing) await prisma.follow.delete({ where: key });
  return json({ following: want, followers: await prisma.follow.count({ where: { followingId: target.id } }) });
}
