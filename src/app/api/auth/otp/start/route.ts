import { issueCode, OtpError, CODE_TTL_MS } from "@/lib/otp";
import { sendEmailCode, sendSmsCode, DeliveryError } from "@/lib/delivery";
import { clientIp, parseTarget } from "@/lib/otp-api";
import { json, badRequest } from "@/lib/api";

/** POST { channel: "email" | "sms", target } — sends a 6-digit sign-in code. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = parseTarget(body);
  if ("error" in parsed) return badRequest(parsed.error);
  const { channel, target } = parsed;
  try {
    const code = await issueCode(channel, target, clientIp(req));
    const devCode = channel === "email" ? await sendEmailCode(target, code) : await sendSmsCode(target, code);
    return json({ ok: true, target, expiresInSec: CODE_TTL_MS / 1000, ...(devCode ? { devCode } : {}) });
  } catch (e) {
    if (e instanceof OtpError) return json({ error: e.message, retryAfter: e.retryAfter }, e.status);
    if (e instanceof DeliveryError) return json({ error: e.message }, 502);
    throw e;
  }
}
