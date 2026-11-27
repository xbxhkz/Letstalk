/// <reference lib="webworker" />
/**
 * Face tracking and person segmentation in a Web Worker, so CPU inference never blocks the camera
 * preview. The main thread posts camera frames (ImageBitmap) and gets back landmarks and masks.
 *
 * The runtime and models are fetched here and loaded from blob URLs / buffers: inside the Android app
 * the worker runs at https://localhost while the server is http, and fetch() is the one path the
 * WebView allows for that (and it only needs CORS, which the server sends for /mediapipe).
 */
import { FaceLandmarker, ImageSegmenter } from "@mediapipe/tasks-vision";

type InMsg =
  | { type: "init"; base: string }
  | { type: "load"; what: "face" | "seg" }
  | { type: "frame"; bitmap: ImageBitmap; ts: number; face: boolean; seg: boolean };

let base = "";
let fileset: Promise<{ wasmLoaderPath: string; wasmBinaryPath: string }> | null = null;
let face: Promise<FaceLandmarker> | null = null;
let seg: Promise<ImageSegmenter> | null = null;

async function blobUrl(url: string, type: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return URL.createObjectURL(new Blob([await res.arrayBuffer()], { type }));
}
async function buffer(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

function files() {
  fileset ??= Promise.all([
    blobUrl(`${base}/vision_wasm_internal.js`, "text/javascript"),
    blobUrl(`${base}/vision_wasm_internal.wasm`, "application/wasm"),
  ]).then(([wasmLoaderPath, wasmBinaryPath]) => ({ wasmLoaderPath, wasmBinaryPath }));
  fileset.catch(() => (fileset = null));
  return fileset;
}

function loadFace() {
  face ??= (async () =>
    FaceLandmarker.createFromOptions(await files(), {
      baseOptions: { modelAssetBuffer: await buffer(`${base}/face_landmarker.task`), delegate: "CPU" },
      runningMode: "VIDEO",
      numFaces: 2,
    }))();
  face.catch(() => (face = null));
  return face;
}

function loadSeg() {
  seg ??= (async () =>
    ImageSegmenter.createFromOptions(await files(), {
      baseOptions: { modelAssetBuffer: await buffer(`${base}/selfie_segmenter.tflite`), delegate: "CPU" },
      runningMode: "VIDEO",
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    }))();
  seg.catch(() => (seg = null));
  return seg;
}

let lastTs = 0;
self.onmessage = async (e: MessageEvent<InMsg>) => {
  const m = e.data;
  if (m.type === "init") {
    base = m.base;
    return;
  }
  if (m.type === "load") {
    try {
      await (m.what === "face" ? loadFace() : loadSeg());
      self.postMessage({ type: "loaded", what: m.what });
    } catch (err) {
      self.postMessage({ type: "error", what: m.what, message: (err as Error).message });
    }
    return;
  }
  if (m.type === "frame") {
    // MediaPipe needs strictly increasing timestamps.
    const ts = Math.max(m.ts, lastTs + 1);
    lastTs = ts;
    let faces: { x: number; y: number }[][] | null = null;
    let mask: { data: Float32Array; width: number; height: number } | null = null;
    try {
      if (m.face && face) faces = (await face).detectForVideo(m.bitmap, ts).faceLandmarks.map((f) => f.map((p) => ({ x: p.x, y: p.y })));
      if (m.seg && seg) {
        const res = (await seg).segmentForVideo(m.bitmap, ts);
        const masks = res.confidenceMasks ?? [];
        const k = masks[masks.length - 1]; // the person channel
        if (k) mask = { data: k.getAsFloat32Array().slice(), width: k.width, height: k.height };
        res.close();
      }
    } catch (err) {
      self.postMessage({ type: "error", what: "frame", message: (err as Error).message });
    } finally {
      m.bitmap.close();
    }
    self.postMessage({ type: "result", faces, mask }, mask ? [mask.data.buffer] : []);
  }
};
