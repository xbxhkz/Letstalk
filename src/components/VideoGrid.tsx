/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Play, Heart } from "lucide-react";
import type { VideoDTO } from "@/lib/types";
import { formatCount } from "@/lib/format";
import { Avatar } from "./Avatar";

export function VideoGrid({ videos, hrefFor, columns = 3, showMeta = false }: { videos: VideoDTO[]; hrefFor: (v: VideoDTO) => string; columns?: 2 | 3; showMeta?: boolean }) {
  return (
    <div className={`grid gap-[2px] ${columns === 3 ? "grid-cols-3" : "grid-cols-2 gap-2 px-2"}`}>
      {videos.map((v) => (
        <Link key={v.id} href={hrefFor(v)} className="group block">
          <div className={`relative aspect-[9/16] overflow-hidden bg-neutral-900 ${columns === 2 ? "rounded-md" : ""}`}>
            {v.thumbnailUrl ? (
              <img src={v.thumbnailUrl} alt={v.caption} loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
            ) : (
              <video src={`${v.url}#t=0.5`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
            )}
            <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-6 text-xs font-semibold">
              {columns === 3 ? <Play className="h-3.5 w-3.5" fill="currentColor" /> : <Heart className="h-3.5 w-3.5" />}
              {formatCount(columns === 3 ? v.views : v.likes)}
            </div>
          </div>
          {showMeta && (
            <div className="px-0.5 pb-2 pt-1.5">
              <p className="line-clamp-2 text-[13px] leading-snug">{v.caption}</p>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-white/60">
                <Avatar user={v.author} size={16} />
                <span className="truncate">{v.author.username}</span>
              </div>
            </div>
          )}
        </Link>
      ))}
    </div>
  );
}
