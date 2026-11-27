import { LoginForm } from "./LoginForm";
import { prisma } from "@/lib/prisma";
import { googleConfigured } from "@/lib/google";
import { safeNext } from "@/lib/auth-flow";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  google_not_configured: "Google sign-in isn't set up on this server yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const demo = await prisma.user.findMany({
    where: { passwordHash: { not: null }, needsUsername: false },
    select: { username: true, displayName: true, avatarUrl: true },
    orderBy: { createdAt: "asc" },
    take: 4,
  });
  return (
    <LoginForm
      next={safeNext(next)}
      demoUsers={demo}
      googleEnabled={googleConfigured()}
      initialError={error ? (ERRORS[error] ?? error.slice(0, 200)) : null}
    />
  );
}
