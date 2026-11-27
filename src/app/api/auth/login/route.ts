import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { json } from "@/lib/api";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const username = String(body.username ?? "").trim().toLowerCase().replace(/^@/, "");
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await bcrypt.compare(String(body.password ?? ""), user.passwordHash)))
    return json({ error: "Wrong username or password" }, 401);
  await createSession(user.id);
  return json({ user: { id: user.id, username: user.username } });
}
