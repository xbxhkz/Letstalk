import { prisma } from "./prisma";
import { userLiteSelect } from "./videos";
import type { Activity, ConversationDTO, MessageDTO, UserLite } from "./types";

const vSel = { id: true, thumbnailUrl: true, url: true } as const;

export type ActivityFilter = "all" | "likes" | "comments" | "mentions" | "followers";

/** Likes, comments, @mentions, comment likes and follows aimed at `userId`, newest first. */
export async function getActivity(userId: string, filter: ActivityFilter = "all", take = 60): Promise<Activity[]> {
  const me = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { username: true } });
  const want = (f: ActivityFilter) => filter === "all" || filter === f;
  const [likes, commentLikes, comments, mentions, follows] = await Promise.all([
    want("likes") ? prisma.like.findMany({ where: { video: { authorId: userId }, userId: { not: userId } }, include: { user: { select: userLiteSelect }, video: { select: vSel } }, orderBy: { createdAt: "desc" }, take }) : [],
    want("likes") ? prisma.commentLike.findMany({ where: { comment: { userId }, userId: { not: userId } }, include: { user: { select: userLiteSelect }, comment: { select: { id: true, text: true, createdAt: true, video: { select: vSel } } } }, take }) : [],
    want("comments") ? prisma.comment.findMany({ where: { video: { authorId: userId }, userId: { not: userId } }, include: { user: { select: userLiteSelect }, video: { select: vSel } }, orderBy: { createdAt: "desc" }, take }) : [],
    want("mentions") ? prisma.comment.findMany({ where: { text: { contains: `@${me.username}` }, userId: { not: userId } }, include: { user: { select: userLiteSelect }, video: { select: vSel } }, orderBy: { createdAt: "desc" }, take }) : [],
    want("followers") ? prisma.follow.findMany({ where: { followingId: userId }, include: { follower: { select: userLiteSelect } }, orderBy: { createdAt: "desc" }, take }) : [],
  ]);
  const items: Activity[] = [
    ...likes.map((l) => ({ id: `l-${l.userId}-${l.videoId}`, kind: "like" as const, createdAt: l.createdAt.toISOString(), user: l.user, video: l.video })),
    // CommentLike has no timestamp of its own; use the comment's.
    ...commentLikes.map((l) => ({ id: `cl-${l.userId}-${l.commentId}`, kind: "comment_like" as const, createdAt: l.comment.createdAt.toISOString(), user: l.user, text: l.comment.text, video: l.comment.video })),
    ...comments.map((c) => ({ id: `c-${c.id}`, kind: "comment" as const, createdAt: c.createdAt.toISOString(), user: c.user, text: c.text, video: c.video })),
    ...mentions.map((c) => ({ id: `m-${c.id}`, kind: "mention" as const, createdAt: c.createdAt.toISOString(), user: c.user, text: c.text, video: c.video })),
    ...follows.map((f) => ({ id: `f-${f.followerId}`, kind: "follow" as const, createdAt: f.createdAt.toISOString(), user: f.follower })),
  ];
  // A mention on my own video is already listed as a comment.
  const seen = new Set<string>();
  return items
    .filter((a) => {
      const k = a.kind === "mention" || a.kind === "comment" ? a.id.slice(2) : a.id;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, take);
}

export async function getUnread(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { username: true, activitySeenAt: true, followersSeenAt: true } });
  const after = { gt: user.activitySeenAt };
  const [followers, likes, comments, mentions, system, messages] = await Promise.all([
    prisma.follow.count({ where: { followingId: userId, createdAt: { gt: user.followersSeenAt } } }),
    prisma.like.count({ where: { video: { authorId: userId }, userId: { not: userId }, createdAt: after } }),
    prisma.comment.count({ where: { video: { authorId: userId }, userId: { not: userId }, createdAt: after } }),
    prisma.comment.count({ where: { text: { contains: `@${user.username}` }, video: { authorId: { not: userId } }, userId: { not: userId }, createdAt: after } }),
    prisma.notice.count({ where: { userId, readAt: null } }),
    prisma.message.count({ where: { recipientId: userId, readAt: null } }),
  ]);
  const activity = likes + comments + mentions;
  return { followers, activity, system, messages, total: followers + activity + system + messages };
}

export function toMessageDTO(m: { id: string; text: string; createdAt: Date; readAt: Date | null; senderId: string; video: { id: string; thumbnailUrl: string | null; url: string; caption: string; author: { username: string } } | null }): MessageDTO {
  return { id: m.id, text: m.text, createdAt: m.createdAt.toISOString(), readAt: m.readAt?.toISOString() ?? null, senderId: m.senderId, video: m.video };
}

export const messageVideoSelect = { select: { id: true, thumbnailUrl: true, url: true, caption: true, author: { select: { username: true } } } } as const;

/** One row per person you've exchanged messages with, newest first. */
export async function getConversations(userId: string): Promise<ConversationDTO[]> {
  const msgs = await prisma.message.findMany({
    where: { OR: [{ senderId: userId }, { recipientId: userId }] },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { sender: { select: userLiteSelect }, recipient: { select: userLiteSelect }, video: messageVideoSelect },
  });
  const map = new Map<string, ConversationDTO>();
  for (const m of msgs) {
    const other = m.senderId === userId ? m.recipient : m.sender;
    let c = map.get(other.id);
    if (!c) {
      c = { user: other, last: toMessageDTO(m), unread: 0 };
      map.set(other.id, c);
    }
    if (m.recipientId === userId && !m.readAt) c.unread += 1;
  }
  return [...map.values()];
}

/** People to message: recent chats first, then mutual follows, then people you follow. */
export async function getFriends(userId: string, take = 20): Promise<(UserLite & { mutual: boolean })[]> {
  const [convos, following, followers] = await Promise.all([
    getConversations(userId),
    prisma.follow.findMany({ where: { followerId: userId }, include: { following: { select: userLiteSelect } }, orderBy: { createdAt: "desc" } }),
    prisma.follow.findMany({ where: { followingId: userId }, select: { followerId: true } }),
  ]);
  const followerIds = new Set(followers.map((f) => f.followerId));
  const out = new Map<string, UserLite & { mutual: boolean }>();
  for (const c of convos) out.set(c.user.id, { ...c.user, mutual: followerIds.has(c.user.id) });
  for (const f of following.filter((f) => followerIds.has(f.followingId))) out.set(f.following.id, { ...f.following, mutual: true });
  for (const f of following) if (!out.has(f.following.id)) out.set(f.following.id, { ...f.following, mutual: false });
  return [...out.values()].slice(0, take);
}

export async function notify(userId: string, title: string, body: string, link?: string) {
  await prisma.notice.create({ data: { userId, title, body, link } });
}
