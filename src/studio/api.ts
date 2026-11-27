/**
 * How the studio reaches the Letstalk server.
 * - Web: base "" (same origin), the session cookie authenticates.
 * - Android app: base is the server origin and an upload token authenticates (the studio runs at https://localhost).
 */
export type StudioApi = { base: string; token?: string };

export type Sound = {
  id: string;
  title: string;
  artist: string;
  genre: string;
  url: string;
  coverUrl: string | null;
  durationMs: number;
  uses: number;
  isLibrary: boolean;
};

/** A chosen sound plus where in it the video starts. */
export type SoundPick = { sound: Sound; startMs: number };

export const absUrl = (api: StudioApi, url: string | null) => (!url ? null : url.startsWith("/") ? api.base + url : url);

/**
 * A URL that <audio>/<img> can load. In the Android app the studio is a secure page (https://localhost)
 * and the server is usually plain http: the WebView auto-upgrades such media src URLs to https and they
 * fail. fetch() is allowed there (mixed content is enabled for it), so media is fetched and played from a
 * blob: URL. That also makes WebAudio mixing same-origin. On the web, the URL is used as-is.
 */
const blobCache = new Map<string, Promise<string>>();
export function mediaUrl(api: StudioApi, url: string | null): Promise<string | null> {
  const abs = absUrl(api, url);
  if (!abs) return Promise.resolve(null);
  const needsBlob = typeof location !== "undefined" && location.protocol === "https:" && abs.startsWith("http:");
  if (!needsBlob) return Promise.resolve(abs);
  let p = blobCache.get(abs);
  if (!p) {
    p = fetch(abs)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.blob();
      })
      .then((b) => URL.createObjectURL(b));
    p.catch(() => blobCache.delete(abs));
    blobCache.set(abs, p);
  }
  return p;
}

export async function studioGet<T>(api: StudioApi, path: string): Promise<T> {
  const res = await fetch(api.base + path, { headers: api.token ? { Authorization: `Bearer ${api.token}` } : undefined, credentials: api.token ? "omit" : "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Multipart POST with upload progress (fetch can't report upload progress). */
export function studioUpload<T>(api: StudioApi, path: string, form: FormData, onProgress?: (p: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", api.base + path);
    if (api.token) xhr.setRequestHeader("Authorization", `Bearer ${api.token}`);
    else xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let data: { error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else reject(new Error(data.error ?? `Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Network error — check your connection and try again."));
    xhr.send(form);
  });
}

export const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
