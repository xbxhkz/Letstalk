import { getSessionUserId } from "@/lib/auth";
import { getUnread } from "@/lib/inbox";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return json({ followers: 0, activity: 0, system: 0, messages: 0, total: 0 });
  return json(await getUnread(userId));
}
