// v0.14.0: national border for the country packages – shared by tools/osm-extract.mjs and tools/paket.mjs.
// readBorder(geojsonFile, iso)  -> {rings, name} from the OSM relation admin_level=2 (exported by osmium as GeoJSON), or null
// readPoly(file)                -> rings from a Geofabrik .poly file (fallback, coarser)
// makeBorder(rings)             -> {inside(x, y), bbox}; fast also for big countries (edges are sorted into latitude bands)
// A ring is {hole: boolean, pts: [[lon, lat], …]}; a hole belongs to the outer ring before it.
import fs from 'node:fs';

export function readPoly(file) {
  const rings = [];
  let cur = null;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/).slice(1)) {
    const l = raw.trim();
    if (!l) continue;
    if (l === 'END') { if (cur) { rings.push(cur); cur = null; } continue; }
    if (!cur) { cur = { hole: l.startsWith('!'), pts: [] }; continue; }
    const [x, y] = l.split(/\s+/).map(Number);
    if (Number.isFinite(x) && Number.isFinite(y)) cur.pts.push([x, y]);
  }
  return rings;
}

export function readBorder(file, iso) {
  const fc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const f = (fc.features || []).find((x) => { const p = x.properties || {}; return p['ISO3166-1'] === iso || p['ISO3166-1:alpha2'] === iso; });
  if (!f || !f.geometry) return null;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
  const rings = [];
  polys.forEach((pg) => pg.forEach((ring, i) => rings.push({ hole: i > 0, pts: ring })));
  return rings.length ? { rings, name: (f.properties || {}).name || iso } : null;
}

const BAND = 0.05; // degrees of latitude per band
function prepRing(pts) {
  const bands = new Map();
  let w = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    w = Math.min(w, xi); e = Math.max(e, xi); s = Math.min(s, yi); n = Math.max(n, yi);
    if (yi === yj) continue; // horizontal edges never cross a horizontal ray
    const b0 = Math.floor(Math.min(yi, yj) / BAND), b1 = Math.floor(Math.max(yi, yj) / BAND);
    for (let b = b0; b <= b1; b++) { let a = bands.get(b); if (!a) bands.set(b, a = []); a.push(xi, yi, xj, yj); }
  }
  return { bands, w, e, s, n };
}
function inRing(r, x, y) {
  if (x < r.w || x > r.e || y < r.s || y > r.n) return false;
  const a = r.bands.get(Math.floor(y / BAND));
  if (!a) return false;
  let inside = false;
  for (let k = 0; k < a.length; k += 4) {
    const xi = a[k], yi = a[k + 1], xj = a[k + 2], yj = a[k + 3];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function makeBorder(rings) {
  // a hole of one polygon must not cut another polygon (enclaves): every outer ring keeps its own holes
  const polys = [];
  let cur = null;
  for (const r of rings) {
    if (!r.hole) { cur = { outer: prepRing(r.pts), holes: [] }; polys.push(cur); }
    else if (cur) cur.holes.push(prepRing(r.pts));
  }
  let w = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
  polys.forEach((p) => { w = Math.min(w, p.outer.w); e = Math.max(e, p.outer.e); s = Math.min(s, p.outer.s); n = Math.max(n, p.outer.n); });
  return {
    bbox: { south: s, west: w, north: n, east: e },
    inside(x, y) { return polys.some((p) => inRing(p.outer, x, y) && !p.holes.some((h) => inRing(h, x, y))); }
  };
}
