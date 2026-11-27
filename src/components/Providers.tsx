"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CheckCircle2, AlertCircle } from "lucide-react";
import type { SessionUser } from "@/lib/auth";

type Unread = { followers: number; activity: number; system: number; messages: number; total: number };
type AuthCtx = { user: SessionUser | null; setUser: (u: SessionUser | null) => void; requireAuth: () => boolean; unread: Unread; refreshUnread: () => void };
type MuteCtx = { muted: boolean; setMuted: (m: boolean) => void };
type ToastCtx = { toast: (message: string, kind?: "success" | "error") => void };

const Auth = createContext<AuthCtx | null>(null);
const Mute = createContext<MuteCtx | null>(null);
const Toast = createContext<ToastCtx | null>(null);

export const useAuth = () => useContext(Auth)!;
export const useMute = () => useContext(Mute)!;
export const useToast = () => useContext(Toast)!;

const MUTE_KEY = "lt:muted";

export function Providers({ initialUser, children }: { initialUser: SessionUser | null; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(initialUser);
  useEffect(() => setUser(initialUser), [initialUser]);

  // New Google / code accounts must pick a username before using the app.
  useEffect(() => {
    if (user?.needsUsername && pathname !== "/onboarding") router.replace(`/onboarding?next=${encodeURIComponent(pathname)}`);
  }, [user, pathname, router]);

  const [unread, setUnread] = useState<Unread>({ followers: 0, activity: 0, system: 0, messages: 0, total: 0 });
  const refreshUnread = useCallback(() => {
    fetch("/api/inbox/unread").then((r) => r.json()).then(setUnread).catch(() => {});
  }, []);
  // Badge on the Inbox tab: refresh on navigation and every 15 s.
  useEffect(() => {
    if (!user) return setUnread({ followers: 0, activity: 0, system: 0, messages: 0, total: 0 });
    refreshUnread();
    const t = setInterval(refreshUnread, 15000);
    return () => clearInterval(t);
  }, [user, pathname, refreshUnread]);

  const requireAuth = useCallback(() => {
    if (user) return true;
    router.push(`/login?next=${encodeURIComponent(pathname)}`);
    return false;
  }, [user, router, pathname]);

  // Start muted (browsers block unmuted autoplay until a gesture); remember the viewer's choice.
  const [muted, setMutedState] = useState(true);
  useEffect(() => {
    try {
      const v = localStorage.getItem(MUTE_KEY);
      if (v !== null) setMutedState(v === "1");
    } catch {}
  }, []);
  const setMuted = useCallback((m: boolean) => {
    setMutedState(m);
    try { localStorage.setItem(MUTE_KEY, m ? "1" : "0"); } catch {}
  }, []);

  const [toastState, setToastState] = useState<{ id: number; message: string; kind: "success" | "error" } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useCallback((message: string, kind: "success" | "error" = "success") => {
    clearTimeout(timer.current);
    setToastState({ id: Date.now(), message, kind });
    timer.current = setTimeout(() => setToastState(null), 2200);
  }, []);

  return (
    <Auth.Provider value={{ user, setUser, requireAuth, unread, refreshUnread }}>
      <Mute.Provider value={{ muted, setMuted }}>
        <Toast.Provider value={{ toast }}>
          {children}
          {toastState && (
            <div key={toastState.id} role="status" className="pointer-events-none absolute left-1/2 top-24 z-[100] -translate-x-1/2 animate-fadeIn">
              <div className="flex items-center gap-2 whitespace-nowrap rounded-lg bg-neutral-800/95 px-4 py-2.5 text-sm font-medium shadow-xl">
                {toastState.kind === "success" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <AlertCircle className="h-4 w-4 text-brand" />}
                {toastState.message}
              </div>
            </div>
          )}
        </Toast.Provider>
      </Mute.Provider>
    </Auth.Provider>
  );
}
