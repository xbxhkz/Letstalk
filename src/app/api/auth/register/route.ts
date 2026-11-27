import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { badRequest, json } from "@/lib/api";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const displayName = String(body.displayName ?? "").trim() || username;
  if (!/^[a-z0-9._]{3,24}$/.test(username)) return badRequest("Username must be 3–24 characters: letters, numbers, . or _");
  if (password.length < 6) return badRequest("Password must be at least 6 characters");
  if (await prisma.user.findUnique({ where: { username } })) return badRequest("That username is taken");
  const user = await prisma.user.create({
    data: { username, displayName: displayName.slice(0, 40), passwordHash: await bcrypt.hash(password, 10) },
    select: { id: true, username: true },
  });
  await createSession(user.id);
  return json({ user }, 201);
}
