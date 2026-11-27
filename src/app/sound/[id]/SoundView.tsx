"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Play, Pause, Music2, Video } from "lucide-react";
import type { SoundDTO } from "@/lib/sounds";
import type { VideoDTO } from "@/lib/types";
import { formatCount } from "@/lib/format";
import { VideoGrid } from "@/components/VideoGrid";

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, "0")}`;

/** TikTok-style sound page: cover, play, "Use this sound", and the videos made with it. */
export function SoundView({ sound, videos }: { sound: SoundDTO; videos: VideoDTO[] }) {
  const router = useRouter();
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const a = new Audio(sound.url);
    a.onended = () => setPlaying(false);
    audio.current = a;
    return () => a.pause();
  }, [sound.url]);

  const toggle = () => {
    const a = audio.current!;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.play().then(() => setPlaying(true)).catch(() => {});
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="relative flex h-12 shrink-0 items-center justify-center font-semibold">
        <button onClick={() => (history.length > 1 ? router.back() : router.push("/"))} aria-label="Back" className="absolute left-2 p-1.5"><ChevronLeft className="h-6 w-6" /></button>
        Sound
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto pb-24">
        <section className="flex gap-4 px-4 pb-4 pt-2">
          <button onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="relative h-28 w-28 shrink-0 overflow-hidden rounded-lg bg-neutral-800">
            {sound.coverUrl ? <img src={sound.coverUrl} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand to-brand-cyan"><Music2 className="h-10 w-10" /></span>}
            <span className="absolute inset-0 flex items-center justify-center bg-black/25">{playing ? <Pause className="h-9 w-9" fill="currentColor" /> : <Play className="h-9 w-9" fill="currentColor" />}</span>
          </button>
          <div className="min-w-0 py-1">
            <h1 className="text-xl font-bold leading-tight">{sound.title}</h1>
            <p className="mt-1 text-sm text-white/70">{sound.uploader ? <Link href={`/profile/${sound.uploader.username}`} className="hover:underline">{sound.artist}</Link> : sound.artist}</p>
            <p className="mt-2 text-xs text-white/50">
              {formatCount(sound.uses)} video{sound.uses === 1 ? "" : "s"} · {fmt(sound.durationMs)}{sound.genre ? ` · ${sound.genre}` : ""}
              {sound.isLibrary ? " · Letstalk library" : ""}
            </p>
          </div>
        </section>
        {videos.length ? (
          <VideoGrid videos={videos} hrefFor={(v) => `/watch?v=${v.id}`} />
        ) : (
          <div className="flex flex-col items-center gap-2 px-8 py-12 text-center text-white/60">
            <Video className="h-10 w-10" />
            <p className="font-semibold text-white">No videos with this sound yet</p>
            <p className="text-sm">Be the first to use it.</p>
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black via-black/80 to-transparent px-6 pb-4 pt-10">
        <Link href={`/create?sound=${sound.id}`} className="pointer-events-auto flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-full bg-brand font-semibold shadow-lg">
          <Video className="h-5 w-5" /> Use this sound
        </Link>
      </div>
    </div>
  );
}
