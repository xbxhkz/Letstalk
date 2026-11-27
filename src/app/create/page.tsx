import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { CreateHub } from "./CreateHub";

export const dynamic = "force-dynamic";

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ mode?: string; sound?: string }> }) {
  const { mode, sound } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(sound ? `/create?sound=${sound}` : "/create")}`);
  // ?sound=<id> comes from a sound page's "Use this sound".
  return <CreateHub username={user.username} startWithUpload={mode === "upload"} soundId={sound && /^[\w-]{1,40}$/.test(sound) ? sound : null} />;
}
