import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { json } from "@/lib/api";

// Compared against when the account doesn't exist or has no password, so response time doesn't reveal which.
const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8.q8l1W0sZ7Z7S5ZtGqk5lBvG5rG2y";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const username = String(body.username ?? "").trim().toLowerCase().replace(/^@/, "");
  const user = await prisma.user.findUnique({ where: { username } });
  const ok = await bcrypt.compare(String(body.password ?? ""), user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.passwordHash || !ok) return json({ error: "Wrong username or password" }, 401);
  await createSession(user.id);
  return json({ user: { id: user.id, username: user.username } });
}
