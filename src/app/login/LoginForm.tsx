"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X, ChevronLeft, Smartphone, Mail, User } from "lucide-react";
import { api } from "@/lib/client";
import { Avatar } from "@/components/Avatar";

type Demo = { username: string; displayName: string; avatarUrl: string | null };
type Step = "choose" | "phone" | "email" | "code" | "password" | "register";
type Channel = "sms" | "email";

const RESEND_SECONDS = 30;

export function LoginForm({ next, demoUsers, googleEnabled, initialError }: { next: string; demoUsers: Demo[]; googleEnabled: boolean; initialError: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("choose");
  const [channel, setChannel] = useState<Channel>("sms");
  const [target, setTarget] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const go = (s: Step) => {
    setError(null);
    setStep(s);
  };

  const finish = (needsUsername: boolean, usernameForProfile?: string) => {
    const dest = next === "/profile" && usernameForProfile ? `/profile/${usernameForProfile}` : next;
    router.replace(needsUsername ? `/onboarding?next=${encodeURIComponent(dest)}` : dest);
    router.refresh();
  };

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ target: string; devCode?: string }>("/api/auth/otp/start", { method: "POST", json: { channel, target } });
      setSentTo(r.target);
      setDevCode(r.devCode ?? null);
      setCode("");
      setResendIn(RESEND_SECONDS);
      setStep("code");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const verify = async (value = code) => {
    if (value.length !== 6 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ user: { username: string }; needsUsername: boolean }>("/api/auth/otp/verify", { method: "POST", json: { channel, target: sentTo, code: value } });
      finish(r.needsUsername, r.user.username);
    } catch (err) {
      setError((err as Error).message);
      setCode("");
      setLoading(false);
    }
  };

  const passwordAuth = async (mode: "login" | "register", u = username, p = password) => {
    setLoading(true);
    setError(null);
    try {
      await api(`/api/auth/${mode}`, { method: "POST", json: { username: u, password: p, displayName } });
      finish(false, u.toLowerCase().replace(/^@/, ""));
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  };

  const back = step === "code" ? (channel === "sms" ? "phone" : "email") : step === "register" ? "password" : "choose";
  const title =
    step === "choose" ? "Log in to Letstalk"
    : step === "phone" ? "Use your phone"
    : step === "email" ? "Use your email"
    : step === "code" ? "Enter the 6-digit code"
    : step === "register" ? "Sign up with a username"
    : "Log in with a username";

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="relative flex h-12 shrink-0 items-center justify-center">
        {step === "choose" ? (
          <button onClick={() => router.push("/")} aria-label="Close" className="absolute left-2 p-1.5"><X className="h-6 w-6" /></button>
        ) : (
          <button onClick={() => go(back)} aria-label="Back" className="absolute left-2 p-1.5"><ChevronLeft className="h-6 w-6" /></button>
        )}
      </header>

      <div className="flex flex-1 flex-col px-6 pb-6">
        <h1 className="mt-4 text-center text-2xl font-bold">{title}</h1>
        {step === "choose" && <p className="mt-2 text-center text-sm text-white/60">Follow creators, like videos, comment and post your own. New here? Any option below creates your account.</p>}
        {step === "code" && (
          <p className="mt-2 text-center text-sm text-white/60">
            We sent a code to <span className="font-semibold text-white">{sentTo}</span>. It expires in 10 minutes.
          </p>
        )}

        {error && <p role="alert" className="mt-5 rounded-md bg-brand/15 px-3 py-2 text-sm text-brand">{error}</p>}

        {step === "choose" && (
          <>
            <div className="mt-6 space-y-3">
              {googleEnabled ? (
                <a href={`/api/auth/google/start?next=${encodeURIComponent(next)}`} className="relative flex h-12 w-full items-center justify-center rounded-md bg-white font-semibold text-black">
                  <GoogleMark className="absolute left-4 h-5 w-5" /> Continue with Google
                </a>
              ) : (
                <div className="relative flex h-12 w-full cursor-not-allowed items-center justify-center rounded-md bg-white/40 font-semibold text-black/70" aria-disabled="true" title="Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server">
                  <GoogleMark className="absolute left-4 h-5 w-5 opacity-60" /> Continue with Google
                  <span className="absolute -bottom-5 left-0 right-0 text-center text-[11px] font-normal text-white/45">Not set up on this server yet</span>
                </div>
              )}
              <MethodButton icon={Smartphone} label="Use phone" onClick={() => { setChannel("sms"); setTarget(""); go("phone"); }} className={googleEnabled ? "" : "!mt-8"} />
              <MethodButton icon={Mail} label="Use email" onClick={() => { setChannel("email"); setTarget(""); go("email"); }} />
              <MethodButton icon={User} label="Use username and password" onClick={() => go("password")} />
            </div>

            {demoUsers.length > 0 && (
              <div className="mt-8">
                <p className="mb-3 text-center text-xs uppercase tracking-wide text-white/45">Or try a demo account</p>
                <div className="grid grid-cols-2 gap-2">
                  {demoUsers.map((u) => (
                    <button key={u.username} disabled={loading} onClick={() => passwordAuth("login", u.username, "password123")} className="flex items-center gap-2 rounded-md border border-white/10 bg-neutral-900 p-2 text-left hover:bg-neutral-800">
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
            <p className="mt-auto pt-8 text-center text-xs text-white/40">By continuing you agree to use Letstalk responsibly.</p>
          </>
        )}

        {(step === "phone" || step === "email") && (
          <form onSubmit={sendCode} className="mt-8 space-y-3">
            <input
              key={step}
              autoFocus
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              type={step === "email" ? "email" : "tel"}
              inputMode={step === "email" ? "email" : "tel"}
              autoComplete={step === "email" ? "email" : "tel"}
              autoCapitalize="none"
              placeholder={step === "email" ? "you@example.com" : "+1 555 123 4567"}
              aria-label={step === "email" ? "Email address" : "Phone number"}
              required
              className="h-12 w-full rounded-md bg-neutral-800 px-4 text-[17px] outline-none placeholder:text-white/40 focus:ring-1 focus:ring-white/30"
            />
            {step === "phone" && <p className="text-xs text-white/45">Include your country code. Numbers without one are treated as US/Canada. Message and data rates may apply.</p>}
            <button disabled={loading || !target.trim()} className="flex h-12 w-full items-center justify-center rounded-md bg-brand font-semibold disabled:opacity-50">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Send code"}
            </button>
          </form>
        )}

        {step === "code" && (
          <div className="mt-8 space-y-4">
            {devCode && (
              <p className="rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
                Dev mode: no {channel === "sms" ? "SMS" : "email"} provider is configured, so here is the code: <button className="font-mono font-bold underline" onClick={() => { setCode(devCode); verify(devCode); }}>{devCode}</button>
              </p>
            )}
            <CodeInput value={code} onChange={(v) => { setCode(v); if (v.length === 6) verify(v); }} disabled={loading} />
            <button onClick={() => verify()} disabled={loading || code.length !== 6} className="flex h-12 w-full items-center justify-center rounded-md bg-brand font-semibold disabled:opacity-50">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Continue"}
            </button>
            <p className="text-center text-sm text-white/60">
              Didn&apos;t get it?{" "}
              {resendIn > 0 ? <span>Resend in {resendIn}s</span> : <button onClick={() => sendCode()} disabled={loading} className="font-semibold text-brand">Resend code</button>}
            </p>
          </div>
        )}

        {(step === "password" || step === "register") && (
          <form onSubmit={(e) => { e.preventDefault(); passwordAuth(step === "password" ? "login" : "register"); }} className="mt-8 space-y-3">
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" autoComplete="username" autoCapitalize="none" required className="h-12 w-full rounded-md bg-neutral-800 px-4 outline-none placeholder:text-white/40 focus:ring-1 focus:ring-white/30" />
            {step === "register" && (
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name (optional)" className="h-12 w-full rounded-md bg-neutral-800 px-4 outline-none placeholder:text-white/40 focus:ring-1 focus:ring-white/30" />
            )}
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" autoComplete={step === "password" ? "current-password" : "new-password"} required className="h-12 w-full rounded-md bg-neutral-800 px-4 outline-none placeholder:text-white/40 focus:ring-1 focus:ring-white/30" />
            <button disabled={loading} className="flex h-12 w-full items-center justify-center rounded-md bg-brand font-semibold disabled:opacity-60">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : step === "password" ? "Log in" : "Sign up"}
            </button>
            <p className="pt-4 text-center text-sm text-white/60">
              {step === "password" ? "No account? " : "Already have one? "}
              <button type="button" onClick={() => go(step === "password" ? "register" : "password")} className="font-semibold text-brand">
                {step === "password" ? "Sign up with a username" : "Log in"}
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

function MethodButton({ icon: Icon, label, onClick, className = "" }: { icon: typeof Mail; label: string; onClick: () => void; className?: string }) {
  return (
    <button onClick={onClick} className={`relative flex h-12 w-full items-center justify-center rounded-md border border-white/15 bg-neutral-900 font-semibold hover:bg-neutral-800 ${className}`}>
      <Icon className="absolute left-4 h-5 w-5" /> {label}
    </button>
  );
}

/** Six boxes backed by one input, so paste and SMS autofill (autocomplete="one-time-code") work. */
function CodeInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <label className="relative block cursor-text" onClick={() => ref.current?.focus()}>
      <span className="sr-only">6-digit code</span>
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        disabled={disabled}
        aria-label="6-digit code"
        className="absolute inset-0 h-full w-full opacity-0"
      />
      <span className="grid grid-cols-6 gap-2" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={`flex h-14 items-center justify-center rounded-md bg-neutral-800 text-2xl font-bold ${i === value.length && !disabled ? "ring-2 ring-white/60" : ""}`}>
            {value[i] ?? ""}
          </span>
        ))}
      </span>
    </label>
  );
}

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
