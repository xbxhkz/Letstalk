// Puts the MediaPipe face tracker files in public/mediapipe/ so the server hosts them (used by face lenses).
// - Copies the WebAssembly runtime from node_modules/@mediapipe/tasks-vision.
// - Downloads the face landmark model once (3.6 MB, Apache-2.0) from Google's model storage.
// Runs before `dev` and `build`. A failure only disables face lenses; it never fails the build.
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const out = path.join("public", "mediapipe");
const MODELS = {
  "face_landmarker.task": "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  // Person/background segmentation for background effects (0.24 MB).
  "selfie_segmenter.tflite": "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
};
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

for (const [name, url] of Object.entries(MODELS)) {
  const model = path.join(out, name);
  if (existsSync(model) && statSync(model).size > 100_000) continue;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(model, Buffer.from(await res.arrayBuffer()));
    console.log(`[mediapipe] downloaded ${name}`);
  } catch (e) {
    console.warn(`[mediapipe] couldn't download ${name} (${e.message}). The effects that need it stay unavailable until it downloads.`);
  }
}
