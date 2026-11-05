// Einmaliger Test (nur Messung): wie gut ist der Rang der Sehenswürdigkeiten in einer Stadt?
// Lädt die Verzeichnis-Kachel wie der Länderbau (core.prepareDirectoryTile), misst die Wikipedia-Seitenaufrufe für ALLE Ziele nahe der Stadtmitte
// (im Bau bekommen nur die besten Kandidaten je Kachel Aufrufe) in zwei Zeiträumen und vergleicht den heutigen Rang mit dem Rang nach Aufrufen.
// Läuft nur auf GitHub (Workflow rang-test.yml), weil die Cloud-Sitzung des Entwicklers Wikidata/Wikipedia nicht erreicht. Env: LAT, LON, RADIUS_KM.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = createRequire(import.meta.url)(path.join(ROOT, 'docs/core.js'));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/config.json'), 'utf8'));
const UA = 'ReisefuehrerBot/' + core.VERSION + ' (https://github.com/obitusde/reisefuehrer; einmaliger Rang-Test)';
const f = (url, o = {}) => fetch(url, { ...o, headers: { ...(o.headers || {}), 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
const LAT = +process.env.LAT || 46.5197, LON = +process.env.LON || 6.6323, RAD = +process.env.RADIUS_KM || 3;
const km = (a, b, c, d) => { const k = Math.cos(((a + c) / 2) * Math.PI / 180); return Math.hypot((b - d) * k * 111.32, (a - c) * 110.57); };
const dcfg = core.directoryConfig(cfg), V = dcfg.verzeichnis;
const stars = (score, natur) => { const th = natur && V.sterne_natur ? V.sterne_natur : V.sterne; return score >= th['3'] ? 3 : score >= th['2'] ? 2 : score >= th['1'] ? 1 : 0; };
const pad = (s, n) => String(s).slice(0, n).padEnd(n);
const rank = (arr) => { const o = arr.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]), r = []; o.forEach((e, k) => { r[e[1]] = k + 1; }); return r; };
const spearman = (a, b) => { const ra = rank(a), rb = rank(b), n = a.length; let d2 = 0; for (let i = 0; i < n; i++) d2 += (ra[i] - rb[i]) ** 2; return 1 - 6 * d2 / (n * (n * n - 1)); };

const tile = core.directoryTiles({ south: LAT - 0.01, west: LON - 0.01, north: LAT + 0.01, east: LON + 0.01 }, cfg)[0];
console.log('Kachel ' + core.tileKey(tile) + ', Mitte ' + LAT + ',' + LON + ', Radius ' + RAD + ' km; Gewichte: Sprachen ' + dcfg.staedte.gewicht_sprachen + ', Aufrufe ' + dcfg.staedte.gewicht_aufrufe + ' (Zeitraum ' + dcfg.staedte.aufrufe_tage + ' Tage)');
const r = await core.prepareDirectoryTile(tile, dcfg, f);
console.log('Kachel geladen: ' + r.roh + ' Wikidata-Einträge, ' + r.items.length + ' behalten, ' + r.abfragen + ' Abfragen, Aufruf-Fehler ' + r.fehler);

const prod = core.computeDirectory(r.items, dcfg, null, { copy: true });
const prodBy = {}; prod.orte.forEach((o) => { prodBy[o.q] = o; });
const near = r.items.filter((x) => !x._c && x._s && km(x.lat, x.lon, LAT, LON) <= RAD && prodBy[x.q]);
console.log('Ziele im Umkreis: ' + near.length + ' (davon mit Aufrufen im Bau gemessen: ' + near.filter((x) => x.pv !== undefined).length + ')');

async function measure(days) {
  const items = near.map((x) => Object.assign({}, x));
  const c2 = JSON.parse(JSON.stringify(dcfg)); c2.staedte.aufrufe_tage = days;
  await core.loadSitelinks(items, c2, f);
  const m = await core.loadPageviews(items, c2, f, {});
  console.log('Aufrufe ' + days + ' Tage: ' + m.requests + ' Abfragen, Fehler ' + m.failed);
  return items;
}
const a30 = await measure(30), a365 = await measure(365);
const rows = near.map((x, i) => {
  const o = prodBy[x.q], p30 = a30[i].pv || 0, p365 = a365[i].pv || 0;
  const re = Object.assign({}, a30[i]); const s2 = core.sightScore(re, dcfg);
  return { name: x.name, typ: o.typ, sl: x.sl, score: o.score, st: o.st, pvBau: x.pv, p30, p365, score2: s2 ? s2.score : o.score, st2: s2 ? stars(s2.score, s2.natur) : o.st };
});
const line = (w) => pad(w.name, 36) + ' ' + pad(w.typ, 12) + ' Spr ' + pad(w.sl, 3) + ' Pkt ' + pad(w.score, 5) + ' ★' + w.st + ' | Aufrufe/Tag im Bau ' + pad(w.pvBau === undefined ? '–' : w.pvBau, 7) + ' 30T ' + pad(w.p30, 7) + ' 365T ' + pad(w.p365, 7) + ' | Punkte mit allen Aufrufen ' + pad(w.score2, 5) + ' ★' + w.st2;
console.log('\n=== Top 40 nach heutigem Rang (Punkte)');
rows.slice().sort((a, b) => b.score - a.score).slice(0, 40).forEach((w) => console.log(line(w)));
console.log('\n=== Top 40 nach Seitenaufrufen (365 Tage)');
rows.slice().sort((a, b) => b.p365 - a.p365).slice(0, 40).forEach((w) => console.log(line(w)));
const withPv = rows.filter((w) => w.p365 > 0);
console.log('\nRangkorrelation (Spearman) Punkte ↔ Aufrufe 365 Tage, nur Ziele mit Wikipedia-Aufrufen (' + withPv.length + '): ' + spearman(withPv.map((w) => w.score), withPv.map((w) => w.p365)).toFixed(2) +
  ' | Aufrufe 30 Tage ↔ 365 Tage: ' + spearman(withPv.map((w) => w.p30), withPv.map((w) => w.p365)).toFixed(2));
const missed = rows.filter((w) => w.pvBau === undefined && w.p365 >= 5);
console.log('Im Bau ohne Aufrufe gemessen, aber ≥ 5 Aufrufe/Tag: ' + missed.length + (missed.length ? ' → ' + missed.slice(0, 15).map((w) => w.name + ' ' + w.p365).join('; ') : ''));
const ch = rows.filter((w) => w.st2 !== w.st);
console.log('Sterne änderten sich, wenn alle Aufrufe gemessen wären: ' + ch.length + (ch.length ? ' → ' + ch.slice(0, 20).map((w) => w.name + ' ★' + w.st + '→★' + w.st2).join('; ') : ''));
const sc = (k) => [0, 1, 2, 3].map((s) => rows.filter((w) => w[k] === s).length).join('/');
console.log('Sterne 0/1/2/3 heute: ' + sc('st') + ' | mit allen Aufrufen: ' + sc('st2'));
