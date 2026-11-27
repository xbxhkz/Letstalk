/**
 * Background effects from person segmentation (MediaPipe Selfie Segmenter): portrait blur, colour pop,
 * spotlight and green-screen scenes. Applied while recording (they need the live mask).
 */
import { drawCover } from "./compositor";

export type BackgroundId = "none" | "blur" | "colorpop" | "spotlight" | "sunset" | "neongrid" | "stars" | "bokeh" | "studio" | "ocean" | "aurora";

export const BACKGROUNDS: { id: BackgroundId; name: string; icon: string }[] = [
  { id: "none", name: "None", icon: "⦸" },
  { id: "blur", name: "Portrait blur", icon: "🌫️" },
  { id: "colorpop", name: "Color pop", icon: "🎯" },
  { id: "spotlight", name: "Spotlight", icon: "🔦" },
  { id: "sunset", name: "Sunset", icon: "🌇" },
  { id: "neongrid", name: "Neon grid", icon: "🌐" },
  { id: "stars", name: "Starry night", icon: "🌌" },
  { id: "bokeh", name: "City lights", icon: "✨" },
  { id: "aurora", name: "Aurora", icon: "🌠" },
  { id: "ocean", name: "Ocean", icon: "🌊" },
  { id: "studio", name: "Studio", icon: "⬜" },
];

/** A person mask (values 0..1, person = 1) at the source frame's aspect ratio. */
export type PersonMask = { data: Float32Array; width: number; height: number };

export class BackgroundCompositor {
  private person: HTMLCanvasElement;
  private pctx: CanvasRenderingContext2D;
  private maskCanvas: HTMLCanvasElement;
  private mctx: CanvasRenderingContext2D;
  private small: HTMLCanvasElement;
  private sctx: CanvasRenderingContext2D;
  private img: ImageData | null = null;

  constructor(private W: number, private H: number) {
    this.person = Object.assign(document.createElement("canvas"), { width: W, height: H });
    this.pctx = this.person.getContext("2d")!;
    this.maskCanvas = document.createElement("canvas");
    this.mctx = this.maskCanvas.getContext("2d")!;
    this.small = Object.assign(document.createElement("canvas"), { width: Math.round(W / 14), height: Math.round(H / 14) });
    this.sctx = this.small.getContext("2d")!;
  }

  /** Turn the latest mask into an alpha image (cheap: 256×256 or so). */
  setMask(m: PersonMask) {
    if (this.maskCanvas.width !== m.width || this.maskCanvas.height !== m.height) {
      this.maskCanvas.width = m.width;
      this.maskCanvas.height = m.height;
      this.img = null;
    }
    this.img ??= this.mctx.createImageData(m.width, m.height);
    const px = this.img.data;
    for (let i = 0; i < m.data.length; i++) {
      // Soften the edge a little: map confidence 0.3..0.7 to alpha 0..1.
      const a = Math.min(1, Math.max(0, (m.data[i] - 0.3) / 0.4));
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = 255;
      px[i * 4 + 3] = a * 255;
    }
    this.mctx.putImageData(this.img, 0, 0);
  }

  /**
   * Draws background + cut-out person into `ctx` (the 9:16 capture canvas). `video` is the camera frame.
   * Without a mask yet, just draws the camera frame.
   */
  draw(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, mirror: boolean, bg: BackgroundId, hasMask: boolean, t: number) {
    const map = drawCover(ctx, video, mirror);
    if (!hasMask || bg === "none") return map;
    const { W, H } = this;
    // 1) the person cut out with the (upscaled, therefore smooth-edged) mask
    const p = this.pctx;
    p.globalCompositeOperation = "source-over";
    p.clearRect(0, 0, W, H);
    drawCover(p, video, mirror);
    p.globalCompositeOperation = "destination-in";
    p.imageSmoothingEnabled = true;
    drawCover(p, this.maskCanvas, mirror, [video.videoWidth, video.videoHeight]);
    p.globalCompositeOperation = "source-over";

    // 2) the background (ctx already holds the plain camera frame)
    switch (bg) {
      case "blur":
        // Down-then-up scaling is a fast, portable blur.
        this.sctx.imageSmoothingEnabled = true;
        this.sctx.drawImage(ctx.canvas, 0, 0, this.small.width, this.small.height);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(this.small, 0, 0, W, H);
        break;
      case "colorpop":
        ctx.save();
        ctx.globalCompositeOperation = "saturation";
        ctx.fillStyle = "#808080";
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        break;
      case "spotlight": {
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.72)";
        ctx.fillRect(0, 0, W, H);
        const g = ctx.createRadialGradient(W / 2, H * 0.42, W * 0.1, W / 2, H * 0.42, W * 0.75);
        g.addColorStop(0, "rgba(255,240,210,0.18)");
        g.addColorStop(1, "rgba(255,240,210,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        break;
      }
      default:
        drawScene(ctx, bg, t, W, H);
    }
    // 3) person on top
    ctx.drawImage(this.person, 0, 0);
    return map;
  }
}

