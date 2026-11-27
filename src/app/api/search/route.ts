import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { findVideos, userLiteSelect } from "@/lib/videos";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const viewerId = await getSessionUserId();
  const raw = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!raw) return json({ users: [], videos: await findVideos({}, viewerId) });
  const term = raw.replace(/^[#@]/, "");
  const lower = term.toLowerCase();
  const isTag = raw.startsWith("#");
  const isUser = raw.startsWith("@");

  const users = isTag
    ? []
    : await prisma.user.findMany({
        where: { OR: [{ username: { contains: lower } }, { displayName: { contains: term } }] },
        select: { ...userLiteSelect, bio: true, _count: { select: { followers: true } } },
        take: 10,
      });
  const videos = isUser
    ? await findVideos({ author: { username: { contains: lower } } }, viewerId)
    : await findVideos(
        isTag ? { hashtags: { contains: lower } } : { OR: [{ caption: { contains: term } }, { hashtags: { contains: lower } }] },
        viewerId,
      );
  return json({
    users: users.map(({ _count, ...u }) => ({ ...u, followers: _count.followers })),
    videos: isTag ? videos.filter((v) => v.hashtags.some((h) => h.startsWith(lower))) : videos,
  });
}
