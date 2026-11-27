import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { json, unauthorized } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  const notices = await prisma.notice.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100 });
  return json({ items: notices.map((n) => ({ ...n, createdAt: n.createdAt.toISOString(), readAt: n.readAt?.toISOString() ?? null })) });
}
