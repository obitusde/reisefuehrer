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

// ---- v0.8 test: directory like a printed guide for a few tiles (all places with a Wikipedia article).
// node tools/build-cities.mjs --verzeichnis "46,6,47,7;46,7,47,8" [--fokus "46.15,6.0,47.0,7.3"]
// The given boxes are split into tiles of `kachel` degrees (what the phone would load one by one).
const VZ = {
  kachel: 0.25, min_einwohner: 1000, aufrufe_ab: 5, aufrufe_orte: 250, aufrufe_natur: 60, aufrufe_staedte: 1000, doppelt_m: 500, nah_ab: 4,
  sterne: { 3: 10.5, 2: 8.5, 1: 7.5 },
  sterne_natur: { 3: 9, 2: 7, 1: 5.5 },
  stadt: { sprachen: 3, aufrufe: 3, wikivoyage: 2, hauptstadt: 1, top_n: 5, basis: 5, einzel_anteil: 0.6 },
  stadt_sterne: { 3: 30, 2: 22, 1: 16 },
  zoom: { region: 9, nah: 12 }
};
async function verzeichnis(arg, fokusArg) {
  const vc = JSON.parse(JSON.stringify(cfg));
  Object.assign(vc.staedte, {
    min_sprachversionen: 1, titel_sprachen: ['de', 'en', 'fr', 'it'], wikivoyage: true,
    gewicht_sprachen: 2, gewicht_aufrufe: 1.5, aufrufe_stapel: 25, aufrufe_parallel: 2, timeout_s: 30
  });
  vc.verzeichnis = VZ;
  const boxes = arg.split(';').filter(Boolean).map((t) => core.bboxOf(t.split(',').map(Number)));
  const tiles = [];
  boxes.forEach((bx) => core.cityTiles(bx, VZ.kachel).forEach((t) => { if (!tiles.some((u) => core.tileKey(u) === core.tileKey(t))) tiles.push(t); }));
  const fk = fokusArg ? fokusArg.split(',').map(Number) : null;
  const fokus = fk ? core.bboxOf(fk) : null;
  const inF = (x) => !fokus || core.inBbox(x, fokus);
  const t0 = Date.now();
  let last = t0;
  const r = await core.loadCityTiles(tiles, vc, f, {
    onProgress: (d, t, n) => { const now = Date.now(); console.log('  Kachel ' + d + '/' + t + ', ' + n + ' Einträge, +' + fmtMs(now - last) + ' (gesamt ' + fmtMs(now - t0) + ')'); last = now; }
  });
  console.log('Wikidata: ' + tiles.length + ' Kacheln à ' + VZ.kachel + '°, ' + r.items.length + ' Einträge, ' + r.queries + ' Abfragen, ' + r.splits + ' geteilt, Fehler ' + JSON.stringify(r.failed) + ', ' + fmtMs(r.ms) + ', ' + Math.round(JSON.stringify(r.items).length / 1024) + ' KB (kompakt)');
  const cands = core.directoryCandidates(r.items, vc);
  const sl = await core.loadSitelinks(cands, vc, f);
  console.log('Titel/Wikivoyage für ' + cands.length + ' Kandidaten: ' + sl.requests + ' Abfragen, ' + sl.failed + ' fehlgeschlagen, ' + fmtMs(sl.ms));
  const pv = await core.loadPageviews(cands, vc, f, {});
  console.log('Seitenaufrufe: ' + pv.requests + ' Abfragen, ' + pv.failed + ' fehlgeschlagen ' + JSON.stringify(pv.errors) + ', ' + fmtMs(pv.ms));
  const land = vc.staedte.laender.find((l) => l.code === 'CH');
  const res = core.computeDirectory(r.items, vc, null);
  const stored = JSON.stringify({ staedte: res.staedte.map(({ name, q, lat, lon, score, st, z }) => ({ name, q, lat, lon, score, st, z })),
    orte: res.orte.map(({ name, q, lat, lon, score, st, z, typ }) => ({ name, q, lat, lon, score, st, z, typ })) });
  console.log('Gespeichert würde: ' + res.staedte.length + ' Orte + ' + res.orte.length + ' Sehenswürdigkeiten = ' + Math.round(stored.length / 1024) + ' KB');
  const S = ['', '★', '★★', '★★★'];
  const so = res.orte.filter(inF), st = res.staedte.filter(inF);
  const hist = {}; so.forEach((o) => { hist[o.st] = (hist[o.st] || 0) + 1; });
  console.log('\nIm Fokus: ' + st.length + ' Orte, ' + so.length + ' Sehenswürdigkeiten (ab ' + VZ.nah_ab + ' Punkten); Sterne: ' + [3, 2, 1, 0].map((k) => (S[k] || 'ohne') + ' ' + (hist[k] || 0)).join(', '));
  const fo = (o) => (S[o.st] || '·') + ' ' + o.name + ' ' + o.score + ' [' + o.typ + (o.natur ? ', Natur' : '') + ']' + (o.stadt ? ' in ' + o.stadt : '');
  const fs_ = (c) => S[c.st] + ' ' + c.name + ' ' + c.score + ' (bekannt ' + c.bekannt + ' + sehen ' + c.sehen + '; ' + c.pop + ' Einw., sl ' + c.sl + ', ' + c.pv + '/Tag' + (c.wv ? ', WV' : '') + ')';
  const lvl = (z) => [st.filter((c) => c.z <= z), so.filter((o) => o.z <= z)];
  let [c0, o0] = lvl(8);
  console.log('\n=== WEIT DRAUSSEN (Zoom ≤8): ' + c0.length + ' Orte, ' + o0.length + ' Ziele');
  c0.forEach((c) => console.log('  ' + fs_(c))); o0.forEach((o) => console.log('  ' + fo(o)));
  let [c1, o1] = lvl(VZ.zoom.region);
  console.log('\n=== REGION (Zoom ' + VZ.zoom.region + '–' + (VZ.zoom.nah - 1) + '): zusätzlich ' + (c1.length - c0.length) + ' Orte, ' + (o1.length - o0.length) + ' Ziele');
  c1.filter((c) => c.z > 8).forEach((c) => console.log('  ' + fs_(c)));
  o1.filter((o) => o.z > 8).forEach((o) => console.log('  ' + fo(o)));
  const o2 = so.filter((o) => o.z >= VZ.zoom.nah);
  console.log('\n=== NAH (Zoom ≥' + VZ.zoom.nah + '): zusätzlich ' + o2.length + ' Ziele; davon Museen ' + o2.filter((o) => o.typ === 'museum').length);
  o2.slice(0, 50).forEach((o) => console.log('  ' + fo(o)));
  console.log('  … Stichprobe ab Platz 50 (jeder 20.):');
  o2.filter((_, i) => i >= 50 && i % 20 === 0).forEach((o) => console.log('  ' + fo(o)));
  console.log('\nNATUR (beste 25):');
  so.filter((o) => o.natur).slice(0, 25).forEach((o) => console.log('  ' + fo(o) + ' ab Zoom ' + o.z));
  console.log('\nOrte ohne Stern (beste 30):');
  st.filter((c) => !c.st).slice(0, 30).forEach((c) => console.log('  ' + fs_(c) + ' – ' + c.top.map((t) => t[0] + ' ' + t[1]).join(', ')));
  console.log('\nWohin die 25 besten Ziele gezählt wurden:');
  r.items.filter((x) => inF(x) && x.fate && /^(zu|außerhalb|Natur|doppelt)/.test(x.fate)).map((x) => ({ x, s: core.sightScore(x, vc) })).filter((o) => o.s)
    .sort((a, b) => b.s.score - a.s.score).slice(0, 25).forEach((o) => console.log('  ' + o.x.name + ': ' + o.x.fate));
  console.log('\nDoppelte entfernt: ' + r.items.filter((x) => /^doppelt/.test(x.fate || '')).length + ', kleine Orte ohne Marker: ' + r.items.filter((x) => /^kleiner Ort/.test(x.fate || '')).length);
  console.log('\nGesamt ' + fmtMs(Date.now() - t0));
}

const args = process.argv.slice(2);
if (args[0] === '--verzeichnis') {
  await verzeichnis(args[1], args[3]);
} else if (args[0] === '--probe') {
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
