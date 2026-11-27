import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import LIBRARY from "./sound-library.json";

export type SoundDTO = {
  id: string;
  title: string;
  artist: string;
  genre: string;
  url: string;
  coverUrl: string | null;
  durationMs: number;
  uses: number;
  isLibrary: boolean;
  uploader: { username: string } | null;
};

/** Makes sure the built-in tracks (src/lib/sound-library.json) exist. Runs once per server process. */
let synced: Promise<void> | null = null;
export function ensureLibrary() {
  synced ??= (async () => {
    for (const s of LIBRARY) {
      const data = { title: s.title, artist: s.artist, genre: s.genre, url: s.url, coverUrl: s.coverUrl, durationMs: s.durationMs };
      await prisma.sound.upsert({ where: { slug: s.slug }, create: { slug: s.slug, ...data }, update: data });
    }
  })();
  synced.catch(() => (synced = null));
  return synced;
}

export const soundInclude = { _count: { select: { videos: true } }, uploader: { select: { username: true } } } satisfies Prisma.SoundInclude;
type SoundRow = Prisma.SoundGetPayload<{ include: typeof soundInclude }>;

export const toSoundDTO = (s: SoundRow): SoundDTO => ({
  id: s.id,
  title: s.title,
  artist: s.artist,
  genre: s.genre,
  url: s.url,
  coverUrl: s.coverUrl,
  durationMs: s.durationMs,
  uses: s._count.videos,
  isLibrary: !!s.slug,
  uploader: s.uploader,
});

export const soundLabel = (s: { title: string; artist: string }) => `${s.title} — ${s.artist}`;
