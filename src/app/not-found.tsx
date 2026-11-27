import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <p className="text-lg font-semibold">Couldn&apos;t find this page</p>
      <p className="text-sm text-white/60">The user or video may have been removed.</p>
      <Link href="/" className="mt-2 rounded-md bg-brand px-6 py-2.5 text-sm font-semibold">Back to feed</Link>
    </div>
  );
}
