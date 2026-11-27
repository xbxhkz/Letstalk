// Renders the built-in sound library: original tracks synthesised from code (no samples, no third-party
// music), so Letstalk owns them outright. Output: public/sounds/library/<id>.m4a + <id>.svg cover,
// and src/lib/sound-library.json. Needs ffmpeg on PATH (only to encode WAV -> AAC).
// Usage: node scripts/generate-sounds.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const SR = 44100;
const SECONDS = 30;
const OUT = path.join("public", "sounds", "library");
mkdirSync(OUT, { recursive: true });

// ---------- tiny synth ----------
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

class Mix {
  constructor(sec) { this.L = new Float32Array(Math.ceil(sec * SR)); this.R = new Float32Array(this.L.length); }
  add(buf, start, gain = 1, pan = 0) {
    const s = Math.floor(start * SR), gl = gain * Math.min(1, 1 - pan), gr = gain * Math.min(1, 1 + pan);
    for (let i = 0; i < buf.length && s + i < this.L.length; i++) { if (s + i < 0) continue; this.L[s + i] += buf[i] * gl; this.R[s + i] += buf[i] * gr; }
  }
}
const env = (n, a, d, sus = 0, rel = 0, len = n) => (i) => {
  const t = i / SR, A = a, D = d;
  if (t < A) return t / A;
  if (t < A + D) return 1 - (1 - sus) * ((t - A) / D);
  const relStart = len / SR - rel;
  if (rel && t > relStart) return sus * Math.max(0, 1 - (t - relStart) / rel);
  return sus;
};
function lowpass(buf, cutoff) {
  const a = Math.exp(-2 * Math.PI * cutoff / SR); let y = 0;
  for (let i = 0; i < buf.length; i++) { y = (1 - a) * buf[i] + a * y; buf[i] = y; }
  return buf;
}
function highpass(buf, cutoff) {
  const a = Math.exp(-2 * Math.PI * cutoff / SR); let y = 0, x0 = 0;
  for (let i = 0; i < buf.length; i++) { y = a * (y + buf[i] - x0); x0 = buf[i]; buf[i] = y; }
  return buf;
}
const osc = {
  sine: (p) => Math.sin(2 * Math.PI * p),
  tri: (p) => 1 - 4 * Math.abs(((p + 0.25) % 1) - 0.5),
  saw: (p) => 2 * (p % 1) - 1,
  square: (p) => ((p % 1) < 0.5 ? 1 : -1),
};
function tone({ freq, dur, wave = "sine", a = 0.005, d = 0.1, sus = 0.7, rel = 0.1, detune = 0, cutoff = 0, vibrato = 0, glideFrom = 0 }) {
  const n = Math.floor(dur * SR), buf = new Float32Array(n), e = env(n, a, d, sus, rel, n);
  const phases = detune ? [0, 0.33, 0.66] : [0];
  const ratios = detune ? [1, Math.pow(2, detune / 1200), Math.pow(2, -detune / 1200)] : [1];
  const ph = phases.slice();
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let f = glideFrom ? freq + (glideFrom - freq) * Math.exp(-t * 18) : freq;
    if (vibrato) f *= 1 + vibrato * Math.sin(2 * Math.PI * 5.5 * t);
    let v = 0;
    for (let k = 0; k < ratios.length; k++) { ph[k] += (f * ratios[k]) / SR; v += osc[wave](ph[k]); }
    buf[i] = (v / ratios.length) * e(i);
  }
  return cutoff ? lowpass(buf, cutoff) : buf;
}
function kick(punch = 1) {
  const n = Math.floor(0.4 * SR), b = new Float32Array(n); let p = 0;
  for (let i = 0; i < n; i++) { const t = i / SR; const f = 45 + 110 * punch * Math.exp(-t * 35); p += f / SR; b[i] = Math.sin(2 * Math.PI * p) * Math.exp(-t * 7); }
  return b;
}
function noiseHit(dur, decay, hp = 0, lp = 0) {
  const n = Math.floor(dur * SR); let b = new Float32Array(n);
  for (let i = 0; i < n; i++) b[i] = rnd() * Math.exp(-(i / SR) * decay);
  if (hp) b = highpass(b, hp); if (lp) b = lowpass(b, lp);
  return b;
}
function snare() { const b = noiseHit(0.25, 18, 900, 9000); const t = tone({ freq: 190, dur: 0.12, d: 0.1, sus: 0 }); for (let i = 0; i < t.length; i++) b[i] += t[i] * 0.5; return b; }
function clap() { const b = new Float32Array(Math.floor(0.3 * SR)); for (const off of [0, 0.011, 0.022]) { const h = noiseHit(0.25, off ? 60 : 14, 1200, 7000); const s = Math.floor(off * SR); for (let i = 0; i < h.length && s + i < b.length; i++) b[s + i] += h[i] * 0.6; } return b; }
const hat = (open = false) => noiseHit(open ? 0.3 : 0.06, open ? 12 : 70, 7000);
function rhodes(freq, dur) { const b = tone({ freq, dur, wave: "sine", a: 0.005, d: dur, sus: 0, rel: 0.05 }); const h = tone({ freq: freq * 2, dur, wave: "sine", d: 0.4, sus: 0 }); for (let i = 0; i < b.length; i++) b[i] = (b[i] + h[i] * 0.25) * (1 + 0.12 * Math.sin(2 * Math.PI * 4 * i / SR)); return b; }
function delay(mix, time, fb, wet) {
  for (const ch of [mix.L, mix.R]) { const d = Math.floor(time * SR); for (let i = d; i < ch.length; i++) ch[i] += ch[i - d] * fb * wet; }
}

