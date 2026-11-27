import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { videoDTOById } from "@/lib/videos";
import { json, notFound, unauthorized } from "@/lib/api";

/** POST toggles; body { like?: boolean } forces a state (double-tap sends like: true). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  if (!(await prisma.video.findUnique({ where: { id }, select: { id: true } }))) return notFound("Video not found");
  const body = await req.json().catch(() => ({}));
  const key = { userId_videoId: { userId, videoId: id } };
  const existing = await prisma.like.findUnique({ where: key });
  const want = typeof body.like === "boolean" ? body.like : !existing;
  if (want && !existing) await prisma.like.create({ data: { userId, videoId: id } });
  if (!want && existing) await prisma.like.delete({ where: key });
  const v = await videoDTOById(id, userId);
  return json({ liked: want, likes: v?.likes ?? 0 });
}
