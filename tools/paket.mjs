// v0.12.0: Länderpaket – everything the map shows, prepared once, so that the phone shows the sights at once
// v0.13.0: plus `info`: one short line per Wikidata item (description, height) for the list and the place window
// (the map itself stays online; photos and Wikipedia texts are loaded when a place is opened).
//   node tools/paket.mjs --land=CH --name=Schweiz --grenze=grenze.geojson --osm=docs/osm/ch --out=docs/paket/ch [--max=N]
// Contents (docs/paket/<code>/paket.json):
//   verzeichnis: {"<0.25° tile>": items}  – exactly what the phone stores after loading a tile (core.prepareDirectoryTile)
//   osm:         {"<0.05° tile>": elements} and osm_cover (tiles completely inside the border, also empty ones)
//   info:        {"<Q-number>": [description, height in m]}  – German description, else English (Wikidata); for every Q of the directory and of the OSM points
// index.json: land, name, stand (when built), osm_stand, counts and size – small, so that the app can check for news.
// Runs on GitHub (workflow paket.yml), only when started by hand.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const core = require(path.join(ROOT, 'docs/core.js'));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/config.json'), 'utf8'));
const opt = Object.fromEntries(process.argv.slice(2).filter((x) => x.startsWith('--')).map((x) => { const i = x.indexOf('='); return i > 0 ? [x.slice(2, i), x.slice(i + 1)] : [x.slice(2), '1']; }));
const LAND = (opt.land || 'CH').toUpperCase();
const UA = 'ReisefuehrerBot/' + core.VERSION + ' (https://github.com/obitusde/reisefuehrer; Länderpaket, einmalige Abfrage je Kachel)';
const f = (url, o = {}) => fetch(url, { ...o, headers: { ...(o.headers || {}), 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (ms) => { const s = Math.round(ms / 1000); return s < 90 ? s + ' s' : Math.round(s / 60) + ' min'; };
const mb = (b) => (b / 1048576).toFixed(1) + ' MB';

// ---- border (OSM admin_level=2, as in tools/osm-extract.mjs)
function inRing(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const fc = JSON.parse(fs.readFileSync(opt.grenze, 'utf8'));
const feat = (fc.features || []).find((x) => { const p = x.properties || {}; return p['ISO3166-1'] === LAND || p['ISO3166-1:alpha2'] === LAND; });
if (!feat) { console.log('Grenze für ' + LAND + ' nicht gefunden'); process.exit(1); }
const polys = feat.geometry.type === 'Polygon' ? [feat.geometry.coordinates] : feat.geometry.coordinates;
const outer = polys.map((pg) => pg[0]);
const inBorder = (x, y) => polys.some((pg) => inRing(x, y, pg[0]) && !pg.slice(1).some((h) => inRing(x, y, h)));
let bb = { south: Infinity, north: -Infinity, west: Infinity, east: -Infinity };
outer.forEach((r) => r.forEach(([x, y]) => { bb.west = Math.min(bb.west, x); bb.east = Math.max(bb.east, x); bb.south = Math.min(bb.south, y); bb.north = Math.max(bb.north, y); }));

// ---- directory tiles touching the country (also the foreign part of border tiles: Geneva sees France)
const all = core.directoryTiles(bb, cfg);
const touches = (t) => {
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
    if (inBorder(t.west + (t.east - t.west) * i / 10, t.south + (t.north - t.south) * j / 10)) return true;
  }
  return outer.some((r) => r.some(([x, y]) => x >= t.west && x <= t.east && y >= t.south && y <= t.north));
};
let tiles = all.filter(touches);
if (opt.max) tiles = tiles.slice(0, +opt.max);
console.log('Grenze ' + (feat.properties.name || LAND) + '; Verzeichnis: ' + tiles.length + ' von ' + all.length + ' Kacheln à ' + (cfg.verzeichnis.kachel || 0.25) + '° berühren das Land');

const dcfg = core.directoryConfig(cfg);
const t0 = Date.now();
const verzeichnis = {}, fehler = [];
let roh = 0, abfragen = 0, pvFehler = 0;
for (let i = 0; i < tiles.length; i++) {
  const t = tiles[i], key = core.tileKey(t);
  let r = null;
  for (let tries = 0; tries < 3 && !r; tries++) {
    try { r = await core.prepareDirectoryTile(t, dcfg, f); } catch (e) {
      console.log('  ' + key + ': Fehler ' + (e.message || e) + (tries < 2 ? ', neuer Versuch' : ''));
      await sleep(tries ? 60000 : 15000);
    }
  }
  if (!r) { fehler.push(key); continue; }
  verzeichnis[key] = r.items;
  roh += r.roh; abfragen += r.abfragen || 0; pvFehler += r.fehler || 0;
  if ((i + 1) % 10 === 0 || i === tiles.length - 1) console.log('  ' + (i + 1) + '/' + tiles.length + ' Kacheln, ' + fmt(Date.now() - t0) + ' (zuletzt ' + key + ': ' + r.roh + ' roh → ' + r.items.length + ', ' + fmt(r.ms) + ')');
  await sleep(500);
}
const vzMs = Date.now() - t0;
const nItems = Object.values(verzeichnis).reduce((a, x) => a + x.length, 0);
// what the map would show: the same computation as in the phone
const res = core.computeDirectory(Object.values(verzeichnis).flat(), dcfg, null, { copy: true });
const S = (l, k) => l.filter((x) => x.st === k).length;
console.log('Verzeichnis: ' + Object.keys(verzeichnis).length + ' Kacheln, ' + nItems + ' Einträge (' + roh + ' roh), ' + abfragen + ' Abfragen, ' + pvFehler + ' Seitenaufruf-Fehler, ' + fmt(vzMs) + (fehler.length ? ', FEHLT: ' + fehler.join(' ') : ''));
console.log('  Orte: ' + res.staedte.length + ' (★★★ ' + S(res.staedte, 3) + ', ★★ ' + S(res.staedte, 2) + ', ★ ' + S(res.staedte, 1) + '); Ziele: ' + res.orte.length +
  ' (★★★ ' + S(res.orte, 3) + ', ★★ ' + S(res.orte, 2) + ', ★ ' + S(res.orte, 1) + ', ohne Stern ' + S(res.orte, 0) + ', davon erst ganz nah ' + res.orte.filter((o) => o.low).length + ')');
console.log('  Beste: ' + res.orte.slice().sort((a, b) => b.score - a.score).slice(0, 12).map((o) => o.name + ' ' + o.score).join(', '));

// ---- OSM tiles (built by tools/osm-extract.mjs in the same run)
const osm = {}, osmDir = opt.osm;
let osmIdx = null;
if (osmDir && fs.existsSync(path.join(osmDir, 'index.json'))) {
  osmIdx = JSON.parse(fs.readFileSync(path.join(osmDir, 'index.json'), 'utf8'));
  for (const [k, n] of Object.entries(osmIdx.kacheln)) if (n) osm[k] = JSON.parse(fs.readFileSync(path.join(osmDir, k + '.json'), 'utf8'));
}
// ---- v0.13.0: one line per Wikidata item (description, height), asked in batches from the Wikidata query service
const qs = new Set();
Object.values(verzeichnis).flat().forEach((x) => { if (x.q) qs.add(x.q); });
Object.values(osm).flat().forEach((e) => { if (e.wd) qs.add(e.wd); });
const info = {};
let infoFehler = 0;
{
  const t1 = Date.now(), list = [...qs], BATCH = 150;
  const val = (b, k) => (b[k] ? b[k].value : '');
  for (let i = 0; i < list.length; i += BATCH) {
    const part = list.slice(i, i + BATCH);
    const query = 'SELECT ?i ?de ?en (MAX(?e) AS ?ele) WHERE { VALUES ?i { ' + part.map((q) => 'wd:' + q).join(' ') + ' }' +
      ' OPTIONAL { ?i schema:description ?de. FILTER(LANG(?de) = "de") }' +
      ' OPTIONAL { ?i schema:description ?en. FILTER(LANG(?en) = "en") }' +
      ' OPTIONAL { ?i p:P2044/psn:P2044/wikibase:quantityAmount ?e. } } GROUP BY ?i ?de ?en';
    let rows = null;
    for (let tries = 0; tries < 4 && !rows; tries++) {
      try {
        const r = await f('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(query), { signal: AbortSignal.timeout(60000) });
        if (r.status === 429 || r.status >= 500) throw new Error('HTTP ' + r.status);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        rows = (await r.json()).results.bindings;
      } catch (e) { console.log('  Info ' + i + ': ' + (e.message || e) + (tries < 3 ? ', neuer Versuch' : '')); await sleep(tries ? 30000 : 10000); }
    }
    if (!rows) { infoFehler++; continue; }
    for (const b of rows) {
      const q = val(b, 'i').replace(/^.*\//, ''), d = (val(b, 'de') || val(b, 'en')).slice(0, 90), e = Math.round(+val(b, 'ele') || 0);
      if (!d && !(e > 0)) continue;
      const rec = info[q] || ['', 0];
      if (d && (!rec[0] || val(b, 'de'))) rec[0] = d;
      if (e > rec[1]) rec[1] = e;
      info[q] = rec;
    }
    if ((i / BATCH) % 20 === 19) console.log('  Info ' + Math.min(i + BATCH, list.length) + '/' + list.length + ', ' + fmt(Date.now() - t1));
    await sleep(400);
  }
  // compact: height only when there is one
  Object.keys(info).forEach((q) => { if (!info[q][1]) info[q].length = 1; });
  console.log('Info: ' + Object.keys(info).length + ' von ' + list.length + ' Q-Nummern mit Beschreibung oder Höhe (' + Object.values(info).filter((r) => r[0]).length + ' Beschreibungen, ' +
    Object.values(info).filter((r) => r[1]).length + ' Höhen), ' + infoFehler + ' Stücke ohne Antwort, ' + fmt(Date.now() - t1));
}
const stand = new Date().toISOString();
const paket = { format: 1, land: LAND, name: opt.name || LAND, stand, osm_stand: osmIdx ? osmIdx.stand : '', kachel_vz: cfg.verzeichnis.kachel || 0.25,
  kachel_osm: cfg.osm.kachel_grad || 0.05, osm_version: cfg.osm.version || 1, verzeichnis, osm, osm_cover: osmIdx ? Object.keys(osmIdx.kacheln) : [], info };
const json = JSON.stringify(paket);
const gz = zlib.gzipSync(json).length;
const parts = { verzeichnis: Buffer.byteLength(JSON.stringify(verzeichnis)), osm: Buffer.byteLength(JSON.stringify(osm)), info: Buffer.byteLength(JSON.stringify(info)) };
console.log('Paket: ' + mb(Buffer.byteLength(json)) + ' (gezippt ' + mb(gz) + '); Verzeichnis ' + mb(parts.verzeichnis) + ', OSM ' + mb(parts.osm) + ', Info ' + mb(parts.info) + ' (' + Object.values(osm).reduce((a, x) => a + x.length, 0) + ' Orte)');
const index = { format: 1, land: LAND, name: paket.name, stand, osm_stand: paket.osm_stand, datei: 'paket.json', bytes: Buffer.byteLength(json), gzip: gz,
  verzeichnis: { kacheln: Object.keys(verzeichnis).length, eintraege: nItems, ziele: res.orte.length, orte: res.staedte.length, fehlt: fehler },
  osm: { kacheln: Object.keys(osm).length, orte: Object.values(osm).reduce((a, x) => a + x.length, 0) }, info: Object.keys(info).length, bbox: bb };
if (opt.out) {
  fs.rmSync(opt.out, { recursive: true, force: true });
  fs.mkdirSync(opt.out, { recursive: true });
  fs.writeFileSync(path.join(opt.out, 'paket.json'), json);
  fs.writeFileSync(path.join(opt.out, 'index.json'), JSON.stringify(index));
  console.log('Geschrieben: ' + opt.out);
}
console.log('Gesamt ' + fmt(Date.now() - t0));
if (fehler.length > tiles.length * 0.05) { console.log('Zu viele fehlende Kacheln – Paket unvollständig'); process.exit(2); }
