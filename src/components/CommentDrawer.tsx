"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X, Heart, Loader2, SendHorizontal } from "lucide-react";
import type { CommentDTO } from "@/lib/types";
import { api } from "@/lib/client";
import { formatCount, timeAgo } from "@/lib/format";
import { useAuth, useToast } from "./Providers";
import { Avatar } from "./Avatar";

export function CommentDrawer({ videoId, initialCount, onCount, onClose }: { videoId: string; initialCount: number; onCount: (n: number) => void; onClose: () => void }) {
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();
  const [comments, setComments] = useState<CommentDTO[] | null>(null);
  const [count, setCount] = useState(initialCount);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const onCountRef = useRef(onCount);
  onCountRef.current = onCount;

  useEffect(() => setMount(document.getElementById("app-root")), []);

  // Load, then poll so new comments from other people show up while the drawer is open.
  useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ comments: CommentDTO[]; count: number }>(`/api/videos/${videoId}/comments`)
        .then((r) => {
          if (!alive) return;
          setComments(r.comments);
          setCount(r.count);
          onCountRef.current(r.count);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [videoId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireAuth() || !text.trim() || posting) return;
    setPosting(true);
    try {
      const r = await api<{ comment: CommentDTO; count: number }>(`/api/videos/${videoId}/comments`, { method: "POST", json: { text } });
      setComments((cs) => [r.comment, ...(cs ?? []).filter((c) => c.id !== r.comment.id)]);
      setCount(r.count);
      onCount(r.count);
      setText("");
      listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setPosting(false);
    }
  };

  const toggleLike = async (c: CommentDTO) => {
    if (!requireAuth()) return;
    const patch = (p: Partial<CommentDTO>) => setComments((cs) => cs?.map((x) => (x.id === c.id ? { ...x, ...p } : x)) ?? cs);
    patch({ likedByMe: !c.likedByMe, likes: c.likes + (c.likedByMe ? -1 : 1) });
    try {
      const r = await api<{ liked: boolean; likes: number }>(`/api/comments/${c.id}/like`, { method: "POST" });
      patch({ likedByMe: r.liked, likes: r.likes });
    } catch {
      patch({ likedByMe: c.likedByMe, likes: c.likes });
    }
  };

  if (!mount) return null;
  return createPortal(
    <div className="absolute inset-0 z-50" role="dialog" aria-modal="true" aria-label="Comments">
      <button className="absolute inset-0 animate-fadeIn bg-black/40" aria-label="Close comments" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 flex h-[65%] animate-slideUp flex-col rounded-t-2xl bg-neutral-900 text-white">
        <header className="relative flex h-12 shrink-0 items-center justify-center border-b border-white/10 text-sm font-semibold">
          {formatCount(count)} {count === 1 ? "comment" : "comments"}
          <button onClick={onClose} aria-label="Close" className="absolute right-3 rounded-full p-1.5 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {!comments ? (
            <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-white/60" /></div>
          ) : comments.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-white/60">
              <p className="font-semibold text-white">No comments yet</p>
              <p className="text-sm">Start the conversation.</p>
            </div>
          ) : (
            <ul className="space-y-5">
              {comments.map((c) => (
                <li key={c.id} className="flex gap-3">
                  <Link href={`/profile/${c.user.username}`} onClick={onClose}><Avatar user={c.user} size={36} /></Link>
                  <div className="min-w-0 flex-1">
                    <Link href={`/profile/${c.user.username}`} onClick={onClose} className="text-[13px] font-semibold text-white/60">{c.user.username}</Link>
                    <p className="break-words text-[15px] leading-snug">{c.text}</p>
                    <time className="mt-1 block text-xs text-white/45" dateTime={c.createdAt}>{timeAgo(c.createdAt)}</time>
                  </div>
                  <button onClick={() => toggleLike(c)} aria-label={c.likedByMe ? "Unlike comment" : "Like comment"} className="flex w-8 flex-col items-center pt-1 text-xs text-white/55">
                    <Heart className={`h-4 w-4 ${c.likedByMe ? "text-brand" : ""}`} fill={c.likedByMe ? "currentColor" : "none"} />
                    {c.likes > 0 && <span className="mt-0.5">{formatCount(c.likes)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={post} className="flex shrink-0 items-center gap-2 border-t border-white/10 px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          {user && <Avatar user={user} size={32} />}
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => { if (!user) requireAuth(); }}
            maxLength={500}
            placeholder={user ? "Add comment..." : "Log in to comment"}
            className="h-10 min-w-0 flex-1 rounded-full bg-neutral-800 px-4 text-sm outline-none placeholder:text-white/40 focus:ring-1 focus:ring-white/30"
          />
          <button type="submit" disabled={!text.trim() || posting} aria-label="Post comment" className="rounded-full p-2 text-brand disabled:text-white/30">
            {posting ? <Loader2 className="h-5 w-5 animate-spin" /> : <SendHorizontal className="h-5 w-5" />}
          </button>
        </form>
      </div>
    </div>,
    mount,
  );
}
