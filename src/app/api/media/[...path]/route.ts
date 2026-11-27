import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { corsHeaders } from "@/lib/cors";

export const dynamic = "force-dynamic";

const ROOT = path.join(process.cwd(), "public", "uploads");
const TYPES: Record<string, string> = { ".mp4": "video/mp4", ".webm": "video/webm", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".aac": "audio/aac", ".ogg": "audio/ogg", ".wav": "audio/wav", ".weba": "audio/webm" };

/**
 * Serves runtime uploads from public/uploads with HTTP Range support.
 * (Next.js only serves files that existed in /public at build time, so new uploads go through here.)
 */
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const parts = (await params).path;
  const file = path.resolve(ROOT, ...parts);
  if (!file.startsWith(ROOT + path.sep)) return new Response("Not found", { status: 404 });
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
    if (!stat.isFile()) throw new Error();
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const type = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  const range = req.headers.get("range");
  // The Android camera studio (https://localhost) mixes uploaded sounds with WebAudio, which needs CORS.
  const base = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=31536000, immutable", ...corsHeaders(req) };

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m?.[1] ? parseInt(m[1], 10) : NaN;
    let end = m?.[2] ? parseInt(m[2], 10) : stat.size - 1;
    if (isNaN(start)) { start = Math.max(0, stat.size - end); end = stat.size - 1; }
    if (start >= stat.size || end < start) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    end = Math.min(end, stat.size - 1);
    const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers: { ...base, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Content-Length": String(end - start + 1) } });
  }
  const stream = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
  return new Response(stream, { headers: { ...base, "Content-Length": String(stat.size) } });
}
