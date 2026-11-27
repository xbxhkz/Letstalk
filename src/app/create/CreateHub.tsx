"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, Loader2, Upload, X } from "lucide-react";
import { Studio, xhrPublisher } from "@/studio/Studio";
import { useToast } from "@/components/Providers";
import { api } from "@/lib/client";
import { CreateForm } from "./CreateForm";

type Where = "checking" | "studio" | "app" | "insecure";

/**
 * Picks how to create:
 * - secure page (https / localhost): the camera studio runs right here;
 * - Android app on a plain-http server: open the studio bundled in the app (secure https://localhost);
 * - plain-http browser: the camera API doesn't exist, so offer file upload.
 */
export function CreateHub({ username, startWithUpload }: { username: string; startWithUpload: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [where, setWhere] = useState<Where>("checking");
  const [upload, setUpload] = useState(startWithUpload);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    const inApp = /\bLetstalkApp\b/.test(navigator.userAgent);
    // mediaDevices is undefined on plain-http pages, whatever the TypeScript types say.
    if (window.isSecureContext && typeof navigator.mediaDevices?.getUserMedia === "function") setWhere("studio");
    else setWhere(inApp ? "app" : "insecure");
  }, []);

  const openAppStudio = async () => {
    setOpening(true);
    try {
      const { token } = await api<{ token: string }>("/api/upload-token", { method: "POST" });
      const q = new URLSearchParams({ server: window.location.origin, token, user: username });
      window.location.href = `https://localhost/studio.html?${q}`;
    } catch (e) {
      toast((e as Error).message, "error");
      setOpening(false);
    }
  };

  // The app opens its bundled studio straight away.
  useEffect(() => {
    if (where === "app" && !upload) openAppStudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [where]);

  if (upload) return <CreateForm username={username} />;

  if (where === "checking" || (where === "app" && opening)) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-white/60" /></div>;
  }

  if (where === "studio") {
    return (
      <div className="fixed inset-0 z-[60] mx-auto h-[100dvh] max-w-[430px] bg-black">
        <Studio
          username={username}
          mediapipeBase="/mediapipe"
          publish={xhrPublisher("/api/videos")}
          onClose={() => (history.length > 1 ? router.back() : router.push("/"))}
          onPublished={() => {
            toast("Your video is live!");
            router.push(`/profile/${username}`);
            router.refresh();
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="relative flex h-12 shrink-0 items-center justify-center border-b border-white/10 font-semibold">
        <Link href="/" aria-label="Close" className="absolute left-2 p-1.5"><X className="h-6 w-6" /></Link>
        Create
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <Camera className="h-12 w-12 text-white/40" />
        {where === "app" ? (
          <>
            <p className="text-white/70">Couldn&apos;t open the camera.</p>
            <button onClick={openAppStudio} className="rounded-md bg-brand px-6 py-2.5 font-semibold">Try again</button>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold">Camera needs a secure connection</p>
            <p className="text-sm text-white/60">Browsers only allow the camera on https or localhost pages. Use the Letstalk Android app, open this site over https, or upload a video file.</p>
          </>
        )}
        <button onClick={() => setUpload(true)} className="flex items-center gap-2 rounded-md bg-neutral-800 px-6 py-2.5 font-semibold"><Upload className="h-4 w-4" /> Upload a video</button>
      </div>
    </div>
  );
}
