"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Feed, Gauge, Severity, Signal } from "@/lib/types";
import WorldMap from "./WorldMap";

const REFRESH_MS = 60_000;

const SEVERITY_STYLE: Record<Severity, { dot: string; text: string; ring: string }> = {
  low: { dot: "bg-emerald-400", text: "text-emerald-300", ring: "ring-emerald-500/30" },
  moderate: { dot: "bg-yellow-400", text: "text-yellow-300", ring: "ring-yellow-500/30" },
  high: { dot: "bg-orange-400", text: "text-orange-300", ring: "ring-orange-500/30" },
  extreme: { dot: "bg-red-500", text: "text-red-300", ring: "ring-red-500/40" },
};

const CATEGORY_ICON: Record<string, string> = {
  earthquake: "🌐",
  wildfire: "🔥",
  volcano: "🌋",
  "severe-storm": "🌀",
  flood: "🌊",
  drought: "🏜️",
  "sea-ice": "🧊",
  landslide: "⛰️",
  snow: "❄️",
  "dust-haze": "🌫️",
  temperature: "🌡️",
  "water-color": "💧",
  manmade: "🏭",
  "solar-flare": "☀️",
  cme: "💥",
  other: "✨",
};

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function GaugeCard({ g }: { g: Gauge }) {
  const s = SEVERITY_STYLE[g.severity];
  return (
    <div className={`rounded-2xl bg-white/[0.03] p-4 ring-1 ${s.ring} backdrop-blur`}>
      <div className="text-xs uppercase tracking-wider text-white/50">{g.label}</div>
      <div className={`mt-2 font-mono text-3xl font-semibold ${s.text}`}>
        {g.display ?? (g.value ?? "—")}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-white/40">
        <span className="flex items-center gap-1.5">
          <span className={`inline-block h-2 w-2 rounded-full ${s.dot}`} />
          {g.severity}
        </span>
        <span>{g.source}</span>
      </div>
    </div>
  );
}

function SchumannCard({ feed }: { feed: Feed }) {
  const sc = feed.schumann;
  const s = SEVERITY_STYLE[sc.severity];
  return (
    <div className={`rounded-2xl bg-white/[0.03] p-4 ring-1 ${s.ring} backdrop-blur`}>
      <div className="text-xs uppercase tracking-wider text-white/50">
        📡 Schumann resonance
      </div>
      <div className={`mt-2 font-mono text-3xl font-semibold ${s.text}`}>
        {sc.frequency != null ? `${sc.frequency.toFixed(2)} Hz` : "—"}
      </div>
      <div className="mt-1 text-[11px] text-white/50">{sc.status}</div>
      {sc.note && (
        <div className="mt-2 text-[10px] leading-snug text-white/35">{sc.note}</div>
      )}
      <div className="mt-2 text-right text-[11px] text-white/40">{sc.source}</div>
    </div>
  );
}

function EventRow({ e }: { e: Signal }) {
  const s = SEVERITY_STYLE[e.severity];
  const inner = (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white/[0.04]">
      <span className="text-xl">{CATEGORY_ICON[e.category] ?? "✨"}</span>
      <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-white/90">{e.title}</div>
        <div className="text-[11px] text-white/40">
          {e.category} · {e.source}
        </div>
      </div>
      {e.scale && (
        <span className={`shrink-0 font-mono text-sm font-semibold ${s.text}`}>
          {e.scale}
        </span>
      )}
      <span className="w-16 shrink-0 text-right text-[11px] text-white/40">
        {relTime(e.time)}
      </span>
    </div>
  );
  return e.url ? (
    <a href={e.url} target="_blank" rel="noreferrer" className="block">
      {inner}
    </a>
  ) : (
    inner
  );
}

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "earth", label: "🌍 Earth" },
  { key: "sky", label: "☀️ Sky" },
];

const SKY = new Set(["solar-flare", "cme"]);

export default function Dashboard({ initial }: { initial: Feed }) {
  const [feed, setFeed] = useState<Feed>(initial);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/feed", { cache: "no-store" });
      if (res.ok) setFeed(await res.json());
    } catch {
      /* keep last good feed */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const events = useMemo(() => {
    if (filter === "earth") return feed.events.filter((e) => !SKY.has(e.category));
    if (filter === "sky") return feed.events.filter((e) => SKY.has(e.category));
    return feed.events;
  }, [feed.events, filter]);

  const counts = useMemo(() => {
    const c = { extreme: 0, high: 0 };
    for (const e of feed.events) {
      if (e.severity === "extreme") c.extreme++;
      else if (e.severity === "high") c.high++;
    }
    return c;
  }, [feed.events]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-12">
      <header className="mb-8">
        <div className="flex items-center gap-2 text-xs text-white/50">
          <span className="live-dot inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />
          LIVE · cache: {feed.cache} · updated {relTime(feed.updatedAt)}
          {loading && <span className="text-white/30">· refreshing…</span>}
        </div>
        <h1 className="mt-2 bg-gradient-to-r from-sky-200 via-white to-violet-200 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
          EarthPulse
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-white/50">
          A live watch over creation — earthquakes, wildfires, volcanoes, storms,
          solar flares, geomagnetic storms and the Schumann resonance, all in one
          place.
        </p>
        <div className="mt-3 flex gap-3 text-xs">
          <span className="rounded-full bg-red-500/10 px-3 py-1 text-red-300 ring-1 ring-red-500/30">
            {counts.extreme} extreme
          </span>
          <span className="rounded-full bg-orange-500/10 px-3 py-1 text-orange-300 ring-1 ring-orange-500/30">
            {counts.high} high
          </span>
          <span className="rounded-full bg-white/5 px-3 py-1 text-white/50 ring-1 ring-white/10">
            {feed.events.length} signals
          </span>
        </div>
      </header>

      <section className="mb-6">
        <WorldMap events={feed.events} />
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-white/40">
          {(["low", "moderate", "high", "extreme"] as Severity[]).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={`inline-block h-2 w-2 rounded-full ${SEVERITY_STYLE[s].dot}`} />
              {s}
            </span>
          ))}
          <span>· hover a dot for details</span>
        </div>
      </section>

      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {feed.gauges.map((g) => (
          <GaugeCard key={g.label} g={g} />
        ))}
        <SchumannCard feed={feed} />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">
            Live events
          </h2>
          <div className="flex gap-1 rounded-full bg-white/5 p-1 text-xs">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-3 py-1 transition ${
                  filter === f.key
                    ? "bg-white/15 text-white"
                    : "text-white/50 hover:text-white/80"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-white/[0.02] p-2 ring-1 ring-white/10">
          {events.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-white/40">
              No events in this view.
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {events.slice(0, 100).map((e) => (
                <EventRow key={e.id} e={e} />
              ))}
            </div>
          )}
        </div>
      </section>

      {feed.errors.length > 0 && (
        <details className="mt-6 text-xs text-white/40">
          <summary className="cursor-pointer">
            {feed.errors.length} source(s) had issues
          </summary>
          <ul className="mt-2 list-disc pl-5">
            {feed.errors.map((er, i) => (
              <li key={i}>{er}</li>
            ))}
          </ul>
        </details>
      )}

      <footer className="mt-10 border-t border-white/10 pt-4 text-center text-[11px] text-white/30">
        Data: USGS · NASA EONET · NASA DONKI · NOAA SWPC. Refreshes every 60s.
      </footer>
    </main>
  );
}
