"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Heart, MessageCircle, UserPlus, AtSign, Bell } from "lucide-react";
import type { Activity } from "@/lib/types";
import { api } from "@/lib/client";
import { timeAgo } from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/components/Providers";
import { InboxHeader, Spinner, VideoThumb } from "@/components/InboxUI";
import { activityText } from "../InboxHome";

const FILTERS = [
  ["all", "All activity"],
  ["likes", "Likes"],
  ["comments", "Comments"],
  ["mentions", "Mentions and tags"],
  ["followers", "Followers"],
] as const;
const ICON = { like: [Heart, "bg-brand"], comment_like: [Heart, "bg-brand"], comment: [MessageCircle, "bg-sky-500"], mention: [AtSign, "bg-amber-500"], follow: [UserPlus, "bg-violet-500"] } as const;

type Item = Activity & { isNew: boolean };

export default function ActivityPage() {
  const { user, requireAuth, refreshUnread } = useAuth();
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [items, setItems] = useState<Item[] | null>(null);
  const newIds = useRef(new Set<string>());

  useEffect(() => { requireAuth(); }, [requireAuth]);
  const marked = useRef(false);
  useEffect(() => {
    if (!user) return;
    setItems(null);
    api<{ items: Item[] }>(`/api/inbox/activity?type=${filter}`)
      .then((r) => {
        // Keep "New" flags from the first load for this whole visit, then mark Activity read.
        setItems(r.items.map((i) => ({ ...i, isNew: i.isNew || newIds.current.has(i.id) })));
        r.items.filter((i) => i.isNew).forEach((i) => newIds.current.add(i.id));
        if (!marked.current) {
          marked.current = true;
          return api("/api/inbox/seen", { method: "POST", json: { section: "activity" } }).then(refreshUnread);
        }
      })
      .catch(() => setItems((i) => i ?? []));
  }, [filter, user, refreshUnread]);

  const fresh = items?.filter((i) => i.isNew) ?? [];
  const earlier = items?.filter((i) => !i.isNew) ?? [];

  return (
    <div className="flex h-full flex-col">
      <InboxHeader title="Activity" />
      <div className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto px-3 py-2.5">
        {FILTERS.map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold ${filter === k ? "bg-white text-black" : "bg-neutral-800 text-white/80"}`}>{label}</button>
        ))}
      </div>
      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-white/60">
          <Bell className="h-10 w-10" />
          <p className="font-semibold text-white">Nothing here yet</p>
          <p className="text-sm">Activity on your videos will show up here.</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          {fresh.length > 0 && <Section title="New" items={fresh} />}
          {earlier.length > 0 && <Section title={fresh.length ? "Earlier" : "All activity"} items={earlier} />}
        </div>
      )}
    </div>
  );
}

function Section({ title, items }: { title: string; items: Item[] }) {
  return (
    <section>
      <h2 className="px-4 pb-1 pt-3 text-sm font-semibold text-white/60">{title}</h2>
      <ul>
        {items.map((a) => {
          const [Icon, bg] = ICON[a.kind];
          return (
            <li key={a.id} className={`flex items-center gap-3 px-4 py-2.5 ${a.isNew ? "bg-white/[0.04]" : ""}`}>
              <Link href={`/profile/${a.user.username}`} className="relative">
                <Avatar user={a.user} size={48} />
                <span className={`absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-black ${bg}`}>
                  <Icon className="h-3 w-3" fill={a.kind === "mention" ? "none" : "currentColor"} strokeWidth={a.kind === "mention" ? 3 : 0} />
                </span>
              </Link>
              <p className="min-w-0 flex-1 text-sm leading-snug">
                <Link href={`/profile/${a.user.username}`} className="font-semibold">{a.user.username}</Link>{" "}
                <span className="text-white/80">{activityText(a)}</span>
                <span className="ml-1 text-white/45">{timeAgo(a.createdAt)}</span>
              </p>
              {a.video && <VideoThumb video={a.video} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
