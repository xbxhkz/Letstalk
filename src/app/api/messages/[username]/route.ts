import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { messageVideoSelect, toMessageDTO } from "@/lib/inbox";
import { userLiteSelect } from "@/lib/videos";
import { badRequest, json, notFound, unauthorized } from "@/lib/api";

export const dynamic = "force-dynamic";

async function other(username: string) {
  return prisma.user.findUnique({ where: { username: decodeURIComponent(username).toLowerCase() }, select: userLiteSelect });
}

/** GET the thread with :username (marks their messages to you as read). ?after=<iso> returns only newer ones. */
export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  const me = await getSessionUserId();
  if (!me) return unauthorized();
  const them = await other((await params).username);
  if (!them) return notFound("User not found");
  const after = new URL(req.url).searchParams.get("after");
  await prisma.message.updateMany({ where: { senderId: them.id, recipientId: me, readAt: null }, data: { readAt: new Date() } });
  const pair = { OR: [{ senderId: me, recipientId: them.id }, { senderId: them.id, recipientId: me }] };
  const rows = await prisma.message.findMany({
    where: after ? { AND: [pair, { createdAt: { gt: new Date(after) } }] } : pair,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { video: messageVideoSelect },
  });
  // Read receipt for my latest message (it may be older than `after`).
  const lastMine = await prisma.message.findFirst({ where: { senderId: me, recipientId: them.id }, orderBy: { createdAt: "desc" }, select: { id: true, readAt: true } });
  const [follows, followedBy] = await Promise.all([
    prisma.follow.findUnique({ where: { followerId_followingId: { followerId: me, followingId: them.id } } }),
    prisma.follow.findUnique({ where: { followerId_followingId: { followerId: them.id, followingId: me } } }),
  ]);
  return json({
    user: them,
    mutual: !!follows && !!followedBy,
    messages: rows.reverse().map(toMessageDTO),
    lastMineReadAt: lastMine?.readAt?.toISOString() ?? null,
    lastMineId: lastMine?.id ?? null,
  });
}

/** POST { text?, videoId? } */
export async function POST(req: Request, { params }: { params: Promise<{ username: string }> }) {
  const me = await getSessionUserId();
  if (!me) return unauthorized();
  const them = await other((await params).username);
  if (!them) return notFound("User not found");
  if (them.id === me) return badRequest("You can't message yourself");
  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? "").trim().slice(0, 1000);
  const videoId = typeof body.videoId === "string" ? body.videoId : null;
  if (!text && !videoId) return badRequest("Message can't be empty");
  if (videoId && !(await prisma.video.findUnique({ where: { id: videoId }, select: { id: true } }))) return notFound("Video not found");
  const m = await prisma.message.create({ data: { text, videoId, senderId: me, recipientId: them.id }, include: { video: messageVideoSelect } });
  return json({ message: toMessageDTO(m) }, 201);
}
