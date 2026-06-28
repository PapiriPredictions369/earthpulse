import { cached } from "./cache";
import type { NewsArticle } from "./types";

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

export async function getNews(): Promise<NewsArticle[]> {
  return cached("gdelt:news", 900, async () => {
    const url =
      "https://api.gdeltproject.org/api/v2/doc/doc?" +
      `query=${encodeURIComponent(GDELT_QUERY)}` +
      "&mode=ArtList&format=json&maxrecords=40&sort=DateDesc";

    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      cache: "no-store",
    });
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
  });
}
