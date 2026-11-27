import { BLEND_INDEX, EFFECT_INDEX, filterById, type Effect, type Layer, type Particles } from "./filters";
import { drawOverlays, type Overlay } from "./overlays";
import { drawParticles } from "./particles";

export const OUT_W = 720;
export const OUT_H = 1280;

export type Look = { filter: string; intensity: number; beauty: number; effect: Effect; particles: Particles };
export const DEFAULT_LOOK: Look = { filter: "none", intensity: 1, beauty: 0, effect: "none", particles: "none" };

type Source = HTMLVideoElement | HTMLCanvasElement;

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

/** Uniforms for one overlay layer (two per filter). */
const layerUniforms = (i: number) => `
uniform int u_l${i}k;        // 0 none, 1 solid, 2 linear→right, 3 linear↓bottom, 4 radial
uniform vec2 u_l${i}c;       // radial centre (frame fractions, y down)
uniform vec4 u_l${i}s0; uniform vec4 u_l${i}s1; uniform vec4 u_l${i}s2; // premultiplied stop colours
uniform vec3 u_l${i}p;       // stop positions
uniform int u_l${i}n;        // stop count
uniform int u_l${i}b;        // blend mode
uniform float u_l${i}o;      // opacity`;

const layerApply = (i: number) => `
  if (u_l${i}k > 0) {
    float t = 0.0;
    if (u_l${i}k == 2) t = q.x;
    else if (u_l${i}k == 3) t = q.y;
    else if (u_l${i}k == 4) {
      vec2 px = q * RES, cpx = u_l${i}c * RES;
      vec2 far = max(cpx, RES - cpx);
      t = length(px - cpx) / length(far);
    }
    vec4 s = gradient(t, u_l${i}s0, u_l${i}s1, u_l${i}s2, u_l${i}p, u_l${i}n);
    c = blendLayer(c, s, u_l${i}b, u_l${i}o);
  }`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_scale;      // cover-fit: portion of the source shown
uniform mat3 u_m;
uniform vec3 u_o;
uniform float u_intensity;
uniform float u_beauty;
uniform float u_glow;
uniform float u_vignette;
uniform float u_grain;
uniform int u_effect;
uniform float u_time;
${layerUniforms(0)}
${layerUniforms(1)}

const vec2 RES = vec2(${OUT_W}.0, ${OUT_H}.0);
const vec2 P = vec2(1.0 / ${OUT_W}.0, 1.0 / ${OUT_H}.0); // one output pixel in uv
const vec3 LUMA = vec3(0.299, 0.587, 0.114);

float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
vec2 cover(vec2 uv) { return (uv - 0.5) * u_scale + 0.5; }
vec3 tex(vec2 uv) { return texture2D(u_tex, cover(clamp(uv, 0.001, 0.999))).rgb; }
float lum(vec3 c) { return dot(c, LUMA); }

