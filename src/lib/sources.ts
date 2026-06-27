import { cached, cacheBackend } from "./cache";
import type {
  Feed,
  Gauge,
  Severity,
  Signal,
  SignalCategory,
  SchumannReading,
} from "./types";

const UA = "EarthPulse/1.0 (+https://github.com/) creation-watch dashboard";

async function fetchJson<T>(url: string, ms = 9000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

/* ----------------------------- Earthquakes (USGS) ----------------------------- */

type UsgsFeed = {
  features: {
    id: string;
    properties: { mag: number | null; place: string; time: number; url: string };
    geometry: { coordinates: [number, number, number] };
  }[];
};

function quakeSeverity(mag: number | null): Severity {
  if (mag == null) return "low";
  if (mag >= 6.5) return "extreme";
  if (mag >= 5.5) return "high";
  if (mag >= 4.5) return "moderate";
  return "low";
}

async function getEarthquakes(): Promise<Signal[]> {
  return cached("eq:usgs:2.5_day", 120, async () => {
    const data = await fetchJson<UsgsFeed>(
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson",
    );
    return data.features.map((f): Signal => {
      const mag = f.properties.mag;
      const [lng, lat] = f.geometry.coordinates;
      return {
        id: `usgs:${f.id}`,
        category: "earthquake",
        title: f.properties.place || "Earthquake",
        scale: mag != null ? `M${mag.toFixed(1)}` : undefined,
        magnitude: mag ?? undefined,
        severity: quakeSeverity(mag),
        time: new Date(f.properties.time).toISOString(),
        lat,
        lng,
        url: f.properties.url,
        source: "USGS",
      };
    });
  });
}

/* --------------------------- Natural events (NASA EONET) --------------------------- */

type EonetFeed = {
  events: {
    id: string;
    title: string;
    link: string;
    categories: { id: string; title: string }[];
    geometry: { date: string; type: string; coordinates: number[] }[];
  }[];
};

const EONET_CATEGORY: Record<string, SignalCategory> = {
  wildfires: "wildfire",
  volcanoes: "volcano",
  severeStorms: "severe-storm",
  seaLakeIce: "sea-ice",
  floods: "flood",
  drought: "drought",
  landslides: "landslide",
  snow: "snow",
  dustHaze: "dust-haze",
  earthquakes: "earthquake",
  tempExtremes: "temperature",
  waterColor: "water-color",
  manmade: "manmade",
};

function eventSeverity(cat: SignalCategory): Severity {
  if (cat === "volcano" || cat === "severe-storm" || cat === "wildfire")
    return "high";
  if (cat === "flood" || cat === "landslide") return "moderate";
  return "moderate";
}

async function getNaturalEvents(): Promise<Signal[]> {
  return cached("eonet:open:20d", 300, async () => {
    const data = await fetchJson<EonetFeed>(
      "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=20",
    );
    return data.events.map((e): Signal => {
      const catId = e.categories[0]?.id ?? "other";
      const category = EONET_CATEGORY[catId] ?? "other";
      const last = e.geometry[e.geometry.length - 1];
      let lat: number | undefined;
      let lng: number | undefined;
      if (last && last.type === "Point" && last.coordinates.length >= 2) {
        [lng, lat] = last.coordinates as [number, number];
      }
      return {
        id: `eonet:${e.id}`,
        category,
        title: e.title,
        severity: eventSeverity(category),
        time: last?.date
          ? new Date(last.date).toISOString()
          : new Date().toISOString(),
        lat,
        lng,
        url: e.link,
        source: "NASA EONET",
      };
    });
  });
}

/* ------------------------------ Solar flares (NASA DONKI) ------------------------------ */

type DonkiFlare = {
  flrID: string;
  beginTime: string;
  peakTime: string | null;
  classType: string | null;
  sourceLocation: string | null;
  link: string;
};

function flareSeverityFromClass(cls: string | null): Severity {
  const c = (cls ?? "").charAt(0).toUpperCase();
  if (c === "X") return "extreme";
  if (c === "M") return "high";
  if (c === "C") return "moderate";
  return "low";
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function getSolarFlares(): Promise<Signal[]> {
  return cached("donki:flr:7d", 600, async () => {
    const key = process.env.NASA_API_KEY || "DEMO_KEY";
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 24 * 3600 * 1000);
    const data = await fetchJson<DonkiFlare[]>(
      `https://api.nasa.gov/DONKI/FLR?startDate=${ymd(start)}&endDate=${ymd(
        end,
      )}&api_key=${key}`,
    );
    return (data || []).map((f): Signal => {
      const t = f.peakTime || f.beginTime;
      return {
        id: `donki:${f.flrID}`,
        category: "solar-flare",
        title: `Solar flare ${f.classType ?? ""}${
          f.sourceLocation ? ` @ ${f.sourceLocation}` : ""
        }`.trim(),
        scale: f.classType ?? undefined,
        severity: flareSeverityFromClass(f.classType),
        time: new Date(t).toISOString(),
        url: f.link,
        source: "NASA DONKI",
      };
    });
  });
}

/* ------------------------------ Space-weather gauges (NOAA SWPC) ------------------------------ */

type KpRow = { time_tag: string; kp_index: number };
type XrayRow = { time_tag: string; flux: number; energy: string };

function kpSeverity(kp: number): Severity {
  if (kp >= 7) return "extreme";
  if (kp >= 5) return "high";
  if (kp >= 4) return "moderate";
  return "low";
}

function windSeverity(speed: number): Severity {
  if (speed >= 700) return "extreme";
  if (speed >= 550) return "high";
  if (speed >= 450) return "moderate";
  return "low";
}

function flareClass(flux: number): { display: string; severity: Severity } {
  let cls: string;
  let n: number;
  if (flux >= 1e-4) {
    cls = "X";
    n = flux / 1e-4;
  } else if (flux >= 1e-5) {
    cls = "M";
    n = flux / 1e-5;
  } else if (flux >= 1e-6) {
    cls = "C";
    n = flux / 1e-6;
  } else if (flux >= 1e-7) {
    cls = "B";
    n = flux / 1e-7;
  } else {
    cls = "A";
    n = flux / 1e-8;
  }
  const severity: Severity =
    cls === "X"
      ? "extreme"
      : cls === "M"
        ? "high"
        : cls === "C"
          ? "moderate"
          : "low";
  return { display: `${cls}${n.toFixed(1)}`, severity };
}

async function getKpGauge(): Promise<Gauge> {
  return cached("noaa:kp", 120, async () => {
    const rows = await fetchJson<KpRow[]>(
      "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json",
    );
    const last = rows[rows.length - 1];
    const kp = Number(last?.kp_index ?? 0);
    return {
      label: "Geomagnetic Kp index",
      value: kp,
      display: `Kp ${kp.toFixed(1)}`,
      severity: kpSeverity(kp),
      time: last?.time_tag,
      source: "NOAA SWPC",
    };
  });
}

async function getSolarWindGauge(): Promise<Gauge> {
  return cached("noaa:wind", 120, async () => {
    const rows = await fetchJson<string[][]>(
      "https://services.swpc.noaa.gov/products/solar-wind/plasma-2-hour.json",
    );
    // rows[0] is a header: ["time_tag","density","speed","temperature"]
    const last = rows[rows.length - 1];
    const speed = Number(last?.[2] ?? 0);
    return {
      label: "Solar wind speed",
      value: Math.round(speed),
      unit: "km/s",
      display: `${Math.round(speed)} km/s`,
      severity: windSeverity(speed),
      time: last?.[0],
      source: "NOAA SWPC",
    };
  });
}

async function getXrayGauge(): Promise<Gauge> {
  return cached("noaa:xray", 120, async () => {
    const rows = await fetchJson<XrayRow[]>(
      "https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json",
    );
    const longBand = rows.filter((r) => r.energy === "0.1-0.8nm");
    const last = longBand[longBand.length - 1] ?? rows[rows.length - 1];
    const flux = Number(last?.flux ?? 0);
    const { display, severity } = flareClass(flux);
    return {
      label: "X-ray flux (flare class)",
      value: flux,
      display,
      severity,
      time: last?.time_tag,
      source: "NOAA SWPC / GOES",
    };
  });
}

/* ------------------------------ Schumann resonance ------------------------------ */
/**
 * There is no stable, free, public JSON API for the Schumann resonance.
 * The well-known live monitors (HeartMath GCI, Tomsk / Cumiana stations) publish
 * images, not machine-readable feeds. So this is pluggable: set SCHUMANN_FEED_URL
 * to a JSON endpoint that returns { frequency, amplitude } and we'll use it.
 * Otherwise we report the ~7.83 Hz baseline and label it clearly as reference.
 */
async function getSchumann(): Promise<SchumannReading> {
  const url = process.env.SCHUMANN_FEED_URL;
  if (!url) {
    return {
      frequency: 7.83,
      amplitude: null,
      severity: "low",
      status: "Reference baseline",
      note: "No live public API. Set SCHUMANN_FEED_URL to a JSON feed ({frequency, amplitude}) to show real-time data. 7.83 Hz is the fundamental mode.",
      source: "Reference (Schumann fundamental)",
    };
  }
  return cached("schumann:custom", 120, async () => {
    const data = await fetchJson<{
      frequency?: number;
      amplitude?: number;
      time?: string;
    }>(url);
    const freq = data.frequency ?? null;
    let severity: Severity = "low";
    if (freq != null) {
      const drift = Math.abs(freq - 7.83);
      severity = drift > 0.6 ? "high" : drift > 0.3 ? "moderate" : "low";
    }
    return {
      frequency: freq,
      amplitude: data.amplitude ?? null,
      severity,
      status: "Live",
      time: data.time,
      source: "Custom feed",
    };
  });
}

/* ------------------------------ Aggregate ------------------------------ */

export async function getFeed(): Promise<Feed> {
  const errors: string[] = [];

  const settle = async <T>(label: string, p: Promise<T>, fallback: T) => {
    try {
      return await p;
    } catch (e) {
      errors.push(`${label}: ${(e as Error).message}`);
      return fallback;
    }
  };

  const [quakes, events, flares, kp, wind, xray, schumann] = await Promise.all([
    settle("earthquakes", getEarthquakes(), [] as Signal[]),
    settle("natural-events", getNaturalEvents(), [] as Signal[]),
    settle("solar-flares", getSolarFlares(), [] as Signal[]),
    settle("kp", getKpGauge(), null as Gauge | null),
    settle("solar-wind", getSolarWindGauge(), null as Gauge | null),
    settle("xray", getXrayGauge(), null as Gauge | null),
    settle("schumann", getSchumann(), {
      frequency: null,
      amplitude: null,
      severity: "low",
      status: "Unavailable",
      source: "—",
    } as SchumannReading),
  ]);

  const allEvents = [...quakes, ...events, ...flares].sort(
    (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
  );

  const gauges = [kp, xray, wind].filter((g): g is Gauge => g !== null);

  return {
    updatedAt: new Date().toISOString(),
    cache: cacheBackend(),
    events: allEvents,
    gauges,
    schumann,
    errors,
  };
}
