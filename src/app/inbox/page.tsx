import Link from "next/link";
import { MessageSquareText } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { Inbox } from "./Inbox";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const user = await getSessionUser();
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-center border-b border-white/10 font-semibold">Activity</header>
      {user ? (
        <Inbox />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center text-white/65">
          <MessageSquareText className="h-12 w-12 text-white/40" />
          <p className="text-lg font-semibold text-white">Your inbox</p>
          <p className="text-sm">Log in to see likes, comments and new followers.</p>
          <Link href="/login?next=/inbox" className="mt-2 rounded-md bg-brand px-8 py-2.5 text-sm font-semibold text-white">Log in</Link>
        </div>
      )}
    </div>
  );
}
