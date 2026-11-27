/**
 * Face lenses (Snapchat-style AR) using MediaPipe Face Landmarker (478 face points).
 * The runtime (WebAssembly) and model are served by the Letstalk server at `${base}/...`
 * (see scripts/prepare-mediapipe.mjs) and loaded only when a lens is first chosen.
 */
import type { FaceLandmarker } from "@mediapipe/tasks-vision";

export type LensId = "none" | "shades" | "crown" | "dog" | "hearts" | "blush" | "clown" | "cat" | "sparkle";

export const LENSES: { id: LensId; name: string; icon: string }[] = [
  { id: "none", name: "None", icon: "⦸" },
  { id: "shades", name: "Shades", icon: "🕶️" },
  { id: "dog", name: "Puppy", icon: "🐶" },
  { id: "cat", name: "Kitty", icon: "🐱" },
  { id: "crown", name: "Royal", icon: "👑" },
  { id: "hearts", name: "Heart eyes", icon: "😍" },
  { id: "blush", name: "Blush", icon: "🌸" },
  { id: "clown", name: "Clown", icon: "🤡" },
  { id: "sparkle", name: "Sparkle", icon: "✨" },
];

// Landmark indices (MediaPipe face mesh).
const P = {
  forehead: 10, chin: 152, noseTip: 1, leftEyeOuter: 33, rightEyeOuter: 263, leftEyeTop: 159, leftEyeBottom: 145, rightEyeTop: 386, rightEyeBottom: 374,
  leftCheek: 50, rightCheek: 280, upperLip: 13, lowerLip: 14, leftTemple: 103, rightTemple: 332,
};

type Pt = { x: number; y: number };
type Mapper = (x: number, y: number) => Pt;

let loading: Promise<FaceLandmarker> | null = null;

export function loadLandmarker(base: string): Promise<FaceLandmarker> {
  loading ??= (async () => {
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const files = await FilesetResolver.forVisionTasks(base);
    const make = (delegate: "GPU" | "CPU") =>
      FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: `${base}/face_landmarker.task`, delegate },
        runningMode: "VIDEO",
        numFaces: 2,
      });
    try {
      return await make("GPU");
    } catch {
      return await make("CPU");
    }
  })();
  loading.catch(() => (loading = null)); // allow a retry after a failure
  return loading;
}

