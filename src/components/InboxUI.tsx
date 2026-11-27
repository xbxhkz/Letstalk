"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2 } from "lucide-react";

export function InboxHeader({ title, back = true, right }: { title: React.ReactNode; back?: boolean; right?: React.ReactNode }) {
  const router = useRouter();
  return (
    <header className="relative flex h-12 shrink-0 items-center justify-center border-b border-white/10 px-12 font-semibold">
      {back && (
        <button onClick={() => (history.length > 1 ? router.back() : router.push("/inbox"))} aria-label="Back" className="absolute left-2 p-1.5">
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      <span className="truncate">{title}</span>
      {right && <div className="absolute right-3 flex items-center">{right}</div>}
    </header>
  );
}

export function Spinner() {
  return <div className="flex flex-1 items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-white/60" /></div>;
}

export function VideoThumb({ video, className = "h-14 w-10" }: { video: { id: string; thumbnailUrl: string | null; url: string }; className?: string }) {
  return (
    <Link href={`/watch?v=${video.id}`} className={`shrink-0 overflow-hidden rounded bg-neutral-800 ${className}`}>
      {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : <video src={`${video.url}#t=0.5`} muted preload="metadata" className="h-full w-full object-cover" />}
    </Link>
  );
}

export function Badge({ n }: { n: number }) {
  if (!n) return null;
  return <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold">{n > 99 ? "99+" : n}</span>;
}
