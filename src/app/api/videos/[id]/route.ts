import { getSessionUserId } from "@/lib/auth";
import { videoDTOById } from "@/lib/videos";
import { json, notFound } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = await videoDTOById(id, await getSessionUserId());
  return video ? json({ video }) : notFound("Video not found");
}
