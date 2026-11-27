import { useEffect, useRef, useState } from "react";
import { Search, X, Play, Pause, Music2, Upload, Loader2, Check, Scissors } from "lucide-react";
import { fmtTime, mediaUrl, studioGet, studioUpload, type Sound, type SoundPick, type StudioApi } from "./api";

type Tab = "popular" | "library" | "mine";

/** TikTok-style "Add sound" sheet: browse, search, preview, upload, then pick a start point. */
export function SoundPicker({ api, current, onPick, onClose }: { api: StudioApi; current: SoundPick | null; onPick: (p: SoundPick | null) => void; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("popular");
  const [q, setQ] = useState("");
  const [sounds, setSounds] = useState<Sound[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [trim, setTrim] = useState<SoundPick | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const a = new Audio();
    a.crossOrigin = "anonymous";
    a.onended = () => setPlaying(null);
    audio.current = a;
    return () => a.pause();
  }, []);

  useEffect(() => {
    let alive = true;
    setSounds(null);
    const t = setTimeout(() => {
      studioGet<{ sounds: Sound[] }>(api, `/api/sounds?tab=${tab}&q=${encodeURIComponent(q.trim())}`)
        .then((r) => alive && setSounds(r.sounds))
        .catch((e) => alive && (setSounds([]), setError((e as Error).message)));
    }, q ? 250 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [api, tab, q]);

  const preview = (s: Sound, fromMs = 0) => {
    const a = audio.current!;
    if (playing === s.id && !trim) {
      a.pause();
      setPlaying(null);
      return;
    }
    mediaUrl(api, s.url)
      .then((src) => {
        a.src = src!;
        a.currentTime = fromMs / 1000;
        return a.play();
      })
      .then(() => setPlaying(s.id))
      .catch(() => setError("Couldn't play this sound."));
  };

  const choose = (s: Sound) => {
    setTrim({ sound: s, startMs: current?.sound.id === s.id ? current.startMs : 0 });
    preview(s, current?.sound.id === s.id ? current.startMs : 0);
  };

  const upload = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    const url = URL.createObjectURL(f);
    const durationMs = await new Promise<number>((resolve) => {
      const a = new Audio();
      a.preload = "metadata";
      a.onloadedmetadata = () => resolve(isFinite(a.duration) ? a.duration * 1000 : 0);
      a.onerror = () => resolve(0);
      a.src = url;
    });
    URL.revokeObjectURL(url);
    if (!durationMs) return setError("That file couldn't be read as audio.");
    const fd = new FormData();
    fd.append("audio", f);
    fd.append("title", f.name.replace(/\.[^.]+$/, ""));
    fd.append("durationMs", String(Math.round(durationMs)));
    setUploading(0);
    try {
      const r = await studioUpload<{ sound: Sound }>(api, "/api/sounds", fd, setUploading);
      setTab("mine");
      choose(r.sound);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(null);
    }
  };

  const close = () => {
    audio.current?.pause();
    onClose();
  };

  // ---- trim step: choose where the video starts in the sound ----
  if (trim) {
    const maxStart = Math.max(0, trim.sound.durationMs - 5000);
    return (
      <Shell onClose={close} title="Choose the part you want">
        <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
          <Cover api={api} s={trim.sound} size={56} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{trim.sound.title}</p>
            <p className="truncate text-sm text-white/60">{trim.sound.artist}</p>
          </div>
          <button type="button" aria-label={playing ? "Pause preview" : "Play preview"} onClick={() => (playing ? (audio.current?.pause(), setPlaying(null)) : preview(trim.sound, trim.startMs))} className="rounded-full bg-white/10 p-2.5">
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>
        </div>
        {maxStart > 0 ? (
          <label className="mt-5 block">
            <span className="mb-2 flex items-center gap-1.5 text-sm text-white/70"><Scissors className="h-4 w-4" />Start at {fmtTime(trim.startMs)} of {fmtTime(trim.sound.durationMs)}</span>
            <input
              type="range"
              min={0}
              max={maxStart}
              step={250}
              value={trim.startMs}
              onChange={(e) => setTrim({ ...trim, startMs: Number(e.target.value) })}
              onPointerUp={() => preview(trim.sound, trim.startMs)}
              aria-label="Sound start"
              className="h-1 w-full accent-brand"
            />
          </label>
        ) : (
          <p className="mt-5 text-sm text-white/60">This sound is short, so it plays from the start.</p>
        )}
        <div className="mt-6 flex gap-2">
          <button type="button" onClick={() => { audio.current?.pause(); setPlaying(null); setTrim(null); }} className="h-11 flex-1 rounded-md bg-white/10 font-semibold">Back</button>
          <button type="button" onClick={() => { audio.current?.pause(); onPick(trim); onClose(); }} className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md bg-brand font-semibold"><Check className="h-5 w-5" />Use sound</button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell onClose={close} title="Add sound">
      <label className="flex h-10 items-center gap-2 rounded-lg bg-white/10 px-3">
        <Search className="h-4 w-4 text-white/50" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sounds" aria-label="Search sounds" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-white/40" />
        {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search"><X className="h-4 w-4" /></button>}
      </label>
      <div className="mt-3 flex items-center gap-4 text-sm font-semibold">
        {([["popular", "For you"], ["library", "Library"], ["mine", "My sounds"]] as const).map(([t, label]) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={tab === t ? "text-white" : "text-white/50"}>{label}</button>
        ))}
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading !== null} className="ml-auto flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs">
          {uploading !== null ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{Math.round(uploading * 100)}%</> : <><Upload className="h-3.5 w-3.5" />Upload a sound</>}
        </button>
        <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-brand">{error}</p>}
      {current && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-brand/15 px-3 py-2 text-sm">
          <Music2 className="h-4 w-4 shrink-0 text-brand" />
          <span className="min-w-0 flex-1 truncate">Using <b>{current.sound.title}</b></span>
          <button type="button" onClick={() => { onPick(null); close(); }} className="font-semibold text-brand">Remove</button>
        </div>
      )}
      <ul className="mt-2 max-h-[46vh] overflow-y-auto">
        {!sounds ? (
          <li className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-white/50" /></li>
        ) : sounds.length === 0 ? (
          <li className="py-8 text-center text-sm text-white/55">{tab === "mine" ? "Sounds you upload appear here." : "No sounds found."}</li>
        ) : (
          sounds.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2">
              <button type="button" onClick={() => preview(s)} aria-label={`${playing === s.id ? "Pause" : "Play"} ${s.title}`} className="relative shrink-0">
                <Cover api={api} s={s} size={52} />
                <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/30">{playing === s.id ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}</span>
              </button>
              <button type="button" onClick={() => preview(s)} className="min-w-0 flex-1 text-left">
                <p className="truncate font-semibold">{s.title}</p>
                <p className="truncate text-xs text-white/55">{s.artist} · {fmtTime(s.durationMs)}{s.genre ? ` · ${s.genre}` : ""}{s.uses ? ` · ${s.uses} video${s.uses === 1 ? "" : "s"}` : ""}</p>
              </button>
              <button type="button" onClick={() => choose(s)} className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-sm font-semibold">Use</button>
            </li>
          ))
        )}
      </ul>
    </Shell>
  );
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div className="relative animate-slideUp rounded-t-2xl bg-neutral-900 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-2">
        <div className="relative flex h-11 items-center justify-center text-sm font-semibold">
          {title}
          <button type="button" onClick={onClose} aria-label="Close sounds" className="absolute right-0 p-1.5"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Cover({ api, s, size }: { api: StudioApi; s: Pick<Sound, "coverUrl" | "title">; size: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    mediaUrl(api, s.coverUrl).then((u) => alive && setSrc(u)).catch(() => {});
    return () => { alive = false; };
  }, [api, s.coverUrl]);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className="rounded-md object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="flex items-center justify-center rounded-md bg-gradient-to-br from-brand to-brand-cyan" style={{ width: size, height: size }}><Music2 className="h-1/2 w-1/2" /></span>
  );
}
