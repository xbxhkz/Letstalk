/**
 * Face lenses (Snapchat-style AR), face distortion and background segmentation, all from MediaPipe.
 * The runtime (WebAssembly) and models are served by the Letstalk server at `${base}/...`
 * (see scripts/prepare-mediapipe.mjs) and loaded only when first needed.
 */
import type { FaceLandmarker, ImageSegmenter } from "@mediapipe/tasks-vision";
import type { WarpPoint } from "./warp";

export type LensId =
  | "none" | "shades" | "crown" | "dog" | "hearts" | "blush" | "clown" | "cat" | "sparkle"
  | "devil" | "angel" | "bunny" | "bear" | "flowers" | "flutter" | "tears" | "party" | "pirate" | "stareyes" | "rainbow" | "freckles" | "facepaint"
  | "bigeyes" | "bigmouth" | "slim" | "alien" | "stretch" | "faceswirl" | "bobble";

export type FaceItem = { id: LensId; name: string; icon: string; kind: "lens" | "warp" };

export const LENSES: FaceItem[] = [
  { id: "none", name: "None", icon: "⦸", kind: "lens" },
  // AR lenses
  { id: "dog", name: "Puppy", icon: "🐶", kind: "lens" },
  { id: "cat", name: "Kitty", icon: "🐱", kind: "lens" },
  { id: "bunny", name: "Bunny", icon: "🐰", kind: "lens" },
  { id: "bear", name: "Teddy", icon: "🧸", kind: "lens" },
  { id: "devil", name: "Neon devil", icon: "😈", kind: "lens" },
  { id: "angel", name: "Angel", icon: "😇", kind: "lens" },
  { id: "flowers", name: "Flower crown", icon: "🌺", kind: "lens" },
  { id: "flutter", name: "Butterflies", icon: "🦋", kind: "lens" },
  { id: "crown", name: "Royal", icon: "👑", kind: "lens" },
  { id: "shades", name: "Shades", icon: "🕶️", kind: "lens" },
  { id: "hearts", name: "Heart eyes", icon: "😍", kind: "lens" },
  { id: "stareyes", name: "Star eyes", icon: "🤩", kind: "lens" },
  { id: "rainbow", name: "Rainbow", icon: "🌈", kind: "lens" },
  { id: "tears", name: "Crying", icon: "😭", kind: "lens" },
  { id: "party", name: "Party", icon: "🥳", kind: "lens" },
  { id: "pirate", name: "Pirate", icon: "🏴‍☠️", kind: "lens" },
  { id: "blush", name: "Blush", icon: "🌸", kind: "lens" },
  { id: "freckles", name: "Freckles", icon: "🤎", kind: "lens" },
  { id: "facepaint", name: "Face paint", icon: "🎨", kind: "lens" },
  { id: "clown", name: "Clown", icon: "🤡", kind: "lens" },
  { id: "sparkle", name: "Sparkle", icon: "✨", kind: "lens" },
  // distortions
  { id: "bigeyes", name: "Big eyes", icon: "👀", kind: "warp" },
  { id: "bigmouth", name: "Big mouth", icon: "👄", kind: "warp" },
  { id: "slim", name: "Slim face", icon: "🫥", kind: "warp" },
  { id: "alien", name: "Alien", icon: "👽", kind: "warp" },
  { id: "stretch", name: "Stretch", icon: "🫠", kind: "warp" },
  { id: "faceswirl", name: "Twisted", icon: "😵‍💫", kind: "warp" },
  { id: "bobble", name: "Bobblehead", icon: "🎈", kind: "warp" },
];

export const isWarp = (id: LensId) => LENSES.find((l) => l.id === id)?.kind === "warp";

