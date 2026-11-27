"use client";

import { useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { Feed } from "@/components/Feed";
import { TopBar, type FeedTab } from "@/components/TopBar";
import { useAuth } from "@/components/Providers";

export function HomeFeed() {
  const [tab, setTab] = useState<FeedTab>("foryou");
  const { user } = useAuth();
  return (
    <div className="relative h-full">
      <TopBar tab={tab} onTab={setTab} />
      {tab === "following" && !user ? (
        <Empty title="Watch your friends' videos" body="Log in to see videos from creators you follow." cta={{ href: "/login?next=/", label: "Log in" }} />
      ) : (
        <Feed
          key={`${tab}-${user?.id ?? "anon"}`}
          query={`feed=${tab}`}
          empty={
            tab === "following" ? (
              <EmptyInner title="No videos from people you follow" body="Follow creators from the For You feed or Discover to fill this tab." cta={{ href: "/discover", label: "Discover creators" }} />
            ) : (
              <EmptyInner title="No videos yet" body="Be the first to post one." cta={{ href: "/create", label: "Upload a video" }} />
            )
          }
        />
      )}
    </div>
  );
}

type EmptyProps = { title: string; body: string; cta: { href: string; label: string } };
function EmptyInner({ title, body, cta }: EmptyProps) {
  return (
    <>
      <Users className="h-12 w-12 text-white/40" />
      <p className="text-lg font-semibold text-white">{title}</p>
      <p className="text-sm">{body}</p>
      <Link href={cta.href} className="mt-2 rounded-md bg-brand px-6 py-2.5 text-sm font-semibold text-white">{cta.label}</Link>
    </>
  );
}
function Empty(p: EmptyProps) {
  return <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-white/70"><EmptyInner {...p} /></div>;
}
