import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { json, notFound, unauthorized } from "@/lib/api";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  if (!(await prisma.comment.findUnique({ where: { id }, select: { id: true } }))) return notFound("Comment not found");
  const key = { userId_commentId: { userId, commentId: id } };
  const existing = await prisma.commentLike.findUnique({ where: key });
  if (existing) await prisma.commentLike.delete({ where: key });
  else await prisma.commentLike.create({ data: { userId, commentId: id } });
  return json({ liked: !existing, likes: await prisma.commentLike.count({ where: { commentId: id } }) });
}
