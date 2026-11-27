import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { ensureLibrary, soundInclude, toSoundDTO } from "@/lib/sounds";
import { findVideos } from "@/lib/videos";
import { preflight, withCors } from "@/lib/cors";
import { json, notFound } from "@/lib/api";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** GET — one sound and the videos that use it (newest first). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureLibrary();
  const { id } = await params;
  const s = await prisma.sound.findUnique({ where: { id }, include: soundInclude });
  if (!s) return withCors(req, notFound("Sound not found"));
  const videos = await findVideos({ soundId: id }, await getSessionUserId(), { createdAt: "desc" }, 60);
  return withCors(req, json({ sound: toSoundDTO(s), videos }));
}
