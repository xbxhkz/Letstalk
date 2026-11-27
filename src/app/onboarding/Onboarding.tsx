"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { api } from "@/lib/client";
import { useAuth } from "@/components/Providers";

type Availability = { available: boolean; reason?: string } | null;

export function Onboarding({ suggested, name, next }: { suggested: string; name: string; next: string }) {
  const router = useRouter();
  const { setUser } = useAuth();
  const [username, setUsername] = useState(suggested);
  const [displayName, setDisplayName] = useState(name === "New user" ? "" : name);
  const [avail, setAvail] = useState<Availability>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const u = username.trim().toLowerCase();
    setAvail(null);
    if (!u) return;
    const t = setTimeout(() => {
      api<{ available: boolean; reason?: string }>(`/api/auth/username?u=${encodeURIComponent(u)}`).then(setAvail).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [username]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = await api<{ user: Parameters<typeof setUser>[0] }>("/api/auth/username", { method: "POST", json: { username, displayName } });
      setUser(r.user);
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 pb-6">
      <h1 className="mt-14 text-center text-2xl font-bold">Create your profile</h1>
      <p className="mt-2 text-center text-sm text-white/60">Pick the username people will find you by. You can change your name and bio later.</p>
      <form onSubmit={save} className="mt-8 space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Username</span>
          <span className="flex h-12 items-center rounded-md bg-neutral-800 px-4 focus-within:ring-1 focus-within:ring-white/30">
            <span className="text-white/50">@</span>
            <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))} maxLength={24} autoCapitalize="none" autoComplete="username" autoFocus required className="h-full min-w-0 flex-1 bg-transparent pl-0.5 outline-none" />
            {avail === null ? (username ? <Loader2 className="h-4 w-4 animate-spin text-white/40" /> : null) : avail.available ? <Check className="h-5 w-5 text-emerald-400" aria-label="Available" /> : <X className="h-5 w-5 text-brand" aria-label="Not available" />}
          </span>
          <span className={`mt-1 block text-xs ${avail && !avail.available ? "text-brand" : "text-white/45"}`}>
            {avail && !avail.available ? (avail.reason ?? "That username is taken.") : "3–24 characters: letters, numbers, . or _"}
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Name</span>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} required placeholder="Your name" className="h-12 w-full rounded-md bg-neutral-800 px-4 outline-none placeholder:text-white/40 focus:ring-1 focus:ring-white/30" />
        </label>
        {error && <p role="alert" className="text-sm text-brand">{error}</p>}
        <button disabled={saving || !avail?.available || !displayName.trim()} className="flex h-12 w-full items-center justify-center rounded-md bg-brand font-semibold disabled:opacity-50">
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Continue"}
        </button>
      </form>
    </div>
  );
}