// Landmark indices (MediaPipe face mesh, 478 points).
const P = {
  forehead: 10, chin: 152, noseTip: 1, leftEyeOuter: 33, rightEyeOuter: 263, leftEyeTop: 159, leftEyeBottom: 145, rightEyeTop: 386, rightEyeBottom: 374,
  leftCheek: 50, rightCheek: 280, upperLip: 13, lowerLip: 14, mouthLeft: 61, mouthRight: 291, jawLeft: 234, jawRight: 454,
};

type Pt = { x: number; y: number };
type Mapper = (x: number, y: number) => Pt;

const preferCpu = () => typeof navigator !== "undefined" && /Android|iPhone|iPad|LetstalkApp/i.test(navigator.userAgent);

/** How often to run face detection / segmentation. CPU work is throttled; effects reuse the last result. */
export const DETECT_INTERVAL_MS = () => (preferCpu() ? 66 : 0);

let files: Promise<unknown> | null = null;
async function vision(base: string) {
  const mp = await import("@mediapipe/tasks-vision");
  files ??= mp.FilesetResolver.forVisionTasks(base);
  return { mp, files: (await files) as Awaited<ReturnType<typeof mp.FilesetResolver.forVisionTasks>> };
}

let landmarker: Promise<FaceLandmarker> | null = null;
export function loadLandmarker(base: string): Promise<FaceLandmarker> {
  landmarker ??= (async () => {
    const { mp, files } = await vision(base);
    const make = (delegate: "GPU" | "CPU") =>
      mp.FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: `${base}/face_landmarker.task`, delegate }, runningMode: "VIDEO", numFaces: 2 });
    // On Android WebViews the GPU delegate often initialises fine and then fails every frame
    // (GL_INVALID_OPERATION in glFramebufferTexture2D), returning no faces. The CPU (XNNPACK)
    // delegate is reliable there and fast enough when throttled (see DETECT_INTERVAL_MS).
    if (preferCpu()) return await make("CPU");
    try {
      return await make("GPU");
    } catch {
      return await make("CPU");
    }
  })();
  landmarker.catch(() => (landmarker = null)); // allow a retry after a failure
  return landmarker;
}

let segmenter: Promise<ImageSegmenter> | null = null;
/** Person/background segmentation (MediaPipe Selfie Segmenter, 0.24 MB). */
export function loadSegmenter(base: string): Promise<ImageSegmenter> {
  segmenter ??= (async () => {
    const { mp, files } = await vision(base);
    const make = (delegate: "GPU" | "CPU") =>
      mp.ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: `${base}/selfie_segmenter.tflite`, delegate },
        runningMode: "VIDEO",
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
    if (preferCpu()) return await make("CPU");
    try {
      return await make("GPU");
    } catch {
      return await make("CPU");
    }
  })();
  segmenter.catch(() => (segmenter = null));
  return segmenter;
}

const EMOJI_FONT = `"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;

function emoji(ctx: CanvasRenderingContext2D, e: string, at: Pt, size: number, angle: number, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(at.x, at.y);
  ctx.rotate(angle);
  ctx.font = `${Math.round(size)}px ${EMOJI_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(e, 0, 0);
  ctx.restore();
}

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Geometry of one face in canvas pixels. */
function faceGeo(face: { x: number; y: number }[], map: Mapper) {
  const p = (i: number) => map(face[i].x, face[i].y);
  const le = p(P.leftEyeOuter), re = p(P.rightEyeOuter);
  const [a, b] = le.x <= re.x ? [le, re] : [re, le];
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const eyeSpan = dist(a, b);
  const lEye = mid(p(P.leftEyeTop), p(P.leftEyeBottom)), rEye = mid(p(P.rightEyeTop), p(P.rightEyeBottom));
  const [eyeL, eyeR] = lEye.x <= rEye.x ? [lEye, rEye] : [rEye, lEye];
  const upper = p(P.upperLip), lower = p(P.lowerLip);
  return {
    p, angle, eyeSpan, eyeL, eyeR,
    eyes: mid(a, b),
    up: { x: Math.sin(angle), y: -Math.cos(angle) }, // "up" relative to the head
    side: { x: Math.cos(angle), y: Math.sin(angle) },
    fore: p(P.forehead), nose: p(P.noseTip), chin: p(P.chin),
    mouth: mid(upper, lower), lower,
    mouthOpen: dist(upper, lower) / eyeSpan,
    cheeks: [p(P.leftCheek), p(P.rightCheek)],
    faceW: dist(p(P.jawLeft), p(P.jawRight)),
  };
}
type Geo = ReturnType<typeof faceGeo>;
const along = (g: Geo, from: Pt, upK: number, sideK = 0): Pt => ({
  x: from.x + g.up.x * g.eyeSpan * upK + g.side.x * g.eyeSpan * sideK,
  y: from.y + g.up.y * g.eyeSpan * upK + g.side.y * g.eyeSpan * sideK,
});

