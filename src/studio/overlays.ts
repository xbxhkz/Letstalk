/** Text and sticker overlays: model, drawing, and hit-testing. Positions are fractions of the frame. */

export type TextStyle = "classic" | "typewriter" | "handwriting" | "neon" | "serif";
export type TextBg = "none" | "solid" | "soft";

export type TextOverlay = {
  kind: "text";
  id: string;
  text: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  style: TextStyle;
  color: string;
  bg: TextBg;
  align: "left" | "center" | "right";
};
export type StickerOverlay = { kind: "sticker"; id: string; emoji: string; x: number; y: number; scale: number; rotation: number };
export type Overlay = TextOverlay | StickerOverlay;

export const TEXT_STYLES: { id: TextStyle; name: string; font: string }[] = [
  { id: "classic", name: "Classic", font: `800 {px}px "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` },
  { id: "typewriter", name: "Typewriter", font: `600 {px}px "Courier New", Courier, monospace` },
  { id: "handwriting", name: "Handwriting", font: `700 {px}px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive` },
  { id: "neon", name: "Neon", font: `800 {px}px "Trebuchet MS", "Segoe UI", sans-serif` },
  { id: "serif", name: "Serif", font: `700 {px}px Georgia, "Times New Roman", serif` },
];

export const TEXT_COLORS = ["#ffffff", "#000000", "#fe2c55", "#25f4ee", "#ffd400", "#2ecc71", "#3b82f6", "#a855f7", "#ff8a00", "#f9a8d4"];

export const STICKERS = ["😂", "😍", "🔥", "💯", "✨", "❤️", "👀", "🎉", "😎", "🥺", "😭", "🙌", "👑", "💅", "🌈", "⭐", "🍕", "🐶", "🐱", "🦋", "🌸", "💀", "🤯", "🫶", "👏", "🎶", "📍", "☀️", "🌙", "💬"];

const BASE_PX = 56; // text size at scale 1 on the 720px-wide frame
const LINE = 1.22;

const fontFor = (style: TextStyle, px: number) => TEXT_STYLES.find((s) => s.id === style)!.font.replace("{px}", String(Math.round(px)));

/** Contrasting text colour for the "solid" background style. */
function contrastOn(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.6 ? "#000000" : "#ffffff";
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Bounding box (in frame pixels, before rotation) of an overlay — used for hit-testing. */
export function measure(ctx: CanvasRenderingContext2D, o: Overlay, W: number, H: number) {
  if (o.kind === "sticker") {
    const s = 110 * o.scale;
    return { cx: o.x * W, cy: o.y * H, w: s, h: s };
  }
  const px = BASE_PX * o.scale;
  ctx.font = fontFor(o.style, px);
  const lines = (o.text || " ").split("\n");
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + px * 0.7;
  const h = lines.length * px * LINE + px * 0.4;
  return { cx: o.x * W, cy: o.y * H, w, h };
}

/** `progress` (0..1) animates overlays in (pop), used by text posts. */
export function drawOverlays(ctx: CanvasRenderingContext2D, overlays: Overlay[], W: number, H: number, progress = 1) {
  for (const o of overlays) {
    const pop = progress >= 1 ? 1 : easeOutBack(Math.min(1, progress));
    ctx.save();
    ctx.translate(o.x * W, o.y * H);
    ctx.rotate(o.rotation);
    ctx.scale(pop, pop);
    if (o.kind === "sticker") {
      const s = 110 * o.scale;
      ctx.font = `${Math.round(s)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(o.emoji, 0, 0);
    } else {
      drawText(ctx, o);
    }
    ctx.restore();
  }
}

function drawText(ctx: CanvasRenderingContext2D, o: TextOverlay) {
  const px = BASE_PX * o.scale;
  ctx.font = fontFor(o.style, px);
  ctx.textBaseline = "middle";
  const lines = (o.text || "").split("\n");
  const lh = px * LINE;
  const top = (-(lines.length - 1) * lh) / 2;
  const widths = lines.map((l) => ctx.measureText(l).width);
  const maxW = Math.max(0, ...widths);
  const padX = px * 0.35, padY = px * 0.16;
  const xFor = (w: number) => (o.align === "left" ? -maxW / 2 : o.align === "right" ? maxW / 2 - w : -w / 2);

  // TikTok-style background: a rounded box per line.
  if (o.bg !== "none") {
    ctx.fillStyle = o.bg === "solid" ? o.color : "rgba(0,0,0,0.55)";
    lines.forEach((l, i) => {
      if (!l.trim()) return;
      roundRect(ctx, xFor(widths[i]) - padX, top + i * lh - lh / 2 - padY + lh * 0.1, widths[i] + padX * 2, lh + padY * 2 - lh * 0.2, px * 0.28);
      ctx.fill();
    });
  }
  const fill = o.bg === "solid" ? contrastOn(o.color) : o.color;
  lines.forEach((l, i) => {
    const x = xFor(widths[i]);
    const y = top + i * lh;
    if (o.style === "neon") {
      ctx.shadowColor = o.color;
      ctx.shadowBlur = px * 0.6;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(l, x, y);
      ctx.shadowBlur = px * 0.25;
      ctx.fillText(l, x, y);
      ctx.shadowBlur = 0;
      return;
    }
    if (o.bg === "none") {
      // Outline so plain text reads on any background.
      ctx.lineWidth = Math.max(2, px * 0.09);
      ctx.strokeStyle = fill === "#000000" ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.55)";
      ctx.lineJoin = "round";
      ctx.strokeText(l, x, y);
    }
    ctx.fillStyle = fill;
    ctx.fillText(l, x, y);
  });
}

function easeOutBack(t: number) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** Topmost overlay under a frame-pixel point. */
export function hitTest(ctx: CanvasRenderingContext2D, overlays: Overlay[], W: number, H: number, px: number, py: number) {
  for (let i = overlays.length - 1; i >= 0; i--) {
    const o = overlays[i];
    const b = measure(ctx, o, W, H);
    // Undo the overlay's rotation around its centre.
    const dx = px - b.cx, dy = py - b.cy;
    const c = Math.cos(-o.rotation), s = Math.sin(-o.rotation);
    const lx = dx * c - dy * s, ly = dx * s + dy * c;
    if (Math.abs(lx) <= b.w / 2 + 12 && Math.abs(ly) <= b.h / 2 + 12) return o;
  }
  return null;
}

export const newId = () => Math.random().toString(36).slice(2, 10);