const EMOJI_FONT = `"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;

function emoji(ctx: CanvasRenderingContext2D, e: string, at: Pt, size: number, angle: number) {
  ctx.save();
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

/** Draw `lens` for every detected face. `faces` are normalised landmark lists from MediaPipe. */
export function drawLens(ctx: CanvasRenderingContext2D, lens: LensId, faces: { x: number; y: number }[][], map: Mapper, time: number) {
  if (lens === "none") return;
  for (const face of faces) {
    const p = (i: number) => map(face[i].x, face[i].y);
    const le = p(P.leftEyeOuter), re = p(P.rightEyeOuter);
    // Angle of the eye line; the mapper already handles mirroring, so order the points left-to-right.
    const [a, b] = le.x <= re.x ? [le, re] : [re, le];
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const eyeSpan = dist(a, b);
    const eyes = mid(a, b);
    const up = { x: Math.sin(angle), y: -Math.cos(angle) }; // "up" relative to the head
    const fore = p(P.forehead);
    const nose = p(P.noseTip);
    const lEye = mid(p(P.leftEyeTop), p(P.leftEyeBottom));
    const rEye = mid(p(P.rightEyeTop), p(P.rightEyeBottom));
    const mouthOpen = dist(p(P.upperLip), p(P.lowerLip)) / eyeSpan;

    switch (lens) {
      case "shades":
        emoji(ctx, "🕶️", { x: eyes.x, y: eyes.y + eyeSpan * 0.05 }, eyeSpan * 1.35, angle);
        break;
      case "crown":
        emoji(ctx, "👑", { x: fore.x + up.x * eyeSpan * 0.55, y: fore.y + up.y * eyeSpan * 0.55 }, eyeSpan * 1.25, angle);
        break;
      case "hearts": {
        const s = eyeSpan * 0.42 * (1 + 0.08 * Math.sin(time * 8));
        emoji(ctx, "❤️", lEye, s, angle);
        emoji(ctx, "❤️", rEye, s, angle);
        break;
      }
      case "clown":
        emoji(ctx, "🔴", nose, eyeSpan * 0.45, angle);
        break;
      case "blush":
        for (const c of [p(P.leftCheek), p(P.rightCheek)]) {
          const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, eyeSpan * 0.32);
          g.addColorStop(0, "rgba(255,105,140,0.55)");
          g.addColorStop(1, "rgba(255,105,140,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(c.x, c.y, eyeSpan * 0.32, 0, Math.PI * 2);
          ctx.fill();
        }
        emoji(ctx, "✨", { x: fore.x + up.x * eyeSpan * 0.2 + eyeSpan * 0.5, y: fore.y + up.y * eyeSpan * 0.2 }, eyeSpan * 0.3, angle);
        break;
      case "sparkle":
        for (let i = 0; i < 6; i++) {
          const t = time * 1.5 + i * 1.05;
          const r = eyeSpan * (1.05 + 0.15 * Math.sin(t * 2));
          emoji(ctx, i % 2 ? "✨" : "⭐", { x: eyes.x + Math.cos(t) * r, y: eyes.y - eyeSpan * 0.2 + Math.sin(t) * r * 0.9 }, eyeSpan * 0.25, 0);
        }
        break;
      case "dog":
      case "cat": {
        const dog = lens === "dog";
        // Ears on either side of the top of the head.
        const top = { x: fore.x + up.x * eyeSpan * 0.35, y: fore.y + up.y * eyeSpan * 0.35 };
        const side = { x: Math.cos(angle), y: Math.sin(angle) };
        for (const dir of [-1, 1]) {
          const ear = { x: top.x + side.x * dir * eyeSpan * 0.75, y: top.y + side.y * dir * eyeSpan * 0.75 };
          ctx.save();
          ctx.translate(ear.x, ear.y);
          ctx.rotate(angle + dir * (dog ? 0.45 : 0.2));
          if (dog) {
            ctx.fillStyle = "#8b5a2b";
            ctx.beginPath();
            ctx.ellipse(0, eyeSpan * 0.15, eyeSpan * 0.28, eyeSpan * 0.55, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#c08552";
            ctx.beginPath();
            ctx.ellipse(0, eyeSpan * 0.2, eyeSpan * 0.16, eyeSpan * 0.38, 0, 0, Math.PI * 2);
            ctx.fill();
          } else {
            const s = eyeSpan * 0.55;
            ctx.fillStyle = "#3f3f46";
            ctx.beginPath();
            ctx.moveTo(-s * 0.5, s * 0.35);
            ctx.lineTo(0, -s * 0.65);
            ctx.lineTo(s * 0.5, s * 0.35);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = "#f9a8d4";
            ctx.beginPath();
            ctx.moveTo(-s * 0.28, s * 0.25);
            ctx.lineTo(0, -s * 0.35);
            ctx.lineTo(s * 0.28, s * 0.25);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        }
        // Nose.
        ctx.save();
        ctx.translate(nose.x, nose.y);
        ctx.rotate(angle);
        ctx.fillStyle = dog ? "#1f1f1f" : "#f472b6";
        ctx.beginPath();
        ctx.ellipse(0, 0, eyeSpan * (dog ? 0.2 : 0.1), eyeSpan * (dog ? 0.14 : 0.08), 0, 0, Math.PI * 2);
        ctx.fill();
        if (!dog) {
          // Whiskers.
          ctx.strokeStyle = "rgba(30,30,30,0.85)";
          ctx.lineWidth = Math.max(2, eyeSpan * 0.02);
          for (const dir of [-1, 1]) for (const k of [-1, 0, 1]) {
            ctx.beginPath();
            ctx.moveTo(dir * eyeSpan * 0.15, eyeSpan * 0.08);
            ctx.lineTo(dir * eyeSpan * 0.6, eyeSpan * (0.05 + k * 0.1));
            ctx.stroke();
          }
        }
        ctx.restore();
        // Tongue when the mouth opens.
        if (dog && mouthOpen > 0.18) {
          const lip = p(P.lowerLip);
          ctx.save();
          ctx.translate(lip.x, lip.y);
          ctx.rotate(angle);
          ctx.fillStyle = "#f472b6";
          ctx.beginPath();
          ctx.ellipse(0, eyeSpan * 0.22, eyeSpan * 0.17, eyeSpan * 0.28, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        break;
      }
    }
  }
}
