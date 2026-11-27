/**
 * Animated overlays (snow, hearts, butterflies...). Pure functions of time, so the live preview and the
 * exported video draw exactly the same frames.
 */
import type { Particles } from "./filters";

const EMOJI = `"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
/** Deterministic pseudo-random in [0,1) for particle i, channel k. */
const r = (i: number, k: number) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

function emoji(ctx: CanvasRenderingContext2D, e: string, x: number, y: number, size: number, rot = 0, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.font = `${Math.round(size)}px ${EMOJI}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(e, 0, 0);
  ctx.restore();
}

/** A falling/rising field: each particle loops over `period` seconds with its own phase and drift. */
function field(n: number, t: number, period: number, cb: (i: number, p: number, x: number) => void) {
  for (let i = 0; i < n; i++) {
    const p = (t / (period * (0.7 + 0.6 * r(i, 1))) + r(i, 2)) % 1;
    cb(i, p, r(i, 3));
  }
}

export function drawParticles(ctx: CanvasRenderingContext2D, kind: Particles, t: number, W: number, H: number) {
  const s = W / 720; // sizes are designed for a 720px-wide frame
  switch (kind) {
    case "snow":
      ctx.save();
      field(90, t, 9, (i, p, x) => {
        const size = (2 + r(i, 4) * 5) * s;
        const px = (x + 0.04 * Math.sin(t * (0.6 + r(i, 5)) + i)) * W;
        ctx.globalAlpha = 0.55 + 0.45 * r(i, 6);
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(px, p * (H + 20) - 10, size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
      break;
    case "rain":
      ctx.save();
      ctx.strokeStyle = "rgba(200,220,255,0.55)";
      ctx.lineCap = "round";
      field(110, t, 1.1, (i, p, x) => {
        ctx.lineWidth = (1 + r(i, 4) * 1.5) * s;
        const y = p * (H + 80) - 40, px = x * W + y * 0.08;
        ctx.beginPath();
        ctx.moveTo(px, y);
        ctx.lineTo(px + 6 * s, y + (28 + 20 * r(i, 5)) * s);
        ctx.stroke();
      });
      ctx.restore();
      break;
    case "hearts":
      field(22, t, 7, (i, p, x) => {
        const y = H + 40 - p * (H + 120);
        emoji(ctx, ["❤️", "💖", "💕", "💗"][i % 4], (x + 0.05 * Math.sin(t * 1.5 + i)) * W, y, (34 + 34 * r(i, 4)) * s, 0.3 * Math.sin(t + i), Math.min(1, p * 4, (1 - p) * 3));
      });
      break;
    case "sparkles":
      for (let i = 0; i < 40; i++) {
        const tw = Math.sin(t * (2 + 3 * r(i, 1)) + i * 2.1);
        if (tw < 0.2) continue;
        const size = (8 + 18 * r(i, 2)) * s * tw;
        const x = r(i, 3) * W, y = r(i, 4) * H;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * 0.8 + i);
        ctx.globalAlpha = tw;
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(0.3, i % 3 ? "rgba(255,240,180,0.8)" : "rgba(255,180,230,0.8)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4, rr = k % 2 ? size * 0.25 : size;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      break;
    case "butterflies":
      for (let i = 0; i < 9; i++) {
        // Lissajous flight paths with a flapping scale.
        const sp = 0.25 + 0.2 * r(i, 1);
        const x = (0.5 + 0.42 * Math.sin(t * sp * 1.3 + i * 1.7)) * W;
        const y = (0.45 + 0.4 * Math.sin(t * sp + i * 2.3)) * H;
        const flap = 0.55 + 0.45 * Math.abs(Math.sin(t * 9 + i));
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(0.3 * Math.sin(t * sp + i));
        ctx.scale(flap, 1);
        emoji(ctx, "🦋", 0, 0, (40 + 26 * r(i, 2)) * s);
        ctx.restore();
      }
      break;
    case "confetti": {
      const colors = ["#fe2c55", "#25f4ee", "#ffd400", "#a855f7", "#22c55e", "#ff8a00"];
      field(120, t, 5, (i, p, x) => {
        const y = p * (H + 40) - 20;
        const px = (x + 0.03 * Math.sin(t * 2 + i)) * W;
        ctx.save();
        ctx.translate(px, y);
        ctx.rotate(t * (2 + 3 * r(i, 4)) + i);
        ctx.scale(1, Math.cos(t * 5 + i));
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(-6 * s, -3.5 * s, 12 * s, 7 * s);
        ctx.restore();
      });
      break;
    }
    case "bubbles":
      ctx.save();
      field(26, t, 8, (i, p, x) => {
        const rr = (12 + 30 * r(i, 4)) * s;
        const px = (x + 0.04 * Math.sin(t * 1.2 + i)) * W, y = H + rr - p * (H + rr * 2);
        const g = ctx.createRadialGradient(px - rr * 0.35, y - rr * 0.35, rr * 0.1, px, y, rr);
        g.addColorStop(0, "rgba(255,255,255,0.75)");
        g.addColorStop(0.5, "rgba(180,230,255,0.12)");
        g.addColorStop(1, "rgba(160,120,255,0.35)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, y, rr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 1.5 * s;
        ctx.stroke();
      });
      ctx.restore();
      break;
    case "petals":
      field(34, t, 8, (i, p, x) => {
        const y = p * (H + 60) - 30;
        emoji(ctx, "🌸", (x + 0.08 * Math.sin(t * 0.9 + i)) * W, y, (24 + 20 * r(i, 4)) * s, t * (0.5 + r(i, 5)) + i, 0.9);
      });
      break;
  }
}
