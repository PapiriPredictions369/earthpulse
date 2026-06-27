import Dashboard from "@/components/Dashboard";
import { getFeed } from "@/lib/sources";

// Server-render the first paint with live data, then the client refreshes it.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function Page() {
  const feed = await getFeed();
  return <Dashboard initial={feed} />;
}
