/**
 * Colour filters and effects for the camera studio.
 * Colour filters are affine colour transforms (3x3 matrix + offset) built from simple operations,
 * so they're cheap on the GPU and easy to add: compose saturation, contrast, tint, sepia, etc.
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

const LR = 0.2126, LG = 0.7152, LB = 0.0722;
export const saturation = (s: number): Affine => ({
  m: [LR * (1 - s) + s, LG * (1 - s), LB * (1 - s), LR * (1 - s), LG * (1 - s) + s, LB * (1 - s), LR * (1 - s), LG * (1 - s), LB * (1 - s) + s],
  o: [0, 0, 0],
});
export const contrast = (c: number): Affine => ({ m: [c, 0, 0, 0, c, 0, 0, 0, c], o: [0.5 * (1 - c), 0.5 * (1 - c), 0.5 * (1 - c)] });
export const brightness = (b: number): Affine => ({ m: I.m, o: [b, b, b] });
export const tint = (r: number, g: number, b: number): Affine => ({ m: [r, 0, 0, 0, g, 0, 0, 0, b], o: [0, 0, 0] });
export const lift = (r: number, g: number, b: number): Affine => ({ m: [1 - r, 0, 0, 0, 1 - g, 0, 0, 0, 1 - b], o: [r, g, b] });
export const sepia: Affine = { m: [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131], o: [0, 0, 0] };

export type Effect = "none" | "vhs" | "glitch" | "rgb" | "mirror" | "pixel" | "quad" | "comic" | "pulse";

export type FilterDef = {
  id: string;
  name: string;
  /** CSS colour(s) for the swatch shown in the picker. */
  swatch: string;
  color: Affine;
  vignette?: number;
  grain?: number;
};

export const FILTERS: FilterDef[] = [
  { id: "none", name: "Normal", swatch: "linear-gradient(135deg,#888,#ddd)", color: I },
  { id: "vivid", name: "Vivid", swatch: "linear-gradient(135deg,#ff2d6f,#ffb800)", color: chain(saturation(1.45), contrast(1.12)) },
  { id: "warm", name: "Warm", swatch: "linear-gradient(135deg,#ff9a3c,#ffd27a)", color: chain(tint(1.08, 1.0, 0.86), saturation(1.1)) },
  { id: "cool", name: "Cool", swatch: "linear-gradient(135deg,#2f80ed,#9be7ff)", color: chain(tint(0.9, 1.0, 1.12), saturation(1.05)) },
  { id: "rose", name: "Rosé", swatch: "linear-gradient(135deg,#ff8fb1,#ffd6e0)", color: chain(tint(1.08, 0.96, 1.0), lift(0.05, 0.02, 0.03), saturation(1.08)) },
  { id: "tealorange", name: "Cinema", swatch: "linear-gradient(135deg,#0f766e,#fb923c)", color: chain(contrast(1.15), tint(1.06, 1.0, 0.95), { m: [1, 0, 0, 0, 1, 0, 0.05, 0.05, 0.9], o: [0, 0, 0.03] }), vignette: 0.35 },
  { id: "vintage", name: "Vintage", swatch: "linear-gradient(135deg,#a47148,#e9d8a6)", color: chain(saturation(0.7), { m: sepia.m.map((v, i) => (i % 4 === 0 ? 0.55 + v * 0.45 : v * 0.45)), o: [0, 0, 0] }, lift(0.08, 0.06, 0.04)), vignette: 0.45, grain: 0.06 },
  { id: "fade", name: "Fade", swatch: "linear-gradient(135deg,#9ca3af,#f3f4f6)", color: chain(saturation(0.8), lift(0.12, 0.12, 0.12), contrast(0.92)) },
  { id: "mono", name: "Mono", swatch: "linear-gradient(135deg,#111,#eee)", color: chain(saturation(0), contrast(1.05)) },
  { id: "noir", name: "Noir", swatch: "linear-gradient(135deg,#000,#777)", color: chain(saturation(0), contrast(1.5), brightness(-0.04)), vignette: 0.55, grain: 0.05 },
  { id: "sunset", name: "Sunset", swatch: "linear-gradient(135deg,#f43f5e,#f59e0b)", color: chain(tint(1.12, 0.95, 0.85), saturation(1.25), contrast(1.05)), vignette: 0.25 },
  { id: "lush", name: "Lush", swatch: "linear-gradient(135deg,#16a34a,#a3e635)", color: chain(tint(0.96, 1.08, 0.95), saturation(1.3)) },
];

export const EFFECTS: { id: Effect; name: string; icon: string }[] = [
  { id: "none", name: "None", icon: "⦸" },
  { id: "vhs", name: "VHS", icon: "📼" },
  { id: "glitch", name: "Glitch", icon: "⚡" },
  { id: "rgb", name: "RGB split", icon: "🌈" },
  { id: "mirror", name: "Mirror", icon: "🪞" },
  { id: "quad", name: "Split ×4", icon: "▦" },
  { id: "pixel", name: "Pixel", icon: "👾" },
  { id: "comic", name: "Comic", icon: "💥" },
  { id: "pulse", name: "Pulse", icon: "💓" },
];

export const EFFECT_INDEX: Record<Effect, number> = { none: 0, vhs: 1, glitch: 2, rgb: 3, mirror: 4, pixel: 5, quad: 6, comic: 7, pulse: 8 };

export const filterById = (id: string) => FILTERS.find((f) => f.id === id) ?? FILTERS[0];