function saved(ctx: CanvasRenderingContext2D, draw: () => void) {
  ctx.save();
  draw();
  ctx.restore();
}

/** Face distortion points for warp lenses. */
export function warpsFor(lens: LensId, faces: { x: number; y: number }[][], map: Mapper, time: number): WarpPoint[] {
  const out: WarpPoint[] = [];
  for (const face of faces.slice(0, 2)) {
    const g = faceGeo(face, map);
    const s = g.eyeSpan;
    switch (lens) {
      case "bigeyes":
        out.push({ ...g.eyeL, radius: s * 0.42, strength: 0.42, type: "bulge" }, { ...g.eyeR, radius: s * 0.42, strength: 0.42, type: "bulge" });
        break;
      case "bigmouth":
        out.push({ ...g.mouth, radius: s * 0.75, strength: 0.5, type: "bulge" });
        break;
      case "slim":
        // Squeeze the lower face horizontally (sampling further out compresses the content).
        out.push({ ...mid(g.nose, g.chin), radius: s * 1.55, strength: -0.3, type: "stretchX" });
        break;
      case "alien":
        out.push({ ...g.eyeL, radius: s * 0.5, strength: 0.55, type: "bulge" }, { ...g.eyeR, radius: s * 0.5, strength: 0.55, type: "bulge" }, { ...g.mouth, radius: s * 0.55, strength: -0.45, type: "bulge" }, { ...along(g, g.fore, 0.3), radius: s * 1.1, strength: 0.3, type: "bulge" });
        break;
      case "stretch":
        // Elongate the face: sampling nearer the centre vertically stretches the content.
        out.push({ ...g.nose, radius: s * 2.1, strength: 0.4, type: "stretchY" });
        break;
      case "faceswirl":
        out.push({ ...g.nose, radius: s * 1.5, strength: 1.4 + 0.5 * Math.sin(time * 2), type: "swirl" });
        break;
      case "bobble":
        out.push({ ...g.nose, radius: s * 1.9, strength: 0.38, type: "bulge" });
        break;
    }
  }
  return out;
}

