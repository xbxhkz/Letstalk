"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { api } from "@/lib/client";
import { Avatar } from "@/components/Avatar";

type Demo = { username: string; displayName: string; avatarUrl: string | null };

export function LoginForm({ next, demoUsers }: { next: string; demoUsers: Demo[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const go = async (u = username, p = password) => {
    setLoading(true);
    setError(null);
    try {
      await api(`/api/auth/${mode === "login" ? "login" : "register"}`, { method: "POST", json: { username: u, password: p, displayName } });
      router.replace(next === "/profile" ? `/profile/${u.toLowerCase().replace(/^@/, "")}` : next);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="relative flex h-12 shrink-0 items-center justify-center">
        <button onClick={() => router.push("/")} aria-label="Close" className="absolute left-2 p-1.5"><X className="h-6 w-6" /></button>
      </header>
      <div className="flex flex-1 flex-col px-6 pb-6">
        <h1 className="mt-4 text-center text-2xl font-bold">{mode === "login" ? "Log in to Letstalk" : "Sign up for Letstalk"}</h1>
        <p className="mt-2 text-center text-sm text-white/60">Follow creators, like videos, comment and post your own.</p>

        <form onSubmit={(e) => { e.preventDefault(); go(); }} className="mt-8 space-y-3">
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" autoComplete="username" autoCapitalize="none" required className="h-12 w-full rounded-md bg-neutral-800 px-4 outline-none placeholder:text-white/40 focus:ring-1 focus:ring-white/30" />
          {mode === "register" && (
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name (optional)" className="h-12 w-full rounded-md bg-neutral-800 px-4 outline-none placeholder:text-white/40 focus:ring-1 focus:ring-white/30" />
          )}
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" autoComplete={mode === "login" ? "current-password" : "new-password"} required className="h-12 w-full rounded-md bg-neutral-800 px-4 outline-none placeholder:text-white/40 focus:ring-1 focus:ring-white/30" />
          {error && <p role="alert" className="text-sm text-brand">{error}</p>}
          <button disabled={loading} className="flex h-12 w-full items-center justify-center rounded-md bg-brand font-semibold disabled:opacity-60">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : mode === "login" ? "Log in" : "Sign up"}
          </button>
        </form>

        {mode === "login" && demoUsers.length > 0 && (
          <div className="mt-8">
            <p className="mb-3 text-center text-xs uppercase tracking-wide text-white/45">Or try a demo account</p>
            <div className="grid grid-cols-2 gap-2">
              {demoUsers.map((u) => (
                <button key={u.username} disabled={loading} onClick={() => { setUsername(u.username); setPassword("password123"); go(u.username, "password123"); }} className="flex items-center gap-2 rounded-md border border-white/10 bg-neutral-900 p-2 text-left hover:bg-neutral-800">
                  <Avatar user={u} size={32} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{u.displayName}</span>
                    <span className="block truncate text-xs text-white/50">@{u.username}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="mt-auto pt-8 text-center text-sm text-white/60">
          {mode === "login" ? "Don't have an account? " : "Already have an account? "}
          <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }} className="font-semibold text-brand">
            {mode === "login" ? "Sign up" : "Log in"}
          </button>
        </p>
      </div>
    </div>
  );
}
