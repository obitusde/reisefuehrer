// v0.10.x test: OpenStreetMap sights from a Geofabrik extract instead of Overpass (the servers are often busy).
// 1) node tools/osm-extract.mjs --osmium        -> prints the osmium tags-filter expressions (from config.json osm.filter)
// 2) node tools/osm-extract.mjs poi.geojsonseq outdir [west,south,east,north]
//    -> tiles like the app's cache (0.05°, same compact elements as core.compactOsm), plus a report;
//       with a box also the numbers for that part (e.g. Waadt).
// Runs on GitHub (workflow osm-daten.yml); nothing is written into docs/ yet.
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

const [input, outDir, boxArg] = process.argv.slice(2);
if (!input || !outDir) { console.log('node tools/osm-extract.mjs poi.geojsonseq outdir [west,south,east,north]'); process.exit(1); }
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
const kb = (x) => (x / 1024).toFixed(0) + ' KB';
const mb = (x) => (x / 1048576).toFixed(1) + ' MB';
console.log('Zeilen gelesen: ' + lines + ', behalten: ' + kept + ', verworfen: ' + skipped + ', ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
console.log('Ganzes Gebiet: ' + Object.keys(tiles).length + ' Kacheln à ' + size + '°, ' + mb(bytes) + ' (gezippt ' + mb(gz) + '), größte Kachel ' + kb(maxB) + ' (' + maxK + ')');
if (box) console.log('Teilgebiet ' + boxArg + ': ' + sub.tiles + ' Kacheln, ' + sub.els + ' Orte, ' + mb(sub.bytes) + ' (gezippt ' + mb(sub.gz) + ')');
console.log('Häufigste Arten: ' + Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, n]) => k + ' ' + n).join(', '));
// a few samples, to check the format against what Overpass gives
const sample = Object.values(tiles).flat().filter((e) => /castle|museum|zoo/.test(e.k)).slice(0, 5);
console.log('Beispiele: ' + JSON.stringify(sample).slice(0, 1500));
