import { getFeed } from "@/lib/sources";

// Always run at request time; our own Upstash layer handles caching/TTL.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const feed = await getFeed();
  return Response.json(feed, {
    headers: {
      // allow a short CDN cache + stale-while-revalidate as a second layer
      "Cache-Control": "s-maxage=60, stale-while-revalidate=120",
    },
  });
}
