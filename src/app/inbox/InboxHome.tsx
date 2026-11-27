"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { UserPlus, Bell, Inbox as InboxIcon, SquarePen, Plus, ChevronRight, MessageCircle } from "lucide-react";
import type { Activity, InboxSummary } from "@/lib/types";
import { api } from "@/lib/client";
import { timeAgo } from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/components/Providers";
import { Badge, InboxHeader, Spinner } from "@/components/InboxUI";

export function activityText(a: Activity) {
  switch (a.kind) {
    case "like": return "liked your video.";
    case "comment": return `commented: ${a.text}`;
    case "comment_like": return `liked your comment: ${a.text}`;
    case "mention": return `mentioned you in a comment: ${a.text}`;
    case "follow": return "started following you.";
  }
}

export function InboxHome() {
  const { user, refreshUnread } = useAuth();
  const [data, setData] = useState<InboxSummary | null>(null);

  const load = useCallback(() => {
    api<InboxSummary>("/api/inbox").then(setData).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    refreshUnread();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load, refreshUnread]);

  return (
    <div className="flex h-full flex-col">
      <InboxHeader
        title="Inbox"
        back={false}
        right={<Link href="/inbox/new" aria-label="New message" className="p-1"><SquarePen className="h-5 w-5" /></Link>}
      />
      {!data ? (
        <Spinner />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Friends row */}
          <div className="no-scrollbar flex gap-4 overflow-x-auto px-4 py-4">
            <Link href="/create" className="flex w-16 shrink-0 flex-col items-center gap-1.5">
              <span className="relative">
                {user && <Avatar user={user} size={60} />}
                <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-cyan text-black ring-2 ring-black"><Plus className="h-3.5 w-3.5" strokeWidth={3} /></span>
              </span>
              <span className="w-full truncate text-center text-xs text-white/70">Create</span>
            </Link>
            {data.friends.map((f) => (
              <Link key={f.id} href={`/inbox/chat/${f.username}`} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                <span className={`rounded-full p-[2px] ${f.mutual ? "bg-gradient-to-tr from-brand to-brand-cyan" : "bg-white/15"}`}>
                  <Avatar user={f} size={56} className="ring-2 ring-black" />
                </span>
                <span className="w-full truncate text-center text-xs text-white/85">{f.displayName.split(" ")[0]}</span>
              </Link>
            ))}
          </div>

          {/* Notification categories */}
          <Row href="/inbox/followers" icon={<UserPlus className="h-6 w-6" />} color="bg-sky-500" title="New followers"
            subtitle={data.latestFollower ? `${data.latestFollower.username} started following you.` : "No new followers yet"} count={data.unread.followers} />
          <Row href="/inbox/activity" icon={<Bell className="h-6 w-6" fill="currentColor" />} color="bg-brand" title="Activity"
            subtitle={data.latestActivity ? `${data.latestActivity.user.username} ${activityText(data.latestActivity)}` : "Likes, comments and mentions show up here"} count={data.unread.activity} />
          <Row href="/inbox/system" icon={<InboxIcon className="h-6 w-6" />} color="bg-neutral-700" title="System notifications"
            subtitle={data.latestNotice ? `${data.latestNotice.title}` : "Updates from Letstalk"} count={data.unread.system} />

          {/* Conversations */}
          <h2 className="px-4 pb-1 pt-4 text-sm font-semibold text-white/60">Messages</h2>
          {data.conversations.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-8 py-8 text-center text-white/55">
              <MessageCircle className="h-9 w-9" />
              <p className="text-sm">Send a message or share a video with a friend to start chatting.</p>
              <Link href="/inbox/new" className="mt-1 rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white">New message</Link>
            </div>
          ) : (
            <ul>
              {data.conversations.map((c) => (
                <li key={c.user.id}>
                  <Link href={`/inbox/chat/${c.user.username}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5">
                    <Avatar user={c.user} size={56} />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-[15px] ${c.unread ? "font-bold" : "font-semibold"}`}>{c.user.displayName}</p>
                      <p className={`truncate text-sm ${c.unread ? "font-semibold text-white" : "text-white/55"}`}>
                        {c.last.senderId === user?.id ? "You: " : ""}
                        {c.last.video ? (c.last.text || "Shared a video") : c.last.text}
                        <span className="font-normal text-white/45"> · {timeAgo(c.last.createdAt)}</span>
                      </p>
                    </div>
                    {c.unread > 0 ? <Badge n={c.unread} /> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ href, icon, color, title, subtitle, count }: { href: string; icon: React.ReactNode; color: string; title: string; subtitle: string; count: number }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5">
      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${color}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">{title}</p>
        <p className={`truncate text-sm ${count ? "text-white" : "text-white/55"}`}>{subtitle}</p>
      </div>
      {count > 0 ? <Badge n={count} /> : <ChevronRight className="h-5 w-5 text-white/35" />}
    </Link>
  );
}