/** Draw `lens` for every detected face. `faces` are normalised landmark lists from MediaPipe. */
export function drawLens(ctx: CanvasRenderingContext2D, lens: LensId, faces: { x: number; y: number }[][], map: Mapper, time: number) {
  if (lens === "none" || isWarp(lens)) return;
  for (const face of faces) {
    const g = faceGeo(face, map);
    const { angle, eyeSpan: s } = g;
    switch (lens) {
      case "shades":
        emoji(ctx, "🕶️", { x: g.eyes.x, y: g.eyes.y + s * 0.05 }, s * 1.35, angle);
        break;
      case "crown":
        emoji(ctx, "👑", along(g, g.fore, 0.55), s * 1.25, angle);
        break;
      case "hearts": {
        const k = s * 0.42 * (1 + 0.08 * Math.sin(time * 8));
        emoji(ctx, "❤️", g.eyeL, k, angle);
        emoji(ctx, "❤️", g.eyeR, k, angle);
        break;
      }
      case "stareyes": {
        const k = s * 0.45 * (1 + 0.1 * Math.sin(time * 6));
        emoji(ctx, "⭐", g.eyeL, k, angle + time * 1.5);
        emoji(ctx, "⭐", g.eyeR, k, angle - time * 1.5);
        break;
      }
      case "clown":
        emoji(ctx, "🔴", g.nose, s * 0.45, angle);
        break;
      case "blush":
        for (const c of g.cheeks) {
          const gr = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, s * 0.32);
          gr.addColorStop(0, "rgba(255,105,140,0.55)");
          gr.addColorStop(1, "rgba(255,105,140,0)");
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.arc(c.x, c.y, s * 0.32, 0, Math.PI * 2);
          ctx.fill();
        }
        emoji(ctx, "✨", along(g, g.fore, 0.2, 0.5), s * 0.3, angle);
        break;
      case "freckles":
        saved(ctx, () => {
          ctx.fillStyle = "rgba(120,70,40,0.55)";
          for (const [ci, c] of g.cheeks.entries()) for (let i = 0; i < 9; i++) {
            const a = (i * 2.4 + ci) % (Math.PI * 2), rr = s * (0.06 + 0.16 * ((i * 37) % 10) / 10);
            ctx.beginPath();
            ctx.arc(c.x + Math.cos(a) * rr, c.y - s * 0.12 + Math.sin(a) * rr * 0.6, s * (0.012 + 0.008 * (i % 3)), 0, Math.PI * 2);
            ctx.fill();
          }
        });
        break;
      case "facepaint":
        saved(ctx, () => {
          const colors = ["#ff2d6f", "#ffb800", "#2ecc71", "#25f4ee", "#a855f7"];
          for (const [ci, c] of g.cheeks.entries()) {
            ctx.save();
            ctx.translate(c.x, c.y - s * 0.12);
            ctx.rotate(angle + (ci ? -0.15 : 0.15));
            colors.forEach((col, i) => {
              ctx.fillStyle = col;
              ctx.globalAlpha = 0.7;
              ctx.beginPath();
              ctx.ellipse((ci ? -1 : 1) * s * 0.02, (i - 2) * s * 0.045, s * 0.17, s * 0.02, 0, 0, Math.PI * 2);
              ctx.fill();
            });
            ctx.restore();
          }
        });
        break;
      case "sparkle":
        for (let i = 0; i < 6; i++) {
          const t = time * 1.5 + i * 1.05;
          const r = s * (1.05 + 0.15 * Math.sin(t * 2));
          emoji(ctx, i % 2 ? "✨" : "⭐", { x: g.eyes.x + Math.cos(t) * r, y: g.eyes.y - s * 0.2 + Math.sin(t) * r * 0.9 }, s * 0.25, 0);
        }
        break;
      case "flutter":
        for (let i = 0; i < 4; i++) {
          const t = time * 1.1 + (i * Math.PI) / 2;
          const c = along(g, g.fore, 0.2);
          const flap = 0.55 + 0.45 * Math.abs(Math.sin(time * 9 + i));
          ctx.save();
          ctx.translate(c.x + Math.cos(t) * s * 1.25, c.y + Math.sin(t) * s * 0.55);
          ctx.scale(flap, 1);
          emoji(ctx, "🦋", { x: 0, y: 0 }, s * 0.42, 0.2 * Math.sin(t));
          ctx.restore();
        }
        break;
      case "flowers": {
        const c = along(g, g.fore, 0.15);
        const fl = ["🌸", "🌼", "🌺", "🌷", "🌸", "🌼", "🌺"];
        fl.forEach((e, i) => {
          const a = Math.PI + (i / (fl.length - 1)) * Math.PI; // arc over the head
          const off = { x: Math.cos(a) * s * 1.05, y: Math.sin(a) * s * 0.45 };
          const rot = { x: off.x * Math.cos(angle) - off.y * Math.sin(angle), y: off.x * Math.sin(angle) + off.y * Math.cos(angle) };
          emoji(ctx, e, { x: c.x + rot.x, y: c.y + rot.y }, s * 0.42, angle);
        });
        break;
      }
      case "devil": {
        ctx.save();
        ctx.shadowColor = "#ff1744";
        ctx.shadowBlur = s * 0.25;
        ctx.fillStyle = "#ff1744";
        for (const dir of [-1, 1]) {
          const base = along(g, g.fore, 0.25, dir * 0.55);
          ctx.save();
          ctx.translate(base.x, base.y);
          ctx.rotate(angle + dir * 0.35);
          ctx.beginPath();
          ctx.moveTo(-s * 0.16, 0);
          ctx.quadraticCurveTo(-s * 0.05, -s * 0.35, dir * s * 0.12, -s * 0.62);
          ctx.quadraticCurveTo(s * 0.05, -s * 0.3, s * 0.16, 0);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
        break;
      }
      case "angel": {
        const c = along(g, g.fore, 0.8);
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(angle);
        ctx.shadowColor = "#ffe082";
        ctx.shadowBlur = s * 0.35;
        ctx.strokeStyle = "#ffd54f";
        ctx.lineWidth = s * 0.08;
        ctx.beginPath();
        ctx.ellipse(0, Math.sin(time * 2) * s * 0.04, s * 0.65, s * 0.16, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case "party": {
        const base = along(g, g.fore, 0.35, 0.35);
        ctx.save();
        ctx.translate(base.x, base.y);
        ctx.rotate(angle + 0.3);
        const h = s * 1.1, w = s * 0.38;
        ctx.beginPath();
        ctx.moveTo(-w, 0);
        ctx.lineTo(0, -h);
        ctx.lineTo(w, 0);
        ctx.closePath();
        ctx.save();
        ctx.clip();
        const stripes = ["#ff2d6f", "#ffd400", "#25f4ee", "#a855f7"];
        for (let i = 0; i < 10; i++) {
          ctx.fillStyle = stripes[i % stripes.length];
          ctx.fillRect(-w, -h + (i * h) / 10, w * 2, h / 10 + 1);
        }
        ctx.restore();
        emoji(ctx, "⚪", { x: 0, y: -h }, s * 0.28, 0);
        ctx.restore();
        break;
      }
      case "pirate": {
        ctx.save();
        ctx.strokeStyle = "#111";
        ctx.lineWidth = s * 0.05;
        const a = along(g, g.eyeL, 0.55, -0.6), b = along(g, g.eyeR, 0.5, 0.75);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.translate(g.eyeL.x, g.eyeL.y);
        ctx.rotate(angle);
        ctx.fillStyle = "#111";
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.24, s * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        emoji(ctx, "🏴‍☠️", along(g, g.fore, 0.6), s * 0.55, angle);
        break;
      }
      case "tears":
        for (const eye of [g.eyeL, g.eyeR]) {
          for (let k = 0; k < 4; k++) {
            const p = ((time * 0.9 + k / 4) % 1);
            const at = along(g, eye, -0.15 - p * 1.1);
            ctx.save();
            ctx.globalAlpha = 0.85 * (1 - p);
            ctx.fillStyle = "#4fc3f7";
            ctx.beginPath();
            ctx.ellipse(at.x, at.y, s * 0.05, s * 0.08, angle, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
        break;
      case "rainbow":
        if (g.mouthOpen > 0.12) {
          const colors = ["#ff1744", "#ff9100", "#ffea00", "#00e676", "#2979ff", "#d500f9"];
          const len = Math.min(1, (g.mouthOpen - 0.12) * 4);
          ctx.save();
          ctx.translate(g.lower.x, g.lower.y);
          ctx.rotate(angle);
          colors.forEach((col, i) => {
            ctx.fillStyle = col;
            ctx.fillRect(-s * 0.3 + (i * s * 0.6) / colors.length, 0, (s * 0.6) / colors.length + 1, s * 4 * len);
          });
          ctx.restore();
        }
        break;
      case "bunny":
      case "bear":
      case "dog":
      case "cat": {
        const top = along(g, g.fore, 0.35);
        for (const dir of [-1, 1]) {
          const ear = { x: top.x + g.side.x * dir * s * 0.75, y: top.y + g.side.y * dir * s * 0.75 };
          ctx.save();
          ctx.translate(ear.x, ear.y);
          if (lens === "bunny") {
            ctx.rotate(angle + dir * 0.18);
            ctx.fillStyle = "#f5f5f5";
            ctx.beginPath();
            ctx.ellipse(0, -s * 0.55, s * 0.2, s * 0.62, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#f8bbd0";
            ctx.beginPath();
            ctx.ellipse(0, -s * 0.52, s * 0.1, s * 0.45, 0, 0, Math.PI * 2);
            ctx.fill();
          } else if (lens === "bear") {
            ctx.rotate(angle);
            ctx.fillStyle = "#6d4c41";
            ctx.beginPath();
            ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#bcaaa4";
            ctx.beginPath();
            ctx.arc(0, 0, s * 0.16, 0, Math.PI * 2);
            ctx.fill();
          } else if (lens === "dog") {
            ctx.rotate(angle + dir * 0.45);
            ctx.fillStyle = "#8b5a2b";
            ctx.beginPath();
            ctx.ellipse(0, s * 0.15, s * 0.28, s * 0.55, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#c08552";
            ctx.beginPath();
            ctx.ellipse(0, s * 0.2, s * 0.16, s * 0.38, 0, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.rotate(angle + dir * 0.2);
            const k = s * 0.55;
            ctx.fillStyle = "#3f3f46";
            ctx.beginPath();
            ctx.moveTo(-k * 0.5, k * 0.35);
            ctx.lineTo(0, -k * 0.65);
            ctx.lineTo(k * 0.5, k * 0.35);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = "#f9a8d4";
            ctx.beginPath();
            ctx.moveTo(-k * 0.28, k * 0.25);
            ctx.lineTo(0, -k * 0.35);
            ctx.lineTo(k * 0.28, k * 0.25);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        }
        // Nose.
        ctx.save();
        ctx.translate(g.nose.x, g.nose.y);
        ctx.rotate(angle);
        const noseCol = lens === "dog" || lens === "bear" ? "#1f1f1f" : lens === "bunny" ? "#f48fb1" : "#f472b6";
        const nw = lens === "dog" ? 0.2 : lens === "bear" ? 0.16 : 0.1, nh = lens === "dog" ? 0.14 : lens === "bear" ? 0.11 : 0.08;
        ctx.fillStyle = noseCol;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * nw, s * nh, 0, 0, Math.PI * 2);
        ctx.fill();
        if (lens === "cat" || lens === "bunny") {
          ctx.strokeStyle = lens === "cat" ? "rgba(30,30,30,0.85)" : "rgba(255,255,255,0.9)";
          ctx.lineWidth = Math.max(2, s * 0.02);
          for (const dir of [-1, 1]) for (const k of [-1, 0, 1]) {
            ctx.beginPath();
            ctx.moveTo(dir * s * 0.15, s * 0.08);
            ctx.lineTo(dir * s * 0.6, s * (0.05 + k * 0.1));
            ctx.stroke();
          }
        }
        ctx.restore();
        // Tongue when the mouth opens.
        if (lens === "dog" && g.mouthOpen > 0.18) {
          ctx.save();
          ctx.translate(g.lower.x, g.lower.y);
          ctx.rotate(angle);
          ctx.fillStyle = "#f472b6";
          ctx.beginPath();
          ctx.ellipse(0, s * 0.22, s * 0.17, s * 0.28, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        break;
      }
    }
  }
}
