// Einmaliger Test (nur Messung): Wie oft wurde etwas fotografiert (Wikimedia Commons)? Vergleich mit dem heutigen Rang einer Stadt.
// 1. Commons-Kategorie je Ziel (Wikidata P373 oder Commons-Sitelink) → Anzahl Dateien und Unterkategorien (categoryinfo, nicht rekursiv)
// 2. Fotos mit Koordinaten im Umkreis von 150 m (geosearch, höchstens 500) für die besten Ziele
// 3. Vergleichswerte: Matterhorn, Château de Chillon u. a.
// Läuft nur auf GitHub (Workflow commons-test.yml). Env: LAT, LON, RADIUS_KM.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = createRequire(import.meta.url)(path.join(ROOT, 'docs/core.js'));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/config.json'), 'utf8'));
const UA = 'ReisefuehrerBot/' + core.VERSION + ' (https://github.com/obitusde/reisefuehrer; einmaliger Commons-Test)';
const f = (url, o = {}) => fetch(url, { ...o, headers: { ...(o.headers || {}), 'User-Agent': UA, Accept: 'application/json' } });
const j = async (url) => { for (let i = 0; i < 3; i++) { try { const r = await f(url); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } catch (e) { if (i === 2) throw e; await new Promise((s) => setTimeout(s, 1500)); } } };
const LAT = +process.env.LAT || 46.5197, LON = +process.env.LON || 6.6323, RAD = +process.env.RADIUS_KM || 3;
const km = (a, b, c, d) => { const k = Math.cos(((a + c) / 2) * Math.PI / 180); return Math.hypot((b - d) * k * 111.32, (a - c) * 110.57); };
const q = (o) => Object.entries(o).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
const pad = (s, n) => String(s).slice(0, n).padEnd(n);
const rank = (arr) => { const o = arr.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]), r = []; o.forEach((e, k) => { r[e[1]] = k + 1; }); return r; };
const spearman = (a, b) => { const ra = rank(a), rb = rank(b), n = a.length; let d2 = 0; for (let i = 0; i < n; i++) d2 += (ra[i] - rb[i]) ** 2; return 1 - 6 * d2 / (n * (n * n - 1)); };

// ---- Commons-Kategorien zu Wikidata-Nummern (P373, sonst Commons-Sitelink "Category:...")
async function categories(qids) {
  const out = {};
  for (let i = 0; i < qids.length; i += 50) {
    const d = await j('https://www.wikidata.org/w/api.php?' + q({ action: 'wbgetentities', format: 'json', ids: qids.slice(i, i + 50).join('|'), props: 'claims|sitelinks', sitefilter: 'commonswiki' }));
    for (const [id, e] of Object.entries(d.entities || {})) {
      const p373 = (((e.claims || {}).P373 || [])[0] || {}).mainsnak, v = p373 && p373.datavalue && p373.datavalue.value;
      const sl = (e.sitelinks || {}).commonswiki;
      out[id] = v ? 'Category:' + v : sl && /^Category:/.test(sl.title) ? sl.title : '';
    }
  }
  return out;
}
async function sizes(titles) {
  const out = {}, list = [...new Set(titles.filter(Boolean))];
  for (let i = 0; i < list.length; i += 40) {
    const d = await j('https://commons.wikimedia.org/w/api.php?' + q({ action: 'query', format: 'json', formatversion: 2, prop: 'categoryinfo', titles: list.slice(i, i + 40).join('|') }));
    (d.query.pages || []).forEach((p) => { out[p.title] = p.categoryinfo ? { files: p.categoryinfo.files || 0, subcats: p.categoryinfo.subcats || 0 } : { files: 0, subcats: 0 }; });
    (d.query.normalized || []).forEach((n) => { if (out[n.to]) out[n.from] = out[n.to]; });
  }
  return out;
}
async function geo(lat, lon) {
  const d = await j('https://commons.wikimedia.org/w/api.php?' + q({ action: 'query', format: 'json', formatversion: 2, list: 'geosearch', gscoord: lat + '|' + lon, gsradius: 150, gsnamespace: 6, gslimit: 500 }));
  return (d.query.geosearch || []).length;
}

