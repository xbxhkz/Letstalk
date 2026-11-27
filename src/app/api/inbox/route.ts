import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { getActivity, getConversations, getFriends, getUnread } from "@/lib/inbox";
import { userLiteSelect } from "@/lib/videos";
import { json, unauthorized } from "@/lib/api";
import type { InboxSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Everything the Inbox home screen needs in one request. */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  const [unread, latestFollow, activity, notice, conversations, friends] = await Promise.all([
    getUnread(userId),
    prisma.follow.findFirst({ where: { followingId: userId }, orderBy: { createdAt: "desc" }, include: { follower: { select: userLiteSelect } } }),
    getActivity(userId, "all", 1),
    prisma.notice.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
    getConversations(userId),
    getFriends(userId),
  ]);
  const summary: InboxSummary = {
    unread,
    latestFollower: latestFollow?.follower ?? null,
    latestActivity: activity.find((a) => a.kind !== "follow") ?? null,
    latestNotice: notice ? { ...notice, createdAt: notice.createdAt.toISOString(), readAt: notice.readAt?.toISOString() ?? null } : null,
    conversations,
    friends,
  };
  return json(summary);
}
