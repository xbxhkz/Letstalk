import crypto from "node:crypto";
import { prisma } from "./prisma";

/** Lowercased, trimmed email, or null if it doesn't look like one. */
export function normalizeEmail(raw: unknown): string | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return null;
  return v;
}

/**
 * E.164 phone number (+<country><number>), or null.
 * Numbers without a "+" get DEFAULT_PHONE_COUNTRY_CODE (default 1, US/Canada) when they have 10 digits.
 */
export function normalizePhone(raw: unknown): string | null {
  const v = String(raw ?? "").trim();
  if (!/^[+\d\s().-]{7,24}$/.test(v)) return null;
  let digits = v.replace(/[^\d]/g, "");
  if (v.startsWith("+")) {
    // already international
  } else if (v.startsWith("00")) {
    digits = digits.slice(2);
  } else {
    const cc = (process.env.DEFAULT_PHONE_COUNTRY_CODE || "1").replace(/\D/g, "");
    if (cc === "1" && digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
    if (digits.length !== 10) return null;
    digits = cc + digits;
  }
  if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return null;
  return `+${digits}`;
}

/** "+15551234567" -> "+1 •••• ••4567" for display. */
export function maskPhone(e164: string) {
  return `${e164.slice(0, e164.length - 10 > 1 ? e164.length - 10 : 2)} •••• ••${e164.slice(-4)}`;
}

const USERNAME_RE = /^[a-z0-9._]{3,24}$/;
export const isValidUsername = (u: string) => USERNAME_RE.test(u);

/** A free, valid username derived from `seed` (e.g. the email's local part or the Google name). */
export async function generateUsername(seed: string): Promise<string> {
  let base = seed.toLowerCase().normalize("NFKD").replace(/[^a-z0-9._]/g, "").replace(/^[._]+|[._]+$/g, "").slice(0, 18);
  if (base.length < 3) base = "user";
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}${crypto.randomInt(100, 99999)}`;
    if (isValidUsername(candidate) && !(await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } }))) return candidate;
  }
  return `user${crypto.randomBytes(5).toString("hex")}`;
}

/** Find the account for a verified email/phone, or create one that still needs to pick a username. */
export async function findOrCreateByContact(kind: "email" | "phone", value: string) {
  const existing = await prisma.user.findUnique({ where: kind === "email" ? { email: value } : { phone: value } });
  if (existing) return { user: existing, created: false };
  const seed = kind === "email" ? value.split("@")[0] : "user";
  const username = await generateUsername(seed);
  const user = await prisma.user.create({
    data: { username, displayName: kind === "email" ? seed.slice(0, 40) : "New user", [kind]: value, needsUsername: true },
  });
  return { user, created: true };
}
