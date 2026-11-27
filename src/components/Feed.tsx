"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { VideoDTO } from "@/lib/types";
import { api } from "@/lib/client";
import { VideoCard } from "./VideoCard";
import { CommentDrawer } from "./CommentDrawer";

export function Feed({ query, initialId, empty }: { query: string; initialId?: string; empty?: React.ReactNode }) {
  const [videos, setVideos] = useState<VideoDTO[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setVideos(null);
    setError(null);
    (async () => {
      try {
        const { videos: list } = await api<{ videos: VideoDTO[] }>(`/api/videos?${query}`);
        if (initialId && !list.some((v) => v.id === initialId)) {
          const one = await api<{ video: VideoDTO }>(`/api/videos/${initialId}`).catch(() => null);
          if (one) list.unshift(one.video);
        }
        if (!cancelled) setVideos(list);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [query, initialId]);

  // Jump to the requested video once the list renders.
  useEffect(() => {
    if (!videos?.length || !scroller.current) return;
    const idx = initialId ? Math.max(0, videos.findIndex((v) => v.id === initialId)) : 0;
    scroller.current.scrollTo({ top: idx * scroller.current.clientHeight, behavior: "instant" as ScrollBehavior });
    setActiveId(videos[idx].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos?.length, initialId]);

  // Whichever slide is mostly visible becomes the active (playing) one.
  useEffect(() => {
    const root = scroller.current;
    if (!root || !videos?.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActiveId((e.target as HTMLElement).dataset.id ?? null);
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll("[data-id]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [videos]);

  const update = useCallback((id: string, patch: Partial<VideoDTO>) => {
    setVideos((vs) => vs?.map((v) => (v.id === id ? { ...v, ...patch } : v)) ?? vs);
  }, []);
  // Following/unfollowing a creator updates every one of their videos in the feed.
  const updateAuthor = useCallback((authorId: string, followedByMe: boolean) => {
    setVideos((vs) => vs?.map((v) => (v.author.id === authorId ? { ...v, author: { ...v.author, followedByMe } } : v)) ?? vs);
  }, []);

  if (error) return <Centered>{error}</Centered>;
  if (!videos) return <Centered><Loader2 className="h-8 w-8 animate-spin text-white/70" /></Centered>;
  if (!videos.length) return <Centered>{empty ?? "No videos yet."}</Centered>;

  const activeIdx = videos.findIndex((v) => v.id === activeId);
  return (
    <>
      <div ref={scroller} className="no-scrollbar h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain">
        {videos.map((v, i) => (
          <div key={v.id} data-id={v.id} className="relative h-full w-full snap-start snap-always">
            <VideoCard
              video={v}
              active={v.id === activeId}
              preload={Math.abs(i - activeIdx) <= 1 ? "auto" : "metadata"}
              onUpdate={(p) => update(v.id, p)}
              onFollowChange={(f) => updateAuthor(v.author.id, f)}
              onOpenComments={() => setCommentsFor(v.id)}
            />
          </div>
        ))}
      </div>
      {commentsFor && (
        <CommentDrawer
          videoId={commentsFor}
          initialCount={videos.find((v) => v.id === commentsFor)?.comments ?? 0}
          onCount={(n) => update(commentsFor, { comments: n })}
          onClose={() => setCommentsFor(null)}
        />
      )}
    </>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-white/70">{children}</div>;
}
