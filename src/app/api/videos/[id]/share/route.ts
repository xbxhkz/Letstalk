import { prisma } from "@/lib/prisma";
import { json, notFound } from "@/lib/api";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await prisma.video.update({ where: { id }, data: { shares: { increment: 1 } }, select: { shares: true } }).catch(() => null);
  return v ? json({ shares: v.shares }) : notFound("Video not found");
}