// ---- W3C compositing blend modes ----
float lumW(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }
vec3 clipColor(vec3 c) {
  float l = lumW(c), n = min(min(c.r, c.g), c.b), x = max(max(c.r, c.g), c.b);
  if (n < 0.0) c = l + (c - l) * l / max(l - n, 1e-5);
  if (x > 1.0) c = l + (c - l) * (1.0 - l) / max(x - l, 1e-5);
  return c;
}
vec3 setLum(vec3 c, float l) { return clipColor(c + (l - lumW(c))); }
float satOf(vec3 c) { return max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b); }
vec3 setSat(vec3 c, float s) {
  float n = min(min(c.r, c.g), c.b), x = max(max(c.r, c.g), c.b);
  return x > n ? (c - n) * s / (x - n) : vec3(0.0);
}
vec3 softD(vec3 b) { return mix(sqrt(b), ((16.0 * b - 12.0) * b + 4.0) * b, step(b, vec3(0.25))); }
vec3 blendFn(vec3 b, vec3 s, int m) {
  if (m == 1) return b * s;
  if (m == 2) return b + s - b * s;
  if (m == 3) return mix(1.0 - 2.0 * (1.0 - s) * (1.0 - b), 2.0 * s * b, step(b, vec3(0.5)));
  if (m == 4) return min(b, s);
  if (m == 5) return max(b, s);
  if (m == 6) return mix(min(vec3(1.0), b / max(1.0 - s, 1e-4)), vec3(1.0), step(1.0, s)) * step(1e-4, b);
  if (m == 7) return mix(1.0 - min(vec3(1.0), (1.0 - b) / max(s, 1e-4)), vec3(1.0), step(1.0 - 1e-4, b)) * step(1e-4, s) + step(1.0 - 1e-4, b) * (1.0 - step(1e-4, s));
  if (m == 8) return mix(b + (2.0 * s - 1.0) * (softD(b) - b), b - (1.0 - 2.0 * s) * b * (1.0 - b), step(s, vec3(0.5)));
  if (m == 9) return b + s - 2.0 * b * s;
  if (m == 10) return setLum(setSat(s, satOf(b)), lumW(b));
  if (m == 11) return setLum(s, lumW(b));
  return s;
}
vec4 gradient(float t, vec4 s0, vec4 s1, vec4 s2, vec3 p, int n) {
  if (n <= 1 || t <= p.x) return s0;
  if (t <= p.y) return mix(s0, s1, (t - p.x) / max(p.y - p.x, 1e-5));
  if (n == 2) return s1;
  if (t <= p.z) return mix(s1, s2, (t - p.y) / max(p.z - p.y, 1e-5));
  return s2;
}
vec3 blendLayer(vec3 b, vec4 s, int mode, float opacity) {
  float a = s.a * opacity;
  if (a <= 0.0) return b;
  vec3 cs = s.rgb / max(s.a, 1e-5);
  return mix(b, clamp(blendFn(b, cs, mode), 0.0, 1.0), a);
}

// ---- helpers for effects ----
vec3 hue2rgb(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
float sobel(vec2 uv, float s) {
  float tl = lum(tex(uv + vec2(-1.0, 1.0) * P * s)), t = lum(tex(uv + vec2(0.0, 1.0) * P * s)), tr = lum(tex(uv + vec2(1.0, 1.0) * P * s));
  float l = lum(tex(uv + vec2(-1.0, 0.0) * P * s)), r = lum(tex(uv + vec2(1.0, 0.0) * P * s));
  float bl = lum(tex(uv + vec2(-1.0, -1.0) * P * s)), b = lum(tex(uv + vec2(0.0, -1.0) * P * s)), br = lum(tex(uv + vec2(1.0, -1.0) * P * s));
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -bl - 2.0 * b - br + tl + 2.0 * t + tr;
  return length(vec2(gx, gy));
}
vec3 blur9(vec2 uv, float r) {
  vec3 s = tex(uv) * 0.2;
  for (int i = 0; i < 8; i++) { float a = float(i) * 0.785398; s += tex(uv + vec2(cos(a), sin(a)) * P * r) * 0.1; }
  return s;
}
vec3 kuwahara(vec2 uv) {
  // 4-quadrant Kuwahara (radius 2, 2px steps): pick the quadrant with the lowest variance.
  vec3 m[4]; vec3 v[4];
  for (int k = 0; k < 4; k++) { m[k] = vec3(0.0); v[k] = vec3(0.0); }
  for (int j = 0; j <= 2; j++) for (int i = 0; i <= 2; i++) {
    vec2 o = vec2(float(i), float(j)) * 2.0 * P;
    vec3 a = tex(uv + vec2(-o.x, o.y)); m[0] += a; v[0] += a * a;
    vec3 b = tex(uv + o);               m[1] += b; v[1] += b * b;
    vec3 c = tex(uv + vec2(o.x, -o.y)); m[2] += c; v[2] += c * c;
    vec3 d = tex(uv - o);               m[3] += d; v[3] += d * d;
  }
  vec3 best = m[0] / 9.0; float bestV = 1e9;
  for (int k = 0; k < 4; k++) {
    vec3 mean = m[k] / 9.0; vec3 var = abs(v[k] / 9.0 - mean * mean);
    float s = var.r + var.g + var.b;
    if (s < bestV) { bestV = s; best = mean; }
  }
  return best;
}

vec3 beauty(vec2 uv, vec3 c) {
  // Edge-preserving smoothing: average neighbours similar in colour (skin), keep edges.
  vec3 sum = c; float wsum = 1.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    vec3 s = tex(uv + vec2(cos(a), sin(a)) * P * 4.0);
    float w = exp(-dot(s - c, s - c) * 40.0);
    sum += s * w; wsum += w;
  }
  return mix(c, sum / wsum * 1.03 + 0.01, u_beauty);
}

