import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { userLiteSelect } from "@/lib/videos";
import { json, unauthorized } from "@/lib/api";
import type { Activity } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  const vSel = { id: true, thumbnailUrl: true, url: true } as const;
  const [likes, comments, follows] = await Promise.all([
    prisma.like.findMany({ where: { video: { authorId: userId }, userId: { not: userId } }, include: { user: { select: userLiteSelect }, video: { select: vSel } }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.comment.findMany({ where: { video: { authorId: userId }, userId: { not: userId } }, include: { user: { select: userLiteSelect }, video: { select: vSel } }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.follow.findMany({ where: { followingId: userId }, include: { follower: { select: userLiteSelect } }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const items: Activity[] = [
    ...likes.map((l) => ({ id: `l-${l.userId}-${l.videoId}`, kind: "like" as const, createdAt: l.createdAt.toISOString(), user: l.user, video: l.video })),
    ...comments.map((c) => ({ id: `c-${c.id}`, kind: "comment" as const, createdAt: c.createdAt.toISOString(), user: c.user, text: c.text, video: c.video })),
    ...follows.map((f) => ({ id: `f-${f.followerId}`, kind: "follow" as const, createdAt: f.createdAt.toISOString(), user: f.follower })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return json({ items });
}
