import { getSessionUserId } from "@/lib/auth";
import { getFriends } from "@/lib/inbox";
import { json, unauthorized } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  return json({ friends: await getFriends(userId, 30) });
}
