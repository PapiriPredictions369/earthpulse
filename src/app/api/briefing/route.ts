import { getBriefing } from "@/lib/briefing";
import { getFeed } from "@/lib/sources";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Allow up to 60s — the model call can take a while.
export const maxDuration = 60;

export async function GET() {
  const feed = await getFeed();
  const briefing = await getBriefing(feed);
  return Response.json(briefing, {
    headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=3600" },
  });
}
