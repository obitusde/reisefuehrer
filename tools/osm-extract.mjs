// v0.11.0: OpenStreetMap sights from a Geofabrik extract instead of Overpass (the servers are often busy).
// 1) node tools/osm-extract.mjs --osmium        -> prints the osmium tags-filter expressions (from config.json osm.filter)
// 2) node tools/osm-extract.mjs poi.geojsonseq outdir [--teil=west,south,east,north] [--poly=land.poly --stand=ISO --land=CH --quelle=…]
//    -> tiles like the app's cache (0.05°, same compact elements as core.compactOsm) and index.json:
//       {land, stand (date of the OSM data), erstellt, quelle, kachel, version, orte, kacheln: {key: count}}.
//       With --poly only tiles completely inside the extract's border (5 points); the others the app loads from Overpass.
// Runs on GitHub (workflow osm-daten.yml).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const core = require(path.join(ROOT, 'docs/core.js'));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/config.json'), 'utf8'));

// The Overpass filters of the app, e.g. ["historic"~"^(castle|ruins)$"]["memorial"!="plaque"], as predicates
function parseFilter(f) {
  const cl = [];
  const re = /\["([^"]+)"(~|=|!=)"([^"]*)"\]/g;
  let m;
  while ((m = re.exec(f))) cl.push({ k: m[1], op: m[2], v: m[3] });
  return cl;
}
const FILTERS = cfg.osm.filter.map(parseFilter);
function matches(tags) {
  if (!tags.name) return false;
  return FILTERS.some((cl) => cl.every((c) => {
    const t = tags[c.k];
    if (c.op === '!=') return t !== c.v;
    if (t == null) return false;
    return c.op === '=' ? t === c.v : new RegExp(c.v).test(t);
  }));
}

if (process.argv[2] === '--osmium') {
  // the first (positive) clause of each filter; the rest is checked here afterwards
  const ex = FILTERS.map((cl) => {
    const c = cl[0];
    const vals = c.op === '~' ? c.v.replace(/^\^\(|\)\$$/g, '').split('|') : [c.v];
    return 'nwr/' + c.k + '=' + vals.join(',');
  });
  console.log(ex.join(' '));
  process.exit(0);
}

const pos = process.argv.slice(2).filter((x) => !x.startsWith('--'));
const opt = Object.fromEntries(process.argv.slice(2).filter((x) => x.startsWith('--')).map((x) => { const i = x.indexOf('='); return i > 0 ? [x.slice(2, i), x.slice(i + 1)] : [x.slice(2), '1']; }));
const [input, outDir] = pos;
const boxArg = opt.teil || pos[2] || '';
if (!input || !outDir) { console.log('node tools/osm-extract.mjs poi.geojsonseq outdir [--teil=w,s,e,n] [--poly=land.poly --stand=ISO --land=CH]'); process.exit(1); }

