import { cacheGet, cacheSet } from "./cache";
import type { NewsArticle } from "./types";

const NEWS_KEY = "gdelt:news:v2";
const OK_TTL = 900; // cache real results for 15 min
const FAIL_TTL = 120; // cache empties briefly so we retry soon but don't hammer

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const UA = "EarthPulse/1.0 (+https://github.com/) creation-watch dashboard";

// Curated reputable English-language outlets. GDELT DOC 2.0 accepts a
// domain-only boolean query; sorted newest-first.
const OUTLETS = [
  "reuters.com",
  "apnews.com",
  "bbc.com",
  "bbc.co.uk",
  "aljazeera.com",
  "theguardian.com",
  "cnn.com",
  "npr.org",
];

const GDELT_QUERY = `(${OUTLETS.map((d) => `domain:${d}`).join(" OR ")})`;

/** Source-country centroids (approx). News is plotted by where the outlet is based. */
const COUNTRY_CENTROID: Record<string, [number, number]> = {
  "United States": [39.8, -98.6],
  "United Kingdom": [54.0, -2.0],
  Qatar: [25.3, 51.2],
  France: [46.2, 2.2],
  Germany: [51.2, 10.4],
  Spain: [40.0, -4.0],
  Italy: [42.8, 12.8],
  Russia: [61.5, 105.3],
  China: [35.9, 104.2],
  Japan: [36.2, 138.3],
  India: [22.0, 79.0],
  Australia: [-25.3, 133.8],
  Canada: [56.1, -106.3],
  Brazil: [-14.2, -51.9],
  "South Africa": [-30.6, 22.9],
  Israel: [31.0, 34.9],
  "United Arab Emirates": [24.0, 54.0],
  "Saudi Arabia": [23.9, 45.1],
  Turkey: [39.0, 35.2],
  Ukraine: [48.4, 31.2],
  Mexico: [23.6, -102.6],
  "South Korea": [36.5, 127.9],
  Singapore: [1.35, 103.8],
  Ireland: [53.4, -8.2],
  Egypt: [26.8, 30.8],
  Nigeria: [9.1, 8.7],
  Kenya: [-0.0, 37.9],
  Pakistan: [30.4, 69.3],
  Indonesia: [-2.5, 118.0],
};

function parseSeenDate(s: string): string {
  // "20260627T213000Z" -> ISO
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!m) return new Date().toISOString();
  const [, y, mo, d, h, mi, se] = m;
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:${se}Z`).toISOString();
}

type GdeltArticle = {
  url: string;
  title: string;
  seendate: string;
  socialimage?: string;
  domain: string;
  sourcecountry?: string;
};

async function fetchGdelt(): Promise<NewsArticle[]> {
  const url =
    "https://api.gdeltproject.org/api/v2/doc/doc?" +
    `query=${encodeURIComponent(GDELT_QUERY)}` +
    "&mode=ArtList&format=json&maxrecords=40&sort=DateDesc";

  // GDELT rate-limits per IP (1 req / 5s) and Vercel egress IPs are shared,
  // so 429s are common. Try a couple of spaced attempts before giving up.
  let lastErr = "unknown";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(5200);
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      cache: "no-store",
    });
    if (res.status === 429) {
      lastErr = "HTTP 429";
      continue;
    }
    if (!res.ok) throw new Error(`GDELT -> HTTP ${res.status}`);
    const data = (await res.json()) as { articles?: GdeltArticle[] };
    const seen = new Set<string>();
    const out: NewsArticle[] = [];
    for (const a of data.articles ?? []) {
      if (!a.url || seen.has(a.url)) continue;
      seen.add(a.url);
      const centroid = a.sourcecountry
        ? COUNTRY_CENTROID[a.sourcecountry]
        : undefined;
      out.push({
        id: `gdelt:${a.url}`,
        title: a.title?.trim() || a.domain,
        url: a.url,
        image: a.socialimage || undefined,
        domain: a.domain,
        country: a.sourcecountry,
        time: parseSeenDate(a.seendate),
        lat: centroid?.[0],
        lng: centroid?.[1],
      });
    }
    return out;
  }
  throw new Error(`GDELT -> ${lastErr}`);
}

export async function getNews(): Promise<NewsArticle[]> {
  const hit = await cacheGet<NewsArticle[]>(NEWS_KEY);
  if (hit) return hit;
  try {
    const articles = await fetchGdelt();
    // Only cache a non-empty success for the full TTL; empty success is brief.
    await cacheSet(NEWS_KEY, articles, articles.length ? OK_TTL : FAIL_TTL);
    return articles;
  } catch {
    // Cache the empty result briefly so we don't hammer GDELT on every request,
    // but recover within a couple of minutes once it lets us through.
    await cacheSet(NEWS_KEY, [], FAIL_TTL);
    return [];
  }
}
