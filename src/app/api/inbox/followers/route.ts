import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { userLiteSelect } from "@/lib/videos";
import { json, unauthorized } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  const [me, followers, following] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { followersSeenAt: true } }),
    prisma.follow.findMany({ where: { followingId: userId }, orderBy: { createdAt: "desc" }, include: { follower: { select: { ...userLiteSelect, bio: true } } }, take: 200 }),
    prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } }),
  ]);
  const iFollow = new Set(following.map((f) => f.followingId));
  return json({
    items: followers.map((f) => ({
      user: f.follower,
      createdAt: f.createdAt.toISOString(),
      isNew: f.createdAt > me.followersSeenAt,
      followingBack: iFollow.has(f.followerId),
    })),
  });
}
