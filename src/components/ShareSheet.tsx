"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X, Link2, Check, Send, Sparkles, Loader2 } from "lucide-react";
import type { UserLite, VideoDTO } from "@/lib/types";
import { api } from "@/lib/client";
import { useAuth, useToast } from "./Providers";
import { Avatar } from "./Avatar";

/** TikTok-style share sheet: send to friends (as a DM), copy link, and "Why this video". */
export function ShareSheet({ video, onCopyLink, onSent, onClose }: { video: VideoDTO; onCopyLink: () => void; onSent: () => void; onClose: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [friends, setFriends] = useState<UserLite[] | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);

  useEffect(() => setMount(document.getElementById("app-root")), []);
  useEffect(() => {
    if (!user) return setFriends([]);
    api<{ friends: UserLite[] }>("/api/friends").then((r) => setFriends(r.friends)).catch(() => setFriends([]));
  }, [user]);

  const send = async (f: UserLite) => {
    if (sent.has(f.id) || sending) return;
    setSending(f.id);
    try {
      await api(`/api/messages/${f.username}`, { method: "POST", json: { videoId: video.id } });
      setSent((s) => new Set(s).add(f.id));
      onSent();
      toast(`Sent to ${f.displayName}`);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSending(null);
    }
  };

  if (!mount) return null;
  return createPortal(
    <div className="absolute inset-0 z-50" role="dialog" aria-modal="true" aria-label="Share">
      <button className="absolute inset-0 animate-fadeIn bg-black/40" aria-label="Close share" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 animate-slideUp rounded-t-2xl bg-neutral-900 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <header className="relative flex h-12 items-center justify-center text-sm font-semibold">
          {showWhy ? "Why this video" : "Send to"}
          <button onClick={onClose} aria-label="Close" className="absolute right-3 rounded-full p-1.5 hover:bg-white/10"><X className="h-5 w-5" /></button>
        </header>

        {showWhy ? (
          <div className="px-5 pb-4">
            <p className="mb-3 text-sm text-white/60">This video is in your For You feed because:</p>
            <ul className="space-y-2">
              {(video.why?.length ? video.why : ["it's popular with viewers right now"]).map((r) => (
                <li key={r} className="flex items-start gap-2 text-[15px]"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-cyan" />{r[0].toUpperCase() + r.slice(1)}</li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-white/45">Your feed learns from what you like, save, comment on, follow and watch to the end, and from swiping past videos quickly.</p>
            <button onClick={() => setShowWhy(false)} className="mt-4 h-10 w-full rounded-md bg-neutral-800 text-sm font-semibold">Back</button>
          </div>
        ) : (
          <>
            <div className="no-scrollbar flex gap-4 overflow-x-auto px-4 pb-4 pt-1">
              {!user ? (
                <Link href="/login" className="py-3 text-sm text-white/60 underline">Log in to send videos to friends</Link>
              ) : !friends ? (
                <Loader2 className="my-4 h-5 w-5 animate-spin text-white/50" />
              ) : friends.length === 0 ? (
                <p className="py-3 text-sm text-white/60">Follow people to send them videos.</p>
              ) : (
                friends.map((f) => (
                  <button key={f.id} onClick={() => send(f)} className="flex w-16 shrink-0 flex-col items-center gap-1.5" aria-label={`Send to ${f.displayName}`}>
                    <span className="relative">
                      <Avatar user={f} size={56} />
                      <span className={`absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-neutral-900 ${sent.has(f.id) ? "bg-emerald-500" : "bg-brand"}`}>
                        {sending === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : sent.has(f.id) ? <Check className="h-3 w-3" strokeWidth={3} /> : <Send className="h-2.5 w-2.5" />}
                      </span>
                    </span>
                    <span className="w-full truncate text-center text-xs text-white/80">{f.displayName}</span>
                  </button>
                ))
              )}
            </div>
            <div className="flex gap-5 border-t border-white/10 px-4 pt-4">
              <SheetAction label="Copy link" onClick={() => { onCopyLink(); onClose(); }} className="bg-brand-cyan/90 text-black"><Link2 className="h-6 w-6" /></SheetAction>
              {video.why && <SheetAction label="Why this video" onClick={() => setShowWhy(true)} className="bg-neutral-700"><Sparkles className="h-6 w-6" /></SheetAction>}
            </div>
          </>
        )}
      </div>
    </div>,
    mount,
  );
}

function SheetAction({ label, onClick, className, children }: { label: string; onClick: () => void; className: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex w-16 flex-col items-center gap-1.5 text-xs text-white/80">
      <span className={`flex h-12 w-12 items-center justify-center rounded-full ${className}`}>{children}</span>
      {label}
    </button>
  );
}
