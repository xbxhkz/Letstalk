import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { ensureLibrary, soundInclude, toSoundDTO } from "@/lib/sounds";
import { findVideos } from "@/lib/videos";
import { SoundView } from "./SoundView";

export const dynamic = "force-dynamic";

export default async function SoundPage({ params }: { params: Promise<{ id: string }> }) {
  await ensureLibrary();
  const { id } = await params;
  const row = await prisma.sound.findUnique({ where: { id }, include: soundInclude });
  if (!row) notFound();
  const videos = await findVideos({ soundId: id }, await getSessionUserId(), { createdAt: "desc" }, 60);
  return <SoundView sound={toSoundDTO(row)} videos={videos} />;
}
