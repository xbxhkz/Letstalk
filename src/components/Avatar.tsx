/* eslint-disable @next/next/no-img-element */
import type { UserLite } from "@/lib/types";

const COLORS = ["#fe2c55", "#25f4ee", "#a855f7", "#22c55e", "#f59e0b", "#3b82f6"];

export function Avatar({ user, size = 40, className = "" }: { user: Pick<UserLite, "username" | "displayName" | "avatarUrl">; size?: number; className?: string }) {
  const style = { width: size, height: size };
  if (user.avatarUrl)
    return <img src={user.avatarUrl} alt={`@${user.username}`} style={style} className={`shrink-0 rounded-full object-cover ${className}`} />;
  const color = COLORS[[...user.username].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
  return (
    <span aria-label={`@${user.username}`} style={{ ...style, background: color, fontSize: size * 0.45 }} className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${className}`}>
      {(user.displayName || user.username)[0]?.toUpperCase()}
    </span>
  );
}
