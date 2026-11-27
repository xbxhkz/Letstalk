"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import type { UserLite } from "@/lib/types";
import { api } from "@/lib/client";
import { timeAgo } from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import { useAuth, useToast } from "@/components/Providers";
import { InboxHeader, Spinner } from "@/components/InboxUI";

type Item = { user: UserLite & { bio: string }; createdAt: string; isNew: boolean; followingBack: boolean };

export default function FollowersPage() {
  const { user, requireAuth, refreshUnread } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => { requireAuth(); }, [requireAuth]);
  useEffect(() => {
    if (!user) return;
    api<{ items: Item[] }>("/api/inbox/followers")
      .then((r) => {
        setItems(r.items);
        return api("/api/inbox/seen", { method: "POST", json: { section: "followers" } }).then(refreshUnread);
      })
      .catch(() => setItems((i) => i ?? []));
  }, [user, refreshUnread]);

  const toggle = async (it: Item) => {
    const next = !it.followingBack;
    setItems((cur) => cur?.map((x) => (x.user.id === it.user.id ? { ...x, followingBack: next } : x)) ?? cur);
    try {
      await api(`/api/users/${it.user.username}/follow`, { method: "POST", json: { follow: next } });
    } catch (e) {
      setItems((cur) => cur?.map((x) => (x.user.id === it.user.id ? { ...x, followingBack: !next } : x)) ?? cur);
      toast((e as Error).message, "error");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <InboxHeader title="New followers" />
      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-white/60">
          <UserPlus className="h-10 w-10" />
          <p className="font-semibold text-white">No followers yet</p>
          <p className="text-sm">When people follow you, you&apos;ll see them here.</p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {items.map((it) => (
            <li key={it.user.id} className={`flex items-center gap-3 px-4 py-2.5 ${it.isNew ? "bg-white/[0.04]" : ""}`}>
              <Link href={`/profile/${it.user.username}`}><Avatar user={it.user} size={48} /></Link>
              <Link href={`/profile/${it.user.username}`} className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{it.user.displayName}</p>
                <p className="truncate text-sm text-white/55">started following you. <span className="text-white/40">{timeAgo(it.createdAt)}</span></p>
              </Link>
              <button onClick={() => toggle(it)} className={`h-8 shrink-0 rounded-md px-4 text-sm font-semibold ${it.followingBack ? "bg-neutral-800 text-white" : "bg-brand text-white"}`}>
                {it.followingBack ? "Friends" : "Follow back"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
