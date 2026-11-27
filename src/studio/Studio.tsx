import { useEffect, useState } from "react";
import { DEFAULT_LOOK, type Look } from "./compositor";
import { Camera } from "./Camera";
import { Editor } from "./Editor";
import { TextPost } from "./TextPost";
import { PostDetails, type Publisher } from "./PostDetails";
import { SoundPicker } from "./SoundPicker";
import { probeDuration, type Segment } from "./recorder";
import { newId } from "./overlays";
import { studioGet, studioUpload, type Sound, type SoundPick, type StudioApi } from "./api";

export type { Publisher, PublishInput } from "./PostDetails";
export type { StudioApi } from "./api";

/**
 * The camera studio: Camera or Text -> Editor -> Post. Framework-free React so it runs both in the
 * Next.js app (secure contexts) and bundled into the Android app (android-shell/studio.html).
 */
export function Studio({
  username,
  mediapipeBase,
  api,
  initialSoundId,
  onClose,
  onPublished,
}: {
  username: string;
  mediapipeBase: string;
  api: StudioApi;
  /** Opened from a sound's "Use this sound" button. */
  initialSoundId?: string | null;
  onClose: () => void;
  onPublished: () => void;
}) {
  const [mode, setMode] = useState<"camera" | "text">("camera");
  const [stage, setStage] = useState<"capture" | "edit" | "post">("capture");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [look, setLook] = useState<Look>(DEFAULT_LOOK);
  const [original, setOriginal] = useState<File | undefined>();
  const [result, setResult] = useState<File | null>(null);
  const [fromText, setFromText] = useState(false);
  const [sound, setSound] = useState<SoundPick | null>(null);
  const [picking, setPicking] = useState(false);
  // The sound was playing while recording, so the mic mostly picked up speaker bleed: start with it muted.
  const [recordedWithSound, setRecordedWithSound] = useState(false);

  useEffect(() => () => segments.forEach((s) => URL.revokeObjectURL(s.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!initialSoundId) return;
    studioGet<{ sound: Sound }>(api, `/api/sounds/${encodeURIComponent(initialSoundId)}`)
      .then((r) => setSound({ sound: r.sound, startMs: 0 }))
      .catch(() => {});
  }, [api, initialSoundId]);

  const importFile = async (f: File) => {
    const url = URL.createObjectURL(f);
    const durationMs = await probeDuration(url);
    segments.forEach((s) => URL.revokeObjectURL(s.url));
    setSegments([{ id: newId(), blob: f, durationMs, speed: 1, url }]);
    setOriginal(f);
    setRecordedWithSound(false);
    setStage("edit");
  };

  const publish: Publisher = ({ video, thumbnail, caption, hashtags, audioName }, onProgress) => {
    const fd = new FormData();
    fd.append("video", video);
    fd.append("caption", caption);
    fd.append("hashtags", hashtags);
    fd.append("audioName", audioName);
    if (sound) fd.append("soundId", sound.sound.id);
    if (thumbnail) fd.append("thumbnail", thumbnail, "cover.jpg");
    return studioUpload(api, "/api/videos", fd, onProgress).then(() => undefined);
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
        <Camera
          mediapipeBase={mediapipeBase}
          api={api}
          look={look}
          onLook={setLook}
          segments={segments}
          onSegments={(s) => {
            setSegments(s);
            setOriginal(undefined);
            if (s.length && sound) setRecordedWithSound(true);
            if (!s.length) setRecordedWithSound(false);
          }}
          sound={sound}
          onPickSound={() => setPicking(true)}
          onClearSound={() => setSound(null)}
          onClose={onClose}
          onNext={() => setStage("edit")}
          onImport={importFile}
          modeSwitch={modeSwitch}
        />
      )}
      {stage === "capture" && mode === "text" && (
        <TextPost
          api={api}
          sound={sound}
          onPickSound={() => setPicking(true)}
          onClose={onClose}
          modeSwitch={modeSwitch}
          onNext={(f) => { setResult(f); setFromText(true); setStage("post"); }}
        />
      )}
      {stage === "edit" && (
        <Editor
          api={api}
          segments={segments}
          look={look}
          original={original}
          sound={sound}
          initialOriginalVolume={recordedWithSound ? 0 : 1}
          onPickSound={() => setPicking(true)}
          onBack={() => {
            if (original) { segments.forEach((s) => URL.revokeObjectURL(s.url)); setSegments([]); setOriginal(undefined); }
            setStage("capture");
          }}
          onNext={(f) => { setResult(f); setFromText(false); setStage("post"); }}
        />
      )}
      {stage === "post" && result && (
        <PostDetails
          file={result}
          username={username}
          soundLabel={sound ? `${sound.sound.title} — ${sound.sound.artist}` : null}
          publish={publish}
          onBack={() => setStage(fromText ? "capture" : "edit")}
          onPublished={onPublished}
        />
      )}
      {picking && <SoundPicker api={api} current={sound} onPick={setSound} onClose={() => setPicking(false)} />}
    </div>
  );
}
