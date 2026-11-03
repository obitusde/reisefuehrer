// Offline checks for the Reiseführer app. Run: node tools/test.mjs
// Uses SYNTHETIC fixture data (docs/testdata/manchester-synthetisch.json); real data is checked in docs/diag.html.
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const core = require(path.join(ROOT, 'docs/core.js'));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/config.json'), 'utf8'));
const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/testdata/manchester-synthetisch.json'), 'utf8'));

let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.log('FAIL', msg); } }
function eq(a, b, msg) { ok(a === b, msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

// ---- mock fetch serving the fixture
export function mockFetch(fixture) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const u = new URL(url);
    let body;
    if (u.hostname.endsWith('.wikipedia.org')) {
      const lang = u.hostname.split('.')[0];
      const arr = fixture.wikipedia[lang];
      body = u.searchParams.get('pvipcontinue') ? arr[1] : arr[0];
    } else if (u.hostname === 'www.wikidata.org') {
      const ids = (u.searchParams.get('ids') || '').split('|');
      const entities = {};
      ids.forEach(id => { entities[id] = fixture.wikidata.entities[id] || { id, missing: '' }; });
      body = { entities };
    } else if (u.hostname === 'nominatim.openstreetmap.org') {
      body = fixture.nominatim;
    } else throw new Error('unexpected url ' + url);
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(body)) };
  };
  fn.calls = calls;
  return fn;
}

// ---- classification
const cls = (p31, descs, titles) => core.classify(p31, descs, titles, cfg);
eq(cls(['Q2977'], [], []), 'kathedrale', 'P31 cathedral');
eq(cls(['Q41176', 'Q16970'], [], []), 'kirche', 'P31 order: church beats building');
eq(cls([], ['Grade I listed church in Manchester, England'], []), 'kirche', 'desc head church');
eq(cls([], ['Victorian Gothic town hall in Manchester'], []), 'rathaus', 'desc town hall not city/town');
eq(cls([], ['city in Greater Manchester, England'], []), 'siedlung', 'desc city');
eq(cls([], ['culverted river in Manchester'], []), 'bach', 'desc culverted river -> bach');
eq(cls([], ['river in North West England'], []), 'fluss', 'desc river');
eq(cls([], ['public park in Manchester'], ['Cathedral Gardens']), 'park', 'desc beats title');
eq(cls([], [], ['Cathedral Gardens']), 'park', 'title head = last word');
eq(cls([], [], ['Museum of Science and Industry (Manchester)']), 'museum', 'title cut at of');
eq(cls([], [], ['River Tib']), 'fluss', 'title starts with river');
eq(cls([], ['römisch-katholische Pfarrkirche in Köln'], []), 'kirche', 'German suffix *kirche');
eq(cls([], ['Bauwerk in Hamburg'], []), 'gebaeude', 'Hamburg is not a castle');
eq(cls([], ['pub in Manchester'], []), 'gastro', 'pub');
eq(cls([], ['Grade II listed house in Bath'], []), 'wohnhaus', 'house');
eq(cls([], ['opera house in Paris'], []), 'theater', 'opera house is not a house');
eq(cls([], ['police station in Manchester'], []), 'sonstiges', 'police station is not a railway station');
eq(cls([], [], []), 'sonstiges', 'nothing');

// ---- sitelinks
eq(core.sitelinkCount({ enwiki: 1, dewiki: 1, commonswiki: 1, enwikivoyage: 1, specieswiki: 1, frwiki: 1 }), 3, 'sitelink count');

// ---- links
const pl = { name: "Chetham's Library", ort: 'Manchester', lat: 53.4857, lon: -2.2432, sterne: 3, artikel: { en: "Chetham's Library" }, wikipedia: "en:Chetham's Library" };
eq(core.gmapsSearchUrl(pl), "https://www.google.com/maps/search/?api=1&query=Chetham's%20Library%2C%20Manchester", 'maps search url');
eq(core.gmapsPinUrl(pl), 'https://www.google.com/maps/search/?api=1&query=53.485700%2C-2.243200', 'maps pin url');
eq(core.geoPinUrl(pl), "geo:53.485700,-2.243200?q=53.485700,-2.243200(Chetham's%20Library)", 'geo pin');
eq(core.nameWithPlace({ name: 'Manchester Cathedral', ort: 'Manchester' }), 'Manchester Cathedral', 'no duplicate city');
eq(core.wikipediaUrl(pl), "https://en.m.wikipedia.org/wiki/Chetham's_Library", 'wikipedia url');
eq(core.merkZeile(pl), "Chetham's Library – ★★★ – Manchester – https://www.google.com/maps/search/?api=1&query=Chetham's%20Library%2C%20Manchester", 'merkzeile');
eq(core.compareVersions('0.10.0', '0.9.9'), 1, 'semver compare');
eq(core.compareVersions('0.2.0', '0.2.0'), 0, 'semver equal');
eq(core.formatDistance(1234), '1,2 km', 'distance format');

