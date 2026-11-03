// Stadt-Sterne vorab berechnen (PROJEKT.md 6c, v0.7.0).
// Läuft als GitHub Action (.github/workflows/staedte.yml), geht aber auch lokal mit Node 18+:
//   node tools/build-cities.mjs            alle Länder aus config.json
//   node tools/build-cities.mjs DE CH      nur diese
//   node tools/build-cities.mjs --probe 50.9,6.9,51.0,7.0   eine Kachel ansehen (nichts wird geschrieben)
// Dieselbe Rechnung (docs/core.js) läuft in der App unter ⚙ → Stadt-Sterne → „Neu berechnen“.
// Schreibt docs/staedte/<LAND>.json und docs/staedte/index.json.
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const core = require(path.join(ROOT, 'docs/core.js'));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/config.json'), 'utf8'));
const OUT = path.join(ROOT, 'docs/staedte');
// test only: other minimum of language versions (workflow input min_sl)
if (/^\d+$/.test(process.env.MIN_SL || '')) cfg.staedte.min_sprachversionen = +process.env.MIN_SL;
const UA = 'ReisefuehrerBot/' + core.VERSION + ' (https://github.com/obitusde/reisefuehrer; Stadt-Sterne, einmalige Abfrage je Kachel)';

const f = (url, o = {}) => fetch(url, { ...o, headers: { ...(o.headers || {}), 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
// Tiles shared between countries (borders) and – in the GitHub Action – between runs (actions/cache, tools/.cache):
// then changing the rules (config.json, core.js) only needs a few seconds instead of an hour of queries.
const CACHE_FILE = path.join(ROOT, 'tools/.cache/staedte-kacheln.json');
const CACHE_DAYS = 25;
const cache = new Map();
const fresh = /^(1|true|ja)$/i.test(process.env.FRISCH || '');
const cacheKey = 'q' + core.citySparql({ south: 0, west: 0, north: 1, east: 1 }, cfg).length; // query changed → reload
if (!fresh && fs.existsSync(CACHE_FILE)) {
  try {
    const c = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    if (c.key === cacheKey && Date.now() - c.t < CACHE_DAYS * 864e5) { for (const [k, v] of Object.entries(c.tiles)) cache.set(k, v); console.log('Zwischenspeicher: ' + cache.size + ' Kacheln vom ' + new Date(c.t).toISOString().slice(0, 10)); }
    else console.log('Zwischenspeicher veraltet oder andere Abfrage – lade neu');
  } catch (e) { console.log('Zwischenspeicher unlesbar: ' + e.message); }
}
function saveCache() {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  let t = Date.now();
  try { const old = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); if (old.key === cacheKey && !fresh) t = Math.min(t, old.t); } catch (e) { /* none */ }
  fs.writeFileSync(CACHE_FILE, JSON.stringify({ key: cacheKey, t, tiles: Object.fromEntries(cache) }));
}
// names to explain in the log: parts separated by |, matched as part of the name (case-insensitive)
const NAMEN = process.env.NAMEN ? { parts: process.env.NAMEN.toLowerCase().split('|').map((x) => x.trim()).filter(Boolean), test(n) { n = String(n).toLowerCase(); return this.parts.some((p) => n.includes(p)); } } : null;

function fmtMs(ms) { const s = Math.round(ms / 1000); return s < 90 ? s + ' s' : Math.round(s / 60) + ' min'; }

async function probe(arg) {
  const tiles = arg.split(';').filter(Boolean).map((t) => { const [s, w, n, e] = t.split(',').map(Number); return { south: s, west: w, north: n, east: e }; });
  for (const t of tiles.slice(1)) { // timing of further tiles only
    const t0 = Date.now(), x = await core.loadCityTiles([t], cfg, f, {});
    console.log('Kachel ' + JSON.stringify(t) + ': ' + x.items.length + ' Einträge, ' + x.queries + ' Abfragen, ' + x.splits + ' geteilt, ' + fmtMs(Date.now() - t0) + (x.failed.length ? ' FEHLER ' + JSON.stringify(x.failed) : ''));
  }
  const r = await core.loadCityTiles(tiles.slice(0, 1), cfg, f, {});
  console.log('Einträge:', r.items.length, 'Abfragen:', r.queries, 'geteilt:', r.splits, 'Fehler:', JSON.stringify(r.failed), fmtMs(r.ms));
  const rows = r.items.map((x) => {
    const city = core.isCityItem(x, cfg), sc = city ? null : core.sightScore(x, cfg);
    return { x, city, sc };
  }).sort((a, b) => b.x.sl - a.x.sl);
  for (const { x, city, sc } of rows.slice(0, 60)) {
    console.log((city ? 'STADT ' : sc ? 'ORT   ' : '--    ') + x.name + ' | ' + x.q + ' | sl ' + x.sl + ' | pop ' + x.pop +
      ' | ' + (sc ? sc.typ + ' ' + sc.score : '') + ' | ' + x.cls.slice(0, 4).join('; '));
  }
  for (const land of cfg.staedte.laender) {
    const res = core.computeCities(r.items, cfg, { ...land, bbox: core.bboxOf(land.bbox) });
    if (!res.staedte.length && !res.orte.length) continue;
    console.log('\n' + land.code, JSON.stringify(res.stats));
    res.staedte.slice(0, 25).forEach((c) => console.log('  ' + c.score + ' ' + 'ⵙ'.repeat(core.cityStars(c, cfg)) + ' ' + c.name + ' (' + c.pop + ', ' + c.n + ' Orte) – ' + c.top.map((t) => t[0] + ' ' + t[3]).join(', ')));
    res.orte.slice(0, 15).forEach((o) => console.log('  Ausflug ' + o.score + ' ' + o.name + ' (' + o.typ + ')'));
  }
}

async function build(codes) {
  fs.mkdirSync(OUT, { recursive: true });
  const idxPath = path.join(OUT, 'index.json');
  const index = fs.existsSync(idxPath) ? JSON.parse(fs.readFileSync(idxPath, 'utf8')) : { laender: {} };
  let anyFail = false;
  for (const land of cfg.staedte.laender.filter((l) => codes.includes(l.code))) {
    console.log('\n=== ' + land.name + ' (' + land.code + ')');
    let lastLog = 0;
    const res = await core.loadCountryCities(land, cfg, f, {
      cache,
      onProgress: (done, total, n) => {
        if (Date.now() - lastLog > 20000 || done === total) { lastLog = Date.now(); console.log('  Kacheln ' + done + '/' + total + ', ' + n + ' Einträge'); }
      }
    });
    const st = res.stats;
    if (NAMEN) {
      const seen = new Set();
      for (const list of cache.values()) for (const x of list) {
        if (seen.has(x.q) || !NAMEN.test(x.name) || !core.inBbox(x, core.bboxOf(land.bbox))) continue;
        seen.add(x.q);
        console.log('  ? ' + x.name + ' ' + x.q + ' sl ' + x.sl + ' pop ' + x.pop + ' km² ' + x.km2 + ' → ' + (x.fate || '–') + ' | ' + x.cls.join('; '));
      }
    }
    console.log('  ' + JSON.stringify(st));
    if (res.fehler.length) { anyFail = true; console.log('  FEHLER:', JSON.stringify(res.fehler).slice(0, 2000)); }
    const dist = { 3: 0, 2: 0, 1: 0, 0: 0 };
    res.staedte.forEach((c) => dist[core.cityStars(c, cfg)]++);
    console.log('  Städte in Datei: ' + res.staedte.length + ' – ★★★ ' + dist[3] + ' · ★★ ' + dist[2] + ' · ★ ' + dist[1] + ' · ohne ' + dist[0] + ' · Ausflugsziele ' + res.orte.length);
    res.staedte.slice(0, 40).forEach((c, i) => console.log('  ' + (i + 1) + '. ' + c.name + ' ' + 'ⵙ'.repeat(core.cityStars(c, cfg)) + ' ' + c.score + ' (' + c.n + ' Orte, ' + c.pop + ' Einw.) – ' + c.top.map((t) => t[0] + ' ' + t[3]).join(', ')));
    const third = res.staedte.filter((c) => core.cityStars(c, cfg) === 1);
    console.log('  Beispiele ★: ' + third.filter((_, i) => i % Math.max(1, Math.floor(third.length / 20)) === 0).slice(0, 20).map((c) => c.name + ' ' + c.score).join(', '));
    console.log('  Ausflugsziele: ' + res.orte.slice(0, 30).map((o) => o.name + ' ' + o.score + ' ' + o.typ).join(', '));
    const file = { land: land.code, version: res.version, stand: res.stand, stats: st, fehler: res.fehler, staedte: res.staedte, orte: res.orte };
    const json = JSON.stringify(file);
    fs.writeFileSync(path.join(OUT, land.code + '.json'), json);
    index.laender[land.code] = { stand: res.stand, staedte: res.staedte.length, orte: res.orte.length, fehler: res.fehler.length, kb: Math.round(json.length / 1024) };
    console.log('  Datei ' + land.code + '.json: ' + Math.round(json.length / 1024) + ' KB');
  }
  saveCache();
  index.version = core.VERSION;
  index.stand = Date.now();
  fs.writeFileSync(idxPath, JSON.stringify(index, null, 1));
  return anyFail;
}

const args = process.argv.slice(2);
if (args[0] === '--probe') {
  await probe(args[1] || '50.9,6.9,51.0,7.0');
} else {
  const known = cfg.staedte.laender.map((l) => l.code);
  const wanted = (args.length ? args : String(process.env.LAENDER || '').split(/[\s,;]+/))
    .map((s) => s.trim().toUpperCase()).filter(Boolean);
  const codes = wanted.length ? wanted.filter((c) => known.includes(c)) : known;
  if (!codes.length) { console.log('Unbekannte Länder: ' + wanted.join(', ') + ' – bekannt: ' + known.join(', ')); process.exit(1); }
  const t0 = Date.now();
  const fail = await build(codes);
  console.log('\nFertig in ' + fmtMs(Date.now() - t0) + (fail ? ' (mit Fehlern bei einzelnen Kacheln)' : ''));
}
