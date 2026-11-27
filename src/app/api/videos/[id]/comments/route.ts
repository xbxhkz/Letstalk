import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { userLiteSelect } from "@/lib/videos";
import { badRequest, json, notFound, unauthorized } from "@/lib/api";
import type { CommentDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

async function list(videoId: string, viewerId: string | null): Promise<CommentDTO[]> {
  const rows = await prisma.comment.findMany({
    where: { videoId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      user: { select: userLiteSelect },
      _count: { select: { likes: true } },
      likes: { where: { userId: viewerId ?? "__nobody__" }, select: { userId: true } },
    },
  });
  return rows.map((c) => ({
    id: c.id,
    text: c.text,
    createdAt: c.createdAt.toISOString(),
    user: c.user,
    likes: c._count.likes,
    likedByMe: c.likes.length > 0,
  }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const comments = await list(id, await getSessionUserId());
  return json({ comments, count: comments.length });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? "").trim();
  if (!text) return badRequest("Comment can't be empty");
  if (text.length > 500) return badRequest("Comments are limited to 500 characters");
  if (!(await prisma.video.findUnique({ where: { id }, select: { id: true } }))) return notFound("Video not found");
  const c = await prisma.comment.create({ data: { text, userId, videoId: id }, include: { user: { select: userLiteSelect } } });
  const comment: CommentDTO = { id: c.id, text: c.text, createdAt: c.createdAt.toISOString(), user: c.user, likes: 0, likedByMe: false };
  const count = await prisma.comment.count({ where: { videoId: id } });
  return json({ comment, count }, 201);
}
