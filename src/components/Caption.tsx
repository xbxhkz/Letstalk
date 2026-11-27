import Link from "next/link";

/** Renders text with #hashtags and @mentions as links. */
export function Caption({ text, className = "" }: { text: string; className?: string }) {
  const parts = text.split(/([#@][\p{L}\p{N}_.]+)/gu);
  return (
    <p className={className}>
      {parts.map((p, i) => {
        if (p.startsWith("#") && p.length > 1)
          return (
            <Link key={i} href={`/discover?q=${encodeURIComponent(p.toLowerCase())}`} onClick={(e) => e.stopPropagation()} className="font-semibold hover:underline">
              {p}
            </Link>
          );
        if (p.startsWith("@") && p.length > 1)
          return (
            <Link key={i} href={`/profile/${p.slice(1).toLowerCase()}`} onClick={(e) => e.stopPropagation()} className="font-semibold hover:underline">
              {p}
            </Link>
          );
        return <span key={i}>{p}</span>;
      })}
    </p>
  );
}
