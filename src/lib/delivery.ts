import nodemailer, { type Transporter } from "nodemailer";

/**
 * Sends sign-in codes.
 *   Email: SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, SMTP_FROM
 *   SMS:   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM (a number) or TWILIO_MESSAGING_SERVICE_SID
 * When a channel isn't configured and NODE_ENV isn't "production", the code is printed to the
 * server console and returned to the browser as `devCode` so sign-in can be tested locally.
 */
export const emailConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_FROM);
export const smsConfigured = () =>
  !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID));
export const devDelivery = () => process.env.NODE_ENV !== "production" || process.env.DEV_SHOW_CODES === "1";

export class DeliveryError extends Error {}

let transport: Transporter | null = null;

export async function sendEmailCode(to: string, code: string) {
  if (!emailConfigured()) return devLog("email", to, code);
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject: `${code} is your Letstalk code`,
      text: `Your Letstalk sign-in code is ${code}\n\nIt expires in 10 minutes. If you didn't ask for it, you can ignore this email.`,
      html: `<div style="font-family:system-ui,sans-serif;font-size:16px;color:#111"><p>Your Letstalk sign-in code is</p><p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:8px 0">${code}</p><p style="color:#666">It expires in 10 minutes. If you didn't ask for it, you can ignore this email.</p></div>`,
    });
  } catch (e) {
    console.error("[letstalk] email send failed:", (e as Error).message);
    throw new DeliveryError("We couldn't send the email. Try again in a moment.");
  }
  return null;
}

export async function sendSmsCode(to: string, code: string) {
  if (!smsConfigured()) return devLog("sms", to, code);
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const form = new URLSearchParams({ To: to, Body: `${code} is your Letstalk code. It expires in 10 minutes.` });
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) form.set("MessagingServiceSid", process.env.TWILIO_MESSAGING_SERVICE_SID);
  else form.set("From", process.env.TWILIO_FROM!);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  }).catch(() => null);
  if (!res || !res.ok) {
    const detail = res ? await res.text().catch(() => "") : "network error";
    console.error("[letstalk] SMS send failed:", res?.status, detail.slice(0, 300));
    throw new DeliveryError("We couldn't send the text message. Check the number and try again.");
  }
  return null;
}

/** Dev fallback: returns the code so the API can show it; refuses in production. */
function devLog(channel: string, to: string, code: string) {
  if (!devDelivery()) throw new DeliveryError(channel === "email" ? "Email sign-in isn't set up on this server yet." : "Phone sign-in isn't set up on this server yet.");
  console.log(`\n[letstalk] ${channel} sign-in code for ${to}: ${code}  (dev mode: no ${channel === "email" ? "SMTP" : "Twilio"} configured)\n`);
  return code;
}
