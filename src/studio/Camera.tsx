import { useCallback, useEffect, useRef, useState } from "react";
import { X, RefreshCw, Gauge, Sparkles, Wand2, Timer, Zap, ZapOff, Image as ImageIcon, Delete, Check, Music2, Loader2, Smile } from "lucide-react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { Compositor, OUT_H, OUT_W, drawCover, type Look } from "./compositor";
import { LENSES, drawLens, loadLandmarker, type LensId } from "./lenses";
import { pickMime, probeDuration, startClip, type Segment } from "./recorder";
import { newId } from "./overlays";
import { EffectStrip, FilterStrip, RailButton, Sheet, Slider } from "./ui";

const SPEEDS = [0.3, 0.5, 1, 2, 3];
const LENGTHS = [
  { sec: 180, label: "3m" },
  { sec: 60, label: "60s" },
  { sec: 15, label: "15s" },
];

type Panel = "filters" | "effects" | "beauty" | "speed" | "timer" | null;

export function Camera({
  mediapipeBase,
  look,
  onLook,
  segments,
  onSegments,
  onClose,
  onNext,
  onImport,
  modeSwitch,
}: {
  mediapipeBase: string;
  look: Look;
  onLook: (l: Look) => void;
  segments: Segment[];
  onSegments: (s: Segment[]) => void;
  onClose: () => void;
  onNext: () => void;
  onImport: (file: File) => void;
  /** Camera | Text switch, shown under the record button before the first clip. */
  modeSwitch?: React.ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const capRef = useRef<HTMLCanvasElement | null>(null);
  const recStreamRef = useRef<MediaStream | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const clipRef = useRef<ReturnType<typeof startClip> | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const lookRef = useRef(look);
  lookRef.current = look;
  const lensRef = useRef<LensId>("none");
  const pressRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [effectsTab, setEffectsTab] = useState<"face" | "screen">("face");
  const [lens, setLens] = useState<LensId>("none");
  const [lensState, setLensState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [speed, setSpeed] = useState(1);
  const [maxSec, setMaxSec] = useState(60);
  const [timer, setTimer] = useState<0 | 3 | 10>(0);
  const [countdown, setCountdown] = useState(0);
  const [recording, setRecording] = useState(false);
  const [liveMs, setLiveMs] = useState(0);
  const [torch, setTorch] = useState<boolean | null>(null); // null = not supported
  const mime = useRef(pickMime());

  lensRef.current = lens;
  const usedMs = segments.reduce((s, x) => s + x.durationMs / x.speed, 0);
  const totalMs = usedMs + (recording ? liveMs / speed : 0);
  const full = totalMs >= maxSec * 1000 - 50;

  // ---- camera ----
  const startCamera = useCallback(async (face: "user" | "environment") => {
    setReady(false);
    camStreamRef.current?.getTracks().forEach((t) => t.stop());
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't open the camera here. Camera recording needs https (or the Letstalk app).");
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: face, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      camStreamRef.current = s;
      const v = videoRef.current!;
      v.srcObject = s;
      await v.play().catch(() => {});
      const track = s.getVideoTracks()[0];
      const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
      setTorch(caps.torch ? false : null);
      // The recorded stream: the composed camera canvas plus the microphone.
      const cap = capRef.current!;
      const canvasTrack = (recStreamRef.current?.getVideoTracks()[0]) ?? cap.captureStream(30).getVideoTracks()[0];
      recStreamRef.current = new MediaStream([canvasTrack, ...s.getAudioTracks()]);
      setError(null);
      setReady(true);
    } catch (e) {
      const name = (e as DOMException).name;
      setError(
        name === "NotAllowedError"
          ? "Camera and microphone access was blocked. Allow it in your browser or phone settings, then try again."
          : name === "NotFoundError"
            ? "No camera was found on this device."
            : `Couldn't start the camera (${name || (e as Error).message}).`,
      );
    }
  }, []);

  useEffect(() => {
    const cap = document.createElement("canvas");
    cap.width = OUT_W;
    cap.height = OUT_H;
    capRef.current = cap;
    return () => {
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
      recStreamRef.current?.getVideoTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    startCamera(facing);
  }, [facing, startCamera]);

  // ---- render loop: camera -> (lens) -> capture canvas -> filters -> screen ----
  useEffect(() => {
    if (!viewRef.current) return;
    const comp = new Compositor(viewRef.current);
    const cap = capRef.current!;
    const cctx = cap.getContext("2d")!;
    let raf = 0;
    let lastTs = 0;
    let faces: { x: number; y: number }[][] = [];
    const loop = () => {
      const v = videoRef.current;
      if (v && v.readyState >= 2) {
        const map = drawCover(cctx, v, facing === "user");
        const now = performance.now();
        const lm = landmarkerRef.current;
        if (lm && lensRef.current !== "none" && map && now > lastTs) {
          try {
            faces = lm.detectForVideo(v, now).faceLandmarks;
          } catch {
            faces = [];
          }
          lastTs = now;
        }
        if (map && lensRef.current !== "none") drawLens(cctx, lensRef.current, faces, map, now / 1000);
        comp.render(cap, lookRef.current, [], now / 1000);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [facing]);

  // Live recording clock (auto-stops at the length limit).
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => {
      const ms = clipRef.current?.elapsed() ?? 0;
      setLiveMs(ms);
      if (usedMs + ms / speed >= maxSec * 1000) stopRecording();
    }, 100);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, usedMs, speed, maxSec]);

  const chooseLens = async (id: LensId) => {
    setLens(id);
    if (id === "none" || landmarkerRef.current) return;
    setLensState("loading");
    try {
      landmarkerRef.current = await loadLandmarker(mediapipeBase);
      setLensState("ready");
    } catch (e) {
      console.warn("[studio] face tracker failed to load:", e);
      setLensState("error");
    }
  };

  // ---- recording ----
  const beginRecording = () => {
    if (!ready || !recStreamRef.current || !mime.current || full) return;
    setPanel(null);
    clipRef.current = startClip(recStreamRef.current, mime.current);
    setLiveMs(0);
    setRecording(true);
  };

  const stopRecording = async () => {
    const clip = clipRef.current;
    clipRef.current = null;
    setRecording(false);
    if (!clip) return;
    const { blob, durationMs } = await clip.stop();
    if (durationMs < 300 || !blob.size) return; // ignore accidental taps
    onSegments([...segmentsRef.current, { id: newId(), blob, durationMs, speed, url: URL.createObjectURL(blob) }]);
  };
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;

  const runCountdown = (secs: number) => {
    setPanel(null);
    setCountdown(secs);
    const tick = (n: number) => {
      if (n <= 0) {
        setCountdown(0);
        beginRecording();
        return;
      }
      setCountdown(n);
      setTimeout(() => tick(n - 1), 1000);
    };
    tick(secs);
  };

  // Tap toggles recording; press-and-hold records while held.
  const onRecordDown = () => {
    if (countdown) return;
    if (recording) return;
    pressRef.current = performance.now();
    beginRecording();
  };
  const onRecordUp = () => {
    if (!recording && !clipRef.current) return;
    const held = performance.now() - pressRef.current;
    if (pressRef.current && held > 350) {
      pressRef.current = 0;
      stopRecording(); // was a hold
    } else if (!pressRef.current) {
      stopRecording(); // second tap
    } else {
      pressRef.current = 0; // first tap: keep recording
    }
  };

  const toggleTorch = async () => {
    const track = camStreamRef.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  };

  const deleteLast = () => {
    const last = segments[segments.length - 1];
    if (last) URL.revokeObjectURL(last.url);
    onSegments(segments.slice(0, -1));
  };

  const importFile = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("video/")) return setError("Choose a video file.");
    onImport(f);
  };

  if (!mime.current) {
    return <Blocker onClose={onClose} text="This device can't record video in the browser. Use Upload to post a video file instead." />;
  }

  return (
    <div className="absolute inset-0 select-none overflow-hidden bg-black">
      <video ref={videoRef} playsInline muted className="hidden" />
      <canvas ref={viewRef} className="absolute inset-0 h-full w-full object-cover" />

      {error && (
        <div className="absolute inset-x-6 top-1/3 z-30 rounded-xl bg-black/80 p-4 text-center text-sm">
          <p>{error}</p>
          <button type="button" onClick={() => startCamera(facing)} className="mt-3 rounded-md bg-brand px-4 py-2 font-semibold">Try again</button>
        </div>
      )}
      {!ready && !error && <Loader2 className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 animate-spin text-white/70" />}

      {/* Segmented progress bar */}
      <div className="absolute inset-x-2 top-[max(8px,env(safe-area-inset-top))] z-20 flex h-1.5 overflow-hidden rounded-full bg-white/25">
        {segments.map((s) => (
          <div key={s.id} className="h-full border-r-2 border-black/60 bg-brand" style={{ width: `${((s.durationMs / s.speed) / (maxSec * 1000)) * 100}%` }} />
        ))}
        {recording && <div className="h-full bg-brand" style={{ width: `${((liveMs / speed) / (maxSec * 1000)) * 100}%` }} />}
      </div>

      {/* Top bar */}
      <div className="absolute inset-x-0 top-[max(16px,env(safe-area-inset-top))] z-20 flex items-center justify-center px-3 pt-2">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute left-3 p-1.5 drop-shadow"><X className="h-7 w-7" /></button>
        <span className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-sm font-semibold backdrop-blur"><Music2 className="h-4 w-4" />Original sound</span>
      </div>

      {/* Right rail */}
      {!recording && (
        <div className="absolute right-1 top-20 z-20 flex flex-col items-center gap-2">
          <RailButton icon={<RefreshCw className="h-7 w-7" />} label="Flip" onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))} />
          <RailButton icon={<Gauge className="h-7 w-7" />} label="Speed" active={panel === "speed" || speed !== 1} onClick={() => setPanel(panel === "speed" ? null : "speed")} />
          <RailButton icon={<Smile className="h-7 w-7" />} label="Beauty" active={panel === "beauty" || look.beauty > 0} onClick={() => setPanel(panel === "beauty" ? null : "beauty")} />
          <RailButton icon={<Sparkles className="h-7 w-7" />} label="Filters" active={panel === "filters" || look.filter !== "none"} onClick={() => setPanel(panel === "filters" ? null : "filters")} />
          <RailButton icon={<Timer className="h-7 w-7" />} label="Timer" active={panel === "timer"} onClick={() => setPanel(panel === "timer" ? null : "timer")} />
          {torch !== null && <RailButton icon={torch ? <Zap className="h-7 w-7" /> : <ZapOff className="h-7 w-7" />} label="Flash" active={!!torch} onClick={toggleTorch} />}
        </div>
      )}

      {countdown > 0 && <div className="absolute inset-0 z-30 flex items-center justify-center text-[120px] font-black drop-shadow-lg">{countdown}</div>}
      {lensState === "loading" && <p className="absolute left-1/2 top-24 z-20 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm">Loading face tracking…</p>}
      {lensState === "error" && lens !== "none" && <p className="absolute left-1/2 top-24 z-20 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm text-brand">Face lenses couldn&apos;t load</p>}

      {/* Bottom controls */}
      {!panel && (
        <div className="absolute inset-x-0 bottom-0 z-20 pb-[max(16px,env(safe-area-inset-bottom))]">
          {segments.length === 0 && !recording && (
            <div className="mb-4 flex justify-center gap-5 text-sm font-semibold">
              {LENGTHS.map((l) => (
                <button key={l.sec} type="button" onClick={() => setMaxSec(l.sec)} className={maxSec === l.sec ? "text-white" : "text-white/55"}>{l.label}</button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between px-8">
            <div className="flex w-16 justify-center">
              {!recording && (
                <button type="button" onClick={() => setPanel("effects")} className="flex flex-col items-center gap-1 text-xs font-semibold">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-amber-400 text-xl">{LENSES.find((l) => l.id === lens)?.icon === "⦸" ? <Wand2 className="h-6 w-6" /> : LENSES.find((l) => l.id === lens)?.icon}</span>
                  Effects
                </button>
              )}
            </div>
            <button
              type="button"
              aria-label={recording ? "Stop recording" : "Record"}
              onPointerDown={onRecordDown}
              onPointerUp={onRecordUp}
              onContextMenu={(e) => e.preventDefault()}
              disabled={!ready || (full && !recording)}
              className="relative flex h-20 w-20 touch-none items-center justify-center rounded-full border-[5px] border-white/80 disabled:opacity-50"
            >
              <span className={`bg-brand transition-all ${recording ? "h-8 w-8 rounded-md" : "h-16 w-16 rounded-full"}`} />
            </button>
            <div className="flex w-16 items-center justify-center gap-3">
              {segments.length > 0 && !recording ? (
                <>
                  <button type="button" onClick={deleteLast} aria-label="Delete last clip" className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50"><Delete className="h-5 w-5" /></button>
                  <button type="button" onClick={onNext} aria-label="Next" className="flex h-10 w-10 items-center justify-center rounded-full bg-brand"><Check className="h-6 w-6" strokeWidth={3} /></button>
                </>
              ) : (
                !recording && (
                  <button type="button" onClick={() => fileRef.current?.click()} className="flex flex-col items-center gap-1 text-xs font-semibold">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-white bg-white/10"><ImageIcon className="h-6 w-6" /></span>
                    Upload
                  </button>
                )
              )}
            </div>
          </div>
          {segments.length === 0 && !recording && modeSwitch && <div className="mt-4 flex justify-center">{modeSwitch}</div>}
          <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={(e) => importFile(e.target.files?.[0])} />
        </div>
      )}

      {/* Panels */}
      {panel === "filters" && <Sheet title="Filters" onClose={() => setPanel(null)}><FilterStrip look={look} onChange={onLook} /></Sheet>}
      {panel === "beauty" && (
        <Sheet title="Beauty" onClose={() => setPanel(null)}>
          <div className="pb-3"><Slider label="Smooth" value={look.beauty} onChange={(v) => onLook({ ...look, beauty: v })} /></div>
        </Sheet>
      )}
      {panel === "speed" && (
        <Sheet title="Speed" onClose={() => setPanel(null)}>
          <div className="mb-3 flex rounded-lg bg-white/10 p-1">
            {SPEEDS.map((s) => (
              <button key={s} type="button" onClick={() => setSpeed(s)} className={`flex-1 rounded-md py-2 text-sm font-semibold ${speed === s ? "bg-white text-black" : "text-white/80"}`}>{s}x</button>
            ))}
          </div>
        </Sheet>
      )}
      {panel === "timer" && (
        <Sheet title="Timer" onClose={() => setPanel(null)}>
          <div className="mb-3 flex gap-2">
            {([3, 10] as const).map((s) => (
              <button key={s} type="button" onClick={() => setTimer(s)} className={`flex-1 rounded-md py-2 text-sm font-semibold ${timer === s ? "bg-white text-black" : "bg-white/10"}`}>{s}s</button>
            ))}
          </div>
          <button type="button" disabled={!timer || !ready || full} onClick={() => runCountdown(timer)} className="mb-2 h-11 w-full rounded-md bg-brand font-semibold disabled:opacity-50">Start countdown</button>
        </Sheet>
      )}
      {panel === "effects" && (
        <Sheet title="Effects" onClose={() => setPanel(null)}>
          <div className="mb-3 flex gap-4 text-sm font-semibold">
            <button type="button" onClick={() => setEffectsTab("face")} className={effectsTab === "face" ? "text-white" : "text-white/50"}>Face</button>
            <button type="button" onClick={() => setEffectsTab("screen")} className={effectsTab === "screen" ? "text-white" : "text-white/50"}>Screen</button>
          </div>
          {effectsTab === "face" ? (
            <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
              {LENSES.map((l) => (
                <button key={l.id} type="button" onClick={() => chooseLens(l.id)} className="flex w-14 shrink-0 flex-col items-center gap-1 text-[11px]">
                  <span className={`flex h-14 w-14 items-center justify-center rounded-xl bg-white/10 text-2xl ring-2 ${lens === l.id ? "ring-white" : "ring-transparent"}`}>
                    {lens === l.id && lensState === "loading" ? <Loader2 className="h-5 w-5 animate-spin" /> : l.icon}
                  </span>
                  <span className={lens === l.id ? "font-semibold text-white" : "text-white/70"}>{l.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <EffectStrip look={look} onChange={onLook} />
          )}
        </Sheet>
      )}
    </div>
  );
}

export function Blocker({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black px-8 text-center">
      <p className="text-white/80">{text}</p>
      <button type="button" onClick={onClose} className="rounded-md bg-brand px-6 py-2.5 font-semibold">Back</button>
    </div>
  );
}

export { probeDuration };
