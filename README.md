# 🌍 EarthPulse — live creation watch

A single live dashboard for natural events happening on Earth and in the heavens:

- 🌐 **Earthquakes** — USGS real-time feed (M2.5+, past 24h)
- 🔥🌋🌀🌊 **Wildfires, volcanoes, storms, floods, ice, drought…** — NASA EONET
- ☀️ **Solar flares** — NASA DONKI + NOAA GOES X-ray flux (flare class)
- 🧲 **Geomagnetic Kp index** & 🌫️ **solar wind speed** — NOAA SWPC
- 📡 **Schumann resonance** — pluggable card (see note below)

Built with Next.js (App Router) + Tailwind, cached in **Upstash Redis**, deploys to **Vercel**.

## How it works

- `src/lib/sources.ts` fetches each public feed and normalizes everything into a
  common `Signal` / `Gauge` shape.
- `src/lib/cache.ts` wraps every upstream call in Upstash (`cached(key, ttl, fn)`),
  with a per-instance in-memory fallback when Upstash isn't configured.
- `src/app/api/feed/route.ts` aggregates it all into one JSON endpoint.
- The dashboard server-renders the first paint, then refreshes every 60s.

If a source is down, the dashboard still renders — failures are collected into a
small "sources had issues" expander instead of crashing the page.

## Run locally

```bash
npm install
cp .env.example .env.local   # optional; works without it
npm run dev
```

Open http://localhost:3000.

## Deploy

1. Push to GitHub:
   ```bash
   git add -A && git commit -m "EarthPulse" && git push
   ```
2. Import the repo at https://vercel.com/new.
3. Create a free Upstash Redis DB and add its env vars in Vercel
   (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`). Add `NASA_API_KEY` too.
4. Deploy.

## Data sources

| Signal | Source | Key needed |
|---|---|---|
| Earthquakes | `earthquake.usgs.gov` GeoJSON | no |
| Natural events | NASA EONET v3 | no |
| Solar flares | NASA DONKI | DEMO_KEY / free key |
| X-ray flux, Kp, solar wind | NOAA SWPC | no |
| Schumann resonance | your `SCHUMANN_FEED_URL` | optional |

### A note on the Schumann resonance

There is **no stable, free, public JSON API** for live Schumann resonance data.
The well-known monitors (HeartMath Global Coherence, Tomsk, Cumiana) publish
spectrogram *images*, not machine-readable feeds. So the card shows the 7.83 Hz
reference baseline by default and clearly labels it as such. If you find or host a
JSON feed, set `SCHUMANN_FEED_URL` and it goes live automatically.
