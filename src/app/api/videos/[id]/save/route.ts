import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { videoDTOById } from "@/lib/videos";
import { json, notFound, unauthorized } from "@/lib/api";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  if (!(await prisma.video.findUnique({ where: { id }, select: { id: true } }))) return notFound("Video not found");
  const key = { userId_videoId: { userId, videoId: id } };
  const existing = await prisma.save.findUnique({ where: key });
  if (existing) await prisma.save.delete({ where: key });
  else await prisma.save.create({ data: { userId, videoId: id } });
  const v = await videoDTOById(id, userId);
  return json({ saved: !existing, saves: v?.saves ?? 0 });
}
