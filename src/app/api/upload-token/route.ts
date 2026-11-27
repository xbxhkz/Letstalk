import { createUploadToken, getSessionUserId } from "@/lib/auth";
import { json, unauthorized } from "@/lib/api";

export const dynamic = "force-dynamic";

/** POST — a 30-minute upload-only token for the Android app's camera studio. */
export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  return json({ token: await createUploadToken(userId), expiresIn: 1800 });
}
