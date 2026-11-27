import { EFFECT_INDEX, filterById, type Effect } from "./filters";
import { drawOverlays, type Overlay } from "./overlays";

export const OUT_W = 720;
export const OUT_H = 1280;

export type Look = { filter: string; intensity: number; beauty: number; effect: Effect };
export const DEFAULT_LOOK: Look = { filter: "none", intensity: 1, beauty: 0, effect: "none" };

type Source = HTMLVideoElement | HTMLCanvasElement;

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_scale;      // cover-fit: portion of the source shown
uniform vec2 u_texel;      // 1 / source size
uniform mat3 u_m;
uniform vec3 u_o;
uniform float u_intensity;
uniform float u_beauty;
uniform float u_vignette;
uniform float u_grain;
uniform int u_effect;
uniform float u_time;

float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
vec2 cover(vec2 uv) { return (uv - 0.5) * u_scale + 0.5; }
vec3 tex(vec2 uv) { return texture2D(u_tex, cover(clamp(uv, 0.0, 1.0))).rgb; }

vec3 beauty(vec2 uv, vec3 c) {
  // Edge-preserving smoothing: average neighbours that are similar in colour (skin), keep edges.
  vec3 sum = c; float wsum = 1.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    vec2 off = vec2(cos(a), sin(a)) * u_texel * 3.5;
    vec3 s = tex(uv + off);
    float w = exp(-dot(s - c, s - c) * 40.0);
    sum += s * w; wsum += w;
  }
  vec3 smooth_ = sum / wsum;
  return mix(c, smooth_ * 1.03 + 0.01, u_beauty);
}

void main() {
  vec2 uv = v_uv;
  float t = u_time;
  if (u_effect == 4) { uv.x = uv.x < 0.5 ? uv.x : 1.0 - uv.x; }                       // mirror
  if (u_effect == 6) { uv = fract(uv * 2.0); }                                       // split x4
  if (u_effect == 5) { vec2 g = vec2(54.0, 96.0); uv = (floor(uv * g) + 0.5) / g; } // pixel
  if (u_effect == 8) { float s = 1.0 + 0.04 * (0.5 + 0.5 * sin(t * 7.0)); uv = (uv - 0.5) / s + 0.5; } // pulse
  if (u_effect == 1) { uv.x += (rand(vec2(floor(uv.y * 180.0), floor(t * 12.0))) - 0.5) * 0.006; }  // vhs jitter
  if (u_effect == 2) {                                                               // glitch blocks
    float band = floor(uv.y * 14.0);
    float on = step(0.86, rand(vec2(band, floor(t * 8.0))));
    uv.x += on * (rand(vec2(band, t)) - 0.5) * 0.12;
  }

  vec3 c;
  if (u_effect == 3 || u_effect == 1 || u_effect == 2) {
    float k = u_effect == 3 ? 0.012 : (u_effect == 1 ? 0.004 : 0.008);
    c = vec3(tex(uv + vec2(k, 0.0)).r, tex(uv).g, tex(uv - vec2(k, 0.0)).b);
  } else {
    c = tex(uv);
  }
  if (u_beauty > 0.0) c = beauty(uv, c);

  vec3 graded = clamp(u_m * c + u_o, 0.0, 1.0);
  c = mix(c, graded, u_intensity);

  if (u_effect == 7) { c = floor(c * 5.0 + 0.5) / 5.0; }                             // comic posterize
  if (u_effect == 1) { c *= 0.92 + 0.08 * sin(v_uv.y * 900.0); c += (rand(v_uv + t) - 0.5) * 0.06; }

  float d = distance(v_uv, vec2(0.5));
  c *= 1.0 - u_vignette * u_intensity * smoothstep(0.35, 0.85, d);
  c += (rand(v_uv * 731.0 + fract(t)) - 0.5) * u_grain * u_intensity;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

/**
 * Renders a source (camera canvas, recorded clip, or text-post background) through the filter shader,
 * then draws text/sticker overlays on top. `out` is the canvas you show, record or export.
 */
export class Compositor {
  readonly out: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private glCanvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null;
  private prog: WebGLProgram | null = null;
  private tex: WebGLTexture | null = null;
  private loc: Record<string, WebGLUniformLocation | null> = {};

  constructor(out?: HTMLCanvasElement) {
    this.out = out ?? document.createElement("canvas");
    this.out.width = OUT_W;
    this.out.height = OUT_H;
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
      for (const n of ["u_tex", "u_scale", "u_texel", "u_m", "u_o", "u_intensity", "u_beauty", "u_vignette", "u_grain", "u_effect", "u_time"]) this.loc[n] = gl.getUniformLocation(p, n);
      this.prog = p;
    } catch (e) {
      console.warn("[studio] WebGL filters unavailable:", (e as Error).message);
      this.prog = null;
    }
  }

  /** Draw one frame. Returns false if the source has no frame yet. */
  render(src: Source, look: Look, overlays: Overlay[], timeSec: number, opts: { overlaysProgress?: number } = {}) {
    const sw = src instanceof HTMLVideoElement ? src.videoWidth : src.width;
    const sh = src instanceof HTMLVideoElement ? src.videoHeight : src.height;
    if (!sw || !sh) return false;
    const ctx = this.ctx;
    // Cover-fit the source into 9:16.
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
      gl.uniform2f(this.loc.u_texel, 1 / sw, 1 / sh);
      // GLSL mat3 is column-major.
      gl.uniformMatrix3fv(this.loc.u_m, false, [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
      gl.uniform3f(this.loc.u_o, f.color.o[0], f.color.o[1], f.color.o[2]);
      gl.uniform1f(this.loc.u_intensity, look.intensity);
      gl.uniform1f(this.loc.u_beauty, look.beauty);
      gl.uniform1f(this.loc.u_vignette, f.vignette ?? 0);
      gl.uniform1f(this.loc.u_grain, f.grain ?? 0);
      gl.uniform1i(this.loc.u_effect, EFFECT_INDEX[look.effect]);
      gl.uniform1f(this.loc.u_time, timeSec);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      ctx.drawImage(this.glCanvas, 0, 0);
    } else {
      const cw = sw * scale[0];
      const ch = sh * scale[1];
      ctx.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, OUT_W, OUT_H);
    }
    drawOverlays(ctx, overlays, OUT_W, OUT_H, opts.overlaysProgress ?? 1);
    return true;
  }
}

/** Draw `src` cover-fitted into a 9:16 2D context (optionally mirrored, for the front camera). */
export function drawCover(ctx: CanvasRenderingContext2D, src: HTMLVideoElement, mirror: boolean) {
  const sw = src.videoWidth, sh = src.videoHeight;
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
  // Maps normalised video coordinates to canvas pixels (used to place face lenses).
  return (x: number, y: number) => {
    const px = dx + x * dw;
    return { x: mirror ? W - px : px, y: dy + y * dh };
  };
}
