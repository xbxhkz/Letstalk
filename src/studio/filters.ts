/**
 * Colour filters, screen effects and overlays for the camera studio.
 *
 * A filter = optional colour overlays ("layers", blended like CSS mix-blend-mode) followed by a colour
 * transform built from CSS filter functions (contrast, brightness, saturate, sepia, grayscale,
 * hue-rotate — using the exact matrices from the W3C Filter Effects spec), plus optional glow,
 * vignette and grain. Everything runs in one GPU shader (compositor.ts).
 *
 * The "Classic" looks are ported from CSSgram by Una Kravets (MIT License), which recreates well-known
 * photo-app filters with CSS filters and blend modes — see THIRD_PARTY_NOTICES.md. They are renamed here.
 */
export type Affine = { m: number[]; o: number[] }; // row-major 3x3, offset

const I: Affine = { m: [1, 0, 0, 0, 1, 0, 0, 0, 1], o: [0, 0, 0] };

/** Apply `b` after `a`. */
function then(a: Affine, b: Affine): Affine {
  const m = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) m[r * 3 + c] += b.m[r * 3 + k] * a.m[k * 3 + c];
  const o = [0, 1, 2].map((r) => b.m[r * 3] * a.o[0] + b.m[r * 3 + 1] * a.o[1] + b.m[r * 3 + 2] * a.o[2] + b.o[r]);
  return { m, o };
}
const chain = (...xs: Affine[]) => xs.reduce(then, I);
const lin = (m: number[]): Affine => ({ m, o: [0, 0, 0] });

// ---- CSS filter functions (W3C Filter Effects Module, "filter primitive" matrices) ----
export const saturate = (s: number) =>
  lin([0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s]);
export const grayscale = (a: number) => {
  const k = 1 - Math.min(1, a);
  return lin([0.2126 + 0.7874 * k, 0.7152 - 0.7152 * k, 0.0722 - 0.0722 * k, 0.2126 - 0.2126 * k, 0.7152 + 0.2848 * k, 0.0722 - 0.0722 * k, 0.2126 - 0.2126 * k, 0.7152 - 0.7152 * k, 0.0722 + 0.9278 * k]);
};
export const sepia = (a: number) => {
  const k = 1 - Math.min(1, a);
  return lin([0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k, 0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k, 0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k]);
};
export const hueRotate = (deg: number) => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return lin([
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ]);
};
export const brightness = (b: number) => lin([b, 0, 0, 0, b, 0, 0, 0, b]);
export const contrast = (c: number): Affine => ({ m: [c, 0, 0, 0, c, 0, 0, 0, c], o: [0.5 - 0.5 * c, 0.5 - 0.5 * c, 0.5 - 0.5 * c] });
export const tint = (r: number, g: number, b: number) => lin([r, 0, 0, 0, g, 0, 0, 0, b]);
export const lift = (r: number, g: number, b: number): Affine => ({ m: [1 - r, 0, 0, 0, 1 - g, 0, 0, 0, 1 - b], o: [r, g, b] });

// ---- overlay layers (CSS backgrounds + mix-blend-mode) ----
export type Blend = "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "color-dodge" | "color-burn" | "soft-light" | "exclusion" | "hue" | "color";
export const BLEND_INDEX: Record<Blend, number> = { normal: 0, multiply: 1, screen: 2, overlay: 3, darken: 4, lighten: 5, "color-dodge": 6, "color-burn": 7, "soft-light": 8, exclusion: 9, hue: 10, color: 11 };
/** Colour stop: [r, g, b, a] in 0..255 / 0..1, at position (fraction of the gradient line). */
export type Stop = { c: [number, number, number, number]; at: number };
export type Layer = {
  kind: "solid" | "linear" | "radial";
  /** linear: "right" or "bottom"; radial: centre in frame fractions (default 0.5, 0.5). */
  dir?: "right" | "bottom";
  center?: [number, number];
  stops: Stop[]; // 1 for solid, up to 3 for gradients
  blend: Blend;
  opacity?: number;
};
const hex = (h: string, a = 1): [number, number, number, number] => {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
};
const rgba = (r: number, g: number, b: number, a: number): [number, number, number, number] => [r, g, b, a];
const solid = (c: [number, number, number, number], blend: Blend, opacity = 1): Layer => ({ kind: "solid", stops: [{ c, at: 0 }], blend, opacity });
const radial = (stops: Stop[], blend: Blend, opacity = 1, center?: [number, number]): Layer => ({ kind: "radial", stops, blend, opacity, center });
const linear = (dir: "right" | "bottom", stops: Stop[], blend: Blend, opacity = 1): Layer => ({ kind: "linear", dir, stops, blend, opacity });
const TRANSPARENT = rgba(0, 0, 0, 0);

