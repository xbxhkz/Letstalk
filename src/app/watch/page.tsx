import { Feed } from "@/components/Feed";
import { TopBar } from "@/components/TopBar";

export const dynamic = "force-dynamic";

/**
 * /watch?v=<id>                                   one video, then the For You feed
 * /watch?v=<id>&feed=user&username=x&type=liked   a profile's grid as a feed
 * /watch?v=<id>&q=<search>                        search/discover results as a feed
 */
export default async function WatchPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const k of ["feed", "username", "type", "q", "tag"]) if (sp[k]) q.set(k, sp[k]!);
  if (!q.has("feed")) q.set("feed", "foryou");
  return (
    <div className="relative h-full">
      <TopBar back />
      <Feed query={q.toString()} initialId={sp.v} />
    </div>
  );
}