// ---------- tracks ----------
const chord = (root, kind) => ({ maj: [0, 4, 7], min: [0, 3, 7], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10], sus: [0, 5, 7] })[kind].map((x) => root + x);

const TRACKS = [
  {
    id: "golden-hour", title: "Golden Hour", artist: "Letstalk Sounds", genre: "Lo-fi", bpm: 80, colors: ["#f59e0b", "#7c2d12"],
    prog: [[65, "maj7"], [64, "min7"], [62, "min7"], [60, "maj7"]],
    render(m, beat, bar, bars) {
      for (let b = 0; b < bars; b++) {
        const [r, k] = this.prog[b % 4]; const t = b * bar;
        for (const n of chord(r, k)) m.add(rhodes(mtof(n), bar * 0.95), t, 0.11, (n % 3 - 1) * 0.3);
        m.add(tone({ freq: mtof(r - 24), dur: beat * 1.8, wave: "sine", sus: 0.8, cutoff: 400 }), t, 0.5);
        m.add(tone({ freq: mtof(r - 24 + 7), dur: beat * 1.5, wave: "sine", sus: 0.8, cutoff: 400 }), t + beat * 2.5, 0.4);
        for (let i = 0; i < 4; i++) {
          if (i % 2 === 0) m.add(kick(0.6), t + i * beat, 0.7);
          else m.add(snare(), t + i * beat, 0.25);
          for (const sw of [0, 0.62]) m.add(hat(), t + (i + sw) * beat, 0.12, 0.3);
        }
      }
      // vinyl crackle
      const c = new Float32Array(m.L.length); for (let i = 0; i < c.length; i++) c[i] = Math.random() < 0.0006 ? rnd() : rnd() * 0.004; m.add(lowpass(c, 5000), 0, 0.6);
    },
  },
  {
    id: "neon-rush", title: "Neon Rush", artist: "Letstalk Sounds", genre: "Dance", bpm: 124, colors: ["#ec4899", "#6d28d9"],
    prog: [[57, "min"], [53, "maj"], [60, "maj"], [55, "maj"]],
    render(m, beat, bar, bars) {
      for (let b = 0; b < bars; b++) {
        const [r, k] = this.prog[b % 4]; const t = b * bar; const ch = chord(r, k);
        for (let i = 0; i < 4; i++) {
          m.add(kick(1), t + i * beat, 0.9);
          m.add(hat(true), t + (i + 0.5) * beat, 0.14, 0.2);
          if (i % 2) m.add(clap(), t + i * beat, 0.35);
          // pumping saw chords on the off-beat
          for (const n of ch) m.add(tone({ freq: mtof(n), dur: beat * 0.45, wave: "saw", detune: 14, a: 0.02, d: 0.2, sus: 0.6, rel: 0.05, cutoff: 3200 }), t + (i + 0.5) * beat, 0.05, (n % 2 ? 0.4 : -0.4));
          m.add(tone({ freq: mtof(r - 24), dur: beat * 0.4, wave: "saw", cutoff: 600, sus: 0.8 }), t + (i + 0.5) * beat, 0.3);
        }
        for (let s = 0; s < 16; s++) if (b >= 2) m.add(tone({ freq: mtof(ch[s % ch.length] + 12 + (s % 8 > 4 ? 12 : 0)), dur: beat * 0.22, wave: "square", d: 0.12, sus: 0, cutoff: 4000 }), t + s * beat / 4, 0.045, Math.sin(s) * 0.5);
      }
      delay(m, (60 / this.bpm) * 0.75, 0.35, 1);
    },
  },
  {
    id: "trap-royale", title: "Trap Royale", artist: "Letstalk Sounds", genre: "Hip-hop", bpm: 140, colors: ["#111827", "#dc2626"],
    prog: [[49, "min"], [49, "min"], [45, "maj"], [47, "maj"]],
    render(m, beat, bar, bars) {
      for (let b = 0; b < bars; b++) {
        const [r] = this.prog[b % 4]; const t = b * bar;
        // 808s with glides
        m.add(tone({ freq: mtof(r - 12), glideFrom: mtof(r - 5), dur: beat * 1.6, wave: "sine", a: 0.003, d: 1.2, sus: 0.5, rel: 0.2 }), t, 0.75);
        m.add(tone({ freq: mtof(r - 12), dur: beat * 0.9, wave: "sine", d: 0.8, sus: 0.4 }), t + beat * 2.5, 0.6);
        m.add(kick(1.1), t, 0.7); m.add(kick(1.1), t + beat * 2.5, 0.6);
        m.add(clap(), t + beat * 2, 0.45); m.add(snare(), t + beat * 2, 0.2);
        for (let s = 0; s < 8; s++) {
          const roll = s === 7 && b % 2;
          if (roll) for (let k = 0; k < 4; k++) m.add(hat(), t + (s / 2 + k / 8) * beat, 0.12, 0.3);
          else m.add(hat(), t + (s / 2) * beat, 0.16, 0.3);
        }
        // dark bell melody
        const mel = [r + 24, r + 27, r + 31, r + 26];
        for (let i = 0; i < 4; i++) m.add(tone({ freq: mtof(mel[(i + b) % 4]), dur: beat * 0.9, wave: "tri", d: 0.6, sus: 0.1, rel: 0.1 }), t + i * beat, 0.08, -0.2);
      }
      delay(m, (60 / this.bpm) * 0.5, 0.3, 1);
    },
  },
  {
    id: "summer-sprint", title: "Summer Sprint", artist: "Letstalk Sounds", genre: "Pop", bpm: 116, colors: ["#fde047", "#f97316"],
    prog: [[60, "maj"], [67, "maj"], [69, "min"], [65, "maj"]],
    render(m, beat, bar, bars) {
      const melody = [76, 79, 81, 79, 76, 74, 72, 74];
      for (let b = 0; b < bars; b++) {
        const [r, k] = this.prog[b % 4]; const t = b * bar; const ch = chord(r, k);
        for (let i = 0; i < 4; i++) {
          m.add(kick(0.9), t + i * beat, i % 2 ? 0.5 : 0.85);
          if (i % 2) { m.add(clap(), t + i * beat, 0.4); m.add(snare(), t + i * beat, 0.15); }
          for (const h of [0, 0.5]) m.add(hat(), t + (i + h) * beat, 0.1, 0.4);
          for (const n of ch) m.add(tone({ freq: mtof(n + 12), dur: beat * 0.3, wave: "tri", d: 0.25, sus: 0, cutoff: 5000 }), t + i * beat, 0.07);
          m.add(tone({ freq: mtof(r - 12), dur: beat * 0.45, wave: "square", cutoff: 700, sus: 0.6 }), t + i * beat, 0.18);
        }
        if (b % 4 >= 2) for (let i = 0; i < 8; i++) m.add(tone({ freq: mtof(melody[(i + b) % 8]), dur: beat * 0.45, wave: "square", d: 0.3, sus: 0.3, cutoff: 3500, vibrato: 0.004 }), t + i * beat / 2, 0.06, 0.2);
      }
    },
  },
  {
    id: "midnight-drive", title: "Midnight Drive", artist: "Letstalk Sounds", genre: "Synthwave", bpm: 100, colors: ["#06b6d4", "#7e22ce"],
    prog: [[52, "min"], [48, "maj"], [55, "maj"], [50, "maj"]],
    render(m, beat, bar, bars) {
      for (let b = 0; b < bars; b++) {
        const [r, k] = this.prog[b % 4]; const t = b * bar; const ch = chord(r, k);
        for (const n of ch) m.add(tone({ freq: mtof(n + 12), dur: bar, wave: "saw", detune: 18, a: 0.4, d: 0.5, sus: 0.7, rel: 0.4, cutoff: 1800 }), t, 0.05, n % 2 ? 0.5 : -0.5);
        for (let s = 0; s < 8; s++) m.add(tone({ freq: mtof(r - 12 + (s % 2 ? 12 : 0)), dur: beat * 0.45, wave: "saw", cutoff: 900, sus: 0.6 }), t + s * beat / 2, 0.2);
        for (let i = 0; i < 4; i++) {
          if (i % 2 === 0) m.add(kick(0.9), t + i * beat, 0.8); else m.add(snare(), t + i * beat, 0.4);
          m.add(hat(), t + (i + 0.5) * beat, 0.08, 0.3);
        }
        for (let s = 0; s < 16; s++) m.add(tone({ freq: mtof(ch[(s * 2) % ch.length] + 24), dur: beat * 0.2, wave: "square", d: 0.15, sus: 0, cutoff: 3000 }), t + s * beat / 4, 0.03, Math.cos(s) * 0.6);
      }
      delay(m, (60 / this.bpm) * 0.75, 0.45, 1);
    },
  },
  {
    id: "cozy-rain", title: "Cozy Rain", artist: "Letstalk Sounds", genre: "Ambient", bpm: 70, colors: ["#64748b", "#1e3a8a"],
    prog: [[62, "min7"], [67, "dom7"], [60, "maj7"], [57, "min7"]],
    render(m, beat, bar, bars) {
      for (let b = 0; b < bars; b++) {
        const [r, k] = this.prog[b % 4]; const t = b * bar; const ch = chord(r, k);
        ch.forEach((n, i) => m.add(rhodes(mtof(n), bar), t + i * 0.12, 0.1, (i - 1.5) * 0.25));
        const top = [ch[3] + 12, ch[2] + 12, ch[1] + 12, ch[2] + 12];
        top.forEach((n, i) => m.add(rhodes(mtof(n), beat * 1.5), t + i * beat + beat * 0.5, 0.06, 0.3));
      }
      const rain = new Float32Array(m.L.length); for (let i = 0; i < rain.length; i++) rain[i] = rnd() * (0.6 + 0.4 * Math.sin(i / SR * 0.7));
      m.add(lowpass(highpass(rain, 400), 6000), 0, 0.05);
      delay(m, 0.33, 0.4, 1);
    },
  },
  {
    id: "bounce-back", title: "Bounce Back", artist: "Letstalk Sounds", genre: "Funk", bpm: 110, colors: ["#22c55e", "#0f766e"],
    prog: [[57, "min7"], [57, "min7"], [62, "dom7"], [64, "dom7"]],
    render(m, beat, bar, bars) {
      for (let b = 0; b < bars; b++) {
        const [r, k] = this.prog[b % 4]; const t = b * bar; const ch = chord(r, k);
        const bassPat = [0, 12, 0, 10, 0, 12, 7, 10];
        bassPat.forEach((o, s) => m.add(tone({ freq: mtof(r - 24 + o), dur: beat * 0.3, wave: "saw", a: 0.002, d: 0.15, sus: 0.3, cutoff: 1100 }), t + s * beat / 2, 0.32));
        for (let i = 0; i < 4; i++) {
          m.add(kick(0.9), t + i * beat, 0.8);
          if (i % 2) m.add(snare(), t + i * beat, 0.4);
          for (const h of [0.25, 0.5, 0.75]) m.add(hat(h === 0.5), t + (i + h) * beat, 0.08, 0.4);
          if (i % 2 === 0) for (const n of ch) m.add(tone({ freq: mtof(n + 12), dur: beat * 0.15, wave: "square", d: 0.1, sus: 0, cutoff: 2500 }), t + (i + 0.5) * beat, 0.04, -0.4);
        }
      }
    },
  },
  {
    id: "epic-moment", title: "Epic Moment", artist: "Letstalk Sounds", genre: "Cinematic", bpm: 90, colors: ["#f8fafc", "#475569"],
    prog: [[50, "min"], [46, "maj"], [53, "maj"], [48, "maj"]],
    render(m, beat, bar, bars) {
      for (let b = 0; b < bars; b++) {
        const [r, k] = this.prog[b % 4]; const t = b * bar; const ch = chord(r, k);
        const grow = Math.min(1, (b + 1) / bars * 1.4);
        for (const n of [...ch, ch[0] + 12]) m.add(tone({ freq: mtof(n), dur: bar, wave: "saw", detune: 10, a: 0.6, d: 0.3, sus: 0.8, rel: 0.5, cutoff: 900 + 2500 * grow, vibrato: 0.003 }), t, 0.04 * (0.5 + grow), n % 2 ? 0.5 : -0.5);
        m.add(tone({ freq: mtof(r - 24), dur: bar, wave: "saw", a: 0.2, sus: 0.8, rel: 0.3, cutoff: 300 }), t, 0.3);
        for (let i = 0; i < 4; i++) {
          m.add(tone({ freq: 90, glideFrom: 140, dur: 0.5, d: 0.4, sus: 0 }), t + i * beat, 0.45 * grow);
          if (b % 2 && i === 3) for (let s = 0; s < 4; s++) m.add(tone({ freq: 110 + s * 15, glideFrom: 180, dur: 0.3, d: 0.25, sus: 0 }), t + (i + s / 4) * beat, 0.3 * grow);
        }
        if (b % 4 === 0) m.add(kick(1.3), t, 1);
      }
      delay(m, 0.4, 0.35, 1);
    },
  },
];

