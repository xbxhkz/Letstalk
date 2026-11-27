"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { VideoDTO } from "@/lib/types";
import { api } from "@/lib/client";
import { VideoCard } from "./VideoCard";
import { CommentDrawer } from "./CommentDrawer";

type Item = { key: string; video: VideoDTO };

/**
 * Vertical snap-scroll feed.
 * With `paginate`, the For You feed loads in small batches: each batch is ranked by the
 * recommender *after* the watch events of the videos just seen, so the feed adapts as you scroll.
 */
export function Feed({ query, initialId, empty, paginate = false }: { query: string; initialId?: string; empty?: React.ReactNode; paginate?: boolean }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const loadingMore = useRef(false);
  const lap = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    lap.current = 0;
    (async () => {
      try {
        const { videos: list } = await api<{ videos: VideoDTO[] }>(`/api/videos?${query}${paginate ? "&limit=8" : ""}`);
        if (initialId && !list.some((v) => v.id === initialId)) {
          const one = await api<{ video: VideoDTO }>(`/api/videos/${initialId}`).catch(() => null);
          if (one) list.unshift(one.video);
        }
        if (!cancelled) setItems(list.map((v) => ({ key: `0-${v.id}`, video: v })));
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [query, initialId, paginate]);

  // Jump to the requested video once the first batch renders.
  const firstLoad = items === null ? 0 : 1;
  useEffect(() => {
    if (!items?.length || !scroller.current) return;
    const idx = initialId ? Math.max(0, items.findIndex((i) => i.video.id === initialId)) : 0;
    scroller.current.scrollTo({ top: idx * scroller.current.clientHeight, behavior: "instant" as ScrollBehavior });
    setActiveKey(items[idx].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstLoad, initialId]);

  // Whichever slide is mostly visible becomes the active (playing) one.
  useEffect(() => {
    const root = scroller.current;
    if (!root || !items?.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActiveKey((e.target as HTMLElement).dataset.key ?? null);
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll("[data-key]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);

  const activeIdx = items?.findIndex((i) => i.key === activeKey) ?? -1;

  // Load the next personalised batch when nearing the end.
  useEffect(() => {
    if (!paginate || !items || activeIdx < 0 || activeIdx < items.length - 3 || loadingMore.current) return;
    loadingMore.current = true;
    const ids = Array.from(new Set(items.map((i) => i.video.id))).slice(-150);
    // Give the watch event of the video just left a moment to land before re-ranking.
    const t = setTimeout(async () => {
      try {
        const { videos } = await api<{ videos: VideoDTO[] }>(`/api/videos?${query}&limit=6&exclude=${ids.join(",")}`);
        if (videos.some((v) => ids.includes(v.id))) lap.current += 1;
        const batch = lap.current;
        setItems((cur) => [...(cur ?? []), ...videos.map((v) => ({ key: `${batch}-${v.id}-${cur?.length ?? 0}`, video: v }))]);
      } catch {}
      loadingMore.current = false;
    }, 400);
    return () => { clearTimeout(t); loadingMore.current = false; };
  }, [activeIdx, items, paginate, query]);

  const update = useCallback((id: string, patch: Partial<VideoDTO>) => {
    setItems((cur) => cur?.map((i) => (i.video.id === id ? { ...i, video: { ...i.video, ...patch } } : i)) ?? cur);
  }, []);
  // Following/unfollowing a creator updates every one of their videos in the feed.
  const updateAuthor = useCallback((authorId: string, followedByMe: boolean) => {
    setItems((cur) => cur?.map((i) => (i.video.author.id === authorId ? { ...i, video: { ...i.video, author: { ...i.video.author, followedByMe } } } : i)) ?? cur);
  }, []);

  if (error) return <Centered>{error}</Centered>;
  if (!items) return <Centered><Loader2 className="h-8 w-8 animate-spin text-white/70" /></Centered>;
  if (!items.length) return <Centered>{empty ?? "No videos yet."}</Centered>;

  const commentVideo = items.find((i) => i.video.id === commentsFor)?.video;
  return (
    <>
      <div ref={scroller} className="no-scrollbar h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain">
        {items.map((item, i) => (
          <div key={item.key} data-key={item.key} className="relative h-full w-full snap-start snap-always">
            <VideoCard
              video={item.video}
              active={item.key === activeKey}
              preload={Math.abs(i - activeIdx) <= 1 ? "auto" : "metadata"}
              onUpdate={(p) => update(item.video.id, p)}
              onFollowChange={(f) => updateAuthor(item.video.author.id, f)}
              onOpenComments={() => setCommentsFor(item.video.id)}
            />
          </div>
        ))}
      </div>
      {commentsFor && (
        <CommentDrawer
          videoId={commentsFor}
          initialCount={commentVideo?.comments ?? 0}
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
