/**
 * Android app entry for the camera studio (android-shell/studio.html, origin https://localhost).
 * The Letstalk page at /create opens this with ?server=<origin>&token=<upload token>&user=<name>.
 * Built by scripts/build-studio.mjs.
 */
import { createRoot } from "react-dom/client";
import { Studio } from "./Studio";

const params = new URLSearchParams(location.search);
const rawServer = params.get("server") ?? "";
const token = params.get("token") ?? "";
const user = params.get("user") ?? "you";
const soundId = /^[\w-]{1,40}$/.test(params.get("sound") ?? "") ? params.get("sound") : null;
// Don't leave the token in the address/history.
history.replaceState(null, "", location.pathname);

/** Only send the upload token to the kind of server the app is allowed to use (LAN or https). */
function trustedServer(raw: string): string | null {
  try {
    const u = new URL(raw);
    const lan = /^(localhost|10\.\d+\.\d+\.\d+|172\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)$/.test(u.hostname);
    if (u.protocol === "https:" || (u.protocol === "http:" && lan)) return u.origin;
  } catch {}
  return null;
}

const server = trustedServer(rawServer);
const root = createRoot(document.getElementById("root")!);

if (!server || !token) {
  root.render(
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center text-white">
      <p>Open the camera from the Create (+) button in Letstalk.</p>
      <a href="/" className="rounded-md bg-brand px-6 py-2.5 font-semibold">Back to Letstalk</a>
    </div>,
  );
} else {
  root.render(
    <Studio
      username={user}
      mediapipeBase={`${server}/mediapipe`}
      api={{ base: server, token }}
      visionWorker={() => new Worker("studio-worker.js")}
      initialSoundId={soundId}
      onClose={() => location.replace(`${server}/`)}
      onPublished={() => location.replace(`${server}/profile/${encodeURIComponent(user)}`)}
    />,
  );
}
