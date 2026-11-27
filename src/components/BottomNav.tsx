"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Compass, Plus, MessageSquareText, User } from "lucide-react";
import { useAuth } from "./Providers";

export function BottomNav() {
  const pathname = usePathname();
  const { user, unread } = useAuth();
  const profileHref = user ? `/profile/${user.username}` : "/login?next=/profile";
  const isActive = (href: string) => (href === "/" ? pathname === "/" || pathname.startsWith("/watch") : pathname.startsWith(href));

  const item = (href: string, label: string, Icon: typeof Home, match = href, badge = 0) => {
    const active = isActive(match);
    return (
      <Link href={href} className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${active ? "text-white" : "text-white/55"}`} aria-current={active ? "page" : undefined} aria-label={badge ? `${label}, ${badge} unread` : undefined}>
        <span className="relative">
          <Icon className="h-6 w-6" strokeWidth={active ? 2.6 : 2} fill={active && label === "Home" ? "currentColor" : "none"} />
          {badge > 0 && (
            <span className="absolute -right-2.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold leading-none text-white ring-2 ring-black">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </span>
        {label}
      </Link>
    );
  };

  return (
    <nav className="z-40 flex h-14 shrink-0 items-stretch border-t border-white/10 bg-black pb-[env(safe-area-inset-bottom)]">
      {item("/", "Home", Home)}
      {item("/discover", "Discover", Compass)}
      <Link href="/create" aria-label="Create" className="flex flex-1 items-center justify-center">
        <span className="relative flex h-8 w-12 items-center justify-center">
          <span className="absolute inset-y-0 left-0 w-10 rounded-lg bg-brand-cyan" />
          <span className="absolute inset-y-0 right-0 w-10 rounded-lg bg-brand" />
          <span className="absolute inset-y-0 left-1 right-1 flex items-center justify-center rounded-lg bg-white">
            <Plus className="h-5 w-5 text-black" strokeWidth={3} />
          </span>
        </span>
      </Link>
      {item("/inbox", "Inbox", MessageSquareText, "/inbox", unread.total)}
      {item(profileHref, "Profile", User, "/profile")}
    </nav>
  );
}
