"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Heart, MessageCircle, Bookmark, Share2, Plus, Check, Play, Pause, Music2, Volume2, VolumeX } from "lucide-react";
import type { VideoDTO } from "@/lib/types";
import { formatCount } from "@/lib/format";
import { api, copyText } from "@/lib/client";
import { useAuth, useMute, useToast } from "./Providers";
import { Avatar } from "./Avatar";
import { Caption } from "./Caption";

type Props = {
  video: VideoDTO;
  active: boolean;
  preload: "auto" | "metadata";
  onUpdate: (p: Partial<VideoDTO>) => void;
  onFollowChange: (following: boolean) => void;
  onOpenComments: () => void;
};

type FloatingHeart = { id: number; x: number; y: number; r: number };

export function VideoCard({ video, active, preload, onUpdate, onFollowChange, onOpenComments }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const { requireAuth } = useAuth();
  const { muted, setMuted } = useMute();
  const { toast } = useToast();
  const [playing, setPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [flash, setFlash] = useState<{ id: number; kind: "play" | "pause" } | null>(null);
  const [hearts, setHearts] = useState<FloatingHeart[]>([]);
  const [likeAnim, setLikeAnim] = useState(0);
  const [progress, setProgress] = useState(0);
  const [justFollowed, setJustFollowed] = useState(false);
  const tapTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastTap = useRef(0);

  // Autoplay when active, pause + rewind when scrolled away.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (active && !userPaused) {
      el.muted = muted;
      el.play().catch(() => {
        // Unmuted autoplay blocked: fall back to muted playback.
        el.muted = true;
        setMuted(true);
        el.play().catch(() => {});
      });
    } else {
      el.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, userPaused]);

  useEffect(() => {
    if (!active) {
      setUserPaused(false);
      if (ref.current) ref.current.currentTime = 0;
    }
  }, [active]);

  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);

  const like = async (force?: boolean) => {
    if (!requireAuth()) return;
    const next = force ?? !video.likedByMe;
    if (next === video.likedByMe) return;
    onUpdate({ likedByMe: next, likes: video.likes + (next ? 1 : -1) });
    if (next) setLikeAnim((n) => n + 1);
    try {
      const r = await api<{ liked: boolean; likes: number }>(`/api/videos/${video.id}/like`, { method: "POST", json: { like: next } });
      onUpdate({ likedByMe: r.liked, likes: r.likes });
    } catch (e) {
      onUpdate({ likedByMe: video.likedByMe, likes: video.likes });
      toast((e as Error).message, "error");
    }
  };

  const handleTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const now = Date.now();
    const rect = e.currentTarget.getBoundingClientRect();
    if (now - lastTap.current < 280) {
      clearTimeout(tapTimer.current);
      lastTap.current = 0;
      const h = { id: now, x: e.clientX - rect.left, y: e.clientY - rect.top, r: Math.round(Math.random() * 40 - 20) };
      setHearts((hs) => [...hs, h]);
      setTimeout(() => setHearts((hs) => hs.filter((x) => x.id !== h.id)), 950);
      if (!video.likedByMe) like(true);
      return;
    }
    lastTap.current = now;
    tapTimer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const willPause = !el.paused;
      setUserPaused(willPause);
      if (!willPause) el.play().catch(() => {});
      setFlash({ id: Date.now(), kind: willPause ? "pause" : "play" });
    }, 280);
  };

  const save = async () => {
    if (!requireAuth()) return;
    const next = !video.savedByMe;
    onUpdate({ savedByMe: next, saves: video.saves + (next ? 1 : -1) });
    try {
      const r = await api<{ saved: boolean; saves: number }>(`/api/videos/${video.id}/save`, { method: "POST" });
      onUpdate({ savedByMe: r.saved, saves: r.saves });
      toast(r.saved ? "Added to Favorites" : "Removed from Favorites");
    } catch (e) {
      onUpdate({ savedByMe: video.savedByMe, saves: video.saves });
      toast((e as Error).message, "error");
    }
  };

  const share = async () => {
    const ok = await copyText(`${window.location.origin}/watch?v=${video.id}`);
    toast(ok ? "Link copied to clipboard" : "Couldn't copy link", ok ? "success" : "error");
    if (ok) {
      onUpdate({ shares: video.shares + 1 });
      api<{ shares: number }>(`/api/videos/${video.id}/share`, { method: "POST" }).then((r) => onUpdate({ shares: r.shares })).catch(() => {});
    }
  };

  const follow = async () => {
    if (!requireAuth()) return;
    onFollowChange(true);
    setJustFollowed(true);
    setTimeout(() => setJustFollowed(false), 1200);
    try {
      await api(`/api/users/${video.author.username}/follow`, { method: "POST", json: { follow: true } });
      toast(`Following @${video.author.username}`);
    } catch (e) {
      onFollowChange(false);
      toast((e as Error).message, "error");
    }
  };

  const showFollowBadge = !video.author.isMe && (!video.author.followedByMe || justFollowed);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <video
        ref={ref}
        src={video.url}
        poster={video.thumbnailUrl ?? undefined}
        loop
        playsInline
        muted={muted}
        preload={preload}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setProgress(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)}
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Tap surface: single tap = play/pause, double tap = like */}
      <div className="absolute inset-0 z-10 select-none" onClick={handleTap} aria-label="Video. Tap to play or pause, double-tap to like." />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-2/5 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-28 bg-gradient-to-b from-black/50 to-transparent" />

      {flash && (
        <div key={flash.id} className="pointer-events-none absolute left-1/2 top-1/2 z-20 animate-popIn rounded-full bg-black/40 p-5" onAnimationEnd={() => setFlash(null)}>
          {flash.kind === "pause" ? <Pause className="h-10 w-10" fill="currentColor" /> : <Play className="h-10 w-10 translate-x-0.5" fill="currentColor" />}
        </div>
      )}
      {!playing && userPaused && !flash && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 opacity-60">
          <Play className="h-16 w-16" fill="currentColor" />
        </div>
      )}
      {hearts.map((h) => (
        <Heart
          key={h.id}
          className="pointer-events-none absolute z-30 h-24 w-24 animate-floatHeart text-brand drop-shadow-icon"
          fill="currentColor"
          style={{ left: h.x, top: h.y, ["--r" as string]: `${h.r}deg` }}
        />
      ))}

      {/* Mute toggle */}
      <button
        onClick={() => setMuted(!muted)}
        aria-label={muted ? "Unmute" : "Mute"}
        className="absolute right-3 top-16 z-20 flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1.5 text-xs font-medium backdrop-blur-sm"
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        {muted && <span>Tap to unmute</span>}
      </button>

      {/* Bottom-left overlay */}
      <div className="absolute bottom-4 left-3 right-20 z-20 text-shadow">
        <Link href={`/profile/${video.author.username}`} className="text-[15px] font-bold hover:underline">
          @{video.author.username}
        </Link>
        <Caption text={video.caption} className="mt-1 line-clamp-3 text-sm leading-snug" />
        <div className="mt-2.5 flex items-center gap-2 text-sm">
          <Music2 className="h-3.5 w-3.5 shrink-0" />
          <div className="relative w-44 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
            <div className={`flex w-max animate-marquee whitespace-nowrap ${playing ? "" : "[animation-play-state:paused]"}`}>
              <span className="pr-10">{video.audioName}</span>
              <span className="pr-10" aria-hidden>{video.audioName}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right action rail */}
      <div className="absolute bottom-4 right-2 z-20 flex w-14 flex-col items-center gap-4">
        <div className="relative mb-2">
          <Link href={`/profile/${video.author.username}`} aria-label={`@${video.author.username}'s profile`}>
            <Avatar user={video.author} size={48} className="border-2 border-white" />
          </Link>
          {showFollowBadge && (
            <button
              onClick={follow}
              disabled={video.author.followedByMe}
              aria-label={`Follow @${video.author.username}`}
              className={`absolute -bottom-2.5 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full transition-colors ${video.author.followedByMe ? "bg-white text-brand" : "bg-brand text-white"}`}
            >
              {video.author.followedByMe ? <Check className="h-3 w-3" strokeWidth={4} /> : <Plus className="h-3.5 w-3.5" strokeWidth={4} />}
            </button>
          )}
        </div>

        <RailButton label={formatCount(video.likes)} onClick={() => like()} aria={video.likedByMe ? "Unlike" : "Like"}>
          <Heart key={likeAnim} className={`h-8 w-8 drop-shadow-icon ${video.likedByMe ? "animate-likePop text-brand" : ""}`} fill={video.likedByMe ? "currentColor" : "rgba(255,255,255,0.95)"} strokeWidth={video.likedByMe ? 0 : 0} />
        </RailButton>
        <RailButton label={formatCount(video.comments)} onClick={onOpenComments} aria="Comments">
          <MessageCircle className="h-8 w-8 drop-shadow-icon" fill="rgba(255,255,255,0.95)" strokeWidth={0} />
        </RailButton>
        <RailButton label={formatCount(video.saves)} onClick={save} aria={video.savedByMe ? "Remove bookmark" : "Bookmark"}>
          <Bookmark className={`h-7 w-7 drop-shadow-icon ${video.savedByMe ? "text-yellow-400" : ""}`} fill={video.savedByMe ? "currentColor" : "rgba(255,255,255,0.95)"} strokeWidth={0} />
        </RailButton>
        <RailButton label={formatCount(video.shares)} onClick={share} aria="Share">
          <Share2 className="h-7 w-7 drop-shadow-icon" strokeWidth={2.5} />
        </RailButton>

        <div className={`mt-1 flex h-11 w-11 animate-spin-slow items-center justify-center rounded-full bg-[conic-gradient(#222,#444,#222,#444,#222)] ring-[6px] ring-neutral-900 ${playing ? "" : "[animation-play-state:paused]"}`} aria-label={`Sound: ${video.audioName}`}>
          <Avatar user={video.author} size={22} />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 h-0.5 bg-white/20">
        <div className="h-full bg-white/80" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}

function RailButton({ label, onClick, aria, children }: { label: string; onClick: () => void; aria: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={aria} className="flex flex-col items-center gap-1 text-xs font-semibold text-shadow active:scale-90">
      {children}
      <span>{label}</span>
    </button>
  );
}
