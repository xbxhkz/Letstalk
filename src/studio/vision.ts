/**
 * Main-thread side of the vision worker (vision.worker.ts): sends camera frames when the worker is
 * free and keeps the latest landmarks / mask. If no worker is available, falls back to running
 * MediaPipe on the main thread (slower: inference then blocks the preview).
 */
import type { PersonMask } from "./background";
import { DETECT_INTERVAL_MS, loadLandmarker, loadSegmenter } from "./lenses";

export type VisionWorkerFactory = () => Worker;
type Faces = { x: number; y: number }[][];

export class Vision {
  faces: Faces = [];
  mask: PersonMask | null = null;
  /** performance.now() of the last result that contained a face (for the "Find a face" hint). */
  lastFaceAt = 0;
  private worker: Worker | null = null;
  private busy = false;
  private pending = new Map<string, { resolve: () => void; reject: (e: Error) => void }>();
  private loaded = { face: false, seg: false };
  private lastMainTs = 0;

  constructor(private base: string, factory?: VisionWorkerFactory) {
    if (!factory || typeof Worker === "undefined") return;
    try {
      this.worker = factory();
      this.worker.postMessage({ type: "init", base });
      this.worker.onmessage = (e) => this.onMessage(e.data);
      this.worker.onerror = (e) => {
        console.warn("[studio] vision worker failed, using the main thread:", e.message);
        this.worker?.terminate();
        this.worker = null;
        this.busy = false;
        for (const [k, p] of this.pending) p.reject(new Error("worker failed")), this.pending.delete(k);
      };
    } catch (e) {
      console.warn("[studio] couldn't start the vision worker:", (e as Error).message);
      this.worker = null;
    }
  }

  get inWorker() {
    return !!this.worker;
  }

  private onMessage(m: { type: string; what?: string; message?: string; faces?: Faces | null; mask?: PersonMask | null }) {
    if (m.type === "loaded" && m.what) {
      this.loaded[m.what as "face" | "seg"] = true;
      this.pending.get(m.what)?.resolve();
      this.pending.delete(m.what);
    } else if (m.type === "error" && m.what && m.what !== "frame") {
      this.pending.get(m.what)?.reject(new Error(m.message));
      this.pending.delete(m.what);
    } else if (m.type === "result") {
      this.busy = false;
      if (m.faces) {
        this.faces = m.faces;
        if (m.faces.length) this.lastFaceAt = performance.now();
      }
      if (m.mask) this.mask = m.mask;
    } else if (m.type === "error") {
      this.busy = false;
    }
  }

  /** Loads face tracking or segmentation (in the worker if there is one). */
  async load(what: "face" | "seg") {
    if (this.loaded[what]) return;
    if (!this.worker) {
      await (what === "face" ? loadLandmarker(this.base) : loadSegmenter(this.base));
      this.loaded[what] = true;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      this.pending.set(what, { resolve, reject });
      this.worker!.postMessage({ type: "load", what });
    });
  }

  /** Call every frame; it only sends a new frame when the worker is idle. */
  update(video: HTMLVideoElement, wantFace: boolean, wantSeg: boolean) {
    const face = wantFace && this.loaded.face, seg = wantSeg && this.loaded.seg;
    if (!face && !seg) return;
    const now = performance.now();
    if (this.worker) {
      if (this.busy) return;
      this.busy = true;
      createImageBitmap(video)
        .then((bitmap) => this.worker?.postMessage({ type: "frame", bitmap, ts: now, face, seg }, [bitmap]))
        .catch(() => (this.busy = false));
      return;
    }
    // Fallback: main thread, throttled.
    if (now - this.lastMainTs < Math.max(1, DETECT_INTERVAL_MS())) return;
    this.lastMainTs = now;
    void (async () => {
      try {
        if (face) {
          this.faces = (await loadLandmarker(this.base)).detectForVideo(video, now).faceLandmarks;
          if (this.faces.length) this.lastFaceAt = now;
        }
        if (seg) {
          const res = (await loadSegmenter(this.base)).segmentForVideo(video, now);
          const masks = res.confidenceMasks ?? [];
          const k = masks[masks.length - 1];
          if (k) this.mask = { data: k.getAsFloat32Array().slice(), width: k.width, height: k.height };
          res.close();
        }
      } catch {
        /* keep the previous result */
      }
    })();
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
  }
}
