import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { feature } from "topojson-client";

// Convert world-atlas land-110m topojson -> a compact GeoJSON of land polygons.
// Coordinates are plain [lng, lat] degrees, which we project linearly
// (equirectangular) in the WorldMap component — no runtime map deps needed.
const topo = JSON.parse(readFileSync("land-110m.topo.json", "utf8"));
const geo = feature(topo, topo.objects.land);

const round = (n) => Math.round(n * 100) / 100; // ~1km precision, plenty here
function roundCoords(c) {
  if (typeof c[0] === "number") return [round(c[0]), round(c[1])];
  return c.map(roundCoords);
}
for (const f of geo.features) {
  f.geometry.coordinates = roundCoords(f.geometry.coordinates);
  delete f.properties;
}

mkdirSync("public", { recursive: true });
writeFileSync("public/land.json", JSON.stringify(geo));
console.log(
  `wrote public/land.json (${geo.features.length} features, ${
    JSON.stringify(geo).length
  } bytes)`,
);