export type FilterCategory = "Trending" | "Portrait" | "Classic" | "Film" | "B&W";
export type FilterDef = {
  id: string;
  name: string;
  category: FilterCategory;
  /** CSS colour(s) for the fallback swatch (the picker shows live previews when it can). */
  swatch: string;
  color: Affine;
  layers?: Layer[];
  glow?: number; // soft bloom 0..1
  vignette?: number;
  grain?: number;
};

const f = (d: FilterDef) => d;

export const FILTERS: FilterDef[] = [
  f({ id: "none", name: "Normal", category: "Trending", swatch: "linear-gradient(135deg,#888,#ddd)", color: I }),
  // ---- Trending looks (2026 TikTok/Snapchat favourites, own recipes) ----
  f({ id: "softfocus", name: "Soft Focus", category: "Trending", swatch: "linear-gradient(135deg,#fde2e4,#fff1e6)", color: chain(contrast(0.94), brightness(1.05), saturate(1.05), lift(0.03, 0.02, 0.03)), glow: 0.55 }),
  f({ id: "goldenhour", name: "Golden Hour", category: "Trending", swatch: "linear-gradient(135deg,#f59e0b,#fde68a)", color: chain(tint(1.08, 1.0, 0.84), saturate(1.15), contrast(1.05)), layers: [radial([{ c: rgba(255, 190, 90, 0.45), at: 0 }, { c: TRANSPARENT, at: 0.75 }], "screen", 1, [0.2, 0.85])], glow: 0.3, vignette: 0.3 }),
  f({ id: "retroglow", name: "Retro Glow", category: "Trending", swatch: "linear-gradient(135deg,#f472b6,#22d3ee)", color: chain(sepia(0.2), saturate(1.35), contrast(1.08)), layers: [linear("right", [{ c: rgba(255, 80, 160, 0.25), at: 0 }, { c: rgba(40, 200, 220, 0.25), at: 1 }], "soft-light")], glow: 0.35, grain: 0.04 }),
  f({ id: "pinkbloom", name: "Pink Bloom", category: "Trending", swatch: "linear-gradient(135deg,#fbcfe8,#f9a8d4)", color: chain(saturate(1.1), brightness(1.04)), layers: [solid(rgba(255, 170, 200, 0.28), "screen")], glow: 0.4 }),
  f({ id: "voguenoir", name: "Vogue Noir", category: "Trending", swatch: "linear-gradient(135deg,#000,#bbb)", color: chain(grayscale(1), contrast(1.45), brightness(0.96)), vignette: 0.5, grain: 0.04 }),
  f({ id: "dreamy", name: "Dreamy", category: "Trending", swatch: "linear-gradient(135deg,#c4b5fd,#fbcfe8)", color: chain(saturate(0.95), brightness(1.06)), layers: [solid(hex("#e6e6fa", 0.6), "soft-light")], glow: 0.65 }),
  f({ id: "y2k", name: "Y2K", category: "Trending", swatch: "linear-gradient(135deg,#a855f7,#06b6d4)", color: chain(saturate(1.4), contrast(1.15)), layers: [linear("bottom", [{ c: rgba(0, 220, 255, 0.35), at: 0 }, { c: rgba(255, 0, 200, 0.35), at: 1 }], "soft-light")], glow: 0.25 }),
  f({ id: "vivid", name: "Vivid", category: "Trending", swatch: "linear-gradient(135deg,#ff2d6f,#ffb800)", color: chain(saturate(1.45), contrast(1.12)) }),
  // ---- Portrait (flattering skin) ----
  f({ id: "natural", name: "Natural", category: "Portrait", swatch: "linear-gradient(135deg,#f5d0c5,#fde68a)", color: chain(brightness(1.04), saturate(1.06), contrast(1.03), tint(1.02, 1.0, 0.98)), glow: 0.12 }),
  f({ id: "rose", name: "Rosé", category: "Portrait", swatch: "linear-gradient(135deg,#ff8fb1,#ffd6e0)", color: chain(tint(1.08, 0.96, 1.0), lift(0.05, 0.02, 0.03), saturate(1.08)) }),
  f({ id: "warm", name: "Warm", category: "Portrait", swatch: "linear-gradient(135deg,#ff9a3c,#ffd27a)", color: chain(tint(1.08, 1.0, 0.86), saturate(1.1)) }),
  f({ id: "cool", name: "Cool", category: "Portrait", swatch: "linear-gradient(135deg,#2f80ed,#9be7ff)", color: chain(tint(0.9, 1.0, 1.12), saturate(1.05)) }),
  f({ id: "glowup", name: "Glow Up", category: "Portrait", swatch: "linear-gradient(135deg,#fef3c7,#fbcfe8)", color: chain(brightness(1.07), contrast(0.96), saturate(1.08)), glow: 0.35, layers: [solid(rgba(255, 220, 200, 0.2), "soft-light")] }),
  f({ id: "lush", name: "Lush", category: "Portrait", swatch: "linear-gradient(135deg,#16a34a,#a3e635)", color: chain(tint(0.96, 1.08, 0.95), saturate(1.3)) }),
  // ---- Classic (ported from CSSgram, MIT — original CSSgram class in comments) ----
  f({ id: "retro77", name: "Retro 77", category: "Classic", swatch: "linear-gradient(135deg,#f36abc,#ffd1e8)", color: chain(contrast(1.1), brightness(1.1), saturate(1.3)), layers: [solid(rgba(243, 106, 188, 0.3), "screen")] }), // _1977
  f({ id: "pastel", name: "Pastel", category: "Classic", swatch: "linear-gradient(135deg,#d8c3b5,#f2e6dc)", color: chain(hueRotate(-20), contrast(0.9), saturate(0.85), brightness(1.2)), layers: [linear("right", [{ c: rgba(66, 10, 14, 0.2), at: 0 }, { c: TRANSPARENT, at: 1 }], "darken")] }), // aden
  f({ id: "brass", name: "Brass", category: "Classic", swatch: "linear-gradient(135deg,#a12cc7,#e7b46a)", color: chain(sepia(0.5), contrast(1.4)), layers: [solid(rgba(161, 44, 199, 0.31), "lighten")] }), // brannan
  f({ id: "borough", name: "Borough", category: "Classic", swatch: "linear-gradient(135deg,#a8dfc1,#c4b7c8)", color: chain(contrast(0.9), brightness(1.1)), layers: [radial([{ c: rgba(168, 223, 193, 0.4), at: 0.7 }, { c: hex("#c4b7c8"), at: 1 }], "overlay")] }), // brooklyn
  f({ id: "crisp", name: "Crisp", category: "Classic", swatch: "linear-gradient(135deg,#7fbbe3,#e0f2fe)", color: chain(contrast(1.2), saturate(1.35)), layers: [solid(rgba(127, 187, 227, 0.2), "overlay")] }), // clarendon
  f({ id: "dawn", name: "Dawn", category: "Classic", swatch: "linear-gradient(135deg,#d0ba8e,#360309)", color: chain(contrast(0.9), sepia(0.2)), layers: [radial([{ c: hex("#d0ba8e"), at: 0.2 }, { c: hex("#360309"), at: 0.85 }, { c: hex("#1d0210"), at: 1 }], "overlay")] }), // earlybird
  f({ id: "lavender", name: "Lavender", category: "Classic", swatch: "linear-gradient(135deg,#e6e6fa,#c4b5fd)", color: chain(brightness(1.05), hueRotate(-10)), layers: [solid(hex("#e6e6fa"), "soft-light")] }), // gingham
  f({ id: "frost", name: "Frost", category: "Classic", swatch: "linear-gradient(135deg,#a6b1ff,#342134)", color: chain(brightness(1.2), contrast(0.9), saturate(1.1)), layers: [radial([{ c: hex("#a6b1ff"), at: 0.5 }, { c: hex("#342134"), at: 1 }], "multiply", 0.5)] }), // hudson
  f({ id: "ember", name: "Ember", category: "Classic", swatch: "linear-gradient(135deg,#382c34,#b77d21)", color: I, layers: [solid(hex("#382c34"), "color-dodge"), solid(hex("#b77d21"), "overlay")] }), // kelvin
  f({ id: "lark", name: "Lark", category: "Classic", swatch: "linear-gradient(135deg,#22253f,#f2f2f2)", color: contrast(0.9), layers: [solid(hex("#22253f"), "color-dodge"), solid(rgba(242, 242, 242, 0.8), "darken")] }), // lark
  f({ id: "punch", name: "Punch", category: "Classic", swatch: "linear-gradient(135deg,#ef4444,#222)", color: chain(saturate(1.1), contrast(1.5)), layers: [radial([{ c: TRANSPARENT, at: 0.7 }, { c: hex("#222222"), at: 1.5 }], "multiply")] }), // lofi
  f({ id: "moss", name: "Moss", category: "Classic", swatch: "linear-gradient(135deg,#03e61a,#a3a37a)", color: chain(sepia(0.25), brightness(0.95), contrast(0.95), saturate(1.5)), layers: [solid(rgba(3, 230, 26, 0.2), "hue")] }), // maven
  f({ id: "soiree", name: "Soirée", category: "Classic", swatch: "linear-gradient(135deg,#ffc8c8,#111)", color: chain(contrast(1.1), saturate(1.1)), layers: [radial([{ c: rgba(255, 255, 255, 0.8), at: 0 }, { c: rgba(255, 200, 200, 0.6), at: 0.3 }, { c: hex("#111111"), at: 0.6 }], "overlay", 0.4, [0.4, 0.6])] }), // mayfair
  f({ id: "moonlight", name: "Moonlight", category: "B&W", swatch: "linear-gradient(135deg,#a0a0a0,#383838)", color: chain(grayscale(1), contrast(1.1), brightness(1.1)), layers: [solid(hex("#a0a0a0"), "soft-light"), solid(hex("#383838"), "lighten")] }), // moon
  f({ id: "peach", name: "Peach", category: "Classic", swatch: "linear-gradient(135deg,#f7b099,#004696)", color: chain(sepia(0.2), contrast(1.2), brightness(1.05), saturate(1.2)), layers: [solid(rgba(247, 176, 153, 0.56), "darken"), solid(rgba(0, 70, 150, 0.4), "lighten")] }), // nashville
  f({ id: "shore", name: "Shore", category: "Classic", swatch: "linear-gradient(180deg,#005b9a,#e6c13d)", color: I, layers: [linear("bottom", [{ c: hex("#005b9a"), at: 0 }, { c: hex("#e6c13d"), at: 1 }], "soft-light", 0.5)] }), // perpetua
  f({ id: "faded", name: "Faded", category: "Film", swatch: "linear-gradient(135deg,#efcdad,#d6c3b0)", color: chain(sepia(0.22), brightness(1.1), contrast(0.85), saturate(0.75)), layers: [solid(hex("#efcdad"), "soft-light", 0.5)] }), // reyes
  f({ id: "sunrise", name: "Sunrise", category: "Classic", swatch: "linear-gradient(135deg,#ecc9a9,#e8c598)", color: chain(brightness(1.05), sepia(0.2), contrast(0.9), saturate(0.9)), layers: [radial([{ c: rgba(236, 205, 169, 0.15), at: 0.55 }, { c: rgba(50, 30, 7, 0.4), at: 1 }], "multiply"), radial([{ c: rgba(232, 197, 152, 0.8), at: 0 }, { c: TRANSPARENT, at: 0.9 }], "overlay", 0.6)] }), // rise
  f({ id: "dusk", name: "Dusk", category: "Film", swatch: "linear-gradient(135deg,#45290c,#7d6918)", color: chain(saturate(0.66), brightness(1.05)), layers: [solid(rgba(69, 41, 12, 0.4), "lighten"), solid(rgba(125, 105, 24, 0.5), "soft-light")] }), // slumber
  f({ id: "blush", name: "Blush", category: "Portrait", swatch: "linear-gradient(135deg,#f09580,#fde2d8)", color: chain(contrast(0.75), saturate(0.85), brightness(1.15)), layers: [solid(rgba(240, 149, 128, 0.2), "soft-light")] }), // stinson
  f({ id: "toast", name: "Toast", category: "Film", swatch: "linear-gradient(135deg,#804e0f,#3b003b)", color: chain(contrast(1.5), brightness(0.9)), layers: [radial([{ c: hex("#804e0f"), at: 0 }, { c: hex("#3b003b"), at: 1 }], "screen")] }), // toaster
  f({ id: "vale", name: "Vale", category: "Classic", swatch: "linear-gradient(135deg,#3a0339,#e7c8b0)", color: chain(contrast(1.08), brightness(1.08), sepia(0.08)), layers: [solid(hex("#3a0339"), "exclusion", 0.5)] }), // valencia
  f({ id: "wild", name: "Wild", category: "Classic", swatch: "linear-gradient(135deg,#0044cc,#f2d16b)", color: chain(brightness(1.1), hueRotate(-10), sepia(0.3), saturate(1.6)), layers: [solid(hex("#0044cc"), "screen", 0.3)] }), // walden
  f({ id: "willow", name: "Willow", category: "B&W", swatch: "linear-gradient(135deg,#d8cdcb,#6b6b6b)", color: chain(grayscale(0.5), contrast(0.95), brightness(0.9)), layers: [radial([{ c: hex("#d4a9af"), at: 0.55 }, { c: hex("#000000"), at: 1.5 }], "overlay"), solid(hex("#d8cdcb"), "color")] }), // willow (CSSgram's ::before gradient is malformed; restored as intended)
  f({ id: "cross", name: "Cross", category: "Film", swatch: "linear-gradient(135deg,#e6e7e0,#2b2aa1)", color: sepia(0.3), layers: [radial([{ c: hex("#e6e7e0"), at: 0.4 }, { c: rgba(43, 42, 161, 0.6), at: 1.1 }], "color-burn")] }), // xpro2
  // ---- Film ----
  f({ id: "cinema", name: "Cinema", category: "Film", swatch: "linear-gradient(135deg,#0f766e,#fb923c)", color: chain(contrast(1.15), tint(1.06, 1.0, 0.95), { m: [1, 0, 0, 0, 1, 0, 0.05, 0.05, 0.9], o: [0, 0, 0.03] }), vignette: 0.35 }),
  f({ id: "vintage", name: "Vintage", category: "Film", swatch: "linear-gradient(135deg,#a47148,#e9d8a6)", color: chain(saturate(0.7), sepia(0.45), lift(0.08, 0.06, 0.04)), vignette: 0.45, grain: 0.06 }),
  f({ id: "fade", name: "Fade", category: "Film", swatch: "linear-gradient(135deg,#9ca3af,#f3f4f6)", color: chain(saturate(0.8), lift(0.12, 0.12, 0.12), contrast(0.92)) }),
  f({ id: "sunset", name: "Sunset", category: "Film", swatch: "linear-gradient(135deg,#f43f5e,#f59e0b)", color: chain(tint(1.12, 0.95, 0.85), saturate(1.25), contrast(1.05)), vignette: 0.25 }),
  f({ id: "kodachrome", name: "Chrome", category: "Film", swatch: "linear-gradient(135deg,#dc2626,#facc15)", color: chain(contrast(1.18), saturate(1.25), tint(1.05, 1.0, 0.9)), grain: 0.035, vignette: 0.2 }),
  f({ id: "polaroid", name: "Instant", category: "Film", swatch: "linear-gradient(135deg,#fef9c3,#bae6fd)", color: chain(lift(0.06, 0.05, 0.08), saturate(0.9), contrast(0.92), tint(1.02, 1.0, 1.04)), layers: [radial([{ c: TRANSPARENT, at: 0.6 }, { c: rgba(255, 240, 200, 0.5), at: 1.2 }], "screen")] }),
  // ---- B&W ----
  f({ id: "mono", name: "Mono", category: "B&W", swatch: "linear-gradient(135deg,#111,#eee)", color: chain(grayscale(1), contrast(1.05)) }),
  f({ id: "noir", name: "Noir", category: "B&W", swatch: "linear-gradient(135deg,#000,#777)", color: chain(grayscale(1), contrast(1.5), brightness(0.96)), vignette: 0.55, grain: 0.05 }),
  f({ id: "ink", name: "Ink", category: "B&W", swatch: "linear-gradient(135deg,#1f2937,#d1d5db)", color: chain(sepia(0.3), contrast(1.1), brightness(1.1), grayscale(1)) }), // inkwell
  f({ id: "silver", name: "Silver", category: "B&W", swatch: "linear-gradient(135deg,#475569,#e2e8f0)", color: chain(grayscale(1), tint(0.97, 1.0, 1.06), contrast(1.15)), glow: 0.2 }),
];

