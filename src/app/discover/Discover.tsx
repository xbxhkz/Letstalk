"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, X, Hash, Loader2, TrendingUp, Music2 } from "lucide-react";
import type { UserLite, VideoDTO } from "@/lib/types";
import type { SoundDTO } from "@/lib/sounds";
import { api } from "@/lib/client";
import { formatCount } from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import { VideoGrid } from "@/components/VideoGrid";

type Trend = { tag: string; videos: number; views: number };
type UserHit = UserLite & { bio: string; followers: number };

export function Discover({ initialQuery, trending, sounds }: { initialQuery: string; trending: Trend[]; sounds: SoundDTO[] }) {
  const [q, setQ] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  const [result, setResult] = useState<{ users: UserHit[]; videos: VideoDTO[] } | null>(null);
  const [loading, setLoading] = useState(true);

  // A #hashtag link clicked while already on /discover changes the prop, not the state.
  useEffect(() => setQ(initialQuery), [initialQuery]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    window.history.replaceState(null, "", debounced ? `/discover?q=${encodeURIComponent(debounced)}` : "/discover");
    api<{ users: UserHit[]; videos: VideoDTO[] }>(`/api/search?q=${encodeURIComponent(debounced)}`)
      .then((r) => alive && setResult(r))
      .catch(() => alive && setResult({ users: [], videos: [] }))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [debounced]);

  const watchHref = (v: VideoDTO) => `/watch?v=${v.id}${debounced ? `&q=${encodeURIComponent(debounced)}` : ""}`;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-3 pb-2 pt-3">
        <label className="flex h-10 items-center gap-2 rounded-lg bg-neutral-800 px-3">
          <Search className="h-4 w-4 text-white/50" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search videos, #hashtags, @users"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-white/40"
            aria-label="Search"
            enterKeyHint="search"
          />
          {q && (
            <button onClick={() => setQ("")} aria-label="Clear search" className="rounded-full bg-white/20 p-0.5"><X className="h-3.5 w-3.5" /></button>
          )}
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {!debounced && (
          <section className="px-3 pb-3 pt-1">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold"><TrendingUp className="h-4 w-4 text-brand" /> Trending hashtags</h2>
            <div className="flex flex-wrap gap-2">
              {trending.map((t) => (
                <button key={t.tag} onClick={() => setQ(`#${t.tag}`)} className="flex items-center gap-1.5 rounded-full border border-white/15 bg-neutral-900 py-1.5 pl-1.5 pr-3 text-sm hover:bg-neutral-800">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10"><Hash className="h-3.5 w-3.5" /></span>
                  <span className="font-semibold">{t.tag}</span>
                  <span className="text-xs text-white/50">{formatCount(t.views)}</span>
                </button>
              ))}
            </div>
          </section>
        )}
        {!debounced && sounds.length > 0 && (
          <section className="pb-3 pt-1">
            <h2 className="mb-2 flex items-center gap-1.5 px-3 text-sm font-bold"><Music2 className="h-4 w-4 text-brand-cyan" /> Trending sounds</h2>
            <div className="no-scrollbar flex gap-3 overflow-x-auto px-3">
              {sounds.map((s) => (
                <Link key={s.id} href={`/sound/${s.id}`} className="w-24 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {s.coverUrl ? <img src={s.coverUrl} alt="" className="h-24 w-24 rounded-lg object-cover" /> : <span className="flex h-24 w-24 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-cyan"><Music2 className="h-8 w-8" /></span>}
                  <p className="mt-1 truncate text-xs font-semibold">{s.title}</p>
                  <p className="truncate text-[11px] text-white/50">{formatCount(s.uses)} video{s.uses === 1 ? "" : "s"}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {loading && !result ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-white/60" /></div>
        ) : (
          <>
            {!!result?.users.length && (
              <section className="px-3 pb-3">
                <h2 className="mb-1 text-sm font-bold">Users</h2>
                <ul>
                  {result.users.map((u) => (
                    <li key={u.id}>
                      <Link href={`/profile/${u.username}`} className="flex items-center gap-3 rounded-lg py-2 hover:bg-white/5">
                        <Avatar user={u} size={44} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{u.username}</p>
                          <p className="truncate text-xs text-white/55">{u.displayName} · {formatCount(u.followers)} followers</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section>
              <h2 className="mb-2 px-3 text-sm font-bold">{debounced ? "Videos" : "Explore"}</h2>
              {result?.videos.length ? (
                <VideoGrid videos={result.videos} columns={2} showMeta hrefFor={watchHref} />
              ) : (
                <p className="px-3 py-10 text-center text-sm text-white/55">No results for “{debounced}”.</p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
