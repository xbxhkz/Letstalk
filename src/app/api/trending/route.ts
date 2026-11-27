import { getTrending } from "@/lib/trending";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return json({ hashtags: await getTrending() });
}
