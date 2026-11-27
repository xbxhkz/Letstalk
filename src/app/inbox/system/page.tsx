"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Inbox, ChevronRight } from "lucide-react";
import type { NoticeDTO } from "@/lib/types";
import { api } from "@/lib/client";
import { timeAgo } from "@/lib/format";
import { useAuth } from "@/components/Providers";
import { InboxHeader, Spinner } from "@/components/InboxUI";

export default function SystemPage() {
  const { user, requireAuth, refreshUnread } = useAuth();
  const [items, setItems] = useState<NoticeDTO[] | null>(null);

  useEffect(() => { requireAuth(); }, [requireAuth]);
  useEffect(() => {
    if (!user) return;
    api<{ items: NoticeDTO[] }>("/api/inbox/system").then((r) => {
      setItems(r.items);
      return api("/api/inbox/seen", { method: "POST", json: { section: "system" } });
    }).then(refreshUnread).catch(() => setItems((i) => i ?? []));
  }, [user, refreshUnread]);

  return (
    <div className="flex h-full flex-col">
      <InboxHeader title="System notifications" />
      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-white/60"><Inbox className="h-10 w-10" /><p className="text-sm">No notifications</p></div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {items.map((n) => {
            const body = (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{n.title}</p>
                  {!n.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
                </div>
                <p className="mt-1 text-sm text-white/70">{n.body}</p>
                <p className="mt-2 flex items-center justify-between text-xs text-white/40">{timeAgo(n.createdAt)}{n.link && <ChevronRight className="h-4 w-4" />}</p>
              </>
            );
            return (
              <li key={n.id} className="rounded-xl bg-neutral-900 p-4">
                {n.link ? <Link href={n.link} className="block">{body}</Link> : body}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
