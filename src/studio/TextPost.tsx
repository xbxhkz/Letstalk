import { useEffect, useRef, useState } from "react";
import { X, Loader2, AlignCenter, AlignLeft, AlignRight, Music2 } from "lucide-react";
import { Compositor, DEFAULT_LOOK, OUT_H, OUT_W } from "./compositor";
import { exportVideo } from "./recorder";
import { mediaUrl, type SoundPick, type StudioApi } from "./api";
import { TEXT_STYLES, measure, newId, type TextOverlay, type TextStyle } from "./overlays";

/** Animated gradient backgrounds for text posts. */
export const BACKGROUNDS: { name: string; stops: string[] }[] = [
  { name: "Sunset", stops: ["#ff2d6f", "#ff9a3c"] },
  { name: "Ocean", stops: ["#2563eb", "#25f4ee"] },
  { name: "Grape", stops: ["#7c3aed", "#ec4899"] },
  { name: "Forest", stops: ["#065f46", "#84cc16"] },
  { name: "Night", stops: ["#0f172a", "#334155"] },
  { name: "Lemon", stops: ["#facc15", "#fb923c"] },
  { name: "Mono", stops: ["#111111", "#111111"] },
  { name: "Paper", stops: ["#f5f5f4", "#e7e5e4"] },
];

export function drawBackground(ctx: CanvasRenderingContext2D, stops: string[], t: number) {
  const a = t * 0.25;
  const cx = OUT_W / 2, cy = OUT_H / 2, r = OUT_H * 0.6;
  const g = ctx.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  stops.forEach((s, i) => g.addColorStop(i / Math.max(1, stops.length - 1), s));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, OUT_W, OUT_H);
}

/** Largest text scale (up to 1.8) that fits ~84% of the frame width and 70% of its height. */
function fitScale(ctx: CanvasRenderingContext2D, o: TextOverlay) {
  for (let s = 1.8; s >= 0.5; s -= 0.05) {
    const b = measure(ctx, { ...o, scale: s }, OUT_W, OUT_H);
    if (b.w <= OUT_W * 0.84 && b.h <= OUT_H * 0.7) return s;
  }
  return 0.5;
}

/** Wraps long lines so text posts don't rely on the user pressing Enter. */
function wrap(ctx: CanvasRenderingContext2D, text: string, style: TextStyle) {
  ctx.font = TEXT_STYLES.find((s) => s.id === style)!.font.replace("{px}", "56");
  const maxW = OUT_W * 0.8 / 1.0;
  return text
    .split("\n")
    .flatMap((para) => {
      const words = para.split(/\s+/);
      const out: string[] = [];
      let line = "";
      for (const w of words) {
        const tryLine = line ? `${line} ${w}` : w;
        if (ctx.measureText(tryLine).width > maxW && line) {
          out.push(line);
          line = w;
        } else line = tryLine;
      }
      out.push(line);
      return out;
    })
    .join("\n");
}

export function TextPost({
  onClose,
  onNext,
  modeSwitch,
  api,
  sound,
  onPickSound,
}: {
  onClose: () => void;
  onNext: (file: File) => void;
  modeSwitch: React.ReactNode;
  api: StudioApi;
  sound: SoundPick | null;
  onPickSound: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [text, setText] = useState("");
  const [style, setStyle] = useState<TextStyle>("classic");
  const [bg, setBg] = useState(0);
  const [align, setAlign] = useState<"left" | "center" | "right">("center");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dark = (stops: string[]) => {
    const n = parseInt(stops[0].slice(1), 16);
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 < 0.75;
  };

  const overlay = useRef<TextOverlay>({ kind: "text", id: newId(), text: "", x: 0.5, y: 0.5, scale: 1, rotation: 0, style, color: "#ffffff", bg: "none", align });
  const bgRef = useRef(bg);
  bgRef.current = bg;

  useEffect(() => {
    const ctx = document.createElement("canvas").getContext("2d")!;
    const o: TextOverlay = { ...overlay.current, text: wrap(ctx, text || "Tap to type", style), style, align, color: dark(BACKGROUNDS[bg].stops) ? "#ffffff" : "#111111" };
    o.scale = fitScale(ctx, o);
    overlay.current = o;
  }, [text, style, bg, align]);

  useEffect(() => {
    const comp = new Compositor(canvasRef.current!);
    const bgc = document.createElement("canvas");
    bgc.width = OUT_W;
    bgc.height = OUT_H;
    const bctx = bgc.getContext("2d")!;
    let raf = 0;
    const loop = () => {
      const t = performance.now() / 1000;
      drawBackground(bctx, BACKGROUNDS[bgRef.current].stops, t);
      comp.render(bgc, DEFAULT_LOOK, [overlay.current], t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const next = async () => {
    if (!text.trim()) return setError("Type something first.");
    setError(null);
    setProgress(0);
    try {
      const stops = BACKGROUNDS[bg].stops;
      const file = await exportVideo(
        {
          segments: [],
          look: DEFAULT_LOOK,
          overlays: [overlay.current],
          volume: 0,
          music: sound ? { url: (await mediaUrl(api, sound.sound.url))!, startMs: sound.startMs, volume: 1 } : null,
          textPost: { draw: (ctx, t) => drawBackground(ctx, stops, t), seconds: 6 },
        },
        setProgress,
      );
      onNext(file);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  };

  const AlignIcon = align === "left" ? AlignLeft : align === "right" ? AlignRight : AlignCenter;

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-3 pt-[max(16px,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 drop-shadow"><X className="h-7 w-7" /></button>
        <button type="button" onClick={onPickSound} className="flex max-w-[55%] items-center gap-1.5 rounded-full bg-black/30 px-3 py-1.5 text-sm font-semibold">
          <Music2 className="h-4 w-4 shrink-0" /><span className="truncate">{sound ? sound.sound.title : "Add sound"}</span>
        </button>
        <button type="button" aria-label="Alignment" onClick={() => setAlign(align === "center" ? "left" : align === "left" ? "right" : "center")} className="rounded-full bg-black/30 p-2"><AlignIcon className="h-5 w-5" /></button>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 space-y-3 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-12">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          rows={2}
          placeholder="Tap to type your post"
          aria-label="Post text"
          className="w-full resize-none rounded-lg bg-black/40 p-3 text-[15px] outline-none placeholder:text-white/50 focus:ring-1 focus:ring-white/40"
        />
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {BACKGROUNDS.map((b, i) => (
            <button key={b.name} type="button" aria-label={b.name} onClick={() => setBg(i)} className={`h-8 w-8 shrink-0 rounded-full border-2 ${bg === i ? "scale-110 border-white" : "border-white/30"}`} style={{ background: `linear-gradient(135deg, ${b.stops.join(",")})` }} />
          ))}
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {TEXT_STYLES.map((s) => (
            <button key={s.id} type="button" onClick={() => setStyle(s.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${style === s.id ? "bg-white text-black" : "bg-white/15"}`} style={{ font: s.font.replace("{px}", "14") }}>{s.name}</button>
          ))}
        </div>
        {error && <p role="alert" className="text-sm text-brand">{error}</p>}
        <div className="flex items-center justify-between">
          {modeSwitch}
          <button type="button" onClick={next} disabled={progress !== null || !text.trim()} className="h-11 rounded-md bg-brand px-8 font-semibold disabled:opacity-50">Next</button>
        </div>
      </div>

      {progress !== null && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/75">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="font-semibold">Creating your post {Math.round(progress * 100)}%</p>
        </div>
      )}
    </div>
  );
}
