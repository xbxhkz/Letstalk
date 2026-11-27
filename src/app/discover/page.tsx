import { getTrending } from "@/lib/trending";
import { Discover } from "./Discover";

export const dynamic = "force-dynamic";

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <Discover initialQuery={q ?? ""} trending={await getTrending(8)} />;
}