export const FILTER_CATEGORIES: FilterCategory[] = ["Trending", "Portrait", "Classic", "Film", "B&W"];

// ---- screen effects (one at a time; run in the shader) ----
export type Effect =
  | "none" | "vhs" | "glitch" | "rgb" | "mirror" | "pixel" | "quad" | "comic" | "pulse"
  | "sketch" | "toon" | "oil" | "halftone" | "crosshatch" | "emboss" | "neon" | "thermal" | "nightvision" | "xray"
  | "popart" | "kaleido" | "fisheye" | "swirl" | "ripple" | "prism" | "duotone" | "tiltshift" | "zoomblur" | "lightleak" | "oldfilm" | "bloom";

export const EFFECTS: { id: Effect; name: string; icon: string }[] = [
  { id: "none", name: "None", icon: "⦸" },
  { id: "bloom", name: "Bloom", icon: "🌟" },
  { id: "lightleak", name: "Light leak", icon: "🌅" },
  { id: "vhs", name: "VHS", icon: "📼" },
  { id: "oldfilm", name: "Old film", icon: "🎞️" },
  { id: "glitch", name: "Glitch", icon: "⚡" },
  { id: "rgb", name: "RGB split", icon: "🌈" },
  { id: "prism", name: "Prism", icon: "🔮" },
  { id: "sketch", name: "Sketch", icon: "✏️" },
  { id: "toon", name: "Toon", icon: "🎨" },
  { id: "oil", name: "Oil paint", icon: "🖼️" },
  { id: "comic", name: "Comic", icon: "💥" },
  { id: "halftone", name: "Halftone", icon: "⚫" },
  { id: "crosshatch", name: "Crosshatch", icon: "#️⃣" },
  { id: "popart", name: "Pop art", icon: "🟨" },
  { id: "neon", name: "Neon edges", icon: "💡" },
  { id: "emboss", name: "Emboss", icon: "🪨" },
  { id: "thermal", name: "Thermal", icon: "🌡️" },
  { id: "nightvision", name: "Night vision", icon: "🟩" },
  { id: "xray", name: "X-ray", icon: "🩻" },
  { id: "duotone", name: "Duotone", icon: "🎭" },
  { id: "kaleido", name: "Kaleido", icon: "❄️" },
  { id: "mirror", name: "Mirror", icon: "🪞" },
  { id: "quad", name: "Split ×4", icon: "▦" },
  { id: "fisheye", name: "Fisheye", icon: "🐟" },
  { id: "swirl", name: "Swirl", icon: "🌀" },
  { id: "ripple", name: "Underwater", icon: "🌊" },
  { id: "tiltshift", name: "Tilt-shift", icon: "🔭" },
  { id: "zoomblur", name: "Zoom blur", icon: "💨" },
  { id: "pixel", name: "Pixel", icon: "👾" },
  { id: "pulse", name: "Pulse", icon: "💓" },
];