// Geofabrik .poly: name, then sections (outer rings; a "!" section is a hole), each a list of "lon lat", END
function readPoly(file) {
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
function inRing(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inPoly(x, y, rings) {
  return rings.some((r) => !r.hole && inRing(x, y, r.pts)) && !rings.some((r) => r.hole && inRing(x, y, r.pts));
}
// The real national border from the OSM data itself (admin_level=2, exported by osmium as GeoJSON), better than the
// simplified Geofabrik .poly (first run: tiles in the middle of Geneva were missing). Rings in the same form as readPoly.
function readBorder(file, iso) {
  const fc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const f = (fc.features || []).find((x) => { const p = x.properties || {}; return p['ISO3166-1'] === iso || p['ISO3166-1:alpha2'] === iso; });
  if (!f || !f.geometry) return null;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
  const rings = [];
  polys.forEach((pg) => pg.forEach((ring, i) => rings.push({ hole: i > 0, pts: ring })));
  return rings.length ? { rings, name: (f.properties || {}).name || iso } : null;
}
let poly = null;
if (opt.grenze) {
  const b = readBorder(opt.grenze, opt.land || '');
  if (b) { poly = b.rings; console.log('Grenze aus OSM: ' + b.name + ', ' + b.rings.length + ' Ringe, ' + b.rings.reduce((a, r) => a + r.pts.length, 0) + ' Punkte'); }
  else console.log('Grenze aus OSM nicht gefunden (' + opt.land + '), nehme .poly');
}
if (!poly && opt.poly) { poly = readPoly(opt.poly); console.log('Grenze aus .poly: ' + poly.length + ' Ringe'); }
// note: a hole of one polygon must not cut another polygon (enclaves): check per outer ring with its own holes
function inBorder(x, y) {
  if (!poly) return true;
  let cur = null;
  for (const r of poly) {
    if (!r.hole) { if (cur && cur.in && !cur.inHole) return true; cur = { in: inRing(x, y, r.pts), inHole: false }; }
    else if (cur && cur.in && inRing(x, y, r.pts)) cur.inHole = true;
  }
  return !!(cur && cur.in && !cur.inHole);
}
const box = boxArg ? (([w, s, e, n]) => ({ west: w, south: s, east: e, north: n }))(boxArg.split(',').map(Number)) : null;

function centerOf(geom) {
  // like Overpass "out center": middle of the bounding box
  let s = Infinity, n = -Infinity, w = Infinity, e = -Infinity;
  const walk = (c) => { if (typeof c[0] === 'number') { w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]); } else c.forEach(walk); };
  walk(geom.coordinates);
  return { lat: (s + n) / 2, lon: (w + e) / 2 };
}
const TYPES = { n: 'node', w: 'way', r: 'relation', a: 'way' };
const size = cfg.osm.kachel_grad || 0.05;
const keyOf = (lat, lon) => (Math.floor(lat / size + 1e-9) * size).toFixed(3) + ',' + (Math.floor(lon / size + 1e-9) * size).toFixed(3);

const t0 = Date.now();
const tiles = {}, seen = new Set(), kinds = {};
let lines = 0, kept = 0, skipped = 0;
const rl = readline.createInterface({ input: fs.createReadStream(input), crlfDelay: Infinity });
for await (let line of rl) {
  line = line.replace(/^\x1e/, '').trim();
  if (!line) continue;
  lines++;
  let f;
  try { f = JSON.parse(line); } catch { skipped++; continue; }
  const tags = f.properties || {};
  if (!f.geometry || !matches(tags)) { skipped++; continue; }
  const id = String(f.id || '');
  const type = TYPES[id[0]] || 'node', num = id.slice(1);
  if (seen.has(type + '/' + num)) continue;
  seen.add(type + '/' + num);
  const c = centerOf(f.geometry);
  const el = core.compactOsm({ type, id: num, lat: c.lat, lon: c.lon, tags });
  if (!el) { skipped++; continue; }
  const k = keyOf(el.lat, el.lon);
  (tiles[k] = tiles[k] || []).push(el);
  kinds[el.k] = (kinds[el.k] || 0) + 1;
  kept++;
}

// tiles completely inside the border (also the empty ones, so the app knows there is nothing there)
const covered = {};
let droppedEls = 0;
if (poly) {
  let s = Infinity, n = -Infinity, w = Infinity, e = -Infinity;
  poly.forEach((r) => r.pts.forEach(([x, y]) => { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }));
  for (let la = Math.floor(s / size) * size; la < n; la += size) {
    for (let lo = Math.floor(w / size) * size; lo < e; lo += size) {
      const pts = [[lo, la], [lo + size, la], [lo, la + size], [lo + size, la + size], [lo + size / 2, la + size / 2]];
      if (pts.every(([x, y]) => inBorder(x, y))) covered[keyOf(la + size / 2, lo + size / 2)] = 0;
    }
  }
  for (const k of Object.keys(tiles)) {
    if (k in covered) covered[k] = tiles[k].length;
    else { droppedEls += tiles[k].length; delete tiles[k]; }
  }
} else for (const k of Object.keys(tiles)) covered[k] = tiles[k].length;