vec3 glowOf(vec2 uv) {
  vec3 s = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5236;
    float r = mod(float(i), 2.0) < 1.0 ? 7.0 : 16.0;
    s += tex(uv + vec2(cos(a), sin(a)) * P * r);
  }
  return s / 12.0;
}

void main() {
  vec2 uv = v_uv;
  vec2 q = vec2(v_uv.x, 1.0 - v_uv.y); // frame coords, y down (CSS-like)
  float t = u_time;
  int e = u_effect;
  vec2 ctr = vec2(0.5);
  vec2 asp = vec2(1.0, RES.y / RES.x);

  // ---- geometric effects (remap uv) ----
  if (e == 4) { uv.x = uv.x < 0.5 ? uv.x : 1.0 - uv.x; }
  if (e == 6) { uv = fract(uv * 2.0); }
  if (e == 5) { vec2 g = vec2(54.0, 96.0); uv = (floor(uv * g) + 0.5) / g; }
  if (e == 8) { float s = 1.0 + 0.04 * (0.5 + 0.5 * sin(t * 7.0)); uv = (uv - 0.5) / s + 0.5; }
  if (e == 1) { uv.x += (rand(vec2(floor(uv.y * 180.0), floor(t * 12.0))) - 0.5) * 0.006; }
  if (e == 2) { float band = floor(uv.y * 14.0); float on = step(0.86, rand(vec2(band, floor(t * 8.0)))); uv.x += on * (rand(vec2(band, t)) - 0.5) * 0.12; }
  if (e == 19) { uv = fract(uv * 2.0); }
  if (e == 20) {
    vec2 d = (uv - ctr) * asp; float r = length(d); float a = atan(d.y, d.x) + t * 0.15;
    float seg = 6.2831853 / 6.0; a = mod(a, seg); a = abs(a - seg * 0.5);
    uv = ctr + vec2(cos(a), sin(a)) * r * 0.5 / asp; // zoomed in so the mirrored wedges stay on the subject
  }
  if (e == 21) { vec2 d = (uv - ctr) * asp; float r = length(d); float k = 1.0 - 0.55 * r * r; uv = ctr + d * k / asp; }
  if (e == 22) { vec2 d = (uv - ctr) * asp; float r = length(d); float R = 0.65; if (r < R) { float p = (R - r) / R; float a = p * p * (3.0 + sin(t) * 0.8); float s = sin(a), co = cos(a); d = vec2(d.x * co - d.y * s, d.x * s + d.y * co); } uv = ctr + d / asp; }
  if (e == 23) { uv += vec2(sin(uv.y * 28.0 + t * 2.4), cos(uv.x * 22.0 + t * 2.0)) * 0.006; }

  // ---- sample ----
  vec3 c;
  if (e == 3 || e == 1 || e == 2) {
    float k = e == 3 ? 0.012 : (e == 1 ? 0.004 : 0.008);
    c = vec3(tex(uv + vec2(k, 0.0)).r, tex(uv).g, tex(uv - vec2(k, 0.0)).b);
  } else if (e == 11) {
    c = kuwahara(uv);
  } else if (e == 26) {
    float d = abs(uv.y - 0.5); float r = smoothstep(0.08, 0.38, d) * 9.0;
    c = r > 0.3 ? blur9(uv, r) * 0.5 + blur9(uv, r * 0.5) * 0.5 : tex(uv);
  } else if (e == 27) {
    vec3 s = vec3(0.0); vec2 d = uv - ctr;
    for (int i = 0; i < 10; i++) s += tex(ctr + d * (1.0 - float(i) * 0.012));
    c = s / 10.0;
  } else {
    c = tex(uv);
  }
  if (u_beauty > 0.0) c = beauty(uv, c);

  // ---- colour filter: overlay layers first, then the CSS-style colour transform (as CSS composites them) ----
  vec3 base = c;
  ${layerApply(0)}
  ${layerApply(1)}
  c = clamp(u_m * c + u_o, 0.0, 1.0);
  if (u_glow > 0.0) { vec3 g = glowOf(uv); g = max(g - 0.25, 0.0) / 0.75; c = 1.0 - (1.0 - c) * (1.0 - g * u_glow); }
  c = mix(base, c, u_intensity);

  // ---- stylised effects (after colour) ----
  if (e == 7) { c = floor(c * 5.0 + 0.5) / 5.0; float ed = sobel(uv, 1.5); c *= 1.0 - smoothstep(0.35, 0.6, ed); }
  if (e == 9) { float ed = sobel(uv, 1.0); float l = lum(c); vec3 paper = vec3(0.98, 0.96, 0.92); c = paper * (1.0 - smoothstep(0.08, 0.5, ed)) * (0.88 + 0.12 * l); c -= (rand(q * 900.0) - 0.5) * 0.03; }
  if (e == 10) { float ed = sobel(uv, 1.2); c = floor(c * 8.0 + 0.5) / 8.0; c = mix(c, vec3(0.0), smoothstep(0.22, 0.32, ed)); }
  if (e == 12) {
    float cell = 9.0; vec2 px = q * RES; vec2 cc = (floor(px / cell) + 0.5) * cell;
    vec3 cellCol = tex(vec2(cc.x / RES.x, 1.0 - cc.y / RES.y));
    float l = lum(cellCol); float rr = (1.0 - l) * cell * 0.62;
    float d = length(px - cc); float dotm = 1.0 - smoothstep(rr - 0.8, rr + 0.8, d);
    c = mix(vec3(0.98, 0.96, 0.9), cellCol * 0.9, dotm);
  }
  if (e == 13) {
    float l = lum(c); vec2 px = q * RES; float ink = 0.0;
    if (l < 0.8 && mod(px.x + px.y, 10.0) < 1.2) ink = 1.0;
    if (l < 0.6 && mod(px.x - px.y, 10.0) < 1.2) ink = 1.0;
    if (l < 0.4 && mod(px.x + px.y - 5.0, 10.0) < 1.2) ink = 1.0;
    if (l < 0.2 && mod(px.x - px.y - 5.0, 10.0) < 1.2) ink = 1.0;
    c = mix(vec3(0.97, 0.95, 0.9), vec3(0.12, 0.1, 0.12), ink);
  }
  if (e == 14) { vec3 a = tex(uv + P * 1.5), b = tex(uv - P * 1.5); float k = lum(b - a) * 3.0 + 0.5; c = mix(vec3(k), c * k * 1.4, 0.35); }
  if (e == 15) {
    float ed = smoothstep(0.08, 0.4, sobel(uv, 1.0));
    vec3 col = hue2rgb(fract(q.y * 0.6 + q.x * 0.3 + t * 0.15));
    c = col * ed * 1.6 + c * 0.08;
  }
  if (e == 16) {
    float l = clamp(lum(c) * 1.15, 0.0, 1.0);
    c = l < 0.25 ? mix(vec3(0.0, 0.0, 0.15), vec3(0.2, 0.0, 0.6), l / 0.25)
      : l < 0.5 ? mix(vec3(0.2, 0.0, 0.6), vec3(0.9, 0.0, 0.3), (l - 0.25) / 0.25)
      : l < 0.75 ? mix(vec3(0.9, 0.0, 0.3), vec3(1.0, 0.65, 0.0), (l - 0.5) / 0.25)
      : mix(vec3(1.0, 0.65, 0.0), vec3(1.0, 1.0, 0.85), (l - 0.75) / 0.25);
  }
  if (e == 17) {
    float l = lum(c) * 1.6 + 0.05; c = vec3(0.15, 1.0, 0.25) * l;
    c += (rand(q * 500.0 + fract(t)) - 0.5) * 0.18; c *= 0.85 + 0.15 * sin(q.y * 900.0);
    vec2 d = (q - 0.5) * vec2(1.0, RES.y / RES.x) * 1.15; c *= 1.0 - smoothstep(0.42, 0.55, length(d));
  }
  if (e == 18) { float l = 1.0 - lum(c); c = vec3(l * 0.55, l * 0.85, l * 1.1); c = (c - 0.5) * 1.35 + 0.5; }
  if (e == 19) {
    float l = lum(tex(uv)); float s = step(0.5, l); vec2 cell = floor(v_uv * 2.0);
    vec3 a1 = vec3(1.0, 0.2, 0.55), b1 = vec3(1.0, 0.9, 0.2), a2 = vec3(0.1, 0.8, 0.9), b2 = vec3(0.98, 0.4, 0.1);
    vec3 a3 = vec3(0.4, 0.1, 0.8), b3 = vec3(0.6, 1.0, 0.4), a4 = vec3(0.05, 0.1, 0.4), b4 = vec3(1.0, 0.5, 0.75);
    vec3 lo = cell.x < 1.0 ? (cell.y < 1.0 ? a1 : a2) : (cell.y < 1.0 ? a3 : a4);
    vec3 hi = cell.x < 1.0 ? (cell.y < 1.0 ? b1 : b2) : (cell.y < 1.0 ? b3 : b4);
    c = mix(lo, hi, smoothstep(0.35, 0.6, l));
  }
  if (e == 23) { c = c * vec3(0.75, 0.95, 1.1) + 0.12 * pow(max(0.0, sin(q.x * 40.0 + t * 1.7) * sin(q.y * 34.0 - t * 1.3)), 4.0); }
  if (e == 24) { vec3 rb = hue2rgb(fract(q.x * 0.8 - q.y * 0.5 + t * 0.2)); c = mix(c, 1.0 - (1.0 - c) * (1.0 - rb * 0.45), 0.8); }
  if (e == 25) { float l = lum(c); c = mix(vec3(0.15, 0.1, 0.45), vec3(1.0, 0.45, 0.6), smoothstep(0.1, 0.9, l)); }
  if (e == 26) { c = (c - 0.5) * 1.08 + 0.5; c = mix(vec3(lum(c)), c, 1.25); }
  if (e == 28) {
    vec2 a = vec2(0.1 + 0.15 * sin(t * 0.7), 0.15); vec2 b = vec2(0.95, 0.7 + 0.2 * sin(t * 0.5 + 1.0));
    vec3 leak = vec3(1.0, 0.45, 0.15) * smoothstep(0.75, 0.0, distance(q, a)) + vec3(1.0, 0.2, 0.45) * smoothstep(0.6, 0.0, distance(q, b)) * 0.8;
    c = 1.0 - (1.0 - c) * (1.0 - leak * (0.65 + 0.2 * sin(t * 1.3)));
  }
  if (e == 29) {
    c = mix(vec3(lum(c)), c, 0.25) * vec3(1.08, 0.98, 0.82);
    c *= 0.92 + 0.08 * rand(vec2(floor(t * 18.0)));
    float fx = floor(t * 18.0);
    for (int i = 0; i < 3; i++) { float x = rand(vec2(fx, float(i))); if (rand(vec2(float(i), fx + 3.0)) > 0.5) c *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.0015, abs(q.x - x))); }
    if (rand(floor(q * vec2(150.0, 260.0)) + fx) > 0.9985) c *= 0.3;
  }
  if (e == 30) { vec3 g = glowOf(uv); g = max(g - 0.45, 0.0) / 0.55; c = 1.0 - (1.0 - c) * (1.0 - g * 1.2); }
  if (e == 1) { c *= 0.92 + 0.08 * sin(v_uv.y * 900.0); c += (rand(v_uv + t) - 0.5) * 0.06; }

  // ---- finish ----
  float d = distance(v_uv, vec2(0.5));
  c *= 1.0 - u_vignette * u_intensity * smoothstep(0.35, 0.85, d);
  c += (rand(v_uv * 731.0 + fract(t)) - 0.5) * u_grain * u_intensity;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

