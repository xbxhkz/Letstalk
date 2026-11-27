/**
 * Face distortion (TikTok-style "Big Eyes", "Big Mouth", "Slim", "Stretch"...): a GPU pass that warps the
 * camera frame around points from face tracking. Applied while recording, like lenses.
 */
export type WarpPoint = {
  /** centre in frame pixels (canvas coordinates, y down) */
  x: number;
  y: number;
  /** radius in frame pixels */
  radius: number;
  /** >0 enlarges (bulge) / stretches; <0 shrinks (pinch); swirl: angle in radians */
  strength: number;
  type: "bulge" | "swirl" | "stretchY" | "stretchX";
};

const MAX = 4;
const TYPE = { bulge: 1, swirl: 2, stretchY: 3, stretchX: 4 } as const;

const FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec4 u_pt[${MAX}];   // x, y (uv, y up), radius (px), strength
uniform int u_ty[${MAX}];
void main() {
  vec2 px = v_uv * u_res;
  for (int i = 0; i < ${MAX}; i++) {
    if (u_ty[i] == 0) continue;
    vec2 c = u_pt[i].xy * u_res; float R = u_pt[i].z; float s = u_pt[i].w;
    vec2 d = px - c; float r = length(d);
    if (r >= R) continue;
    float f = 1.0 - r / R; f = f * f * (3.0 - 2.0 * f); // smooth falloff
    if (u_ty[i] == 1) d *= 1.0 - s * f;                 // sample nearer the centre = magnify
    else if (u_ty[i] == 2) { float a = s * f; float cs = cos(a), sn = sin(a); d = vec2(d.x * cs - d.y * sn, d.x * sn + d.y * cs); }
    else if (u_ty[i] == 3) d.y *= 1.0 - s * f;
    else if (u_ty[i] == 4) d.x *= 1.0 - s * f;
    px = c + d;
  }
  gl_FragColor = vec4(texture2D(u_tex, px / u_res).rgb, 1.0);
}`;

const VERT = `attribute vec2 a_pos; varying vec2 v_uv; void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

export class Warper {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null;
  private ok = false;
  private tex: WebGLTexture | null = null;
  private uPt: WebGLUniformLocation | null = null;
  private uTy: WebGLUniformLocation | null = null;
  private uRes: WebGLUniformLocation | null = null;

  constructor(w: number, h: number) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = w;
    this.canvas.height = h;
    this.gl = this.canvas.getContext("webgl", { preserveDrawingBuffer: true, premultipliedAlpha: false });
    const gl = this.gl;
    if (!gl) return;
    try {
      const sh = (type: number, src: string) => {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
        return s;
      };
      const p = gl.createProgram()!;
      gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(p);
      gl.useProgram(p);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      const a = gl.getAttribLocation(p, "a_pos");
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      this.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      this.uPt = gl.getUniformLocation(p, "u_pt");
      this.uTy = gl.getUniformLocation(p, "u_ty");
      this.uRes = gl.getUniformLocation(p, "u_res");
      this.ok = true;
    } catch (e) {
      console.warn("[studio] face distortion unavailable:", (e as Error).message);
    }
  }

  /** Warps `src` (same size as this warper) in place: returns true if it drew back into `ctx`. */
  apply(ctx: CanvasRenderingContext2D, points: WarpPoint[]) {
    const gl = this.gl;
    if (!gl || !this.ok || !points.length) return false;
    const W = this.canvas.width, H = this.canvas.height;
    gl.viewport(0, 0, W, H);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, ctx.canvas);
    const pt = new Float32Array(MAX * 4), ty = new Int32Array(MAX);
    points.slice(0, MAX).forEach((p, i) => {
      pt.set([p.x / W, 1 - p.y / H, p.radius, p.strength], i * 4);
      ty[i] = TYPE[p.type];
    });
    gl.uniform2f(this.uRes, W, H);
    gl.uniform4fv(this.uPt, pt);
    gl.uniform1iv(this.uTy, ty);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    ctx.drawImage(this.canvas, 0, 0);
    return true;
  }
}
