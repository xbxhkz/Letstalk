"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { UserLite } from "@/lib/types";
import { api } from "@/lib/client";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/components/Providers";
import { InboxHeader, Spinner } from "@/components/InboxUI";

type Friend = UserLite & { mutual?: boolean };

export default function NewMessagePage() {
  const { user, requireAuth } = useAuth();
  const [q, setQ] = useState("");
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [results, setResults] = useState<Friend[] | null>(null);

  useEffect(() => { requireAuth(); }, [requireAuth]);
  useEffect(() => {
    if (user) api<{ friends: Friend[] }>("/api/friends").then((r) => setFriends(r.friends)).catch(() => setFriends([]));
  }, [user]);
  useEffect(() => {
    const term = q.trim().replace(/^@/, "");
    if (!term) return setResults(null);
    const t = setTimeout(() => {
      api<{ users: Friend[] }>(`/api/search?q=${encodeURIComponent("@" + term)}`)
        .then((r) => setResults(r.users.filter((u) => u.id !== user?.id)))
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q, user]);

  const list = results ?? friends;
  return (
    <div className="flex h-full flex-col">
      <InboxHeader title="New message" />
      <div className="shrink-0 p-3">
        <label className="flex h-10 items-center gap-2 rounded-lg bg-neutral-800 px-3">
          <Search className="h-4 w-4 text-white/50" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users" aria-label="Search users" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-white/40" />
        </label>
      </div>
      <h2 className="px-4 pb-1 text-sm font-semibold text-white/60">{results ? "Results" : "Friends and people you follow"}</h2>
      {!list ? (
        <Spinner />
      ) : list.length === 0 ? (
        <p className="px-4 py-6 text-sm text-white/55">{results ? "No users found." : "Follow people to message them, or search above."}</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {list.map((u) => (
            <li key={u.id}>
              <Link href={`/inbox/chat/${u.username}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5">
                <Avatar user={u} size={44} />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{u.displayName}</p>
                  <p className="truncate text-sm text-white/55">@{u.username}{u.mutual ? " · Friends" : ""}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
