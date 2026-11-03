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
      const arr = fixture.wikipedia[lang] || [{ query: { pages: [] } }];
      body = u.searchParams.get('incontinue') ? arr[1] : arr[0];
    } else if (u.hostname === 'www.wikidata.org') {
      const ids = (u.searchParams.get('ids') || '').split('|');
      const entities = {};
      ids.forEach(id => { entities[id] = fixture.wikidata.entities[id] || { id, missing: '' }; });
      body = { entities };
    } else if (u.hostname === 'nominatim.openstreetmap.org') {
      body = u.pathname.startsWith('/search') ? fixture.nominatimSearch : fixture.nominatim;
    } else throw new Error('unexpected url ' + url);
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(body)) };
  };
  fn.calls = calls;
  return fn;
}

// ---- classification
const cls = (p31, descs, titles) => core.classify(p31, [], descs, titles, cfg);
const clsL = (labels, descs, titles) => core.classify([], labels, descs, titles, cfg);
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
eq(clsL(['research library'], [], []), 'bibliothek', 'class label research library');
eq(clsL(['Anglican cathedral', 'church building'], [], []), 'kathedrale', 'class label cathedral beats church');
eq(clsL(['library building'], ['late-Victorian neo-Gothic building in Manchester'], ['John Rylands Research Institute and Library']), 'bibliothek', 'generic building defers to specific title');
eq(clsL(['skyscraper'], ['skyscraper in Manchester'], ['Beetham Tower, Manchester']), 'turm', 'generic skyscraper -> title tower');
eq(clsL(['office building'], [], []), 'buero', 'office building specific');
eq(clsL(['terrorist attack'], [], []), 'ereignis', 'event');
eq(clsL(['diocese of the Church of England'], [], ['Anglican Diocese of Manchester']), 'organisation', 'diocese is not a church');
eq(clsL(['commune of France'], [], []), 'siedlung', 'commune');
eq(cls([], [], ['Musée Alexis Forel']), 'museum', 'French title musée');
eq(cls([], [], ['Château de Morges']), 'schloss', 'French château de');

eq(clsL(['scenic viewpoint'], [], []), 'aussicht', 'viewpoint class');
eq(cls([], ['observation tower in Zurich'], []), 'aussicht', 'observation tower is a viewpoint');
eq(core.starsFor(0.5, 'museum', cfg), 1, 'museum always at least 1 star');
eq(core.starsFor(0.5, 'aussicht', cfg), 1, 'viewpoint always at least 1 star');
eq(core.starsFor(0.5, 'park', cfg), 0, 'park only by score');

// ---- names
ok(core.isLatin('Hôtel de ville de Morges') && core.isLatin("Chetham's Library") && core.isLatin('Łódź'), 'latin names readable');
ok(!core.isLatin('Παρθενώνας') && !core.isLatin('Москва') && !core.isLatin('東京タワー'), 'non-latin not readable');
const pn = (n) => { const r = core.pickNames(n); return r.name + '|' + r.name2; };
eq(pn({ local: 'Hôtel de ville de Morges', de: 'Rathaus Morges', en: 'Morges Town Hall' }), 'Hôtel de ville de Morges|Rathaus Morges', 'local first, German second');
eq(pn({ local: 'Manchester Town Hall', de: 'Rathaus Manchester', en: 'Manchester Town Hall' }), 'Manchester Town Hall|Rathaus Manchester', 'England: English is local');
eq(pn({ local: '東京タワー', de: 'Tokyo Tower', en: 'Tokyo Tower' }), 'Tokyo Tower|', 'Japanese: English first, no duplicate German');
eq(pn({ local: 'Παρθενώνας', de: 'Parthenon', en: 'Parthenon' }), 'Parthenon|', 'Greek: English first');
eq(pn({ local: 'Ακρόπολη', de: 'Akropolis', en: 'Acropolis of Athens' }), 'Acropolis of Athens|Akropolis', 'Greek: English then German');
eq(pn({ local: 'Kölner Dom', de: 'Kölner Dom', en: 'Cologne Cathedral' }), 'Kölner Dom|', 'Germany: one name');
eq(pn({ local: '', de: 'Musée X', en: '' }), 'Musée X|', 'no local name: German');
eq(core.localLanguage({ cc: 'ch', region: 'CH-VD' }, cfg), 'fr', 'local language Vaud');
eq(core.localLanguage({ cc: 'gb', region: 'GB-ENG' }, cfg), 'en', 'local language England');
eq(core.localLanguage({ cc: 'de' }, cfg), 'de', 'local language Germany');