/** Procedural green-screen scenes (animated, so they look alive). */
function drawScene(ctx: CanvasRenderingContext2D, bg: BackgroundId, t: number, W: number, H: number) {
  const lin = (stops: [number, string][]) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    for (const [at, c] of stops) g.addColorStop(at, c);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  const rnd = (i: number, k: number) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
  switch (bg) {
    case "sunset": {
      lin([[0, "#2b1055"], [0.45, "#d53369"], [0.7, "#ff9a44"], [1, "#ffd194"]]);
      ctx.fillStyle = "rgba(255,230,150,0.9)";
      ctx.beginPath();
      ctx.arc(W / 2, H * 0.68 + Math.sin(t * 0.2) * 6, W * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3a1c4a";
      ctx.fillRect(0, H * 0.78, W, H * 0.22);
      break;
    }
    case "neongrid": {
      lin([[0, "#0b0221"], [0.5, "#2a0845"], [0.62, "#ff2a6d"], [0.63, "#120321"], [1, "#05010f"]]);
      const hz = H * 0.62;
      // One path for the whole grid, stroked twice (wide + faint, then thin + bright) for the neon glow:
      // much cheaper than canvas shadowBlur on phones.
      ctx.beginPath();
      for (let i = -12; i <= 12; i++) {
        ctx.moveTo(W / 2, hz);
        ctx.lineTo(W / 2 + i * W * 0.18, H);
      }
      for (let k = 0; k < 12; k++) {
        const p = ((k + t * 0.8) % 12) / 12;
        const y = hz + (H - hz) * p * p;
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
      }
      ctx.strokeStyle = "rgba(0,255,240,0.18)";
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = "rgba(120,255,248,0.85)";
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }
    case "stars": {
      lin([[0, "#020111"], [0.6, "#191b46"], [1, "#2c3e70"]]);
      for (let i = 0; i < 160; i++) {
        const tw = 0.5 + 0.5 * Math.sin(t * (1 + 2 * rnd(i, 1)) + i);
        ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.7 * tw})`;
        ctx.beginPath();
        ctx.arc(rnd(i, 2) * W, rnd(i, 3) * H * 0.85, 0.6 + 1.8 * rnd(i, 4), 0, Math.PI * 2);
        ctx.fill();
      }
      const sx = ((t * 0.15) % 1.6 - 0.3) * W;
      const sg = ctx.createLinearGradient(sx - 120, H * 0.1, sx, H * 0.18);
      sg.addColorStop(0, "rgba(255,255,255,0)");
      sg.addColorStop(1, "rgba(255,255,255,0.9)");
      ctx.strokeStyle = sg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx - 120, H * 0.1);
      ctx.lineTo(sx, H * 0.18);
      ctx.stroke();
      break;
    }
    case "bokeh": {
      lin([[0, "#1a1033"], [1, "#0d0d1a"]]);
      const cols = ["255,180,80", "255,90,140", "120,200,255", "255,230,150", "190,120,255"];
      for (let i = 0; i < 45; i++) {
        const r = (20 + 55 * rnd(i, 1)) * (W / 720);
        const x = (rnd(i, 2) * 1.2 - 0.1 + 0.03 * Math.sin(t * 0.3 + i)) * W;
        const y = (rnd(i, 3) + 0.02 * Math.cos(t * 0.25 + i)) * H;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const c = cols[i % cols.length];
        g.addColorStop(0, `rgba(${c},0.55)`);
        g.addColorStop(0.7, `rgba(${c},0.25)`);
        g.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "aurora": {
      lin([[0, "#00111a"], [1, "#02233a"]]);
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += 12) ctx.lineTo(x, H * (0.3 + 0.08 * k) + Math.sin(x / W * 6 + t * (0.5 + k * 0.2) + k) * H * 0.06);
        ctx.lineTo(W, H);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, H * 0.2, 0, H * 0.7);
        g.addColorStop(0, ["rgba(0,255,160,0.45)", "rgba(80,160,255,0.35)", "rgba(200,80,255,0.3)"][k]);
        g.addColorStop(1, "rgba(0,20,40,0)");
        ctx.fillStyle = g;
        ctx.fill();
      }
      break;
    }
    case "ocean": {
      lin([[0, "#7dd3fc"], [0.45, "#e0f2fe"], [0.46, "#0284c7"], [1, "#0c4a6e"]]);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      for (let k = 0; k < 8; k++) {
        const y = H * (0.5 + k * 0.06);
        ctx.beginPath();
        for (let x = 0; x <= W; x += 10) ctx.lineTo(x, y + Math.sin(x / 40 + t * 1.5 + k) * 4);
        ctx.stroke();
      }
      break;
    }
    case "studio": {
      const g = ctx.createRadialGradient(W / 2, H * 0.4, W * 0.1, W / 2, H * 0.5, H * 0.8);
      g.addColorStop(0, "#f5f5f4");
      g.addColorStop(1, "#a8a29e");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      break;
    }
  }
}