fs.mkdirSync(outDir, { recursive: true });
let bytes = 0, gz = 0, maxB = 0, maxK = '';
const sub = { tiles: 0, els: 0, bytes: 0, gz: 0 };
for (const [k, els] of Object.entries(tiles)) {
  const json = JSON.stringify(els);
  const b = Buffer.byteLength(json), g = zlib.gzipSync(json).length;
  fs.writeFileSync(path.join(outDir, k + '.json'), json);
  bytes += b; gz += g;
  if (b > maxB) { maxB = b; maxK = k; }
  if (box) {
    const [la, lo] = k.split(',').map(Number);
    if (la < box.north && la + size > box.south && lo < box.east && lo + size > box.west) { sub.tiles++; sub.els += els.length; sub.bytes += b; sub.gz += g; }
  }
}
// small map in the log to check the border tiles: # with data, o empty, . not from files (Overpass)
if (poly && opt.karte) {
  opt.karte.split(';').forEach((b) => {
    const [w, s, e, n] = b.split(',').map(Number);
    console.log('Karte ' + b + ' (# Datei mit Orten, o Datei leer, . Overpass):');
    for (let la = n - size / 2; la > s; la -= size) {
      let row = '  ' + (Math.floor(la / size) * size).toFixed(2) + ' ';
      for (let lo = w + size / 2; lo < e; lo += size) { const k = keyOf(la, lo); row += !(k in covered) ? ' .' : covered[k] ? ' #' : ' o'; }
      console.log(row);
    }
  });
}
const nOrte = Object.values(tiles).reduce((a, x) => a + x.length, 0);
const index = { land: opt.land || '', stand: opt.stand || '', erstellt: new Date().toISOString(), quelle: opt.quelle || 'OpenStreetMap-Mitwirkende (ODbL), Auszug Geofabrik',
  kachel: size, version: cfg.osm.version || 1, orte: nOrte, kacheln: Object.fromEntries(Object.entries(covered).sort()) };
const idxJson = JSON.stringify(index);
fs.writeFileSync(path.join(outDir, 'index.json'), idxJson);
const kb = (x) => (x / 1024).toFixed(0) + ' KB';
const mb = (x) => (x / 1048576).toFixed(1) + ' MB';
console.log('Zeilen gelesen: ' + lines + ', behalten: ' + kept + ', verworfen: ' + skipped + ', ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
if (poly) console.log('Grenze: ' + Object.keys(covered).length + ' Kacheln ganz drin (davon ' + Object.values(covered).filter((x) => !x).length + ' leer); am Rand weggelassen: ' + droppedEls + ' Orte (dort lädt die App über Overpass)');
console.log('index.json: ' + kb(Buffer.byteLength(idxJson)) + ', Stand der Daten ' + (index.stand || '?') + ', ' + nOrte + ' Orte');
console.log('Ganzes Gebiet: ' + Object.keys(tiles).length + ' Kacheln à ' + size + '°, ' + mb(bytes) + ' (gezippt ' + mb(gz) + '), größte Kachel ' + kb(maxB) + ' (' + maxK + ')');
if (box) console.log('Teilgebiet ' + boxArg + ': ' + sub.tiles + ' Kacheln, ' + sub.els + ' Orte, ' + mb(sub.bytes) + ' (gezippt ' + mb(sub.gz) + ')');
console.log('Häufigste Arten: ' + Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, n]) => k + ' ' + n).join(', '));
// a few samples, to check the format against what Overpass gives
const sample = Object.values(tiles).flat().filter((e) => /castle|museum|zoo/.test(e.k)).slice(0, 5);
console.log('Beispiele: ' + JSON.stringify(sample).slice(0, 1500));
