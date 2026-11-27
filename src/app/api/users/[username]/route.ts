import { getProfile } from "@/lib/profile";
import { getSessionUserId } from "@/lib/auth";
import { json, notFound } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const profile = await getProfile(decodeURIComponent(username).toLowerCase(), await getSessionUserId());
  return profile ? json({ profile }) : notFound("User not found");
}