// ---- place search
const hits = await core.searchPlaces('Manchester', mockFetch(fx));
eq(hits.length, 2, 'search hits');
eq(hits[0].name + '|' + hits[0].detail, 'Manchester|Greater Manchester, England, Vereinigtes Königreich', 'search hit text');
ok(Math.abs(hits[0].lat - 53.479) < 0.01, 'search hit coords');

// ---- languages
eq(core.languagesFor({ cc: 'ch', region: 'CH-VD' }, cfg).join(), 'de,en,fr', 'Vaud -> fr');
eq(core.languagesFor({ cc: 'ch', region: 'CH-ZH' }, cfg).join(), 'de,en', 'Zürich -> de only');
eq(core.languagesFor({ cc: 'ch', region: 'CH-TI' }, cfg).join(), 'de,en,it', 'Ticino -> it');
eq(core.languagesFor({ cc: 'gb', region: 'GB-ENG' }, cfg).join(), 'de,en', 'England');
eq(core.languagesFor({ cc: 'be' }, cfg).join(), 'de,en,fr,nl', 'Belgium two languages');
eq(core.languagesFor({}, cfg).join(), 'de,en', 'unknown place');

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
const res = await core.loadPlaces({ lat: fx.center.lat, lon: fx.center.lon, radius: 1000, cfg, fetch: f, wdCache, langs: ['de', 'en', 'fr'], localLang: 'en' });
const by = n => res.places.find(p => (p.artikel.en || p.artikel.de || '').includes(n) || p.name.includes(n));
eq(res.warnings.length, 0, 'no warnings: ' + res.warnings.join('; '));
eq(res.places.length, 23, 'merged count (21 wd items + 1 de-only + 1 fr-only)');
eq(f.calls.filter(u => u.includes('en.wikipedia')).length, 2, 'en continuation followed');
ok(by('Town Hall').laenge === 52000, 'length merged from continuation, longest article');
ok(!f.calls.some(u => u.includes('pageviews')), 'no pageviews requested');
eq(by('John Rylands').typ, 'bibliothek', 'John Rylands typ via class label');
eq(by('Cathedral').typ, 'kathedrale', 'Cathedral typ via class label');
eq(by('Victoria station').sterne <= 1, true, 'station without great building at most 1 star (' + by('Victoria station').score + ')');
eq(by('Arena bombing').sterne, 0, 'event no star');
eq(by('Musée Exemple').sterne, 1, 'fr-only museum gets 1 star');
eq(by('Musée Exemple').typ, 'museum', 'fr-only museum typ');
eq(by('Town Hall').name, 'Manchester Town Hall', 'display name = local (English in England)');
eq(by('Town Hall').name2, 'Rathaus Manchester', 'second name = German');
eq(by("Chetham").name2, '', 'no German name -> no second line');
eq(by('Town Hall').wikipedia, 'en:Manchester Town Hall', 'wikipedia = longer article');
for (const n of cfg.goldlisten[0].drei_sterne) eq(by(n) && by(n).sterne, 3, 'gold 3 stars: ' + n);
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
eq(f2.calls.filter(u => u.includes('wikidata')).length, 0, 'wikidata cache used (items and classes)');

// "Search is currently too busy" -> retried, then fine
let busyLeft = 2;
const fbusy = async (url) => {
  if (url.includes('de.wikipedia') && busyLeft-- > 0) return { ok: true, status: 200, json: async () => ({ error: { code: 'search-error', info: 'Search is currently too busy. Please try again later.' } }) };
  return mockFetch(fx)(url);
};
const r3 = await core.loadPlaces({ lat: 53.4792, lon: -2.2442, radius: 1000, cfg, fetch: fbusy, wdCache, retryDelays: [5, 5] });
ok(r3.warnings.length === 0 && r3.places.some(p => p.artikel.de), 'busy retried: ' + r3.warnings.join('; '));
let busyAlways = async (url) => url.includes('de.wikipedia') ? { ok: true, status: 200, json: async () => ({ error: { info: 'Search is currently too busy.' } }) } : mockFetch(fx)(url);
const r3b = await core.loadPlaces({ lat: 53.4792, lon: -2.2442, radius: 1000, cfg, fetch: busyAlways, wdCache, retryDelays: [5, 5] });
ok(r3b.places.length > 0 && r3b.warnings.some(w => /Wikipedia de: Search is currently too busy/.test(w)), 'busy gives up after retries with warning');

// reverse geocode returns name, country, region
const rg = await core.reverseGeocode(53.4792, -2.2442, mockFetch(fx));
eq(rg.name + '|' + rg.cc + '|' + rg.region, 'Manchester|gb|GB-ENG', 'reverse geocode info');

// one language failing -> still results, warning
const fbad = async (url) => url.includes('de.wikipedia') ? { ok: false, status: 404, json: async () => ({}) } : mockFetch(fx)(url);
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