export const EFFECT_INDEX: Record<Effect, number> = {
  none: 0, vhs: 1, glitch: 2, rgb: 3, mirror: 4, pixel: 5, quad: 6, comic: 7, pulse: 8,
  sketch: 9, toon: 10, oil: 11, halftone: 12, crosshatch: 13, emboss: 14, neon: 15, thermal: 16, nightvision: 17, xray: 18,
  popart: 19, kaleido: 20, fisheye: 21, swirl: 22, ripple: 23, prism: 24, duotone: 25, tiltshift: 26, zoomblur: 27, lightleak: 28, oldfilm: 29, bloom: 30,
};

// ---- animated overlays (drawn on top; see particles.ts) ----
export type Particles = "none" | "snow" | "rain" | "hearts" | "sparkles" | "butterflies" | "confetti" | "bubbles" | "petals";
export const PARTICLES: { id: Particles; name: string; icon: string }[] = [
  { id: "none", name: "None", icon: "⦸" },
  { id: "butterflies", name: "Butterflies", icon: "🦋" },
  { id: "hearts", name: "Hearts", icon: "💕" },
  { id: "sparkles", name: "Glitter", icon: "✨" },
  { id: "snow", name: "Snow", icon: "❄️" },
  { id: "petals", name: "Petals", icon: "🌸" },
  { id: "confetti", name: "Confetti", icon: "🎉" },
  { id: "bubbles", name: "Bubbles", icon: "🫧" },
  { id: "rain", name: "Rain", icon: "🌧️" },
];

export const filterById = (id: string) => FILTERS.find((f) => f.id === id) ?? FILTERS[0];
