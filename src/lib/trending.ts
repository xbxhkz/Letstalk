import { prisma } from "./prisma";

export async function getTrending(limit = 10) {
  const vids = await prisma.video.findMany({ select: { hashtags: true, views: true, baseLikes: true, _count: { select: { likes: true } } } });
  const score = new Map<string, { tag: string; videos: number; views: number }>();
  for (const v of vids) {
    for (const tag of v.hashtags.split(" ").filter(Boolean)) {
      const s = score.get(tag) ?? { tag, videos: 0, views: 0 };
      s.videos += 1;
      s.views += v.views;
      score.set(tag, s);
    }
  }
  return Array.from(score.values()).sort((a, b) => b.videos - a.videos || b.views - a.views).slice(0, limit);
}