// ---- Ziele der Kachel wie im Länderbau
const tile = core.directoryTiles({ south: LAT - 0.01, west: LON - 0.01, north: LAT + 0.01, east: LON + 0.01 }, cfg)[0];
const dcfg = core.directoryConfig(cfg);
const prep = await core.prepareDirectoryTile(tile, dcfg, f);
const prod = core.computeDirectory(prep.items, dcfg, null, { copy: true });
const prodBy = {}; prod.orte.forEach((o) => { prodBy[o.q] = o; });
const near = prep.items.filter((x) => !x._c && x._s && prodBy[x.q] && km(x.lat, x.lon, LAT, LON) <= RAD);
console.log('Ziele im Umkreis: ' + near.length);
const cat = await categories(near.map((x) => x.q));
const sz = await sizes(Object.values(cat));
let rows = near.map((x) => { const c = cat[x.q] || '', s = sz[c] || { files: 0, subcats: 0 }; return { q: x.q, name: x.name, lat: x.lat, lon: x.lon, typ: prodBy[x.q].typ, st: prodBy[x.q].st, score: prodBy[x.q].score, cat: c, files: s.files, subcats: s.subcats }; });
console.log('Mit Commons-Kategorie: ' + rows.filter((r) => r.cat).length + ' von ' + rows.length + '; mit mindestens 1 Datei: ' + rows.filter((r) => r.files > 0).length);
const topN = rows.slice().sort((a, b) => b.files - a.files).slice(0, 60);
for (const r of topN) r.geo = await geo(r.lat, r.lon);
const line = (r) => pad(r.name, 38) + ' ' + pad(r.typ, 11) + ' ★' + r.st + ' ' + pad(r.score, 5) + ' | Dateien ' + pad(r.files, 6) + ' Unterkat. ' + pad(r.subcats, 4) + (r.geo != null ? ' | Fotos mit Ort im Umkreis 150 m: ' + r.geo : '');
console.log('\n=== Top 30 nach Anzahl Dateien in der Commons-Kategorie');
topN.slice(0, 30).forEach((r) => console.log(line(r)));
console.log('\n=== Top 25 nach heutigem Rang (Punkte), mit Dateien');
rows.slice().sort((a, b) => b.score - a.score).slice(0, 25).forEach((r) => console.log(line(r)));
const withF = rows.filter((r) => r.files > 0);
console.log('\nRangkorrelation (Spearman) Punkte ↔ Dateien (' + withF.length + ' Ziele mit Dateien): ' + spearman(withF.map((r) => r.score), withF.map((r) => Math.log10(1 + r.files))).toFixed(2));
console.log('Ziele ohne Stern, aber mit mehr als 300 Dateien: ' + rows.filter((r) => r.st === 0 && r.files > 300).sort((a, b) => b.files - a.files).map((r) => r.name + ' ' + r.files).join('; '));
console.log('Ziele mit Stern, aber unter 20 Dateien: ' + rows.filter((r) => r.st > 0 && r.files < 20).map((r) => r.name + ' ' + r.files).join('; '));

// ---- Vergleichswerte
console.log('\n=== Vergleichswerte (Commons-Kategorien)');
for (const name of ['Matterhorn', 'Château de Chillon', 'Rheinfall', 'Kapellbrücke', 'Lausanne Cathedral', 'Eiffelturm', 'Neuschwanstein Castle', 'Kölner Dom']) {
  try {
    const s = await j('https://www.wikidata.org/w/api.php?' + q({ action: 'wbsearchentities', format: 'json', search: name, language: 'de', limit: 1 }));
    const id = (s.search || [])[0] && s.search[0].id;
    if (!id) { console.log('  ' + name + ': nicht gefunden'); continue; }
    const c = (await categories([id]))[id], z = (await sizes([c]))[c] || {};
    console.log('  ' + pad(name, 24) + ' ' + id + ' ' + pad(c || '–', 40) + ' Dateien ' + (z.files != null ? z.files : '–') + ', Unterkategorien ' + (z.subcats != null ? z.subcats : '–'));
  } catch (e) { console.log('  ' + name + ': Fehler ' + e.message); }
}
