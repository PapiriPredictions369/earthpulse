"use client";

import { useEffect, useMemo, useState } from "react";
import type { NewsArticle, Severity, Signal } from "@/lib/types";

type Ring = [number, number][];
type LandFeature = {
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
};
type LandGeo = { features: LandFeature[] };

const W = 360;
const H = 180;

// equirectangular: lng/lat degrees -> svg units
const px = (lng: number) => lng + 180;
const py = (lat: number) => 90 - lat;

const DOT: Record<Severity, { fill: string; r: number }> = {
  low: { fill: "#34d399", r: 0.9 },
  moderate: { fill: "#facc15", r: 1.1 },
  high: { fill: "#fb923c", r: 1.4 },
  extreme: { fill: "#ef4444", r: 1.9 },
};

function ringPath(ring: Ring): string {
  return (
    ring
      .map((c, i) => `${i === 0 ? "M" : "L"}${px(c[0]).toFixed(2)} ${py(c[1]).toFixed(2)}`)
      .join("") + "Z"
  );
}

function landPath(geo: LandGeo): string {
  const parts: string[] = [];
  for (const f of geo.features) {
    if (f.geometry.type === "Polygon") {
      for (const ring of f.geometry.coordinates as number[][][]) {
        parts.push(ringPath(ring as Ring));
      }
    } else {
      for (const poly of f.geometry.coordinates as number[][][][]) {
        for (const ring of poly) parts.push(ringPath(ring as Ring));
      }
    }
  }
  return parts.join("");
}

export default function WorldMap({
  events,
  news = [],
}: {
  events: Signal[];
  news?: NewsArticle[];
}) {
  const [geo, setGeo] = useState<LandGeo | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/land.json")
      .then((r) => r.json())
      .then((g: LandGeo) => alive && setGeo(g))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const land = useMemo(() => (geo ? landPath(geo) : ""), [geo]);

  // News is plotted by source-country centroid; aggregate so each country is one marker.
  const newsClusters = useMemo(() => {
    const byCountry = new Map<
      string,
      { lat: number; lng: number; count: number; country: string }
    >();
    for (const n of news) {
      if (typeof n.lat !== "number" || typeof n.lng !== "number") continue;
      const key = n.country ?? `${n.lat},${n.lng}`;
      const c = byCountry.get(key);
      if (c) c.count++;
      else
        byCountry.set(key, {
          lat: n.lat,
          lng: n.lng,
          count: 1,
          country: n.country ?? "",
        });
    }
    return [...byCountry.values()];
  }, [news]);

  const dots = useMemo(
    () =>
      events
        .filter((e) => typeof e.lat === "number" && typeof e.lng === "number")
        // draw most severe last so they sit on top
        .sort((a, b) => DOT[a.severity].r - DOT[b.severity].r),
    [events],
  );

  return (
    <div className="overflow-hidden rounded-2xl bg-[#070b18] ring-1 ring-white/10">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        style={{ aspectRatio: "2 / 1" }}
        role="img"
        aria-label="World map of current natural events"
      >
        <rect width={W} height={H} fill="#070b18" />
        {/* graticule */}
        {[-60, -30, 0, 30, 60].map((lat) => (
          <line
            key={`h${lat}`}
            x1={0}
            x2={W}
            y1={py(lat)}
            y2={py(lat)}
            stroke="#ffffff"
            strokeOpacity={0.05}
            strokeWidth={0.2}
          />
        ))}
        {[-120, -60, 0, 60, 120].map((lng) => (
          <line
            key={`v${lng}`}
            y1={0}
            y2={H}
            x1={px(lng)}
            x2={px(lng)}
            stroke="#ffffff"
            strokeOpacity={0.05}
            strokeWidth={0.2}
          />
        ))}
        {land && <path d={land} fill="#1b2740" stroke="#2c3c5e" strokeWidth={0.15} />}
        {newsClusters.map((c) => {
          const s = 1.3 + Math.min(c.count, 12) * 0.18;
          return (
            <rect
              key={`news-${c.country}-${c.lat}-${c.lng}`}
              x={px(c.lng) - s / 2}
              y={py(c.lat) - s / 2}
              width={s}
              height={s}
              transform={`rotate(45 ${px(c.lng)} ${py(c.lat)})`}
              fill="#38bdf8"
              fillOpacity={0.55}
              stroke="#7dd3fc"
              strokeWidth={0.15}
            >
              <title>{`${c.count} news ${c.count === 1 ? "story" : "stories"} from ${c.country || "source"}`}</title>
            </rect>
          );
        })}
        {dots.map((e) => {
          const d = DOT[e.severity];
          return (
            <circle
              key={e.id}
              cx={px(e.lng!)}
              cy={py(e.lat!)}
              r={d.r}
              fill={d.fill}
              fillOpacity={0.85}
              stroke={d.fill}
              strokeOpacity={0.3}
              strokeWidth={d.r}
            >
              <title>{`${e.title}${e.scale ? ` (${e.scale})` : ""}`}</title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}
