"use client";

/* eslint-disable @next/next/no-img-element */
import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SendHorizontal, Loader2, Play } from "lucide-react";
import type { MessageDTO, UserLite } from "@/lib/types";
import { api } from "@/lib/client";
import { Avatar } from "@/components/Avatar";
import { useAuth, useToast } from "@/components/Providers";
import { InboxHeader, Spinner } from "@/components/InboxUI";

type Thread = { user: UserLite; mutual: boolean; messages: MessageDTO[]; lastMineReadAt: string | null; lastMineId: string | null };

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return time;
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${time}`;
}

export function ChatView({ username }: { username: string }) {
  const { user, requireAuth, refreshUnread } = useAuth();
  const { toast } = useToast();
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const count = thread?.messages.length ?? 0;

  useEffect(() => { requireAuth(); }, [requireAuth]);

  // Initial load, then poll for new messages and read receipts.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    let latest: string | null = null;
    const load = async () => {
      try {
        const r = await api<Thread>(`/api/messages/${username}${latest ? `?after=${encodeURIComponent(latest)}` : ""}`);
        if (!alive) return;
        setThread((cur) => {
          if (!cur || !latest) return r;
          const ids = new Set(cur.messages.map((m) => m.id));
          return { ...r, messages: [...cur.messages, ...r.messages.filter((m) => !ids.has(m.id))] };
        });
        const last = r.messages[r.messages.length - 1];
        if (last) latest = last.createdAt;
        if (r.messages.length) refreshUnread();
      } catch (e) {
        if (alive && !latest) setError((e as Error).message);
      }
    };
    load();
    const t = setInterval(load, 3000);
    return () => { alive = false; clearInterval(t); };
  }, [user, username, refreshUnread]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [count]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const r = await api<{ message: MessageDTO }>(`/api/messages/${username}`, { method: "POST", json: { text } });
      setThread((cur) => cur && { ...cur, messages: [...cur.messages.filter((m) => m.id !== r.message.id), r.message], lastMineId: r.message.id, lastMineReadAt: null });
      setText("");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSending(false);
    }
  };

  if (error) return <div className="flex h-full flex-col"><InboxHeader title="Chat" /><p className="p-8 text-center text-white/60">{error}</p></div>;
  if (!thread) return <div className="flex h-full flex-col"><InboxHeader title="Chat" /><Spinner /></div>;

  const them = thread.user;
  return (
    <div className="flex h-full flex-col">
      <InboxHeader
        title={
          <Link href={`/profile/${them.username}`} className="flex flex-col items-center leading-tight">
            <span>{them.displayName}</span>
            <span className="text-xs font-normal text-white/50">@{them.username}</span>
          </Link>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <div className="mb-6 flex flex-col items-center text-center">
          <Avatar user={them} size={72} />
          <p className="mt-2 font-semibold">{them.displayName}</p>
          <p className="text-sm text-white/50">@{them.username}{thread.mutual ? " · You're friends" : ""}</p>
          <Link href={`/profile/${them.username}`} className="mt-3 rounded-md bg-neutral-800 px-4 py-1.5 text-sm font-semibold">View profile</Link>
        </div>

        {thread.messages.map((m, i) => {
          const mine = m.senderId === user?.id;
          const prev = thread.messages[i - 1];
          const showTime = !prev || new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > 15 * 60 * 1000;
          const nextSame = thread.messages[i + 1]?.senderId === m.senderId;
          return (
            <Fragment key={m.id}>
              {showTime && <p className="my-3 text-center text-xs text-white/40">{dayLabel(m.createdAt)}</p>}
              <div className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"} ${nextSame ? "mb-1" : "mb-3"}`}>
                {!mine && <span className="w-7 shrink-0">{!nextSame && <Avatar user={them} size={28} />}</span>}
                <div className={`flex max-w-[75%] flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
                  {m.video && (
                    <Link href={`/watch?v=${m.video.id}`} className="relative block w-40 overflow-hidden rounded-xl bg-neutral-800">
                      <div className="relative aspect-[9/16]">
                        {m.video.thumbnailUrl ? <img src={m.video.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : <video src={`${m.video.url}#t=0.5`} muted preload="metadata" className="h-full w-full object-cover" />}
                        <Play className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 opacity-80" fill="currentColor" />
                      </div>
                      <div className="p-2">
                        <p className="text-xs font-semibold">@{m.video.author.username}</p>
                        <p className="line-clamp-2 text-xs text-white/70">{m.video.caption}</p>
                      </div>
                    </Link>
                  )}
                  {m.text && (
                    <p className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${mine ? "rounded-br-md bg-[#2b7cff] text-white" : "rounded-bl-md bg-neutral-800"}`}>{m.text}</p>
                  )}
                </div>
              </div>
              {mine && m.id === thread.lastMineId && (
                <p className="-mt-2 mb-3 text-right text-[11px] text-white/45">{thread.lastMineReadAt ? "Seen" : "Sent"}</p>
              )}
            </Fragment>
          );
        })}
        <div ref={bottom} />
      </div>

      <form onSubmit={send} className="flex shrink-0 items-center gap-2 border-t border-white/10 px-3 py-2.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          placeholder="Send a message..."
          aria-label="Message"
          className="h-10 min-w-0 flex-1 rounded-full bg-neutral-800 px-4 text-[15px] outline-none placeholder:text-white/40 focus:ring-1 focus:ring-white/30"
        />
        <button type="submit" disabled={!text.trim() || sending} aria-label="Send" className="rounded-full p-2 text-[#2b7cff] disabled:text-white/30">
          {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <SendHorizontal className="h-5 w-5" />}
        </button>
      </form>
    </div>
  );
}
