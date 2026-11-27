import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUserId, getUploadTokenUserId } from "@/lib/auth";
import { ensureLibrary, soundInclude, toSoundDTO } from "@/lib/sounds";
import { preflight, withCors } from "@/lib/cors";
import { badRequest, json, unauthorized } from "@/lib/api";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const MAX_BYTES = 15 * 1024 * 1024;
const AUDIO_TYPES: Record<string, string> = {
  "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/m4a": "m4a", "audio/aac": "aac",
  "audio/ogg": "ogg", "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/webm": "weba",
};

/** GET ?tab=popular|library|new|mine&q=search */
export async function GET(req: Request) {
  await ensureLibrary();
  const sp = new URL(req.url).searchParams;
  const tab = sp.get("tab") ?? "popular";
  const q = sp.get("q")?.trim();
  const where: Prisma.SoundWhereInput = {};
  if (tab === "library") where.slug = { not: null };
  if (tab === "mine") {
    const me = (await getSessionUserId()) ?? (await getUploadTokenUserId(req));
    if (!me) return withCors(req, json({ sounds: [] }));
    where.uploaderId = me;
  }
  if (q) where.OR = [{ title: { contains: q } }, { artist: { contains: q } }, { genre: { contains: q } }];
  const rows = await prisma.sound.findMany({
    where,
    include: soundInclude,
    orderBy: tab === "popular" ? [{ videos: { _count: "desc" } }, { createdAt: "asc" }] : { createdAt: "desc" },
    take: 60,
  });
  return withCors(req, json({ sounds: rows.map(toSoundDTO) }));
}

/** POST multipart: audio (mp3/m4a/aac/ogg/wav/webm, ≤15 MB), title, durationMs. Cookie or upload token. */
export async function POST(req: Request) {
  const userId = (await getSessionUserId()) ?? (await getUploadTokenUserId(req));
  if (!userId) return withCors(req, unauthorized());
  const form = await req.formData().catch(() => null);
  if (!form) return withCors(req, badRequest("Expected multipart form data"));
  const file = form.get("audio");
  if (!(file instanceof File) || !file.size) return withCors(req, badRequest("Choose an audio file"));
  const ext = AUDIO_TYPES[file.type];
  if (!ext) return withCors(req, badRequest("Use an MP3, M4A, AAC, OGG, WAV or WebM audio file"));
  if (file.size > MAX_BYTES) return withCors(req, badRequest("Sounds must be 15 MB or smaller"));
  const durationMs = Math.round(Number(form.get("durationMs")));
  if (!(durationMs >= 1000 && durationMs <= 10 * 60 * 1000)) return withCors(req, badRequest("Sounds must be between 1 second and 10 minutes"));
  const me = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { displayName: true } });
  const title = String(form.get("title") ?? "").trim().slice(0, 60) || file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "My sound";

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(UPLOAD_DIR, name), Buffer.from(await file.arrayBuffer()));
  const sound = await prisma.sound.create({
    data: { title, artist: me.displayName, url: `/api/media/${name}`, durationMs, uploaderId: userId },
    include: soundInclude,
  });
  return withCors(req, json({ sound: toSoundDTO(sound) }, 201));
}
