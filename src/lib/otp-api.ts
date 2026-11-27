import { normalizeEmail, normalizePhone } from "./identity";
import type { Channel } from "./otp";

/** Parses { channel, target } from a request body into a normalised address. */
export function parseTarget(body: Record<string, unknown>): { channel: Channel; target: string } | { error: string } {
  const channel = body.channel === "sms" ? "sms" : body.channel === "email" ? "email" : null;
  if (!channel) return { error: "Choose email or phone." };
  const target = channel === "email" ? normalizeEmail(body.target) : normalizePhone(body.target);
  if (!target) return { error: channel === "email" ? "Enter a valid email address." : "Enter a valid phone number, including the country code (for example +44 7700 900123)." };
  return { channel, target };
}

export function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip"))?.trim() || null;
}
