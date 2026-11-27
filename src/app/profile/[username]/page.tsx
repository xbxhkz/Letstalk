import { notFound } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { getProfile } from "@/lib/profile";
import { findVideos } from "@/lib/videos";
import { ProfileView } from "./ProfileView";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const username = decodeURIComponent((await params).username).toLowerCase();
  const viewerId = await getSessionUserId();
  const profile = await getProfile(username, viewerId);
  if (!profile) notFound();
  const posted = await findVideos({ authorId: profile.id }, viewerId);
  return <ProfileView key={profile.id} initialProfile={profile} initialPosted={posted} />;
}
