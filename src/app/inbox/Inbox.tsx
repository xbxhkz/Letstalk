"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart, MessageCircle, UserPlus, Loader2, Bell } from "lucide-react";
import type { Activity } from "@/lib/types";
import { api } from "@/lib/client";
import { timeAgo } from "@/lib/format";
import { Avatar } from "@/components/Avatar";

const ICON = { like: [Heart, "bg-brand"], comment: [MessageCircle, "bg-sky-500"], follow: [UserPlus, "bg-violet-500"] } as const;

export function Inbox() {
  const [items, setItems] = useState<Activity[] | null>(null);
  useEffect(() => {
    api<{ items: Activity[] }>("/api/inbox").then((r) => setItems(r.items)).catch(() => setItems([]));
  }, []);

  if (!items) return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-white/60" /></div>;
  if (!items.length)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-white/60">
        <Bell className="h-10 w-10" />
        <p className="font-semibold text-white">No activity yet</p>
        <p className="text-sm">Likes, comments and follows will show up here.</p>
      </div>
    );

  return (
    <ul className="min-h-0 flex-1 overflow-y-auto">
      {items.map((a) => {
        const [Icon, bg] = ICON[a.kind];
        return (
          <li key={a.id} className="flex items-center gap-3 px-4 py-3">
            <Link href={`/profile/${a.user.username}`} className="relative">
              <Avatar user={a.user} size={48} />
              <span className={`absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-black ${bg}`}>
                <Icon className="h-3 w-3" fill="currentColor" strokeWidth={0} />
              </span>
            </Link>
            <div className="min-w-0 flex-1 text-sm">
              <Link href={`/profile/${a.user.username}`} className="font-semibold">{a.user.username}</Link>{" "}
              <span className="text-white/75">
                {a.kind === "like" && "liked your video."}
                {a.kind === "comment" && <>commented: <span className="text-white">{a.text}</span></>}
                {a.kind === "follow" && "started following you."}
              </span>
              <span className="ml-1 text-white/45">{timeAgo(a.createdAt)}</span>
            </div>
            {a.video && (
              <Link href={`/watch?v=${a.video.id}`} className="h-14 w-10 shrink-0 overflow-hidden rounded bg-neutral-800">
                {a.video.thumbnailUrl ? <img src={a.video.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : <video src={`${a.video.url}#t=0.5`} muted preload="metadata" className="h-full w-full object-cover" />}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