const NO_LAYER: Layer = { kind: "solid", stops: [{ c: [0, 0, 0, 0], at: 0 }], blend: "normal", opacity: 0 };

/**
 * Renders a source (camera canvas, recorded clip, or text-post background) through the filter shader,
 * then draws animated overlays and text/stickers on top. `out` is the canvas you show, record or export.
 */
export class Compositor {
  readonly out: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private glCanvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null;
  private prog: WebGLProgram | null = null;
  private tex: WebGLTexture | null = null;
  private loc: Record<string, WebGLUniformLocation | null> = {};

  constructor(out?: HTMLCanvasElement, size: [number, number] = [OUT_W, OUT_H]) {
    this.out = out ?? document.createElement("canvas");
    this.out.width = size[0];
    this.out.height = size[1];
    this.ctx = this.out.getContext("2d")!;
    this.glCanvas = document.createElement("canvas");
    this.glCanvas.width = OUT_W;
    this.glCanvas.height = OUT_H;
    this.gl = this.glCanvas.getContext("webgl", { preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (this.gl) this.initGL(this.gl);
  }

  get hasGL() {
    return !!this.prog;
  }

  private initGL(gl: WebGLRenderingContext) {
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
      return s;
    };
    try {
      const p = gl.createProgram()!;
      gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link error");
      gl.useProgram(p);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      const a = gl.getAttribLocation(p, "a_pos");
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      this.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      const names = ["u_tex", "u_scale", "u_m", "u_o", "u_intensity", "u_beauty", "u_glow", "u_vignette", "u_grain", "u_effect", "u_time"];
      for (const i of [0, 1]) for (const k of ["k", "c", "s0", "s1", "s2", "p", "n", "b", "o"]) names.push(`u_l${i}${k}`);
      for (const n of names) this.loc[n] = gl.getUniformLocation(p, n);
      this.prog = p;
    } catch (e) {
      console.warn("[studio] WebGL filters unavailable:", (e as Error).message);
      this.prog = null;
    }
  }

  private setLayer(gl: WebGLRenderingContext, i: number, l: Layer | undefined) {
    const L = l ?? NO_LAYER;
    const kind = !l ? 0 : L.kind === "solid" ? 1 : L.kind === "linear" ? (L.dir === "bottom" ? 3 : 2) : 4;
    const stop = (k: number) => {
      const s = L.stops[Math.min(k, L.stops.length - 1)];
      const a = s.c[3];
      return [(s.c[0] / 255) * a, (s.c[1] / 255) * a, (s.c[2] / 255) * a, a];
    };
    const pos = (k: number) => L.stops[Math.min(k, L.stops.length - 1)].at;
    gl.uniform1i(this.loc[`u_l${i}k`], kind);
    gl.uniform2f(this.loc[`u_l${i}c`], L.center?.[0] ?? 0.5, L.center?.[1] ?? 0.5);
    gl.uniform4fv(this.loc[`u_l${i}s0`], stop(0));
    gl.uniform4fv(this.loc[`u_l${i}s1`], stop(1));
    gl.uniform4fv(this.loc[`u_l${i}s2`], stop(2));
    gl.uniform3f(this.loc[`u_l${i}p`], pos(0), pos(1), pos(2));
    gl.uniform1i(this.loc[`u_l${i}n`], L.stops.length);
    gl.uniform1i(this.loc[`u_l${i}b`], BLEND_INDEX[L.blend]);
    gl.uniform1f(this.loc[`u_l${i}o`], L.opacity ?? 1);
  }

  /** Draw one frame. Returns false if the source has no frame yet. */
  render(src: Source, look: Look, overlays: Overlay[], timeSec: number, opts: { overlaysProgress?: number } = {}) {
    const sw = src instanceof HTMLVideoElement ? src.videoWidth : src.width;
    const sh = src instanceof HTMLVideoElement ? src.videoHeight : src.height;
    if (!sw || !sh) return false;
    const ctx = this.ctx;
    const W = this.out.width, H = this.out.height;
    const srcAspect = sw / sh;
    const outAspect = OUT_W / OUT_H;
    const scale: [number, number] = srcAspect > outAspect ? [outAspect / srcAspect, 1] : [1, srcAspect / outAspect];

    const gl = this.gl;
    const plain = look.filter === "none" && look.effect === "none" && look.beauty === 0;
    if (gl && this.prog && !plain) {
      gl.viewport(0, 0, OUT_W, OUT_H);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);
      } catch {
        return false;
      }
      const f = filterById(look.filter);
      const m = f.color.m;
      gl.uniform1i(this.loc.u_tex, 0);
      gl.uniform2f(this.loc.u_scale, scale[0], scale[1]);
      gl.uniformMatrix3fv(this.loc.u_m, false, [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]); // GLSL is column-major
      gl.uniform3f(this.loc.u_o, f.color.o[0], f.color.o[1], f.color.o[2]);
      gl.uniform1f(this.loc.u_intensity, look.intensity);
      gl.uniform1f(this.loc.u_beauty, look.beauty);
      gl.uniform1f(this.loc.u_glow, f.glow ?? 0);
      gl.uniform1f(this.loc.u_vignette, f.vignette ?? 0);
      gl.uniform1f(this.loc.u_grain, f.grain ?? 0);
      gl.uniform1i(this.loc.u_effect, EFFECT_INDEX[look.effect]);
      gl.uniform1f(this.loc.u_time, timeSec);
      this.setLayer(gl, 0, f.layers?.[0]);
      this.setLayer(gl, 1, f.layers?.[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      ctx.drawImage(this.glCanvas, 0, 0, W, H);
    } else {
      const cw = sw * scale[0];
      const ch = sh * scale[1];
      ctx.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, W, H);
    }
    if (look.particles !== "none") drawParticles(ctx, look.particles, timeSec, W, H);
    if (overlays.length) drawOverlays(ctx, overlays, W, H, opts.overlaysProgress ?? 1);
    return true;
  }
}

/**
 * Draw `src` cover-fitted into a 9:16 2D context (optionally mirrored, for the front camera).
 * Returns a mapper from normalised source coordinates to canvas pixels (used to place face lenses).
 */
export function drawCover(ctx: CanvasRenderingContext2D, src: CanvasImageSource & { videoWidth?: number; videoHeight?: number; width?: number; height?: number }, mirror: boolean, size?: [number, number]) {
  const sw = size?.[0] ?? (src.videoWidth || (src.width as number)), sh = size?.[1] ?? (src.videoHeight || (src.height as number));
  if (!sw || !sh) return null;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const s = Math.max(W / sw, H / sh);
  const dw = sw * s, dh = sh * s;
  const dx = (W - dw) / 2, dy = (H - dh) / 2;
  ctx.save();
  if (mirror) {
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(src, dx, dy, dw, dh);
  ctx.restore();
  return (x: number, y: number) => {
    const px = dx + x * dw;
    return { x: mirror ? W - px : px, y: dy + y * dh };
  };
}
