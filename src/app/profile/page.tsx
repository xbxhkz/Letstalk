import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function MyProfile() {
  const user = await getSessionUser();
  redirect(user ? `/profile/${user.username}` : "/login?next=/profile");
}
