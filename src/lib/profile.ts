import { prisma } from "./prisma";

export async function getProfile(username: string, viewerId: string | null) {
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true, username: true, displayName: true, bio: true, avatarUrl: true,
      _count: { select: { followers: true, following: true } },
      followers: { where: { followerId: viewerId ?? "__nobody__" }, select: { followerId: true } },
    },
  });
  if (!user) return null;
  const agg = await prisma.video.aggregate({ where: { authorId: user.id }, _sum: { baseLikes: true } });
  const realLikes = await prisma.like.count({ where: { video: { authorId: user.id } } });
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    followers: user._count.followers,
    following: user._count.following,
    likes: (agg._sum.baseLikes ?? 0) + realLikes,
    followedByMe: user.followers.length > 0,
    isMe: viewerId === user.id,
  };
}

export type ProfileDTO = NonNullable<Awaited<ReturnType<typeof getProfile>>>;
