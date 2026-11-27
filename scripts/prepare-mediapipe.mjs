// Puts the MediaPipe face tracker files in public/mediapipe/ so the server hosts them (used by face lenses).
// - Copies the WebAssembly runtime from node_modules/@mediapipe/tasks-vision.
// - Downloads the face landmark model once (3.6 MB, Apache-2.0) from Google's model storage.
// Runs before `dev` and `build`. A failure only disables face lenses; it never fails the build.
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const out = path.join("public", "mediapipe");
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
mkdirSync(out, { recursive: true });

const src = path.join("node_modules", "@mediapipe", "tasks-vision", "wasm");
for (const f of ["vision_wasm_internal.js", "vision_wasm_internal.wasm"]) {
  const from = path.join(src, f);
  const to = path.join(out, f);
  if (!existsSync(from)) {
    console.warn(`[mediapipe] ${from} missing; run npm install. Face lenses will be unavailable.`);
    continue;
  }
  if (!existsSync(to) || statSync(to).size !== statSync(from).size) copyFileSync(from, to);
}

const model = path.join(out, "face_landmarker.task");
if (!existsSync(model) || statSync(model).size < 1_000_000) {
  try {
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(model, Buffer.from(await res.arrayBuffer()));
    console.log("[mediapipe] downloaded face model");
  } catch (e) {
    console.warn(`[mediapipe] couldn't download the face model (${e.message}). Face lenses will be unavailable until it downloads.`);
  }
}
