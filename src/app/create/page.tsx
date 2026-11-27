import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { CreateHub } from "./CreateHub";

export const dynamic = "force-dynamic";

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/create");
  const { mode } = await searchParams;
  return <CreateHub username={user.username} startWithUpload={mode === "upload"} />;
}
