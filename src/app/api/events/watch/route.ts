import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/auth";
import { badRequest, json } from "@/lib/api";

/** Body: { videoId, watchMs, durationMs, completions } — sent when a video leaves the screen. */
export async function POST(req: Request) {
  const { userId, viewerKey } = await getViewer();
  const key = userId ?? viewerKey;
  if (!key) return json({ ok: false, reason: "no viewer id" });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.videoId !== "string") return badRequest("videoId required");
  const watchMs = Math.max(0, Math.min(Number(body.watchMs) || 0, 30 * 60 * 1000));
  const durationMs = Math.max(0, Math.min(Number(body.durationMs) || 0, 30 * 60 * 1000));
  const completions = Math.max(0, Math.min(Math.floor(Number(body.completions) || 0), 50));
  if (watchMs < 300) return json({ ok: true, ignored: true });
  const video = await prisma.video.findUnique({ where: { id: body.videoId }, select: { id: true } });
  if (!video) return json({ ok: false }, 404);
  await prisma.$transaction([
    prisma.view.create({ data: { viewerKey: key, userId, videoId: video.id, watchMs, durationMs, completions } }),
    ...(watchMs >= 1000 ? [prisma.video.update({ where: { id: video.id }, data: { views: { increment: 1 } } })] : []),
  ]);
  return json({ ok: true });
}
