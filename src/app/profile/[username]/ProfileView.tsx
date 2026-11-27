"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Grid3x3, Heart, LogOut, Loader2, ChevronLeft, X, Lock } from "lucide-react";
import type { VideoDTO } from "@/lib/types";
import type { ProfileDTO } from "@/lib/profile";
import { api } from "@/lib/client";
import { formatCount } from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import { VideoGrid } from "@/components/VideoGrid";
import { useAuth, useToast } from "@/components/Providers";

type Tab = "posted" | "liked";

export function ProfileView({ initialProfile, initialPosted }: { initialProfile: ProfileDTO; initialPosted: VideoDTO[] }) {
  const router = useRouter();
  const { requireAuth, setUser } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState(initialProfile);
  const [tab, setTab] = useState<Tab>("posted");
  const [liked, setLiked] = useState<VideoDTO[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => setProfile(initialProfile), [initialProfile]);
  useEffect(() => {
    if (tab !== "liked" || liked) return;
    api<{ videos: VideoDTO[] }>(`/api/videos?feed=user&username=${profile.username}&type=liked`).then((r) => setLiked(r.videos)).catch(() => setLiked([]));
  }, [tab, liked, profile.username]);

  const toggleFollow = async () => {
    if (!requireAuth() || busy) return;
    const next = !profile.followedByMe;
    setBusy(true);
    setProfile((p) => ({ ...p, followedByMe: next, followers: p.followers + (next ? 1 : -1) }));
    try {
      const r = await api<{ following: boolean; followers: number }>(`/api/users/${profile.username}/follow`, { method: "POST", json: { follow: next } });
      setProfile((p) => ({ ...p, followedByMe: r.following, followers: r.followers }));
    } catch (e) {
      setProfile((p) => ({ ...p, followedByMe: !next, followers: p.followers + (next ? -1 : 1) }));
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/");
    router.refresh();
  };

  const list = tab === "posted" ? initialPosted : liked;
  const hrefFor = (v: VideoDTO) => `/watch?v=${v.id}&feed=user&username=${profile.username}&type=${tab}`;

  return (
    <div className="h-full overflow-y-auto">
      <header className="sticky top-0 z-10 flex h-12 items-center justify-center bg-black/90 font-semibold backdrop-blur">
        <button onClick={() => (history.length > 1 ? router.back() : router.push("/"))} aria-label="Back" className="absolute left-2 p-1.5"><ChevronLeft className="h-6 w-6" /></button>
        {profile.displayName}
        {profile.isMe && (
          <button onClick={logout} aria-label="Log out" className="absolute right-3 flex items-center gap-1 text-xs font-medium text-white/70"><LogOut className="h-4 w-4" /> Log out</button>
        )}
      </header>

      <section className="flex flex-col items-center px-4 pb-4 pt-3 text-center">
        <Avatar user={profile} size={96} />
        <h1 className="mt-3 text-lg font-bold">@{profile.username}</h1>
        <div className="mt-4 flex items-center gap-6">
          {([["Following", profile.following], ["Followers", profile.followers], ["Likes", profile.likes]] as const).map(([label, n]) => (
            <div key={label} className="flex min-w-[4.5rem] flex-col items-center">
              <span className="text-[17px] font-bold">{formatCount(n)}</span>
              <span className="text-[13px] text-white/60">{label}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          {profile.isMe ? (
            <button onClick={() => setEditing(true)} className="h-10 rounded-md bg-neutral-800 px-8 text-sm font-semibold hover:bg-neutral-700">Edit profile</button>
          ) : (
            <>
              <button onClick={toggleFollow} disabled={busy} className={`h-10 w-36 rounded-md text-sm font-semibold transition-colors ${profile.followedByMe ? "bg-neutral-800 hover:bg-neutral-700" : "bg-brand hover:bg-brand/90"}`}>
                {profile.followedByMe ? "Following" : "Follow"}
              </button>
              <button onClick={() => requireAuth() && router.push(`/inbox/chat/${profile.username}`)} className="h-10 rounded-md bg-neutral-800 px-5 text-sm font-semibold hover:bg-neutral-700">
                Message
              </button>
            </>
          )}
        </div>
        {profile.bio && <p className="mt-4 max-w-xs whitespace-pre-line text-sm">{profile.bio}</p>}
      </section>

      <div className="sticky top-12 z-10 flex border-b border-white/10 bg-black" role="tablist">
        {([["posted", Grid3x3, "Posted videos"], ["liked", Heart, "Liked videos"]] as const).map(([t, Icon, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} aria-label={label} onClick={() => setTab(t)} className={`relative flex flex-1 justify-center py-3 ${tab === t ? "text-white" : "text-white/45"}`}>
            <Icon className="h-5 w-5" />
            {tab === t && <span className="absolute bottom-0 h-0.5 w-14 bg-white" />}
          </button>
        ))}
      </div>

      {!list ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-white/60" /></div>
      ) : list.length ? (
        <VideoGrid videos={list} hrefFor={hrefFor} />
      ) : (
        <div className="flex flex-col items-center gap-2 px-8 py-14 text-center text-white/60">
          {tab === "posted" ? <Grid3x3 className="h-10 w-10" /> : <Lock className="h-10 w-10" />}
          <p className="font-semibold text-white">{tab === "posted" ? "No videos yet" : "No liked videos yet"}</p>
          <p className="text-sm">{tab === "posted" ? (profile.isMe ? "Tap + to post your first video." : "Nothing posted so far.") : "Videos liked will show up here."}</p>
        </div>
      )}

      {editing && (
        <EditProfile
          profile={profile}
          onClose={() => setEditing(false)}
          onSaved={(u) => {
            setProfile((p) => ({ ...p, displayName: u.displayName, bio: u.bio }));
            setUser({ ...u, needsUsername: false });
            setEditing(false);
            toast("Profile updated");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

type SavedUser = { id: string; username: string; displayName: string; bio: string; avatarUrl: string | null };

function EditProfile({ profile, onClose, onSaved }: { profile: ProfileDTO; onClose: () => void; onSaved: (u: SavedUser) => void }) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api<{ user: SavedUser }>("/api/users/me", { method: "PATCH", json: { displayName, bio } });
      onSaved(r.user);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };
  return (
    <div className="absolute inset-0 z-50" role="dialog" aria-modal="true" aria-label="Edit profile">
      <button className="absolute inset-0 animate-fadeIn bg-black/50" onClick={onClose} aria-label="Close" />
      <form onSubmit={save} className="absolute inset-x-0 bottom-0 animate-slideUp space-y-4 rounded-t-2xl bg-neutral-900 p-4">
        <div className="relative flex items-center justify-center font-semibold">
          <button type="button" onClick={onClose} className="absolute left-0 p-1" aria-label="Cancel"><X className="h-5 w-5" /></button>
          Edit profile
        </div>
        <label className="block">
          <span className="mb-1 block text-sm text-white/60">Name</span>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} className="h-11 w-full rounded-lg bg-neutral-800 px-3 outline-none focus:ring-1 focus:ring-white/30" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-white/60">Bio</span>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={160} rows={3} className="w-full resize-none rounded-lg bg-neutral-800 p-3 outline-none focus:ring-1 focus:ring-white/30" />
          <span className="block text-right text-xs text-white/40">{bio.length}/160</span>
        </label>
        {error && <p role="alert" className="text-sm text-brand">{error}</p>}
        <button disabled={saving} className="h-11 w-full rounded-md bg-brand font-semibold disabled:opacity-60">{saving ? "Saving…" : "Save"}</button>
      </form>
    </div>
  );
}
