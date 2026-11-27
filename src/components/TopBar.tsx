"use client";

import Link from "next/link";
import { Search, ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export type FeedTab = "following" | "foryou";

export function TopBar({ tab, onTab, back }: { tab?: FeedTab; onTab?: (t: FeedTab) => void; back?: boolean }) {
  const router = useRouter();
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-14 items-center justify-center px-3 pt-[env(safe-area-inset-top)]">
      {back && (
        <button onClick={() => (history.length > 1 ? router.back() : router.push("/"))} aria-label="Back" className="pointer-events-auto absolute left-2 rounded-full p-1.5 drop-shadow-icon">
          <ChevronLeft className="h-7 w-7" />
        </button>
      )}
      {onTab && (
        <nav className="pointer-events-auto flex items-center gap-5 text-[17px] font-semibold text-shadow" role="tablist">
          {(["following", "foryou"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => onTab(t)} className={`relative pb-1.5 transition-colors ${tab === t ? "text-white" : "text-white/60"}`}>
              {t === "following" ? "Following" : "For You"}
              {tab === t && <span className="absolute bottom-0 left-1/2 h-[3px] w-7 -translate-x-1/2 rounded-full bg-white" />}
            </button>
          ))}
        </nav>
      )}
      <Link href="/discover" aria-label="Search" className="pointer-events-auto absolute right-3 rounded-full p-1.5 drop-shadow-icon">
        <Search className="h-6 w-6" strokeWidth={2.5} />
      </Link>
    </header>
  );
}
