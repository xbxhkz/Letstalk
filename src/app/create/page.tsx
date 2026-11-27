import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { CreateForm } from "./CreateForm";

export const dynamic = "force-dynamic";

export default async function CreatePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/create");
  return <CreateForm username={user.username} />;
}
