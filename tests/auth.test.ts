/** Sign-in code and identity tests. Run with `npm test`. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { issueCode, verifyCode, OtpError, MAX_ATTEMPTS } from "../src/lib/otp";
import { normalizeEmail, normalizePhone, findOrCreateByContact, generateUsername } from "../src/lib/identity";

const T = (s: string) => `${s}-${Date.now()}@test.example`;

after(async () => {
  await prisma.otpCode.deleteMany({ where: { target: { contains: "test.example" } } });
  await prisma.user.deleteMany({ where: { email: { contains: "test.example" } } });
  await prisma.$disconnect();
});

test("email normalisation", () => {
  assert.equal(normalizeEmail("  Maya@Example.COM "), "maya@example.com");
  assert.equal(normalizeEmail("not-an-email"), null);
  assert.equal(normalizeEmail("a@b"), null);
});

test("phone normalisation to E.164", () => {
  assert.equal(normalizePhone("+44 7700 900123"), "+447700900123");
  assert.equal(normalizePhone("(555) 123-4567"), "+15551234567"); // default country code 1
  assert.equal(normalizePhone("1 555 123 4567"), "+15551234567");
  assert.equal(normalizePhone("0044 7700 900123"), "+447700900123");
  assert.equal(normalizePhone("12345"), null);
  assert.equal(normalizePhone("call me"), null);
});

test("a code works once, and the right code is required", async () => {
  const email = T("once");
  const code = await issueCode("email", email, null);
  assert.match(code, /^\d{6}$/);
  const wrong = code === "000000" ? "111111" : "000000";
  await assert.rejects(verifyCode("email", email, wrong), (e: OtpError) => /Wrong code/.test(e.message));
  assert.equal(await verifyCode("email", email, code), true);
  await assert.rejects(verifyCode("email", email, code), OtpError, "a used code can't be reused");
});

test("the code is not stored in plain text", async () => {
  const email = T("hash");
  const code = await issueCode("email", email, null);
  const row = await prisma.otpCode.findFirstOrThrow({ where: { target: email } });
  assert.notEqual(row.codeHash, code);
  assert.ok(!row.codeHash.includes(code));
});

test(`after ${MAX_ATTEMPTS} wrong tries even the right code is refused`, async () => {
  const email = T("lockout");
  const code = await issueCode("email", email, null);
  const wrong = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < MAX_ATTEMPTS; i++) await assert.rejects(verifyCode("email", email, wrong), OtpError);
  await assert.rejects(verifyCode("email", email, code), (e: OtpError) => e.status === 429);
});

test("expired codes are refused", async () => {
  const email = T("expired");
  const code = await issueCode("email", email, null);
  await prisma.otpCode.updateMany({ where: { target: email }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await assert.rejects(verifyCode("email", email, code), (e: OtpError) => /expired/.test(e.message));
});

test("resending too fast is rate-limited, and a new code replaces the old one", async () => {
  const email = T("rate");
  const first = await issueCode("email", email, null);
  await assert.rejects(issueCode("email", email, null), (e: OtpError) => e.status === 429 && !!e.retryAfter);
  // Pretend 31 s passed.
  await prisma.otpCode.updateMany({ where: { target: email }, data: { createdAt: new Date(Date.now() - 31_000) } });
  const second = await issueCode("email", email, null);
  if (first !== second) await assert.rejects(verifyCode("email", email, first), OtpError, "the old code is dead");
  assert.equal(await verifyCode("email", email, second), true);
});

test("first sign-in creates an account that must pick a username; the next one finds it", async () => {
  const email = T("newuser");
  const a = await findOrCreateByContact("email", email);
  assert.equal(a.created, true);
  assert.equal(a.user.needsUsername, true);
  assert.equal(a.user.passwordHash, null);
  const b = await findOrCreateByContact("email", email);
  assert.equal(b.created, false);
  assert.equal(b.user.id, a.user.id);
});

test("generated usernames are valid and unique", async () => {
  const taken = (await prisma.user.findFirstOrThrow()).username;
  const u = await generateUsername(taken);
  assert.match(u, /^[a-z0-9._]{3,24}$/);
  assert.notEqual(u, taken);
  assert.match(await generateUsername("Zoë O'Brien!!"), /^[a-z0-9._]{3,24}$/);
});

test("post-login destinations can't leave the site", async () => {
  const { safeNext } = await import("../src/lib/auth-flow");
  for (const bad of ["//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "/\r\n/evil.com", "https://evil.com", "javascript:alert(1)", "evil.com", "/\\/evil.com", "/.//evil.com", "/a/..//evil.com", "/./\\evil.com", "/%2e//evil.com", ""])
    assert.equal(safeNext(bad), "/", JSON.stringify(bad));
  assert.equal(safeNext("/discover?q=%23dance#top"), "/discover?q=%23dance#top");
  assert.equal(safeNext("/profile/maya.moves"), "/profile/maya.moves");
  assert.equal(safeNext("/a/../discover"), "/discover");
});
