import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { getActivity, type ActivityFilter } from "@/lib/inbox";
import { json, unauthorized } from "@/lib/api";

export const dynamic = "force-dynamic";

const FILTERS: ActivityFilter[] = ["all", "likes", "comments", "mentions", "followers"];

/** GET ?type=all|likes|comments|mentions|followers — items newer than the last visit are flagged `isNew`. */
export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  const t = new URL(req.url).searchParams.get("type") as ActivityFilter;
  const filter = FILTERS.includes(t) ? t : "all";
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { activitySeenAt: true, followersSeenAt: true } });
  const items = await getActivity(userId, filter);
  return json({
    items: items.map((a) => ({ ...a, isNew: new Date(a.createdAt) > (a.kind === "follow" ? user.followersSeenAt : user.activitySeenAt) })),
  });
}