// ---- full pipeline with synthetic data
const f = mockFetch(fx);
const cache = new Map();
const wdCache = { get: k => cache.get(k), set: (k, v) => cache.set(k, v) };
const res = await core.loadPlaces({ lat: fx.center.lat, lon: fx.center.lon, radius: 1000, cfg, fetch: f, wdCache });
const by = n => res.places.find(p => (p.artikel.en || p.artikel.de || '').includes(n) || p.name.includes(n));
eq(res.warnings.length, 0, 'no warnings: ' + res.warnings.join('; '));
eq(res.places.length, 20, 'merged count (19 wd items + 1 de-only)');
eq(f.calls.filter(u => u.includes('en.wikipedia')).length, 2, 'en continuation followed');
ok(by('Town Hall').aufrufe90 > 20000, 'pageviews merged from continuation and both languages');
eq(by('Town Hall').name, 'Rathaus Manchester', 'display name prefers de');
eq(by('Town Hall').wikipedia, 'en:Manchester Town Hall', 'wikipedia = longer article');
for (const n of cfg.goldliste.drei_sterne) eq(by(n) && by(n).sterne, 3, 'gold 3 stars: ' + n);
eq(by('River Tib').sterne, 0, 'River Tib no star');
eq(by('River Tib').typ, 'bach', 'River Tib typ');
eq(by('Manchester') && res.places.find(p => p.wikidata === 'Q900013').sterne, 0, 'city article capped at 0');
eq(res.places.find(p => p.typ === 'liste').sterne, 0, 'list capped');
eq(by('tram stop').sterne, 0, 'tram stop no star');
eq(by('Deansgate').sterne, 0, 'street no star');
ok(res.places.every((p, i, a) => i === 0 || a[i - 1].sterne > p.sterne || (a[i - 1].sterne === p.sterne && a[i - 1].score >= p.score)), 'sorted by stars, score');
ok(res.places.every(p => p.quellen.join() === 'W' && p.geprueft === true && typeof p.lat === 'number'), 'format 5b fields');
eq(res.places.find(p => p.id.startsWith('wp:de:')).name, 'Gedenktafel am Rathaus', 'de-only page kept, title cleaned');

// cache: second run makes no Wikidata request
const f2 = mockFetch(fx);
await core.loadPlaces({ lat: fx.center.lat, lon: fx.center.lon, radius: 1000, cfg, fetch: f2, wdCache });
eq(f2.calls.filter(u => u.includes('wikidata')).length, 0, 'wikidata cache used');

// no pageviews -> fallback thresholds + warning
const fxNoViews = JSON.parse(JSON.stringify(fx));
fxNoViews.wikipedia.en = [{ query: { pages: fx.wikipedia.en[0].query.pages } }];
fxNoViews.wikipedia.de[0].query.pages.forEach(p => delete p.pageviews);
const r3 = await core.loadPlaces({ lat: 53.4792, lon: -2.2442, radius: 1000, cfg, fetch: mockFetch(fxNoViews), wdCache });
ok(r3.warnings.some(w => w.includes('Seitenaufrufe')), 'warning without pageviews');
ok(r3.places.every(p => p.aufrufe90 === null), 'aufrufe null');

// one language failing -> still results, warning
const fbad = async (url) => url.includes('de.wikipedia') ? { ok: false, status: 503, json: async () => ({}) } : mockFetch(fx)(url);
const r4 = await core.loadPlaces({ lat: 53.4792, lon: -2.2442, radius: 1000, cfg, fetch: fbad, wdCache });
ok(r4.places.length > 0 && r4.warnings.some(w => w.includes('Wikipedia de')), 'partial failure tolerated');

// ---- version consistency across files
const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/version.json'), 'utf8')).version;
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
eq(core.VERSION, v, 'core.js version');
for (const [file, re] of [['docs/app.js', /var VERSION = '([\d.]+)'/], ['docs/sw.js', /const VERSION = '([\d.]+)'/],
  ['docs/diag.html', /var VERSION = '([\d.]+)'/]]) {
  const m = read(file).match(re); eq(m && m[1], v, file + ' version');
}
const idx = read('docs/index.html');
const qv = [...idx.matchAll(/\?v=([\d.]+)/g)].map(m => m[1]);
ok(qv.length >= 3 && qv.every(x => x === v), 'index.html ?v= query strings = ' + v);
ok(read('docs/sw.js').includes("'app.js?v=' + VERSION"), 'sw precache uses versioned app.js');
ok(read('CHANGELOG.md').includes('## v' + v + ' '), 'CHANGELOG has entry v' + v);

// ---- referenced local files exist
for (const m of idx.matchAll(/(?:src|href)="([^"#:]+?)(?:\?v=[\d.]+)?"/g)) {
  ok(fs.existsSync(path.join(ROOT, 'docs', m[1])), 'index.html references existing file ' + m[1]);
}
const man = JSON.parse(read('docs/manifest.webmanifest'));
for (const ic of man.icons) ok(fs.existsSync(path.join(ROOT, 'docs', ic.src)), 'manifest icon ' + ic.src);

console.log(`${passes} ok, ${fails} fehlgeschlagen`);
if (fails) process.exit(1);
