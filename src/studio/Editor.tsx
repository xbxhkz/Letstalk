import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Type, Sticker, Sparkles, Volume2, Trash2, AlignLeft, AlignCenter, AlignRight, Loader2, Music2 } from "lucide-react";
import { Compositor, OUT_H, OUT_W, type Look } from "./compositor";
import { exportVideo, type Segment } from "./recorder";
import { STICKERS, TEXT_COLORS, TEXT_STYLES, hitTest, newId, type Overlay, type TextOverlay } from "./overlays";
import { EffectStrip, FilterStrip, RailButton, Sheet, Slider } from "./ui";
import { mediaUrl, type SoundPick, type StudioApi } from "./api";

type Panel = "stickers" | "filters" | "volume" | null;

export function Editor({
  segments,
  look: initialLook,
  original,
  onBack,
  onNext,
  api,
  sound,
  initialOriginalVolume = 1,
  onPickSound,
}: {
  segments: Segment[];
  look: Look;
  /** An imported gallery file: posted as-is if nothing is changed. */
  original?: File;
  onBack: () => void;
  onNext: (file: File) => void;
  api: StudioApi;
  sound: SoundPick | null;
  /** 0 when the clips were recorded with the added sound playing (the mic mostly caught speaker bleed). */
  initialOriginalVolume?: number;
  onPickSound: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const [look, setLook] = useState(initialLook);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [volume, setVolume] = useState(initialOriginalVolume);
  const [musicVolume, setMusicVolume] = useState(1);
  const [panel, setPanel] = useState<Panel>(null);
  const [filterTab, setFilterTab] = useState<"filters" | "effects" | "beauty">("filters");
  const [editing, setEditing] = useState<TextOverlay | null>(null);
  const [dragging, setDragging] = useState<{ id: string; overTrash: boolean } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seg, setSeg] = useState(0);

  const state = useRef({ look, overlays, editingId: null as string | null });
  state.current = { look, overlays, editingId: editing?.id ?? null };

  // ---- preview: loop through clips at their speeds, render through the compositor ----
  useEffect(() => {
    const v = videoRef.current!;
    const s = segments[seg % segments.length];
    v.src = s.url;
    v.playbackRate = s.speed;
    (v as HTMLVideoElement & { preservesPitch?: boolean }).preservesPitch = true;
    v.volume = volume;
    v.play().catch(() => {
      v.muted = true; // autoplay with sound blocked: preview silently
      v.play().catch(() => {});
    });
    // Keep the added sound in step: jump to where this clip sits in the final video.
    const m = musicRef.current;
    if (m && sound) {
      const i = seg % segments.length;
      const before = segments.slice(0, i).reduce((t, x) => t + x.durationMs / x.speed, 0);
      m.currentTime = (sound.startMs + before) / 1000;
      m.play().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seg, segments, sound]);

  // The added sound's preview player.
  useEffect(() => {
    if (!sound) return;
    const m = new Audio();
    m.preload = "auto";
    m.volume = musicVolume;
    musicRef.current = m;
    mediaUrl(api, sound.sound.url)
      .then((src) => {
        if (!src || musicRef.current !== m) return;
        m.src = src;
        const v = videoRef.current;
        if (v && !v.paused) {
          const i = seg % segments.length;
          const before = segments.slice(0, i).reduce((t, x) => t + x.durationMs / x.speed, 0);
          m.currentTime = (sound.startMs + before + (v.currentTime * 1000) / segments[i].speed) / 1000;
          m.play().catch(() => {});
        }
      })
      .catch(() => {});
    return () => {
      m.pause();
      musicRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, sound]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume]);
  useEffect(() => {
    if (musicRef.current) musicRef.current.volume = musicVolume;
  }, [musicVolume]);

  useEffect(() => {
    const comp = new Compositor(canvasRef.current!);
    let raf = 0;
    const loop = () => {
      const v = videoRef.current;
      // Hide the overlay being edited (it's shown in the text editor instead).
      const shown = state.current.editingId ? state.current.overlays.filter((o) => o.id !== state.current.editingId) : state.current.overlays;
      if (v && v.readyState >= 2) comp.render(v, state.current.look, shown, v.currentTime);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---- overlay gestures: drag, pinch to scale/rotate, tap text to edit, drop on trash to delete ----
  const gesture = useRef<{
    id: string | null;
    pointers: Map<number, { x: number; y: number }>;
    start: { x: number; y: number; scale: number; rotation: number; dist: number; angle: number; px: number; py: number; t: number };
    moved: boolean;
  }>({ id: null, pointers: new Map(), start: { x: 0, y: 0, scale: 1, rotation: 0, dist: 0, angle: 0, px: 0, py: 0, t: 0 }, moved: false });

  const toFrame = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * OUT_W, y: ((e.clientY - r.top) / r.height) * OUT_H };
  };

  const updateOverlay = (id: string, patch: Partial<Overlay>) => setOverlays((os) => os.map((o) => (o.id === id ? ({ ...o, ...patch } as Overlay) : o)));

  const onPointerDown = (e: React.PointerEvent) => {
    const g = gesture.current;
    const p = toFrame(e);
    g.pointers.set(e.pointerId, p);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (g.pointers.size === 1) {
      const ctx = canvasRef.current!.getContext("2d")!;
      const hit = hitTest(ctx, overlays, OUT_W, OUT_H, p.x, p.y);
      g.id = hit?.id ?? null;
      g.moved = false;
      if (hit) {
        // Bring to front.
        setOverlays((os) => [...os.filter((o) => o.id !== hit.id), hit]);
        g.start = { x: hit.x, y: hit.y, scale: hit.scale, rotation: hit.rotation, dist: 0, angle: 0, px: p.x, py: p.y, t: performance.now() };
      }
    } else if (g.pointers.size === 2 && g.id) {
      const [a, b] = [...g.pointers.values()];
      const o = overlays.find((x) => x.id === g.id);
      if (o) g.start = { ...g.start, scale: o.scale, rotation: o.rotation, dist: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g.pointers.has(e.pointerId) || !g.id) return;
    const p = toFrame(e);
    g.pointers.set(e.pointerId, p);
    if (g.pointers.size === 1) {
      const dx = p.x - g.start.px, dy = p.y - g.start.py;
      if (Math.hypot(dx, dy) > 8) g.moved = true;
      if (!g.moved) return;
      const x = Math.min(1, Math.max(0, g.start.x + dx / OUT_W));
      const y = Math.min(1, Math.max(0, g.start.y + dy / OUT_H));
      updateOverlay(g.id, { x, y });
      setDragging({ id: g.id, overTrash: y > 0.88 });
    } else if (g.pointers.size >= 2 && g.start.dist) {
      g.moved = true;
      const [a, b] = [...g.pointers.values()];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      updateOverlay(g.id, { scale: Math.min(5, Math.max(0.3, g.start.scale * (dist / g.start.dist))), rotation: g.start.rotation + angle - g.start.angle });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    g.pointers.delete(e.pointerId);
    if (g.pointers.size > 0) return;
    const id = g.id;
    g.id = null;
    if (dragging?.overTrash && id) setOverlays((os) => os.filter((o) => o.id !== id));
    setDragging(null);
    if (id && !g.moved && performance.now() - g.start.t < 400) {
      const o = overlays.find((x) => x.id === id);
      if (o?.kind === "text") setEditing(o);
    }
  };

  // Desktop: mouse wheel resizes the overlay under the pointer.
  const onWheel = (e: React.WheelEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const ctx = canvasRef.current!.getContext("2d")!;
    const hit = hitTest(ctx, overlays, OUT_W, OUT_H, ((e.clientX - r.left) / r.width) * OUT_W, ((e.clientY - r.top) / r.height) * OUT_H);
    if (hit) updateOverlay(hit.id, { scale: Math.min(5, Math.max(0.3, hit.scale * (e.deltaY < 0 ? 1.08 : 0.93))) });
  };

  const addText = () => {
    const t: TextOverlay = { kind: "text", id: newId(), text: "", x: 0.5, y: 0.42, scale: 1, rotation: 0, style: "classic", color: "#ffffff", bg: "none", align: "center" };
    setOverlays((os) => [...os, t]);
    setEditing(t);
  };

  const finishText = (t: TextOverlay) => {
    setOverlays((os) => (t.text.trim() ? os.map((o) => (o.id === t.id ? t : o)) : os.filter((o) => o.id !== t.id)));
    setEditing(null);
  };

  const unchanged = () =>
    !!original && !sound && segments.length === 1 && segments[0].speed === 1 && overlays.length === 0 && volume === 1 && look.filter === "none" && look.effect === "none" && look.beauty === 0 && /^video\/(mp4|webm)$/.test(original.type);

  const next = async () => {
    if (unchanged()) return onNext(original!);
    setError(null);
    setProgress(0);
    videoRef.current?.pause();
    musicRef.current?.pause();
    try {
      const music = sound ? { url: (await mediaUrl(api, sound.sound.url))!, startMs: sound.startMs, volume: musicVolume } : null;
      const file = await exportVideo({ segments, look, overlays, volume, music }, setProgress);
      onNext(file);
    } catch (e) {
      setError((e as Error).message || "Couldn't process the video.");
    } finally {
      setProgress(null);
      videoRef.current?.play().catch(() => {});
    }
  };

  return (
    <div className="absolute inset-0 select-none overflow-hidden bg-black">
      <video ref={videoRef} playsInline className="hidden" onEnded={() => setSeg((i) => i + 1)} />
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        className="absolute inset-0 h-full w-full touch-none object-cover"
      />

      {dragging && (
        <div className={`absolute bottom-10 left-1/2 z-30 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full ${dragging.overTrash ? "scale-125 bg-brand" : "bg-black/50"} transition-transform`}>
          <Trash2 className="h-6 w-6" />
        </div>
      )}

      {!editing && !dragging && (
        <>
          <button type="button" onClick={onBack} aria-label="Back" className="absolute left-3 top-[max(16px,env(safe-area-inset-top))] z-20 p-1.5 drop-shadow"><ChevronLeft className="h-8 w-8" /></button>
          <button type="button" onClick={onPickSound} className="absolute left-1/2 top-[max(20px,env(safe-area-inset-top))] z-20 flex max-w-[55%] -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-sm font-semibold backdrop-blur">
            <Music2 className="h-4 w-4 shrink-0" /><span className="truncate">{sound ? sound.sound.title : "Add sound"}</span>
          </button>
          <div className="absolute right-1 top-16 z-20 flex flex-col items-center gap-2">
            <RailButton icon={<Type className="h-7 w-7" />} label="Text" onClick={addText} />
            <RailButton icon={<Sticker className="h-7 w-7" />} label="Stickers" active={panel === "stickers"} onClick={() => setPanel(panel === "stickers" ? null : "stickers")} />
            <RailButton icon={<Sparkles className="h-7 w-7" />} label="Filters" active={panel === "filters"} onClick={() => setPanel(panel === "filters" ? null : "filters")} />
            <RailButton icon={<Music2 className="h-7 w-7" />} label="Sound" active={!!sound} onClick={onPickSound} />
            <RailButton icon={<Volume2 className="h-7 w-7" />} label="Volume" active={panel === "volume"} onClick={() => setPanel(panel === "volume" ? null : "volume")} />
          </div>
          {!panel && (
            <div className="absolute inset-x-0 bottom-0 z-20 flex justify-end gap-3 bg-gradient-to-t from-black/70 to-transparent px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-10">
              {overlays.length === 0 && <p className="mr-auto self-center text-xs text-white/60">Tap Text or Stickers. Drag to move, pinch to resize.</p>}
              <button type="button" onClick={next} disabled={progress !== null} className="h-11 rounded-md bg-brand px-8 font-semibold disabled:opacity-60">Next</button>
            </div>
          )}
        </>
      )}

      {panel === "stickers" && (
        <Sheet title="Stickers" onClose={() => setPanel(null)}>
          <div className="grid max-h-60 grid-cols-6 gap-2 overflow-y-auto pb-2 text-3xl">
            {STICKERS.map((s) => (
              <button key={s} type="button" onClick={() => { setOverlays((os) => [...os, { kind: "sticker", id: newId(), emoji: s, x: 0.5, y: 0.45, scale: 1, rotation: 0 }]); setPanel(null); }} className="flex h-12 items-center justify-center rounded-lg hover:bg-white/10">{s}</button>
            ))}
          </div>
        </Sheet>
      )}
      {panel === "filters" && (
        <Sheet title="Filters & effects" onClose={() => setPanel(null)}>
          <div className="mb-3 flex gap-4 text-sm font-semibold">
            {(["filters", "effects", "beauty"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setFilterTab(t)} className={filterTab === t ? "capitalize text-white" : "capitalize text-white/50"}>{t}</button>
            ))}
          </div>
          {filterTab === "filters" && <FilterStrip look={look} onChange={setLook} />}
          {filterTab === "effects" && <EffectStrip look={look} onChange={setLook} />}
          {filterTab === "beauty" && <div className="pb-3"><Slider label="Smooth" value={look.beauty} onChange={(v) => setLook({ ...look, beauty: v })} /></div>}
        </Sheet>
      )}
      {panel === "volume" && (
        <Sheet title="Volume" onClose={() => setPanel(null)}>
          <div className="space-y-4 pb-3">
            <Slider label="Original" value={volume} max={1} onChange={setVolume} />
            {sound && <Slider label="Added sound" value={musicVolume} max={1} onChange={setMusicVolume} />}
          </div>
        </Sheet>
      )}

      {editing && <TextEditor initial={editing} onDone={finishText} />}

      {progress !== null && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/75">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="font-semibold">Processing {Math.round(progress * 100)}%</p>
          <p className="max-w-[16rem] text-center text-xs text-white/60">Applying filters and text. Keep this screen open.</p>
        </div>
      )}
      {error && <p role="alert" className="absolute inset-x-4 top-20 z-40 rounded-md bg-brand/90 p-3 text-sm">{error}</p>}
    </div>
  );
}

/** Full-screen text editor (TikTok style): type, pick font, colour, background and alignment. */
function TextEditor({ initial, onDone }: { initial: TextOverlay; onDone: (t: TextOverlay) => void }) {
  const [t, setT] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const css = TEXT_STYLES.find((s) => s.id === t.style)!.font.replace("{px}", "30");
  const bgNext = { none: "solid", solid: "soft", soft: "none" } as const;
  const AlignIcon = t.align === "left" ? AlignLeft : t.align === "right" ? AlignRight : AlignCenter;
  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-black/60 backdrop-blur-[2px]">
      <div className="flex items-center justify-between px-3 pt-[max(16px,env(safe-area-inset-top))]">
        <div className="flex gap-2">
          <button type="button" aria-label="Alignment" onClick={() => setT({ ...t, align: t.align === "center" ? "left" : t.align === "left" ? "right" : "center" })} className="rounded-full bg-white/15 p-2"><AlignIcon className="h-5 w-5" /></button>
          <button type="button" aria-label="Background" onClick={() => setT({ ...t, bg: bgNext[t.bg] })} className={`rounded-md px-2.5 py-1 text-sm font-black ${t.bg === "solid" ? "bg-white text-black" : t.bg === "soft" ? "bg-white/40" : "border border-white"}`}>A</button>
        </div>
        <button type="button" onClick={() => onDone(t)} className="rounded-full px-3 py-1 font-semibold text-brand-cyan">Done</button>
      </div>
      <div className="flex flex-1 items-center justify-center px-6">
        <textarea
          ref={ref}
          value={t.text}
          onChange={(e) => setT({ ...t, text: e.target.value })}
          rows={3}
          maxLength={200}
          placeholder="Type something"
          aria-label="Text"
          className="w-full resize-none bg-transparent outline-none placeholder:text-white/40"
          style={{
            font: css,
            textAlign: t.align,
            color: t.bg === "solid" ? (t.color === "#ffffff" ? "#000" : "#fff") : t.style === "neon" ? "#fff" : t.color,
            textShadow: t.style === "neon" ? `0 0 12px ${t.color}` : "0 1px 3px rgba(0,0,0,.5)",
            background: t.bg === "solid" ? t.color : t.bg === "soft" ? "rgba(0,0,0,.55)" : "transparent",
            borderRadius: 10,
            padding: "4px 8px",
          }}
        />
      </div>
      <div className="space-y-3 pb-[max(16px,env(safe-area-inset-bottom))]">
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-3">
          {TEXT_COLORS.map((c) => (
            <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => setT({ ...t, color: c })} className={`h-7 w-7 shrink-0 rounded-full border-2 ${t.color === c ? "border-white scale-110" : "border-white/40"}`} style={{ background: c }} />
          ))}
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-3">
          {TEXT_STYLES.map((s) => (
            <button key={s.id} type="button" onClick={() => setT({ ...t, style: s.id })} className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${t.style === s.id ? "bg-white text-black" : "bg-white/15"}`} style={{ font: s.font.replace("{px}", "14") }}>{s.name}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
