import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { extractHashtags, findVideos, videoDTOById } from "@/lib/videos";
import { badRequest, json, unauthorized } from "@/lib/api";

export const dynamic = "force-dynamic";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const MAX_BYTES = 100 * 1024 * 1024;
const VIDEO_TYPES: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm" };
const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * GET /api/videos
 *   feed=foryou (default) | following | user
 *   username=<handle>&type=posted|liked   (feed=user)
 *   q=<search>                            (caption / hashtag filter)
 *   tag=<hashtag>
 */
export async function GET(req: Request) {
  const viewerId = await getSessionUserId();
  const sp = new URL(req.url).searchParams;
  const feed = sp.get("feed") ?? "foryou";
  const q = sp.get("q")?.trim();
  const tag = sp.get("tag")?.trim().replace(/^#/, "").toLowerCase();
  const where: Prisma.VideoWhereInput = {};

  if (feed === "following") {
    if (!viewerId) return json({ videos: [], requiresAuth: true });
    where.author = { followers: { some: { followerId: viewerId } } };
  } else if (feed === "user") {
    const username = sp.get("username") ?? "";
    if (sp.get("type") === "liked") where.likes = { some: { user: { username } } };
    else where.author = { username };
  }
  if (tag) where.hashtags = { contains: tag };
  if (q) {
    const term = q.replace(/^#/, "");
    where.OR = [{ caption: { contains: term } }, { hashtags: { contains: term.toLowerCase() } }, { author: { username: { contains: term.toLowerCase() } } }];
  }

  let videos = await findVideos(where, viewerId);
  if (tag) videos = videos.filter((v) => v.hashtags.includes(tag));
  return json({ videos });
}

/** POST /api/videos — multipart: video (mp4/webm), caption, hashtags?, audioName?, thumbnail? */
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  const form = await req.formData().catch(() => null);
  if (!form) return badRequest("Expected multipart form data");

  const file = form.get("video");
  if (!(file instanceof File) || file.size === 0) return badRequest("Choose a video file to upload");
  const ext = VIDEO_TYPES[file.type];
  if (!ext) return badRequest("Only MP4 and WebM videos are supported");
  if (file.size > MAX_BYTES) return badRequest("Video must be 100 MB or smaller");

  const caption = String(form.get("caption") ?? "").trim().slice(0, 2200);
  const extraTags = String(form.get("hashtags") ?? "")
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#/, "").toLowerCase())
    .filter((t) => /^[\p{L}\p{N}_]+$/u.test(t));
  const tags = Array.from(new Set([...extractHashtags(caption), ...extraTags]));
  const fullCaption = [caption, ...extraTags.filter((t) => !extractHashtags(caption).includes(t)).map((t) => `#${t}`)].filter(Boolean).join(" ");

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const id = crypto.randomUUID();
  const videoName = `${id}.${ext}`;
  await fs.writeFile(path.join(UPLOAD_DIR, videoName), Buffer.from(await file.arrayBuffer()));

  let thumbnailUrl: string | null = null;
  const thumb = form.get("thumbnail");
  if (thumb instanceof File && thumb.size > 0 && thumb.size < 5 * 1024 * 1024 && IMAGE_TYPES[thumb.type]) {
    const thumbName = `${id}-thumb.${IMAGE_TYPES[thumb.type]}`;
    await fs.writeFile(path.join(UPLOAD_DIR, thumbName), Buffer.from(await thumb.arrayBuffer()));
    thumbnailUrl = `/api/media/${thumbName}`;
  }

  const author = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { username: true } });
  const audioName = String(form.get("audioName") ?? "").trim().slice(0, 80) || `original sound — ${author.username}`;
  const video = await prisma.video.create({
    data: { url: `/api/media/${videoName}`, thumbnailUrl, caption: fullCaption, hashtags: tags.join(" "), audioName, authorId: userId },
  });
  return json({ video: await videoDTOById(video.id, userId) }, 201);
}
