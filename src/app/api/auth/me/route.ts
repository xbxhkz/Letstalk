import { getSessionUser } from "@/lib/auth";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return json({ user: await getSessionUser() });
}