function render(track) {
  seed = 7;
  const beat = 60 / track.bpm, bar = beat * 4;
  const bars = Math.ceil(SECONDS / bar) + 1;
  const m = new Mix(SECONDS + 1);
  track.render(m, beat, bar, bars);
  // master: normalise, soft clip, fades
  let peak = 0; for (let i = 0; i < m.L.length; i++) peak = Math.max(peak, Math.abs(m.L[i]), Math.abs(m.R[i]));
  const g = 1.15 / (peak || 1);
  const n = SECONDS * SR, data = Buffer.alloc(44 + n * 4);
  data.write("RIFF", 0); data.writeUInt32LE(36 + n * 4, 4); data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22); data.writeUInt32LE(SR, 24);
  data.writeUInt32LE(SR * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34); data.write("data", 36); data.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const fade = Math.min(1, i / (0.05 * SR), (n - i) / (1.2 * SR));
    for (const [c, ch] of [[0, m.L], [1, m.R]]) data.writeInt16LE(Math.round(Math.tanh(ch[i] * g) * 0.92 * fade * 32767), 44 + i * 4 + c * 2);
  }
  return data;
}

function cover(t) {
  const [a, b] = t.colors;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="256" height="256" fill="url(#g)"/><circle cx="128" cy="128" r="70" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="6"/><circle cx="128" cy="128" r="14" fill="rgba(255,255,255,0.85)"/><text x="128" y="232" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="700" fill="rgba(255,255,255,0.9)">${t.genre}</text></svg>`;
}

const tmp = path.join(os.tmpdir(), "letstalk-sounds");
mkdirSync(tmp, { recursive: true });
const manifest = [];
for (const t of TRACKS) {
  const wav = path.join(tmp, `${t.id}.wav`);
  writeFileSync(wav, render(t));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-af", "loudnorm=I=-14:TP=-1.2", "-ar", "44100", "-c:a", "aac", "-b:a", "128k", path.join(OUT, `${t.id}.m4a`)]);
  writeFileSync(path.join(OUT, `${t.id}.svg`), cover(t));
  manifest.push({ slug: t.id, title: t.title, artist: t.artist, genre: t.genre, url: `/sounds/library/${t.id}.m4a`, coverUrl: `/sounds/library/${t.id}.svg`, durationMs: SECONDS * 1000 });
  console.log(`rendered ${t.title}`);
}
rmSync(tmp, { recursive: true, force: true });
writeFileSync(path.join("src", "lib", "sound-library.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`${manifest.length} tracks -> ${OUT}`);
