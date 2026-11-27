import { getTrending } from "@/lib/trending";
import { prisma } from "@/lib/prisma";
import { ensureLibrary, soundInclude, toSoundDTO } from "@/lib/sounds";
import { Discover } from "./Discover";

export const dynamic = "force-dynamic";

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  await ensureLibrary();
  const sounds = await prisma.sound.findMany({ include: soundInclude, orderBy: [{ videos: { _count: "desc" } }, { createdAt: "asc" }], take: 10 });
  return <Discover initialQuery={q ?? ""} trending={await getTrending(8)} sounds={sounds.map(toSoundDTO)} />;
}
