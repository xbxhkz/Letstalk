import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { VideoDTO } from "./types";

export const userLiteSelect = { id: true, username: true, displayName: true, avatarUrl: true } as const;

export function videoInclude(viewerId: string | null) {
  const none = "__nobody__";
  return {
    author: { select: { ...userLiteSelect, followers: { where: { followerId: viewerId ?? none }, select: { followerId: true } } } },
    _count: { select: { likes: true, comments: true, saves: true } },
    sound: { select: { id: true, title: true, artist: true } },
    likes: { where: { userId: viewerId ?? none }, select: { userId: true } },
    saves: { where: { userId: viewerId ?? none }, select: { userId: true } },
  } satisfies Prisma.VideoInclude;
}

type VideoWithRelations = Prisma.VideoGetPayload<{ include: ReturnType<typeof videoInclude> }>;

export function toVideoDTO(v: VideoWithRelations, viewerId: string | null): VideoDTO {
  const { followers, ...author } = v.author;
  return {
    id: v.id,
    url: v.url,
    thumbnailUrl: v.thumbnailUrl,
    caption: v.caption,
    hashtags: v.hashtags ? v.hashtags.split(" ") : [],
    audioName: v.audioName,
    sound: v.sound,
    createdAt: v.createdAt.toISOString(),
    author: { ...author, followedByMe: followers.length > 0, isMe: viewerId === author.id },
    likes: v.baseLikes + v._count.likes,
    comments: v._count.comments,
    saves: v.baseSaves + v._count.saves,
    shares: v.shares,
    views: v.views,
    likedByMe: v.likes.length > 0,
    savedByMe: v.saves.length > 0,
  };
}

export async function findVideos(where: Prisma.VideoWhereInput, viewerId: string | null, orderBy: Prisma.VideoOrderByWithRelationInput = { createdAt: "desc" }, take = 50) {
  const rows = await prisma.video.findMany({ where, include: videoInclude(viewerId), orderBy, take });
  return rows.map((r) => toVideoDTO(r, viewerId));
}

export function extractHashtags(text: string): string[] {
  return Array.from(new Set((text.match(/#([\p{L}\p{N}_]+)/gu) ?? []).map((t) => t.slice(1).toLowerCase())));
}

export async function videoDTOById(id: string, viewerId: string | null) {
  const v = await prisma.video.findUnique({ where: { id }, include: videoInclude(viewerId) });
  return v ? toVideoDTO(v, viewerId) : null;
}

export async function videosByIdsInOrder(ids: string[], viewerId: string | null) {
  if (!ids.length) return [];
  const rows = await prisma.video.findMany({ where: { id: { in: ids } }, include: videoInclude(viewerId) });
  const map = new Map(rows.map((r) => [r.id, toVideoDTO(r, viewerId)]));
  return ids.map((id) => map.get(id)).filter((v): v is VideoDTO => !!v);
}
