import { Compositor, OUT_H, OUT_W, type Look } from "./compositor";
import type { Overlay } from "./overlays";

export type Segment = { id: string; blob: Blob; durationMs: number; speed: number; url: string };

/** Best container the device can record. MP4/H.264 first: it plays everywhere and reports its duration. */
export function pickMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "video/mp4;codecs=avc1.42E01F,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

export const baseType = (mime: string) => (mime.startsWith("video/mp4") ? "video/mp4" : "video/webm");
export const extFor = (mime: string) => (baseType(mime) === "video/mp4" ? "mp4" : "webm");

/** Records one clip from a stream; stop() resolves with the clip. */
export function startClip(stream: MediaStream, mime: string) {
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 128_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const started = performance.now();
  rec.start(250);
  return {
    elapsed: () => performance.now() - started,
    stop: () =>
      new Promise<{ blob: Blob; durationMs: number }>((resolve) => {
        const durationMs = performance.now() - started;
        rec.onstop = () => resolve({ blob: new Blob(chunks, { type: baseType(mime) }), durationMs });
        if (rec.state !== "inactive") rec.stop();
      }),
  };
}

export type ExportJob = {
  segments: Segment[];
  look: Look;
  overlays: Overlay[];
  volume: number; // original sound, 0..1
  /** Text posts: a background drawer and a fixed length instead of clips. */
  textPost?: { draw: (ctx: CanvasRenderingContext2D, t: number) => void; seconds: number };
};

/**
 * Renders the final video in real time: each clip is played (at its speed) through the compositor,
 * and the compositor canvas plus the clip audio are recorded into one file.
 */
export async function exportVideo(job: ExportJob, onProgress: (p: number) => void): Promise<File> {
  const mime = pickMime();
  if (!mime) throw new Error("This device can't record video.");
  const comp = new Compositor();
  const canvasStream = comp.out.captureStream(30);
  const audioCtx = new AudioContext();
  await audioCtx.resume().catch(() => {});
  const dest = audioCtx.createMediaStreamDestination();
  const gain = audioCtx.createGain();
  gain.gain.value = job.volume;
  gain.connect(dest);
  const tracks = [...canvasStream.getVideoTracks(), ...(job.textPost ? [] : dest.stream.getAudioTracks())];
  const rec = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 128_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<Blob>((resolve) => (rec.onstop = () => resolve(new Blob(chunks, { type: baseType(mime) }))));

  try {
    if (job.textPost) {
      const bg = document.createElement("canvas");
      bg.width = OUT_W;
      bg.height = OUT_H;
      const bctx = bg.getContext("2d")!;
      rec.start(250);
      const start = performance.now();
      await new Promise<void>((resolve) => {
        const frame = () => {
          const t = (performance.now() - start) / 1000;
          job.textPost!.draw(bctx, t);
          comp.render(bg, job.look, job.overlays, t, { overlaysProgress: Math.min(1, t / 0.45) });
          onProgress(Math.min(1, t / job.textPost!.seconds));
          if (t < job.textPost!.seconds) requestAnimationFrame(frame);
          else resolve();
        };
        frame();
      });
    } else {
      const video = document.createElement("video");
      video.playsInline = true;
      video.preload = "auto";
      audioCtx.createMediaElementSource(video).connect(gain);
      const total = job.segments.reduce((s, x) => s + x.durationMs / x.speed, 0) || 1;
      let doneMs = 0;
      rec.start(250);
      for (const seg of job.segments) {
        video.src = seg.url;
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error("A clip couldn't be read."));
        });
        video.playbackRate = seg.speed;
        // Keep pitch at slow/fast speeds, like TikTok.
        (video as HTMLVideoElement & { preservesPitch?: boolean }).preservesPitch = true;
        await video.play();
        await new Promise<void>((resolve) => {
          let finished = false;
          video.onended = () => {
            finished = true;
            resolve();
          };
          const frame = () => {
            if (finished) return;
            comp.render(video, job.look, job.overlays, video.currentTime);
            onProgress(Math.min(0.999, (doneMs + (video.currentTime * 1000) / seg.speed) / total));
            requestAnimationFrame(frame);
          };
          frame();
        });
        doneMs += seg.durationMs / seg.speed;
      }
    }
  } finally {
    if (rec.state !== "inactive") rec.stop();
  }
  const blob = await done;
  canvasStream.getTracks().forEach((t) => t.stop());
  audioCtx.close().catch(() => {});
  onProgress(1);
  return new File([blob], `letstalk-${Date.now()}.${extFor(mime)}`, { type: baseType(mime) });
}

/** Video length in ms. WebM from MediaRecorder reports Infinity until you seek far ahead. */
export function probeDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.src = url;
    v.onloadedmetadata = () => {
      if (isFinite(v.duration)) return resolve(v.duration * 1000);
      v.ontimeupdate = () => {
        v.ontimeupdate = null;
        resolve(isFinite(v.duration) ? v.duration * 1000 : 0);
      };
      v.currentTime = 1e9;
    };
    v.onerror = () => resolve(0);
  });
}

/** Frames for the cover picker. */
export async function grabFrames(file: Blob, count: number): Promise<{ at: number; dataUrl: string }[]> {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = url;
  await new Promise<void>((r) => (v.onloadeddata = () => r()));
  const dur = (await probeDuration(url)) / 1000 || v.duration || 1;
  const c = document.createElement("canvas");
  c.width = 180;
  c.height = 320;
  const ctx = c.getContext("2d")!;
  const out: { at: number; dataUrl: string }[] = [];
  for (let i = 0; i < count; i++) {
    const at = Math.min(dur - 0.05, (dur * (i + 0.5)) / count);
    await new Promise<void>((r) => {
      v.onseeked = () => r();
      v.currentTime = Math.max(0, at);
    });
    ctx.drawImage(v, 0, 0, c.width, c.height);
    out.push({ at, dataUrl: c.toDataURL("image/jpeg", 0.8) });
  }
  URL.revokeObjectURL(url);
  return out;
}

/** Full-size JPEG of the frame at `at` seconds, used as the post's thumbnail. */
export async function coverJpeg(file: Blob, at: number): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = url;
  try {
    await new Promise<void>((r, j) => {
      v.onloadeddata = () => r();
      v.onerror = () => j();
    });
    await new Promise<void>((r) => {
      v.onseeked = () => r();
      v.currentTime = at;
    });
    const c = document.createElement("canvas");
    c.width = 540;
    c.height = 960;
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    return await new Promise((r) => c.toBlob((b) => r(b), "image/jpeg", 0.85));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
