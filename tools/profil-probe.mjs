// Einmaliger Test (nur Messung): Was ändert ein persönliches Interessenprofil an den Sternen einer Stadt?
// Heutiger Rang (wie der Länderbau ihn rechnet) gegen Rang mit Profil: Kunst-/Geschichtsmuseen hoch, Aussichtspunkte gleich wie Museen, Geschichte (Burg, Schloss …) etwas höher,
// einfache Kirchen nur mit Denkmalstatus, fehlende Seitenaufrufe nachgemessen. Nichts wird gespeichert; die App ist unverändert.
// Läuft nur auf GitHub (Workflow profil-test.yml). Env: LAT, LON, RADIUS_KM.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = createRequire(import.meta.url)(path.join(ROOT, 'docs/core.js'));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/config.json'), 'utf8'));
const UA = 'ReisefuehrerBot/' + core.VERSION + ' (https://github.com/obitusde/reisefuehrer; einmaliger Profil-Test)';
const f = (url, o = {}) => fetch(url, { ...o, headers: { ...(o.headers || {}), 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
const LAT = +process.env.LAT || 46.5197, LON = +process.env.LON || 6.6323, RAD = +process.env.RADIUS_KM || 3;
const km = (a, b, c, d) => { const k = Math.cos(((a + c) / 2) * Math.PI / 180); return Math.hypot((b - d) * k * 111.32, (a - c) * 110.57); };
const dcfg = core.directoryConfig(cfg), V = dcfg.verzeichnis, G = dcfg.staedte.gewicht_aufrufe || 0;
const log10p = (x) => Math.log(1 + Math.max(0, x || 0)) / Math.LN10;
const th = V.sterne;
const stars = (s) => (s >= th['3'] ? 3 : s >= th['2'] ? 2 : s >= th['1'] ? 1 : 0);
const pad = (s, n) => String(s).slice(0, n).padEnd(n);

const tile = core.directoryTiles({ south: LAT - 0.01, west: LON - 0.01, north: LAT + 0.01, east: LON + 0.01 }, cfg)[0];
console.log('Kachel ' + core.tileKey(tile) + ', Mitte ' + LAT + ',' + LON + ', Radius ' + RAD + ' km; Schwellen ★ ' + th['1'] + ' / ★★ ' + th['2'] + ' / ★★★ ' + th['3']);
const prep = await core.prepareDirectoryTile(tile, dcfg, f);
const prod = core.computeDirectory(prep.items, dcfg, null, { copy: true });
const prodBy = {}; prod.orte.forEach((o) => { prodBy[o.q] = o; });
const raw = await core.loadCityTiles([tile], dcfg, f, {});
const rawBy = {}; raw.items.forEach((x) => { rawBy[x.q] = x; });
const near = prep.items.filter((x) => !x._c && x._s && km(x.lat, x.lon, LAT, LON) <= RAD && prodBy[x.q] && rawBy[x.q]);
console.log('Ziele im Umkreis: ' + near.length + ', Aufrufe im Bau gemessen: ' + near.filter((x) => x.pv !== undefined).length);

// fehlende Seitenaufrufe (30 Tage) nachmessen
const missing = near.filter((x) => x.pv === undefined).map((x) => Object.assign({}, x));
await core.loadSitelinks(missing, dcfg, f);
const pm = await core.loadPageviews(missing, dcfg, f, {});
const pvMissing = {}; missing.forEach((x) => { pvMissing[x.q] = x.pv || 0; });
console.log('Fehlende Aufrufe nachgemessen: ' + missing.length + ' Ziele, ' + pm.requests + ' Abfragen, Fehler ' + pm.failed);

// --- das Profil (Annahmen aus dem Gespräch; nur hier im Test)
const T = (x) => ((rawBy[x.q].cls || []).concat(rawBy[x.q].p31 || [])).join(' | ').toLowerCase();
const RE = {
  kunst: /art museum|kunstmuseum|art gallery|gallery|galerie|beaux-arts|musée d'art|photograph|design|contemporary|kunsthalle|art brut|museum of modern/,
  geschichte: /history museum|historical museum|historisches|archaeolog|archéolog|archaeological|roman|römisch|musée historique|musée d'histoire|ethnograph|military|cultural history/,
  aussicht: /viewpoint|lookout|observation|aussicht|belvedere|panorama/
};
const rules = [];
function profil(x, o) {
  const t = T(x), d = []; let delta = 0;
  if (o.typ === 'museum') {
    if (RE.kunst.test(t) || RE.kunst.test(x.name.toLowerCase())) { delta += 2; d.push('Kunstmuseum +2'); }
    else if (RE.geschichte.test(t) || RE.geschichte.test(x.name.toLowerCase())) { delta += 1.5; d.push('Geschichtsmuseum +1,5'); }
    else { delta -= 1.5; d.push('anderes Museum −1,5'); }
  }
  if (RE.aussicht.test(t) || o.typ === 'aussicht') { delta += 2; d.push('Aussicht +2'); }
  if (['burg', 'schloss', 'kloster', 'archaeologie', 'herrenhaus'].includes(o.typ)) { delta += 1; d.push('Geschichte +1'); }
  return { delta, d };
}
const rows = near.map((x) => {
  const o = prodBy[x.q], r = rawBy[x.q];
  let s = o.score; const why = [];
  if (x.pv === undefined && pvMissing[x.q]) { const add = Math.round(G * log10p(pvMissing[x.q]) * 10) / 10; s += add; why.push('Aufrufe +' + add); }
  const p = profil(x, o); s += p.delta; why.push(...p.d);
  const isChurch = o.typ === 'kirche' && !(r.h && r.h.length) && !o.unesco;
  if (isChurch && stars(s) > 0) { s = th['1'] - 0.1; why.push('Kirche ohne Denkmalstatus: kein Stern'); }
  s = Math.round(s * 10) / 10;
  return { name: x.name, typ: o.typ, sl: x.sl, was: o.score, st: o.st, neu: s, st2: stars(s), why: why.join('; '), cls: (r.cls || []).slice(0, 3).join(' / '), h: (r.h || []).length };
});
const L = (w) => pad(w.name, 38) + ' ' + pad(w.typ, 11) + ' Spr ' + pad(w.sl, 3) + ' ' + pad(w.was, 5) + ' ★' + w.st + ' → ' + pad(w.neu, 5) + ' ★' + w.st2 + (w.st2 !== w.st ? '  *' : '  ') + ' ' + w.why;
const sc = (k) => [0, 1, 2, 3].map((s) => rows.filter((w) => w[k] === s).length).join('/');
console.log('\nSterne 0/1/2/3 heute: ' + sc('st') + ' | mit Profil: ' + sc('st2'));
console.log('\n=== Mit Profil: alle Ziele mit Stern (nach neuen Punkten)  [* = Stern ändert sich]');
rows.filter((w) => w.st2 > 0 || w.st > 0).sort((a, b) => b.neu - a.neu).forEach((w) => console.log(L(w)));
console.log('\n=== Knapp darunter (neu zwischen ' + (th['1'] - 1.5) + ' und ' + th['1'] + ')');
rows.filter((w) => w.st2 === 0 && w.neu >= th['1'] - 1.5).sort((a, b) => b.neu - a.neu).forEach((w) => console.log(L(w)));
console.log('\n=== Alle Museen: Einordnung (Klassen aus Wikidata)');
rows.filter((w) => w.typ === 'museum').sort((a, b) => b.neu - a.neu).forEach((w) => console.log(pad(w.name, 38) + ' ' + pad(w.neu, 5) + ' ★' + w.st2 + ' | ' + pad(w.why, 40) + ' | ' + w.cls));
console.log('\n=== Kirchen, Türme, Aussicht (Einordnung)');
rows.filter((w) => ['kirche', 'turm', 'aussicht', 'kathedrale'].includes(w.typ)).sort((a, b) => b.neu - a.neu).forEach((w) => console.log(pad(w.name, 38) + ' ' + pad(w.typ, 10) + ' ' + pad(w.was, 5) + '→' + pad(w.neu, 5) + ' ★' + w.st2 + ' Denkmal ' + w.h + ' | ' + w.why));
