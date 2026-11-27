import { verifyCode, OtpError } from "@/lib/otp";
import { findOrCreateByContact } from "@/lib/identity";
import { createSession } from "@/lib/auth";
import { parseTarget } from "@/lib/otp-api";
import { json, badRequest } from "@/lib/api";

/** POST { channel, target, code } — signs in (creating the account on first use). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = parseTarget(body);
  if ("error" in parsed) return badRequest(parsed.error);
  const { channel, target } = parsed;
  try {
    await verifyCode(channel, target, String(body.code ?? ""));
  } catch (e) {
    if (e instanceof OtpError) return json({ error: e.message }, e.status);
    throw e;
  }
  const { user, created } = await findOrCreateByContact(channel === "email" ? "email" : "phone", target);
  await createSession(user.id);
  return json({ user: { id: user.id, username: user.username }, created, needsUsername: user.needsUsername });
}
