import sharp from "sharp";
const glyph = (fill, dx, dy) => `<text x="${512 + dx}" y="${700 + dy}" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="560" text-anchor="middle" fill="${fill}">L</text>`;
const letters = glyph("#25f4ee", -22, -16) + glyph("#fe2c55", 22, 16) + glyph("#ffffff", 0, 0);
const full = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#000"/>${letters}</svg>`;
// Adaptive-icon foreground: keep the glyph inside the central safe zone (~66%).
const fg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><g transform="translate(512 512) scale(0.62) translate(-512 -512)">${letters}</g></svg>`;
const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#000"/></svg>`;
const splash = `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732"><rect width="2732" height="2732" fill="#000"/><g transform="translate(1366 1366) scale(0.6) translate(-512 -512)">${letters}</g></svg>`;
await sharp(Buffer.from(full)).png().toFile("assets/icon-only.png");
await sharp(Buffer.from(fg)).png().toFile("assets/icon-foreground.png");
await sharp(Buffer.from(bg)).png().toFile("assets/icon-background.png");
await sharp(Buffer.from(splash)).png().toFile("assets/splash.png");
await sharp(Buffer.from(splash)).png().toFile("assets/splash-dark.png");
console.log("icons written");

// ---- Android resources (sizes follow Android's density buckets) ----
import { readdirSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
const res = "android/app/src/main/res";
if (existsSync(res)) {
  const legacy = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  const roundMask = (s) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}"><circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}"/></svg>`);
  for (const [d, s] of Object.entries(legacy)) {
    const dir = path.join(res, `mipmap-${d}`);
    await sharp(Buffer.from(full)).resize(s, s).png().toFile(path.join(dir, "ic_launcher.png"));
    await sharp(Buffer.from(full)).resize(s, s).composite([{ input: roundMask(s), blend: "dest-in" }]).png().toFile(path.join(dir, "ic_launcher_round.png"));
    // Adaptive foreground is a 108dp canvas: 2.25x the 48dp legacy size.
    await sharp(Buffer.from(fg)).resize(Math.round(s * 2.25), Math.round(s * 2.25)).png().toFile(path.join(dir, "ic_launcher_foreground.png"));
  }
  writeFileSync(path.join(res, "values", "ic_launcher_background.xml"), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#000000</color>\n</resources>\n`);
  for (const dir of readdirSync(res).filter((n) => n.startsWith("drawable"))) {
    const file = path.join(res, dir, "splash.png");
    if (!existsSync(file)) continue;
    const { width, height } = await sharp(file).metadata();
    const size = Math.round(Math.min(width, height) * 0.35);
    const logo = await sharp(Buffer.from(fg)).resize(size, size).png().toBuffer();
    const img = await sharp({ create: { width, height, channels: 4, background: "#000000" } }).composite([{ input: logo, gravity: "center" }]).png().toBuffer();
    writeFileSync(file, img);
  }
  console.log("android icons + splash written");
}
