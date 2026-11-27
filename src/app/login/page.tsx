import { LoginForm } from "./LoginForm";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const demo = await prisma.user.findMany({ select: { username: true, displayName: true, avatarUrl: true }, orderBy: { createdAt: "asc" }, take: 4 });
  return <LoginForm next={safeNext} demoUsers={demo} />;
}
