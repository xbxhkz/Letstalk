// Bundles the camera studio for the Android app: android-shell/studio.js (+ lazy chunks) and studio.css.
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { rmSync, readdirSync } from "node:fs";

for (const f of readdirSync("android-shell")) if (/^studio(-.+)?\.(js|css)$/.test(f)) rmSync(`android-shell/${f}`);

await build({
  entryPoints: ["src/studio/app-entry.tsx"],
  bundle: true,
  minify: true,
  format: "esm",
  splitting: true, // the face tracker library is loaded only when a lens is chosen
  outdir: "android-shell",
  entryNames: "studio",
  chunkNames: "studio-[hash]",
  jsx: "automatic",
  target: ["chrome110"],
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});

const css = spawnSync("npx", ["tailwindcss", "-c", "tailwind.config.ts", "-i", "src/studio/studio.css", "-o", "android-shell/studio.css", "--minify"], {
  stdio: ["ignore", "ignore", "inherit"],
  shell: process.platform === "win32",
});
if (css.status !== 0) process.exit(css.status ?? 1);
console.log("Studio bundle built: android-shell/studio.js, studio.css");
