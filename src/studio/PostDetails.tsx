import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Hash, Loader2, Music2, X } from "lucide-react";
import { coverJpeg, grabFrames } from "./recorder";

export type PublishInput = { video: File; thumbnail: Blob | null; caption: string; hashtags: string; audioName: string };
export type Publisher = (input: PublishInput, onProgress: (p: number) => void) => Promise<void>;

export function PostDetails({
  file,
  username,
  soundLabel,
  publish,
  onBack,
  onPublished,
}: {
  file: File;
  username: string;
  /** "Title — Artist" of the added sound; the video is linked to it, so the name isn't editable. */
  soundLabel: string | null;
  publish: Publisher;
  onBack: () => void;
  onPublished: () => void;
}) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const [caption, setCaption] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [audio, setAudio] = useState("");
  const [frames, setFrames] = useState<{ at: number; dataUrl: string }[] | null>(null);
  const [cover, setCover] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    grabFrames(file, 6).then(setFrames).catch(() => setFrames([]));
  }, [file]);

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, "").toLowerCase().replace(/[^\p{L}\p{N}_]/gu, "");
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  };

  const post = async () => {
    if (!caption.trim() && !tags.length) return setError("Add a caption or at least one hashtag.");
    setError(null);
    setProgress(0);
    try {
      const thumbnail = frames?.length ? await coverJpeg(file, frames[cover].at) : null;
      await publish({ video: file, thumbnail, caption, hashtags: tags.join(" "), audioName: audio }, setProgress);
      onPublished();
    } catch (e) {
      setError((e as Error).message || "Upload failed.");
      setProgress(null);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-black">
      <header className="relative flex h-12 shrink-0 items-center justify-center border-b border-white/10 pt-[env(safe-area-inset-top)] font-semibold">
        <button type="button" onClick={onBack} aria-label="Back" className="absolute left-2 p-1.5"><ChevronLeft className="h-6 w-6" /></button>
        Post
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex gap-3">
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2200} rows={5} placeholder="Describe your video… #hashtags work here too" aria-label="Caption" className="min-w-0 flex-1 resize-none rounded-lg bg-neutral-900 p-3 text-[15px] outline-none placeholder:text-white/40 focus:ring-1 focus:ring-white/30" />
          <video src={url} autoPlay muted loop playsInline className="aspect-[9/16] w-24 shrink-0 rounded-lg bg-neutral-900 object-cover" />
        </div>

        <div>
          <p className="mb-1 text-sm font-semibold">Hashtags</p>
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-neutral-900 p-2">
            {tags.map((t) => (
              <span key={t} className="flex items-center gap-1 rounded-full bg-white/10 py-1 pl-2.5 pr-1.5 text-sm">#{t}<button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Remove #${t}`}><X className="h-3.5 w-3.5" /></button></span>
            ))}
            <span className="flex min-w-[8rem] flex-1 items-center gap-1">
              <Hash className="h-4 w-4 text-white/40" />
              <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (["Enter", " ", ","].includes(e.key)) { e.preventDefault(); addTag(); } }} onBlur={addTag} placeholder="Add a tag" aria-label="Add hashtag" className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-white/40" />
            </span>
          </div>
        </div>

        <div>
          <p className="mb-1 text-sm font-semibold">Cover</p>
          {!frames ? (
            <Loader2 className="h-5 w-5 animate-spin text-white/50" />
          ) : (
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {frames.map((f, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <button key={i} type="button" onClick={() => setCover(i)} aria-label={`Cover frame ${i + 1}`} className={`shrink-0 overflow-hidden rounded-md ring-2 ${cover === i ? "ring-brand" : "ring-transparent"}`}><img src={f.dataUrl} alt="" className="h-24 w-[54px] object-cover" /></button>
              ))}
            </div>
          )}
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Sound</span>
          <span className="flex items-center gap-2 rounded-lg bg-neutral-900 px-3">
            <Music2 className="h-4 w-4 text-white/40" />
            {soundLabel ? (
              <span className="flex h-11 min-w-0 flex-1 items-center truncate text-sm">{soundLabel}</span>
            ) : (
              <input value={audio} onChange={(e) => setAudio(e.target.value)} maxLength={80} placeholder={`original sound — ${username}`} className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/40" />
            )}
          </span>
        </label>
        {error && <p role="alert" className="rounded-md bg-brand/15 px-3 py-2 text-sm text-brand">{error}</p>}
      </div>
      <div className="shrink-0 border-t border-white/10 p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <button type="button" onClick={post} disabled={progress !== null} className="relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-md bg-brand font-semibold disabled:opacity-90">
          {progress !== null && <span className="absolute inset-y-0 left-0 bg-white/20" style={{ width: `${progress * 100}%` }} />}
          {progress !== null ? <><Loader2 className="h-5 w-5 animate-spin" /> Posting {Math.round(progress * 100)}%</> : "Post"}
        </button>
      </div>
    </div>
  );
}
