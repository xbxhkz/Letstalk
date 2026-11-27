import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { safeNext } from "@/lib/auth-flow";
import { Onboarding } from "./Onboarding";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getSessionUser();
  const next = safeNext((await searchParams).next);
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!user.needsUsername) redirect(next);
  return <Onboarding suggested={user.username} name={user.displayName} next={next} />;
}
