import { useEffect, useState } from "react";
import { DEFAULT_LOOK, type Look } from "./compositor";
import { Camera } from "./Camera";
import { Editor } from "./Editor";
import { TextPost } from "./TextPost";
import { PostDetails, type Publisher } from "./PostDetails";
import { probeDuration, type Segment } from "./recorder";
import { newId } from "./overlays";

export type { Publisher, PublishInput } from "./PostDetails";

/**
 * The camera studio: Camera or Text -> Editor -> Post. Framework-free React so it runs both in the
 * Next.js app (secure contexts) and bundled into the Android app (android-shell/studio.html).
 */
export function Studio({ username, mediapipeBase, publish, onClose, onPublished }: { username: string; mediapipeBase: string; publish: Publisher; onClose: () => void; onPublished: () => void }) {
  const [mode, setMode] = useState<"camera" | "text">("camera");
  const [stage, setStage] = useState<"capture" | "edit" | "post">("capture");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [look, setLook] = useState<Look>(DEFAULT_LOOK);
  const [original, setOriginal] = useState<File | undefined>();
  const [result, setResult] = useState<File | null>(null);
  const [fromText, setFromText] = useState(false);

  useEffect(() => () => segments.forEach((s) => URL.revokeObjectURL(s.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const importFile = async (f: File) => {
    const url = URL.createObjectURL(f);
    const durationMs = await probeDuration(url);
    segments.forEach((s) => URL.revokeObjectURL(s.url));
    setSegments([{ id: newId(), blob: f, durationMs, speed: 1, url }]);
    setOriginal(f);
    setStage("edit");
  };

  const modeSwitch = (
    <div className="flex gap-4 text-sm font-semibold">
      {(["camera", "text"] as const).map((m) => (
        <button key={m} type="button" onClick={() => setMode(m)} className={`capitalize ${mode === m ? "text-white" : "text-white/50"}`}>{m}</button>
      ))}
    </div>
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-black text-white">
      {stage === "capture" && mode === "camera" && (
        <>
          <Camera
            mediapipeBase={mediapipeBase}
            look={look}
            onLook={setLook}
            segments={segments}
            onSegments={(s) => { setSegments(s); setOriginal(undefined); }}
            onClose={onClose}
            onNext={() => setStage("edit")}
            onImport={importFile}
            modeSwitch={modeSwitch}
          />
        </>
      )}
      {stage === "capture" && mode === "text" && (
        <TextPost onClose={onClose} modeSwitch={modeSwitch} onNext={(f) => { setResult(f); setFromText(true); setStage("post"); }} />
      )}
      {stage === "edit" && (
        <Editor
          segments={segments}
          look={look}
          original={original}
          onBack={() => {
            if (original) { segments.forEach((s) => URL.revokeObjectURL(s.url)); setSegments([]); setOriginal(undefined); }
            setStage("capture");
          }}
          onNext={(f) => { setResult(f); setFromText(false); setStage("post"); }}
        />
      )}
      {stage === "post" && result && (
        <PostDetails file={result} username={username} publish={publish} onBack={() => setStage(fromText ? "capture" : "edit")} onPublished={onPublished} />
      )}
    </div>
  );
}

/** Uploads with progress (fetch has no upload progress). `auth` adds a Bearer token for the app. */
export function xhrPublisher(endpoint: string, auth?: string): Publisher {
  return ({ video, thumbnail, caption, hashtags, audioName }, onProgress) =>
    new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append("video", video);
      fd.append("caption", caption);
      fd.append("hashtags", hashtags);
      fd.append("audioName", audioName);
      if (thumbnail) fd.append("thumbnail", thumbnail, "cover.jpg");
      const xhr = new XMLHttpRequest();
      xhr.open("POST", endpoint);
      if (auth) xhr.setRequestHeader("Authorization", `Bearer ${auth}`);
      else xhr.withCredentials = true;
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => {
        if (xhr.status === 201) return resolve();
        try {
          reject(new Error(JSON.parse(xhr.responseText).error));
        } catch {
          reject(new Error(`Upload failed (${xhr.status}).`));
        }
      };
      xhr.onerror = () => reject(new Error("Network error — check your connection and try again."));
      xhr.send(fd);
    });
}
