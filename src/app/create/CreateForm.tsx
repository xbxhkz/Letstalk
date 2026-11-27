"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, X, Hash, Music2, Loader2, Film } from "lucide-react";
import { useToast } from "@/components/Providers";

const ACCEPT = ["video/mp4", "video/webm"];
const MAX = 100 * 1024 * 1024;

export function CreateForm({ username }: { username: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [thumb, setThumb] = useState<Blob | null>(null);
  const [caption, setCaption] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [audio, setAudio] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (!ACCEPT.includes(f.type)) return setError("Please choose an MP4 or WebM video.");
    if (f.size > MAX) return setError("That file is larger than 100 MB.");
    setFile(f);
    setThumb(null);
    setPreview(URL.createObjectURL(f));
  };

  // Grab a frame from the preview to use as the grid thumbnail.
  const captureThumb = () => {
    const v = videoRef.current;
    if (!v || thumb || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 540 / v.videoWidth);
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((b) => b && setThumb(b), "image/jpeg", 0.8);
  };

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, "").toLowerCase().replace(/[^\p{L}\p{N}_]/gu, "");
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  };

  const publish = () => {
    if (!file) return setError("Choose a video first.");
    if (!caption.trim() && !tags.length) return setError("Add a caption or at least one hashtag.");
    const fd = new FormData();
    fd.append("video", file);
    fd.append("caption", caption);
    fd.append("hashtags", tags.join(" "));
    fd.append("audioName", audio);
    if (thumb) fd.append("thumbnail", thumb, "thumb.jpg");
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/videos");
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      setProgress(null);
      if (xhr.status === 201) {
        toast("Your video is live!");
        router.push("/");
        router.refresh();
      } else {
        try { setError(JSON.parse(xhr.responseText).error); } catch { setError("Upload failed."); }
      }
    };
    xhr.onerror = () => { setProgress(null); setError("Network error — please try again."); };
    setProgress(0);
    setError(null);
    xhr.send(fd);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="relative flex h-12 shrink-0 items-center justify-center border-b border-white/10 font-semibold">
        <button onClick={() => router.back()} aria-label="Cancel" className="absolute left-2 p-1.5"><X className="h-6 w-6" /></button>
        Post video
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <input ref={input} type="file" accept="video/mp4,video/webm" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        {preview ? (
          <div className="relative mx-auto aspect-[9/16] w-48 overflow-hidden rounded-lg bg-neutral-900">
            <video ref={videoRef} src={preview} autoPlay muted loop playsInline onLoadedData={captureThumb} className="h-full w-full object-cover" />
            <button onClick={() => input.current?.click()} className="absolute inset-x-2 bottom-2 rounded-md bg-black/60 py-1.5 text-xs font-semibold backdrop-blur">Change video</button>
          </div>
        ) : (
          <button
            onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}
            className="flex aspect-[9/16] w-48 mx-auto flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-white/25 bg-neutral-900 text-center text-sm text-white/70 hover:border-white/50"
          >
            <Upload className="h-8 w-8" />
            <span className="font-semibold text-white">Select video</span>
            <span className="px-4 text-xs">MP4 or WebM, up to 100 MB. Vertical 9:16 looks best.</span>
          </button>
        )}
        {file && <p className="flex items-center justify-center gap-1.5 text-xs text-white/55"><Film className="h-3.5 w-3.5" />{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}

        <div>
          <label htmlFor="caption" className="mb-1 block text-sm font-semibold">Caption</label>
          <textarea id="caption" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2200} rows={3} placeholder="Describe your video… #hashtags work here too" className="w-full resize-none rounded-lg bg-neutral-800 p-3 text-[15px] outline-none placeholder:text-white/40 focus:ring-1 focus:ring-white/30" />
          <p className="text-right text-xs text-white/40">{caption.length}/2200</p>
        </div>

        <div>
          <label htmlFor="tags" className="mb-1 block text-sm font-semibold">Hashtags</label>
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-neutral-800 p-2 focus-within:ring-1 focus-within:ring-white/30">
            {tags.map((t) => (
              <span key={t} className="flex items-center gap-1 rounded-full bg-white/10 py-1 pl-2.5 pr-1.5 text-sm">
                #{t}
                <button onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Remove #${t}`}><X className="h-3.5 w-3.5" /></button>
              </span>
            ))}
            <span className="flex min-w-[8rem] flex-1 items-center gap-1">
              <Hash className="h-4 w-4 text-white/40" />
              <input
                id="tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " " || e.key === ",") { e.preventDefault(); addTag(); } }}
                onBlur={addTag}
                placeholder="Add a tag and press Enter"
                className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-white/40"
              />
            </span>
          </div>
        </div>

        <div>
          <label htmlFor="audio" className="mb-1 block text-sm font-semibold">Sound</label>
          <label className="flex items-center gap-2 rounded-lg bg-neutral-800 px-3 focus-within:ring-1 focus-within:ring-white/30">
            <Music2 className="h-4 w-4 text-white/40" />
            <input id="audio" value={audio} onChange={(e) => setAudio(e.target.value)} maxLength={80} placeholder={`original sound — ${username}`} className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/40" />
          </label>
        </div>

        {error && <p role="alert" className="rounded-md bg-brand/15 px-3 py-2 text-sm text-brand">{error}</p>}
      </div>

      <div className="shrink-0 border-t border-white/10 p-3">
        <button onClick={publish} disabled={progress !== null} className="relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-md bg-brand font-semibold disabled:opacity-90">
          {progress !== null && <span className="absolute inset-y-0 left-0 bg-white/20" style={{ width: `${progress}%` }} />}
          {progress !== null ? <><Loader2 className="h-5 w-5 animate-spin" /> Uploading {progress}%</> : "Post"}
        </button>
      </div>
    </div>
  );
}
