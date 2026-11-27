import crypto from "node:crypto";
import { prisma } from "./prisma";

/**
 * One-time sign-in codes for email and SMS.
 * - 6 digits, valid for 10 minutes, 5 wrong guesses and the code is dead.
 * - Only an HMAC of the code is stored (keyed with AUTH_SECRET), so a database leak doesn't leak live codes.
 * - Sending a new code invalidates older ones. Rate limits: 1 send per 30 s and 5 per hour per address,
 *   20 per hour per IP.
 */
export type Channel = "email" | "sms";

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
const RESEND_GAP_MS = 30 * 1000;
const PER_TARGET_PER_HOUR = 5;
const PER_IP_PER_HOUR = 20;

const key = () => process.env.AUTH_SECRET || "letstalk-dev-secret-change-me-in-production";
export const hashCode = (channel: Channel, target: string, code: string) =>
  crypto.createHmac("sha256", key()).update(`${channel}:${target}:${code}`).digest("hex");

export class OtpError extends Error {
  constructor(message: string, public status = 400, public retryAfter?: number) {
    super(message);
  }
}

export async function issueCode(channel: Channel, target: string, ip: string | null): Promise<string> {
  const now = Date.now();
  const hourAgo = new Date(now - 60 * 60 * 1000);
  const recent = await prisma.otpCode.findMany({ where: { channel, target, createdAt: { gt: hourAgo } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  if (recent[0] && now - recent[0].createdAt.getTime() < RESEND_GAP_MS) {
    const wait = Math.ceil((RESEND_GAP_MS - (now - recent[0].createdAt.getTime())) / 1000);
    throw new OtpError(`Please wait ${wait}s before requesting another code.`, 429, wait);
  }
  if (recent.length >= PER_TARGET_PER_HOUR) throw new OtpError("Too many codes requested. Try again in an hour.", 429, 3600);
  if (ip && (await prisma.otpCode.count({ where: { ip, createdAt: { gt: hourAgo } } })) >= PER_IP_PER_HOUR)
    throw new OtpError("Too many codes requested from this network. Try again later.", 429, 3600);

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.$transaction([
    prisma.otpCode.updateMany({ where: { channel, target, consumedAt: null }, data: { consumedAt: new Date() } }),
    prisma.otpCode.create({ data: { channel, target, codeHash: hashCode(channel, target, code), expiresAt: new Date(now + CODE_TTL_MS), ip } }),
  ]);
  return code;
}

/** Checks a code. Returns true once (the code is consumed); throws with a user-facing message otherwise. */
export async function verifyCode(channel: Channel, target: string, code: string): Promise<true> {
  const clean = code.replace(/\D/g, "");
  if (clean.length !== 6) throw new OtpError("Enter the 6-digit code.");
  const row = await prisma.otpCode.findFirst({ where: { channel, target, consumedAt: null }, orderBy: { createdAt: "desc" } });
  if (!row || row.expiresAt.getTime() < Date.now()) throw new OtpError("That code has expired. Request a new one.", 400);
  if (row.attempts >= MAX_ATTEMPTS) throw new OtpError("Too many wrong tries. Request a new code.", 429);

  const expected = Buffer.from(row.codeHash, "hex");
  const actual = Buffer.from(hashCode(channel, target, clean), "hex");
  if (!crypto.timingSafeEqual(expected, actual)) {
    const { attempts } = await prisma.otpCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } }, select: { attempts: true } });
    const left = MAX_ATTEMPTS - attempts;
    throw new OtpError(left > 0 ? `Wrong code. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong tries. Request a new code.", left > 0 ? 400 : 429);
  }
  // Consume atomically so the same code can't be used twice in parallel.
  const { count } = await prisma.otpCode.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: new Date() } });
  if (count !== 1) throw new OtpError("That code was already used. Request a new one.");
  return true;
}
