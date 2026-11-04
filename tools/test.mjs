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
      if ((u.searchParams.get('prop') || '').includes('extracts')) {
        const titles = u.searchParams.get('titles').split('|');
        const intro = (t) => lang === 'de' ? t + ' ist ein Testort (synthetisch). Zweiter Satz.' : t + ' is a test place (synthetic). Second sentence.';
        const full = (t) => intro(t) + '\n\n== History ==\n' + Array.from({ length: 400 }, (_, i) => 'Sentence number ' + (i + 1) + ' about the history.').join(' ') +
          '\n\n== Architecture ==\nIt has a tower.\n\n== See also ==\nOther places.\n\n== References ==\nBook 1.';
        body = { query: { pages: titles.map((t, i) => ({ pageid: i + 1, ns: 0, title: t,
          extract: u.searchParams.get('exintro') ? intro(t) : full(t),
          ...((u.searchParams.get('prop') || '').includes('pageimages') ? { thumbnail: { source: 'https://upload.wikimedia.org/test/' + i + '.jpg', width: 640, height: 400 } } : {}) })) } };
      } else {
        const arr = fixture.wikipedia[lang] || [{ query: { pages: [] } }];
        body = u.searchParams.get('incontinue') ? arr[1] : arr[0];
      }
    } else if (u.hostname === 'www.wikidata.org') {
      const ids = (u.searchParams.get('ids') || '').split('|');
      const entities = {};
      ids.forEach(id => { entities[id] = fixture.wikidata.entities[id] || { id, missing: '' }; });
      body = { entities };
    } else if (u.hostname === 'nominatim.openstreetmap.org') {
      body = u.pathname.startsWith('/search')
        ? (/imperial/i.test(u.searchParams.get('q')) ? fixture.nominatimSearch.imperial : fixture.nominatimSearch.default)
        : fixture.nominatim;
    } else if (/overpass/.test(u.hostname) || u.hostname === 'maps.mail.ru') {
      if (fixture.__overpassDown && u.hostname === 'overpass-api.de') return { ok: false, status: 504, json: async () => ({}) };
      body = fixture.overpass;
    } else if (u.hostname === 'api.mymemory.translated.net') {
      const q = u.searchParams.get('q');
      body = fixture.__mmQuota ? { responseData: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY' }, responseStatus: 429, quotaFinished: true }
        : { responseData: { translatedText: '[DE] ' + q.replace("'", '&#39;') }, responseStatus: 200 };
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
eq(core.starsFor(0.5, 'museum', cfg), 2, 'museum always at least 2 stars (orange)');
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
// v0.5: German only if it is really another name
eq(pn({ local: 'Espace Horloger Vallée de Joux', de: 'Espace Horloger de la Vallée de Joux', en: '' }), 'Espace Horloger Vallée de Joux|', 'German variant with "de la" not shown');
eq(pn({ local: 'Musée Alexis-Forel', de: 'Musée Alexis Forel', en: '' }), 'Musée Alexis-Forel|', 'German variant with dash not shown');
eq(pn({ local: 'Château de Morges', de: 'Schloss Morges', en: '' }), 'Château de Morges|Schloss Morges', 'real translation shown');
eq(pn({ local: 'Manchester Cathedral', de: 'Kathedrale von Manchester', en: '' }), 'Manchester Cathedral|Kathedrale von Manchester', 'Cathedral/Kathedrale shown');
ok(core.sameName('Musée Forel', 'Musée Alexis Forel') && !core.sameName('Town Hall', 'Rathaus'), 'sameName subset / different');
eq(core.localLanguage({ cc: 'ch', region: 'CH-VD' }, cfg), 'fr', 'local language Vaud');
eq(core.localLanguage({ cc: 'gb', region: 'GB-ENG' }, cfg), 'en', 'local language England');
eq(core.localLanguage({ cc: 'de' }, cfg), 'de', 'local language Germany');

// ---- place search
const sf = mockFetch(fx);
const hits = await core.searchPlaces('Manchester', sf, { west: -2.3, south: 53.4, east: -2.2, north: 53.5 });
eq(hits.length, 2, 'search hits: duplicate Manchester merged');
eq(hits[0].name + '|' + hits[0].typ + '|' + hits[0].detail, 'Manchester|Stadt|Greater Manchester, England, Vereinigtes Königreich', 'search hit text');
eq(hits[1].detail, 'Hillsborough County, New Hampshire, Vereinigte Staaten', 'postcode removed');
ok(Math.abs(hits[0].lat - 53.479) < 0.01 && hits[0].poi === false, 'search hit coords, settlement');
ok(sf.calls[0].includes('viewbox=-2.3000%2C53.5000%2C-2.2000%2C53.4000') && sf.calls[0].includes('bounded=0'), 'search prefers map view');
const ih = await core.searchPlaces('Imperial War Museum', mockFetch(fx));
ok(ih.length === 2 && ih[0].poi && ih[0].typ === 'Museum', 'sight search: museum is a POI');

// ---- short texts
eq(core.shortLabel('Manchester Central Library', 'Manchester'), 'Central Library', 'label without city');
eq(core.shortLabel('Hôtel de ville de Morges', 'Morges'), 'Hôtel de ville', 'label without "de Morges"');
eq(core.shortLabel('Kathedrale von Manchester', 'Manchester'), 'Kathedrale', 'label without "von Manchester"');
eq(core.shortLabel('Maison du dessin de presse', 'Morges'), 'Maison du dessin…', 'label shortened at word boundary');
eq(core.shortLabel('Manchester', 'Manchester'), 'Manchester', 'label = city stays');
eq(core.stripLocation('Museum in Morges (Schweiz)'), 'Museum', 'description without location');
eq(core.stripLocation('Grade I listed building in Manchester, England'), 'Grade I listed building', 'description without location en');
eq(core.firstSentence("The People's History Museum (PHM) in Manchester is the UK's national museum of democracy. It was founded in 1975."),
  "The People's History Museum in Manchester is the UK's national museum of democracy.", 'first sentence, brackets removed');
eq(core.firstSentence('Das Rathaus ist ein Bau von ca. 1877 im Stil der Neugotik. Es wurde von A. Waterhouse entworfen.'),
  'Das Rathaus ist ein Bau von ca. 1877 im Stil der Neugotik.', 'first sentence keeps abbreviations');

// ---- intros + translation
const ip = [{ id: 'a', artikel: { de: 'Rathaus Manchester', en: 'Manchester Town Hall' } }, { id: 'b', artikel: { en: "Chetham's Library" } },
  { id: 'c', artikel: { fr: 'Musée Alexis Forel' }, wikipedia: 'fr:Musée Alexis Forel' }];
const intros = await core.loadIntros(ip, mockFetch(fx));
eq(intros.a.lang + '|' + intros.a.text, 'de|Rathaus Manchester ist ein Testort. Zweiter Satz.', 'intro German preferred, short -> 2 sentences');
eq(intros.b.lang, 'en', 'intro English');
eq(intros.c.lang + '|' + intros.c.text, 'fr|Musée Alexis Forel is a test place. Second sentence.', 'intro local language');

// "what is it" without the location
eq(core.shortInfo('Die Manchester Art Gallery ist ein öffentliches Kunstmuseum in Manchester. Sie besitzt über 25.000 Werke, darunter präraffaelitische Gemälde.'),
  'Die Manchester Art Gallery ist ein öffentliches Kunstmuseum. Sie besitzt über 25.000 Werke, darunter präraffaelitische Gemälde.', 'location dropped, second sentence added');
eq(core.shortInfo('Esea Contemporary is a contemporary art gallery based in Manchester, England. It focuses on artists of East Asian heritage.'),
  'Esea Contemporary is a contemporary art gallery. It focuses on artists of East Asian heritage.', '"based in …" dropped');
eq(core.shortInfo("Le musée Alexis-Forel est un musée situé à Morges, en Suisse. Il présente des arts décoratifs."),
  "Le musée Alexis-Forel est un musée. Il présente des arts décoratifs.", 'French location dropped');
eq(core.shortInfo("The People's History Museum in Manchester is the UK's national museum of democracy, founded as a labour history collection in the twentieth century. It opened in 1975."),
  "The People's History Museum in Manchester is the UK's national museum of democracy, founded as a labour history collection in the twentieth century.", 'long first sentence alone, location in the middle kept');
eq(core.stripLocation('contemporary art gallery based in Manchester, England'), 'Contemporary art gallery', 'description: "based" removed');
eq(core.dropLocation("Die St. Thomas' Church befindet sich in Pendleton, Salford."), "Die St. Thomas' Church befindet sich in Pendleton, Salford.", 'location sentence kept (would be broken)');
eq(core.dropLocation('Es befindet sich in Manchester.'), 'Es befindet sich in Manchester.', 'short location sentence kept');
eq(core.dropLocation('St Ann\'s Church is located in St Ann\'s Square, Manchester, England.'), 'St Ann\'s Church is located in St Ann\'s Square, Manchester, England.', 'English location sentence kept');
eq(core.dropLocation('Die Royal Exchange ist ein denkmalgeschütztes Gebäude in Manchester.'), 'Die Royal Exchange ist ein denkmalgeschütztes Gebäude.', 'normal sentence still shortened');
eq(core.shortLabel('Old Trafford', 'Trafford'), 'Old Trafford', 'label: city part of the name stays');
eq(core.shortLabel('Trafford Centre', 'Trafford'), 'Trafford Centre', 'label: short rest keeps full name');
eq(core.shortLabel('Manchester Cathedral', 'Manchester'), 'Cathedral', 'label: long rest without city');
eq(core.classify([], [], ['large former manor house in Salford'], [], cfg), 'herrenhaus', 'manor house is Herrenhaus, not Schloss');
core._resetTranslators();
const tr = await core.translate("It's a test.", 'en', 'de', mockFetch(fx));
eq(tr.via + '|' + tr.text, "mymemory|[DE] It's a test.", 'translation via MyMemory, entities decoded');
const fxq = Object.assign({}, fx, { __mmQuota: true });
let quotaErr = null;
await core.translate('x', 'en', 'de', mockFetch(fxq)).catch((e) => { quotaErr = e.message; });
eq(quotaErr, 'MyMemory-Tageslimit erreicht', 'quota detected');
core._resetTranslators();
globalThis.self = { Translator: { availability: async () => 'available', create: async () => ({ translate: async (t) => 'CHROME:' + t }) } };
eq((await core.translate('Hi.', 'en', 'de', mockFetch(fx))).text, 'CHROME:Hi.', 'Chrome translator preferred when available');
delete globalThis.self; core._resetTranslators();

// ---- narration (v0.3)
const raw = 'Intro sentence one. Intro two.\n\n== History ==\nOld times.\n\n=== Empty ===\n\n== Notes ==\nNote 1\n\n== References ==\nRef';
eq(core.cleanArticle(raw), 'Intro sentence one. Intro two.\n\nHistory:\nOld times.', 'clean article: headings, empty sections and references removed');
const cut = core.cutAtSentence('One. Two. Three four five.', 12);
eq(cut.text + '|' + cut.truncated, 'One. Two.|true', 'cut at sentence');
const th = { id: 'x', name: 'Manchester Town Hall', name2: 'Rathaus Manchester', ort: 'Manchester', lat: 53.4794, lon: -2.2446, typ_label: 'Rathaus',
  wikipedia: 'en:Manchester Town Hall', artikel: { en: 'Manchester Town Hall', de: 'Rathaus Manchester' } };
const artK = await core.loadArticle(th, 'kurz', mockFetch(fx));
const artF = await core.loadArticle(th, 'full', mockFetch(fx));
eq(artK.lang + '|' + artK.thumb.slice(0, 30), 'en|https://upload.wikimedia.org/t', 'article: longest language (en) and picture');
ok(artF.text.includes('Architecture:') && !artF.text.includes('Book 1') && !artF.text.includes('Other places'), 'full article cleaned');
eq(artF.intro, 'Manchester Town Hall is a test place (synthetic). Second sentence.', 'intro from full article');
eq(artF.url, 'https://en.wikipedia.org/wiki/Manchester_Town_Hall', 'article url');
const pK = core.buildPrompt(th, { article: artK, level: 'kurz', schwerpunkt: '', distance: 120 }, cfg);
ok(pK.text.startsWith('Du bist mein Reiseführer. Erzähle mir gleich etwas über diesen Ort.'), 'prompt starts with template');
ok(pK.text.includes('Ort: Manchester Town Hall (deutsch: Rathaus Manchester)') && pK.text.includes('Wo: 53.47940, -2.24460, etwa 120 m von mir entfernt'), 'prompt place and distance');
ok(pK.text.includes('Länge: etwa dreißig Sekunden') && pK.text.includes('Schwerpunkt: keiner, ein guter Überblick'), 'prompt length and focus');
ok(pK.text.includes('Quelltext (Englisch, Wikipedia):\nManchester Town Hall is a test place') && !pK.text.includes('Reisetipp') && !pK.text.includes('\n\n\n'), 'prompt source, no empty Wikivoyage line');
ok(pK.text.endsWith('Weitere Infos: https://en.wikipedia.org/wiki/Manchester_Town_Hall'), 'prompt ends with link');
const pN = core.buildPrompt(th, { article: artF, level: 'normal', schwerpunkt: 'Architektur', distance: null }, cfg);
ok(pN.truncated && pN.text.includes('Wikipedia – an einer Satzgrenze gekürzt') && pN.text.includes('Schwerpunkt: Architektur') && pN.text.includes('Wo: 53.47940, -2.24460\n'), 'normal: truncated, focus, no distance');
const srcN = pN.text.split('):\n')[1].split('\n\nWeitere Infos')[0];
ok(srcN.length <= 3000 && /[.!?]$/.test(srcN), 'normal source <= 3000 and ends at sentence: ' + srcN.length);
const pA = core.buildPrompt(th, { article: artF, level: 'ausfuehrlich', schwerpunkt: '', distance: 50 }, cfg);
ok(pA.length <= 12000 && pA.length > 9000, 'ausführlich within 12000: ' + pA.length);
const big = Object.assign({}, artF, { text: artF.text + ' ' + 'x'.repeat(30000) });
ok(core.buildPrompt(th, { article: big, level: 'ausfuehrlich' }, Object.assign({}, cfg, { erzaehlen: Object.assign({}, cfg.erzaehlen, { quelltext_max: { ausfuehrlich: 50000 } }) })).length <= 12000, 'never above 12000 even with huge limits');
const pNone = core.buildPrompt(th, { article: null, level: 'kurz' }, cfg);
ok(pNone.text.includes('keinen Wikipedia-Text') && pNone.text.includes('Quelltext (kein Wikipedia-Artikel):'), 'prompt without article says so');
const pOsm = core.buildPrompt(Object.assign({}, th, { osm: { x: { artist_name: 'Glyn Hughes', start_date: '2001' } } }), { article: null, level: 'kurz' }, cfg);
ok(pOsm.text.includes('Quelltext (OpenStreetMap, kein Wikipedia-Artikel):') && pOsm.text.includes('Angaben aus OpenStreetMap: Künstler: Glyn Hughes; Entstehung: 2001'), 'prompt uses OSM facts');
ok(pK.text.includes('Quelltext (Englisch, Wikipedia):'), 'prompt source label with Wikipedia');
eq(core.nameSimilarity('Manchester Cathedral', 'Manchester Cathedral'), 1, 'similarity equal');
ok(core.nameSimilarity('Musée Alexis-Forel', 'Musee Alexis Forel') === 1, 'similarity ignores accents and dashes');
ok(core.nameSimilarity('Town Hall', 'Manchester Town Hall') < 0.85, 'different names stay apart');
eq(core.tileKeys(53.4792, -2.2442, 10000, 0.1).length, 12, 'tiles for 10 km with 0.1° (3 x 4)');
const tk = core.tileKeys(53.4792, -2.2442, 1000, 0.05);
ok(tk.length === 2 && new Set(tk).size === 2 && tk.includes('53.450,-2.300') && tk.includes('53.450,-2.250'), 'v0.5: 0.05° tiles have distinct keys: ' + tk.join(' '));
const bq = core.overpassQuery('53.450,-2.250', cfg);
ok(bq.includes('(53.4500,-2.2500,53.5000,-2.2000)') && bq.includes('[timeout:25]'), 'overpass bbox from key');
// v0.5: map section
const vb = { south: 53.47, west: -2.26, north: 53.49, east: -2.23 };
const vs = core.bboxSize(vb);
ok(Math.abs(vs.w - 1985) < 30 && Math.abs(vs.h - 2224) < 30, 'bbox size ' + Math.round(vs.w) + ' x ' + Math.round(vs.h));
const vc = core.circleFor(vb);
ok(Math.abs(vc.lat - 53.48) < 1e-9 && vc.radius > 1480 && vc.radius < 1500, 'circle around bbox r=' + vc.radius);
ok(core.inBbox({ lat: 53.48, lon: -2.24 }, vb) && !core.inBbox({ lat: 53.5, lon: -2.24 }, vb), 'inBbox');
ok(core.bboxContains({ south: 53, west: -3, north: 54, east: -2 }, vb) && !core.bboxContains(vb, { south: 53, west: -3, north: 54, east: -2 }), 'bboxContains');
const cells = core.cellsFor({ south: 53.43, west: -2.32, north: 53.52, east: -2.17 }, 3000);
ok(cells.length === 16 && cells.every((c) => c.radius < 2200), 'cells 10 x 10 km -> 4 x 4 of ~2,5 km: ' + cells.length);
eq(core.sourceTag({ quellen: ['W', 'O'] }) + core.sourceTag({ quellen: ['O'] }) + core.sourceTag({ quellen: ['W'] }), 'W+OSMOSMW', 'source tags');
// OsmAnd links
const pin = { lat: 46.5110, lon: 6.4980, name: 'Test' };
eq(core.osmandWebUrl(pin), 'https://osmand.net/map?pin=46.511000,6.498000#17/46.511000/6.498000', 'osmand web url');
eq(core.osmandGoUrl(pin), 'https://osmand.net/go?lat=46.511000&lon=6.498000&z=17', 'osmand go url');
ok(core.osmandIntentUrl(pin, 'net.osmand.plus').startsWith('intent://osmand.net/map?pin=46.511000,6.498000#Intent;scheme=https;package=net.osmand.plus;S.browser_fallback_url=https%3A%2F%2Fosmand.net') &&
  core.osmandIntentUrl(pin).endsWith(';end'), 'osmand intent url');
ok(core.claudeNewUrl('a b?').startsWith('claude://claude.ai/new?q=a%20b%3F'), 'claude url');
const rv = core.buildReviewPrompt(th, cfg);
ok(rv.text.startsWith('Gib mir eine Übersicht zu dieser Sehenswürdigkeit') && rv.text.includes('Ort: Manchester Town Hall (deutsch: Rathaus Manchester)') &&
  rv.text.includes('Google Maps, Tripadvisor') && rv.text.includes('## Praktische Tipps') && rv.text.includes('Wikipedia: https://en.wikipedia.org/wiki/Manchester_Town_Hall'), 'review prompt');
ok(rv.text.includes('nicht zum Vorlesen') && rv.text.includes('Eine Tabelle mit zwei Spalten') && rv.text.includes('## Lohnt es sich?') && rv.length < 3000, 'v0.5 overview prompt: for reading, table, verdict (' + rv.length + ')');

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
eq(core.wikipediaUrl({ wikipedia: 'fr:Château de Morges', artikel: { de: 'Schloss Morges', fr: 'Château de Morges' } }), 'https://fr.m.wikipedia.org/wiki/Ch%C3%A2teau_de_Morges', 'v0.6.1: link to the longest article, not the German one');
eq(core.merkZeile(pl), "Chetham's Library – ★★★ – Manchester – https://www.google.com/maps/search/?api=1&query=Chetham's%20Library%2C%20Manchester", 'merkzeile');
eq(core.compareVersions('0.10.0', '0.9.9'), 1, 'semver compare');
eq(core.compareVersions('0.2.0', '0.2.0'), 0, 'semver equal');
eq(core.formatDistance(1234), '1,2 km', 'distance format');

// ---- full pipeline with synthetic data
const f = mockFetch(fx);
const cache = new Map();
const wdCache = { get: k => cache.get(k), set: (k, v) => cache.set(k, v) };
const osmStore = new Map();
const osmCache = { get: async (k) => osmStore.get(k), set: async (k, v) => { osmStore.set(k, v); } };
const res = await core.loadPlaces({ lat: fx.center.lat, lon: fx.center.lon, radius: 1000, cfg, fetch: f, wdCache, osmCache, langs: ['de', 'en', 'fr'], localLang: 'en' });
eq(f.calls.filter(u => u.includes('overpass')).length, 2, 'one Overpass request per tile (2 tiles of 0.05°)');
const f5 = mockFetch(fx);
await core.loadPlaces({ lat: fx.center.lat, lon: fx.center.lon, radius: 1000, cfg, fetch: f5, wdCache, osmCache, localLang: 'en' });
eq(f5.calls.filter(u => u.includes('overpass')).length, 0, 'Overpass tile cached');
const f6 = mockFetch(Object.assign({}, fx, { __overpassDown: true }));
const r6 = await core.loadPlaces({ lat: fx.center.lat, lon: fx.center.lon, radius: 1000, cfg, fetch: f6, wdCache, localLang: 'en' });
ok(f6.calls.some(u => u.includes('overpass.kumi.systems')) && r6.places.some(p => p.name === 'Alan Turing Memorial'), 'Overpass fallback server used');
// v0.4.1: a hanging Overpass server must not block the search
core._setFetchTimeout(300);
const hang = (url) => /overpass|mail\.ru/.test(url) ? new Promise(() => {}) : mockFetch(fx)(url);
const cfgFast = JSON.parse(JSON.stringify(cfg)); cfgFast.osm.max_wartezeit_s = 0.3; cfgFast.osm.version = 99; cfgFast.osm.server = ['https://overpass-api.de/api/interpreter']; // one server: the test ends quickly
const tHang = Date.now();
const r8 = await core.loadPlaces({ lat: fx.center.lat, lon: fx.center.lon, radius: 1000, cfg: cfgFast, fetch: hang, wdCache, localLang: 'en' });
ok(Date.now() - tHang < 3000 && r8.places.length >= 20 && r8.warnings.some(w => /OpenStreetMap: keine Antwort nach 0.3 s/.test(w)) && r8.stats.src.osm.state === 'timeout', 'hanging OSM: results without OSM after the waiting time');
// v0.5: "Ohne OSM weiter" button and late OSM
const ctl = {}; let late = null;
const slowOsm = (url) => /overpass/.test(url) ? new Promise((r) => setTimeout(() => r(mockFetch(fx)(url)), 400)).then((x) => x) : mockFetch(fx)(url);
const cfgSlow = JSON.parse(JSON.stringify(cfg)); cfgSlow.osm.version = 98;
const tSkip = Date.now();
const pSkip = core.loadPlaces({ lat: fx.center.lat, lon: fx.center.lon, radius: 1000, cfg: cfgSlow, fetch: slowOsm, wdCache, osmCache, localLang: 'en', control: ctl,
  onProgress: (t, ph) => { if (ph === 'osm') ctl.skipOsm(); }, onOsmLate: (i) => { late = i; } });
const r9 = await pSkip;
ok(Date.now() - tSkip < 400 && r9.stats.src.osm.state === 'skip' && !r9.places.some((p) => p.quellen.includes('O')), 'skip OSM: results at once without OSM');
await new Promise((r) => setTimeout(r, 700));
ok(late && late.ok && late.els > 0, 'OSM arrives later: onOsmLate ' + JSON.stringify(late));
const tTo = Date.now();
const toErr = await core.getJsonRetry('https://de.wikipedia.org/w/api.php?x=1', () => new Promise(() => {}), []).then(() => 'none', (e) => e.message);
eq(toErr, 'Zeitüberschreitung', 'hanging request ends by time limit (' + (Date.now() - tTo) + ' ms)');
core._setFetchTimeout(20000);
const r7 = await core.loadPlaces({ lat: fx.center.lat, lon: fx.center.lon, radius: 1000, cfg, fetch: mockFetch(fx), wdCache, localLang: 'en', osm: false });
ok(!r7.places.some(p => p.quellen.includes('O')) && r7.stats.src.osm.state === 'off', 'OSM can be switched off');
// v0.5: only places inside the map section; source stats
const rb = await core.loadPlaces({ lat: fx.center.lat, lon: fx.center.lon, radius: 1000, bbox: { south: 53.475, west: -2.25, north: 53.4835, east: -2.238 }, cfg, fetch: mockFetch(fx), wdCache, osmCache, localLang: 'en' });
ok(rb.places.length > 3 && rb.places.length < res.places.length && rb.places.every((p) => p.lat >= 53.475 && p.lat <= 53.4835 && p.lon >= -2.25 && p.lon <= -2.238), 'bbox filter: ' + rb.places.length + ' of ' + res.places.length);
// v0.6.1: while an area is prepared, a search only takes OSM tiles from the cache
const fCo = mockFetch(fx);
const rCo = await core.loadPlaces({ lat: 53.1, lon: -2.1, radius: 500, cfg, fetch: fCo, wdCache, osmCache, localLang: 'en', osmCacheOnly: true });
ok(!fCo.calls.some((u) => u.includes('overpass')) && rCo.stats.src.osm.state === 'prep', 'cache-only OSM: no Overpass request (' + rCo.stats.src.osm.state + ')');
ok(rb.stats.src.wiki.ms != null && rb.stats.src.osm.state === 'cache' && rb.stats.herkunft.w + rb.stats.herkunft.o + rb.stats.herkunft.wo === rb.places.length, 'source stats ' + JSON.stringify(rb.stats.src.osm) + ' ' + JSON.stringify(rb.stats.herkunft));
// v0.6: an area in cells: same places as one search, OSM tiles loaded once
const fA = mockFetch(fx);
const osmStoreA = new Map();
const rA = await core.loadPlaces({ lat: fx.center.lat, lon: fx.center.lon, circles: core.cellsFor({ south: 53.4702, west: -2.2592, north: 53.4882, east: -2.2292 }, 1000),
  bbox: { south: 53.4702, west: -2.2592, north: 53.4882, east: -2.2292 }, cfg, fetch: fA, wdCache, localLang: 'en', langs: ['de', 'en', 'fr'],
  osmCache: { get: async (k) => osmStoreA.get(k), set: async (k, v) => { osmStoreA.set(k, v); } } });
const ids1 = new Set(res.places.filter((p) => core.inBbox(p, { south: 53.4702, west: -2.2592, north: 53.4882, east: -2.2292 })).map((p) => p.id));
const idsA = new Set(rA.places.map((p) => p.id));
ok(ids1.size > 10 && [...ids1].every((id) => idsA.has(id)), 'area in cells finds the same places (' + idsA.size + ' / ' + ids1.size + ')');
eq(rA.places.filter((p) => p.name === 'Manchester Town Hall').length, 1, 'area: no duplicates across cells');
eq(fA.calls.filter((u) => u.includes('overpass')).length, rA.stats.osmTiles, 'area: every OSM tile once (' + rA.stats.osmTiles + ')');
// dense area: more than 500 articles -> the circle is split
const many = { query: { pages: Array.from({ length: 500 }, (_, i) => ({ pageid: 9000 + i, ns: 0, title: 'P' + i, coordinates: [{ lat: 53.48, lon: -2.24 }] })) } };
let wpCalls = 0;
const denseF = async (url) => { wpCalls++; return { ok: true, status: 200, json: async () => (wpCalls === 1 ? many : { query: { pages: [{ pageid: 1, ns: 0, title: 'Extra', coordinates: [{ lat: 53.48, lon: -2.24 }] }] } }) }; };
const dense = await core.loadWikipediaArea('en', [{ lat: 53.48, lon: -2.24, radius: 2000 }], cfg, denseF, []);
ok(wpCalls === 5 && dense.pages.length === 501, 'dense: split into 4 after 500 results (' + wpCalls + ' calls, ' + dense.pages.length + ' pages)');
const by = n => res.places.find(p => (p.artikel.en || p.artikel.de || '').includes(n) || p.name.includes(n));
eq(res.warnings.length, 0, 'no warnings: ' + res.warnings.join('; '));
// OpenStreetMap merge (PROJEKT.md v0.4)
const st4 = res.stats.osm;
ok(st4 && st4.byWikidata >= 3 && st4.byName >= 1 && st4.osmDup === 0, 'OSM merged by Wikidata and by name: ' + JSON.stringify(st4));
eq(res.places.filter(p => /^Manchester Town Hall$/.test(p.name)).length, 1, 'Town Hall appears once');
eq(res.places.filter(p => p.name === 'Manchester Cathedral').length, 1, 'Cathedral appears once (name + 150 m)');
eq(by('Town Hall').quellen.join(), 'W,O', 'Town Hall sources W and O');
eq(by('Cathedral').quellen.join(), 'W,O', 'Cathedral sources W and O');
ok(by('Town Hall').teile.quellen === 0.5, 'source bonus +0.5');
eq(res.places.filter(p => p.name.includes('John Rylands')).length, 1, 'John Rylands once (two OSM objects + W)');
const turing = by('Alan Turing Memorial');
ok(turing && turing.quellen.join() === 'O' && turing.typ === 'kunst' && turing.sterne === 1, 'OSM-only artwork: 1 star');
ok(turing.osmOnly && turing.beschreibung.includes('Glyn Hughes'), 'OSM facts as description');
eq(by('Castlefield Viewing Platform').sterne, 1, 'OSM-only viewpoint 1 star');
eq(by('Pankhurst Centre').sterne, 2, 'OSM-only museum 2 stars (museums always orange)');
eq(by('Piccadilly Gardens').sterne, 0, 'OSM-only park: no star');
ok(by('Albert Memorial').sterne <= 1, 'OSM-only memorial at most 1 star');
ok(!by('Far Away Tower'), 'OSM outside radius ignored');
const owi = by('Old Wellington Inn');
ok(owi && owi.wikidata === 'Q900040' && owi.wikipedia === 'en:Old Wellington Inn' && owi.sprachversionen === 3 && !owi.osmOnly, 'OSM with Wikidata scored via Wikidata, article from OSM tag');
eq(res.places.length, 23 + 6, 'merged count (23 W + 6 new from OSM)');
eq(f.calls.filter(u => u.includes('en.wikipedia')).length, 2, 'en continuation followed');
ok(by('Town Hall').laenge === 52000, 'length merged from continuation, longest article');
ok(!f.calls.some(u => u.includes('pageviews')), 'no pageviews requested');
eq(by('John Rylands').typ, 'bibliothek', 'John Rylands typ via class label');
eq(by('Cathedral').typ, 'kathedrale', 'Cathedral typ via class label');
eq(by('Victoria station').sterne <= 1, true, 'station without great building at most 1 star (' + by('Victoria station').score + ')');
eq(by('Arena bombing').sterne, 0, 'event no star');
eq(by('Musée Exemple').sterne, 2, 'fr-only museum gets 2 stars (museums always orange)');
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
ok(res.places.every(p => /^(W|O|W,O)$/.test(p.quellen.join()) && p.geprueft === true && typeof p.lat === 'number'), 'format 5b fields');
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

// ---- v0.7.0: map symbols
eq(core.iconFor('museum', cfg), 'museum', 'symbol museum');
eq(core.iconFor('kathedrale', cfg), 'kirche', 'symbol cathedral = church');
eq(core.iconFor('burg', cfg), 'schloss', 'symbol castle');
eq(core.iconFor('park', cfg), 'natur', 'symbol park');
eq(core.iconFor('rathaus', cfg), '', 'town hall: plain dot');
eq(core.iconFor('sonstiges', cfg), '', 'other: plain dot');

// ---- v0.7.0: city stars
{
  const tiles = core.cityTiles(core.bboxOf([49.44, 5.73, 50.19, 6.53]), 1);
  eq(tiles.map((t) => t.south + ',' + t.west).join(' '), '49,5 49,6 50,5 50,6', 'city tiles on the 1° grid (shared between countries)');
  const sp = core.splitTile({ south: 48, west: 2, north: 49, east: 3 });
  ok(sp.length === 4 && sp[3].south === 48.5 && sp[3].west === 2.5 && sp[0].north === 48.5, 'tile split into four');
  const q = core.citySparql({ south: 48, west: 2, north: 49, east: 3 }, cfg);
  ok(q.includes('cornerSouthWest "Point(2 48)"') && q.includes('cornerNorthEast "Point(3 49)"') && q.includes('FILTER(?s >= 12)') && q.includes('psn:P2046'), 'SPARQL box query');
  const rows = core.parseCityRows({ results: { bindings: [
    { item: { value: 'http://www.wikidata.org/entity/Q90' }, coord: { value: 'Point(2.3514 48.8575)' }, sl: { value: '366' }, pop: { value: '2103778' },
      area: { value: '105400000' }, cls: { value: 'national capital|metropolis' }, p31: { value: 'Q5119|Q200250' }, land: { value: 'Q142' }, de: { value: 'Paris' }, cap: { value: 'x' } },
    { item: { value: 'http://www.wikidata.org/entity/Q1' }, coord: { value: 'Point(1 2)' }, sl: { value: '20' } }] } });
  ok(rows.length === 1 && rows[0].q === 'Q90' && rows[0].lat === 48.8575 && rows[0].km2 === 105.4 && rows[0].cap && rows[0].cls.length === 2, 'parse SPARQL rows (items without name dropped)');
  const it = (q, name, lat, lon, sl, cls, o = {}) => ({ q, name, name_en: name, lat, lon, sl, pop: o.pop || 0, km2: o.km2 || 0, p31: o.p31 || [], cls, h: o.h || [], land: o.land || ['Q142'], u: !!o.u, cap: !!o.cap, desc: '' });
  ok(core.isCityItem(it('Q90', 'Paris', 0, 0, 1, ['commune of France'], { pop: 2e6 }), cfg), 'commune is a city');
  ok(!core.isCityItem(it('Q133132', 'Pariser Kommune', 0, 0, 1, ['insurgency', 'commune']), cfg), 'Paris Commune (insurgency) is no city');
  ok(!core.isCityItem(it('Q2', 'X', 0, 0, 1, ['commune']), cfg), 'bare "commune" without population is no city');
  ok(!core.isCityItem(it('Q3', 'Hauts-de-Seine', 0, 0, 1, ['department of France'], { pop: 1e6 }), cfg), 'department is no city');
  ok(!core.isCityItem(it('Q1', 'Metropolitanstadt Rom', 0, 0, 1, ['metropolitan city of Italy'], { pop: 4e6 }), cfg), 'metropolitan city (administration) is no city');
  ok(core.isCityItem(it('Q220', 'Rom', 0, 0, 1, ['comune of Italy', 'big city', 'capital city'], { pop: 2.7e6 }), cfg), 'Rome is a city');
  ok(core.isCityItem(it('Q10690', 'Cardiff', 0, 0, 1, ['city', 'principal area of Wales', 'county borough'], { pop: 3e5 }), cfg), 'Cardiff: city although also county borough');
  ok(!core.isCityItem(it('Q2', 'Wrexham County Borough', 0, 0, 1, ['principal area of Wales', 'county borough', 'municipality'], { pop: 1e5 }), cfg), 'county borough is no city');
  ok(core.isCityItem(it('Q18125', 'Manchester', 0, 0, 1, ['unparished area', 'city status in the United Kingdom', 'civil parish'], { pop: 547627 }), cfg), 'Manchester (city status) is a city');
  {
    const lyon = core.computeCities([
      it('Q1', 'Métropole de Lyon', 45.76, 4.84, 90, ['metropolis'], { pop: 1.4e6, km2: 534 }),
      it('Q456', 'Lyon', 45.7578, 4.832, 197, ['commune of France', 'big city'], { pop: 519127, km2: 47.9 }),
      it('Q5', 'Fourvière', 45.7622, 4.8226, 40, ['basilica'], { p31: ['Q163687'] })], cfg, { code: 'FR', qid: 'Q142', bbox: core.bboxOf([41, -5, 51, 9]) });
    const cc = core.computeCities([
      it('Q6582', 'Carcassonne', 43.2128, 2.3537, 107, ['commune of France'], { pop: 46080, km2: 65 }),
      it('Q389269', 'Cité von Carcassonne', 43.2063, 2.3634, 38, ['citadel', 'fortress', 'fortified town'], { km2: 13.6, u: true })], cfg, { code: 'FR', qid: 'Q142', bbox: core.bboxOf([41, -5, 51, 9]) });
    ok(cc.staedte.length === 1 && cc.staedte[0].top[0][0] === 'Cité von Carcassonne' && core.cityStars(cc.staedte[0], cfg) === 2, 'fortified town without inhabitants counts as sight of Carcassonne: ' + JSON.stringify(cc.staedte[0] && cc.staedte[0].top));
    ok(lyon.staedte.length === 1 && lyon.staedte[0].name === 'Lyon' && lyon.staedte[0].q === 'Q456', 'merged: the better-known item names the city: ' + JSON.stringify(lyon.staedte.map((c) => c.name)));
  }
  ok(core.isCityItem(it('Q1726', 'München', 0, 0, 1, ['urban district of Germany', 'big city', 'municipality of Germany'], { pop: 1.5e6 }), cfg), 'Munich (urban district) is a city');
  const bam = core.sightScore(it('Q3', 'Altstadt Bamberg', 0, 0, 50, ['historic district', 'old town'], { h: ['Q9259'] }), cfg);
  ok(bam && bam.typ === 'welterbe' && bam.score > 10, 'UNESCO old town counts although "district": ' + JSON.stringify(bam));
  eq(Math.round(core.cityRadius(2e6, cfg, 105.4)), 6371, 'radius from area (Paris)');
  eq(Math.round(core.cityRadius(1e5, cfg, 0)), 4500, 'radius from population without area');
  eq(Math.round(core.cityRadius(1e5, cfg, 2000)), 12000, 'radius capped at max');
  eq(core.sightScore(it('Q150', 'Französisch', 0, 0, 353, ['natural language', 'language']), cfg), null, 'a language is no sight');
  eq(core.sightScore(it('Q4', 'Olympische Spiele', 0, 0, 118, ['Summer Olympic Games edition']), cfg), null, 'an event is no sight');
  eq(core.sightScore(it('Q5', 'Flughafen', 0, 0, 64, ['international airport']), cfg), null, 'an airport is no sight');
  ok(core.sightScore(it('Q64436', 'Triumphbogen', 0, 0, 86, ['triumphal arch']), cfg).score > 5, 'triumphal arch counts (extra word list)');
  const louvre = core.sightScore(it('Q19675', 'Louvre', 0, 0, 170, ['art museum'], { p31: ['Q207694'] }), cfg);
  ok(louvre.typ === 'museum' && louvre.score === 9.7 && !louvre.natur, 'Louvre: museum 9.7');
  ok(core.sightScore(it('Q1374', 'Matterhorn', 0, 0, 100, ['mountain'], { p31: ['Q8502'] }), cfg).natur, 'mountain is nature');
  const items = [
    it('Q90', 'Paris', 48.8575, 2.3514, 366, ['national capital', 'metropolis'], { pop: 2103778, km2: 105.4, cap: true }),
    it('Q161741', '1. Arrondissement', 48.8625, 2.3364, 65, ['municipal arrondissement of France', 'city district'], { pop: 15114 }),
    it('Q999', 'Paris (Gemeinde-Eintrag)', 48.86, 2.35, 50, ['commune of France'], { pop: 2000000 }),
    it('Q172455', 'Boulogne-Billancourt', 48.8353, 2.2411, 98, ['big city', 'commune of France'], { pop: 119019, km2: 6.17 }),
    it('Q19675', 'Louvre', 48.8611, 2.3358, 170, ['art museum'], { p31: ['Q207694'] }),
    it('Q2981', 'Notre-Dame', 48.853, 2.3499, 125, ['Catholic cathedral'], { p31: ['Q2977'], u: true }),
    it('Q243', 'Eiffelturm', 48.8584, 2.2945, 191, ['observation tower']),
    it('Q20', 'Jardin des Serres', 48.846, 2.252, 60, ['botanical garden']),
    it('Q2946', 'Schloss Versailles', 48.8049, 2.1204, 109, ['château', 'royal palace'], { p31: ['Q751876'], u: true }),
    it('Q21', 'Mont Test', 48.5, 2.6, 100, ['mountain'], { p31: ['Q8502'] }),
    it('Q22', 'Brüsseler Platz', 50.85, 4.35, 60, ['square'], { land: ['Q31'] })
  ];
  const res = core.computeCities(items, cfg, { code: 'FR', qid: 'Q142', bbox: core.bboxOf([41.33, -5.15, 51.09, 9.56]) });
  const byName = Object.fromEntries(res.staedte.map((c) => [c.name, c]));
  ok(byName.Paris && !byName['1. Arrondissement'] && !byName['Paris (Gemeinde-Eintrag)'], 'one marker for Paris (arrondissement and duplicate merged/excluded)');
  ok(byName.Paris.n === 3 && byName.Paris.unesco && byName.Paris.top[0][0] === 'Notre-Dame', 'Paris gets Louvre, Notre-Dame, Eiffel tower: ' + JSON.stringify(byName.Paris.top));
  ok(byName['Boulogne-Billancourt'].score === 5.4, 'one sight only: no language-version bonus: ' + byName['Boulogne-Billancourt'].score);
  ok(byName['Boulogne-Billancourt'] && byName['Boulogne-Billancourt'].n === 1, 'garden next to Boulogne (small radius from area) goes to Boulogne');
  eq(byName.Paris.score, Math.round((9.7 + 12.3 + 7.8 + 3 + 1 + 36.6) * 10) / 10, 'Paris score = sum of sights + UNESCO + capital + 0.1 × language versions');
  ok(res.orte.some((o) => o.name === 'Schloss Versailles') && res.orte.some((o) => o.name === 'Mont Test'), 'castle outside cities and mountain are excursions: ' + res.orte.map((o) => o.name).join(', '));
  ok(!res.orte.some((o) => o.name === 'Brüsseler Platz'), 'excursions only of the own country');
  eq(core.cityStars(byName.Paris, cfg), 3, 'Paris ★★★ via Notre-Dame (UNESCO, 12.3) although the sample sum is only 33.8');
  eq(core.cityStars({ score: 34.8, top: [['x', 0, 0, 9]] }, cfg), 2, 'sum 34.8 alone: ★★');
  eq(core.cityStars({ score: 15, top: [['Schloss', 0, 0, 12.1]] }, cfg), 3, 'one world-famous sight gives ★★★');
  eq(core.cityStars({ score: 5, top: [['Burg', 0, 0, 7.2]] }, cfg), 1, 'one good castle gives ★');
  eq(core.cityStars(5, cfg), 0, 'low score: no star');
  eq(core.ortStars(9.5, cfg) + '' + core.ortStars(7.6, cfg) + core.ortStars(6.6, cfg), '321', 'excursion stars');
  ok(core.cityWikiUrl('Q90') === 'https://www.wikidata.org/wiki/Special:GoToLinkedPage/dewiki/Q90', 'city Wikipedia link');

  // loading: a tile that times out is split, a 400 is a query error, the cache is used
  const cfgT = JSON.parse(JSON.stringify(cfg)); cfgT.staedte.pause_ms = 0;
  let calls = 0;
  const fSplit = async (url) => {
    calls++;
    const qq = decodeURIComponent(url.split('query=')[1]);
    const m = /Point\(([-\d.]+) ([-\d.]+)\)"\^\^geo:wktLiteral; wikibase:cornerNorthEast "Point\(([-\d.]+) ([-\d.]+)\)/.exec(qq);
    if (+m[3] - +m[1] > 0.9) return { ok: false, status: 504, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ results: { bindings: [{ item: { value: 'x/Q' + m[1] + '_' + m[2] }, coord: { value: 'Point(' + m[1] + ' ' + m[2] + ')' }, sl: { value: '20' }, de: { value: 'T' } }] } }) };
  };
  const cache = new Map();
  const lr = await core.loadCityTiles([{ south: 48, west: 2, north: 49, east: 3 }], cfgT, fSplit, { cache });
  ok(lr.splits === 1 && lr.items.length === 4 && lr.failed.length === 0 && calls === 5, 'timeout → tile split into 4: ' + JSON.stringify({ s: lr.splits, n: lr.items.length, calls }));
  const lr2 = await core.loadCityTiles(core.splitTile({ south: 48, west: 2, north: 49, east: 3 }), cfgT, fSplit, { cache });
  ok(lr2.queries === 0 && lr2.items.length === 4, 'tiles from the shared cache');
  const lr3 = await core.loadCityTiles([{ south: 48, west: 2, north: 48.5, east: 2.5 }], cfgT, async () => ({ ok: false, status: 400, json: async () => ({}) }), {});
  ok(lr3.failed.length === 1 && lr3.splits === 0, 'query error (400): not split, reported');
  const ctl = { cancelled: true };
  const lr4 = await core.loadCityTiles(core.cityTiles(core.bboxOf([47, 5, 55, 15]), 1), cfgT, fSplit, { control: ctl });
  ok(lr4.queries === 0, 'cancel stops before the next tile');
}

// ---- v0.7.2: leisure parks and zoos
eq(core.classify([], ['amusement park'], [''], ['Fort Fun Abenteuerland'], cfg), 'freizeit', 'amusement park is a leisure park');
eq(core.classify([], ['zoo'], [''], ['Zoo Zürich'], cfg), 'freizeit', 'zoo');
eq(core.classify([], ['park'], [''], ['Stadtpark'], cfg), 'park', 'plain park stays park');
eq(core.classify([], ['car park'], [''], ['P1'], cfg), 'parkplatz', 'car park stays car park');

// ---- v0.8: directory
{
  const dc = core.directoryConfig(cfg);
  ok(dc.staedte.min_sprachversionen === 1 && cfg.staedte.min_sprachversionen === 12, 'directory config overrides a copy only');
  ok(!core.citySparql({ south: 0, west: 0, north: 0.25, east: 0.25 }, dc).includes('schema:about'), 'directory tile query without title joins');
  eq(core.directoryTiles(core.bboxOf([46.6, 6.2, 46.7, 6.3]), cfg).map(core.tileKey).join(' '), '46.5,6,46.75,6.25 46.5,6.25,46.75,6.5', 'directory tiles 0.25°');
  const it = (q, name, lat, lon, sl, cls, o = {}) => ({ q, name, name_en: name, lat, lon, sl, pop: o.pop || 0, km2: o.km2 || 0, p31: o.p31 || [], cls, h: [], land: ['Q39'], u: !!o.u, cap: false, desc: '' });
  const B = (x) => ({ item: { value: 'http://www.wikidata.org/entity/' + x.q }, coord: { value: 'Point(' + x.lon + ' ' + x.lat + ')' }, sl: { value: String(x.sl) }, de: { value: x.name }, en: { value: x.name },
    cls: { value: x.cls.join('|') }, p31: { value: x.p31.join('|') }, land: { value: 'Q39' }, ...(x.pop ? { pop: { value: String(x.pop) } } : {}) });
  const raw = [
    it('Q1', 'Le Chenit', 46.6, 6.23, 30, ['municipality of Switzerland'], { pop: 4500 }),
    it('Q2', 'Audemars Piguet Museum', 46.57, 6.22, 3, ['museum'], { p31: ['Q33506'] }),
    it('Q3', 'Espace Horloger', 46.61, 6.24, 1, ['museum'], { p31: ['Q33506'] }),
    it('Q4', 'Bahnhof Le Brassus', 46.58, 6.21, 3, ['railway station'], { p31: ['Q55488'] }),
    it('Q5', 'Fort Fun Abenteuerland', 46.62, 6.3, 4, ['amusement park']),
    it('Q6', 'Le Brassus', 46.58, 6.21, 20, ['village'], { pop: 600 })
  ];
  const calls = [];
  const fD = async (url) => {
    calls.push(url.replace(/\?.*/, '') + (url.includes('wbgetentities') ? ' wb' : url.includes('pageviews') ? ' pv' : ''));
    if (url.includes('query.wikidata.org')) return { ok: true, status: 200, json: async () => ({ results: { bindings: raw.map(B) } }) };
    if (url.includes('wbgetentities')) {
      const ids = new URL(url).searchParams.get('ids').split('|');
      return { ok: true, status: 200, json: async () => ({ entities: Object.fromEntries(ids.map((id) => [id, { id, sitelinks: { dewiki: { title: raw.find((x) => x.q === id).name } } }])) }) };
    }
    const titles = new URL(url).searchParams.get('titles').split('|');
    return { ok: true, status: 200, json: async () => ({ query: { pages: titles.map((t) => ({ title: t, pageviews: { d: /Fort Fun/.test(t) ? 3000 : 30 } })) } }) };
  };
  const dc0 = JSON.parse(JSON.stringify(dc)); dc0.staedte.pause_ms = 0;
  const tile = await core.prepareDirectoryTile({ south: 46.5, west: 6.0, north: 46.75, east: 6.25 }, dc0, fD);
  const byQ = Object.fromEntries(tile.items.map((x) => [x.q, x]));
  ok(tile.roh === 6 && !byQ.Q4 && !byQ.Q6 && byQ.Q1._c && byQ.Q2._s.typ === 'museum', 'tile keeps towns from 1000 inhabitants and sights only: ' + tile.items.map((x) => x.name).join(', '));
  ok(byQ.Q5._s.typ === 'freizeit' && byQ.Q5.pv === 100, 'leisure park gets page views (excursion candidate): ' + JSON.stringify(byQ.Q5));
  ok(calls.filter((c) => / wb$/.test(c)).length === 1 && calls.filter((c) => / pv$/.test(c)).length >= 1, 'one sitelinks request, page views per language');
  const stored = JSON.parse(JSON.stringify(tile.items));
  const res = core.computeDirectory(tile.items, dc0, null, { copy: true });
  ok(JSON.stringify(tile.items) === JSON.stringify(stored), 'computeDirectory with copy leaves the stored items as they are');
  const fort = res.orte.find((o) => o.name === 'Fort Fun Abenteuerland');
  ok(fort && fort.st >= 1 && fort.z === dc.verzeichnis.zoom.region, 'Fort Fun as excursion from region zoom: ' + JSON.stringify(fort));
  ok(res.orte.some((o) => o.name === 'Audemars Piguet Museum' && o.z === dc.verzeichnis.zoom.nah), 'local museum from zoom 12: ' + JSON.stringify(res.orte.map((o) => [o.name, o.score, o.st, o.z])));
  const town = res.staedte.find((c) => c.name === 'Le Chenit');
  ok(town && town.st === 0, 'town without much to see: no star (min_sehen): ' + JSON.stringify(town && { s: town.score, see: town.sehen }));
  ok(town.top[0].length === 4, 'top sights with position (as in the country files)');
}

// ---- v0.8.4: the more important Wikidata type wins; page views for well-known sights with few points
eq(core.classify(['Q7075'], ['library', 'art museum'], [''], ['ZKM'], cfg), 'museum', 'library + art museum → museum (ZKM)');
eq(core.classify(['Q16970'], ['church building', 'cathedral'], [''], ['Dom'], cfg), 'kathedrale', 'church + cathedral → cathedral');
eq(core.classify(['Q4830453'], ['company', 'museum'], [''], ['Firma X'], cfg), 'firma', 'a company stays a company (exclusion wins)');
{
  const dc = core.directoryConfig(cfg);
  const mk = (q, sl, cls, p31) => ({ q, name: q, name_en: q, lat: 49, lon: 8.4, sl, pop: 0, km2: 0, p31: p31 || [], cls, h: [], land: [], u: false, cap: false, desc: '' });
  const items = [mk('Qzkm', 13, ['bridge']), mk('Qsmall', 2, ['bridge'])];
  const c = core.directoryCandidates(items, dc, dc.verzeichnis.kachel_aufrufe);
  ok(c.some((x) => x.q === 'Qzkm') && !c.some((x) => x.q === 'Qsmall'), 'page views for a sight with 10+ languages even below 5 points: ' + c.map((x) => x.q).join(','));
}

// ---- v0.9: route corridor
{
  const morges = { lat: 46.511, lon: 6.498 }, genf = { lat: 46.204, lon: 6.143 }, lyon = { lat: 45.764, lon: 4.836 };
  const len = core.lineLength([morges, genf]);
  ok(len > 40 && len < 46, 'Morges → Genf straight line about 43 km: ' + len.toFixed(1));
  const mid = { lat: (morges.lat + genf.lat) / 2, lon: (morges.lon + genf.lon) / 2 };
  const r = core.lineDistance(mid, [morges, genf]);
  ok(r.d < 0.3 && Math.abs(r.along - len / 2) < 1, 'point in the middle: on the line, half way: ' + JSON.stringify(r));
  const off = core.lineDistance({ lat: mid.lat + 0.05, lon: mid.lon - 0.05 }, [morges, genf]);
  ok(off.d > 3 && off.d < 9, 'point beside the line: some km away: ' + off.d.toFixed(1));
  for (const m of ['auto', 'fahrrad', 'fuss']) {
    const w = core.corridorWidths(m, cfg);
    ok(w[3] >= w[2] && w[2] >= w[1] && w[1] >= w[0], 'widths monotone for ' + m + ': ' + JSON.stringify(w));
  }
  eq(JSON.stringify(core.corridorWidths('fahrrad', cfg)), JSON.stringify({ 3: 8, 2: 3, 1: 1, 0: 0.5 }), 'bike widths from PROJEKT.md 6b');
  const tl = core.corridorTiles([morges, lyon], 'auto', cfg);
  ok(tl.length > 10 && tl.length <= cfg.korridor.max_kacheln, 'Morges → Lyon by car: tiles along the line: ' + tl.length);
  const tb = core.corridorTiles([morges, genf], 'fahrrad', cfg);
  ok(tb.length >= 2 && tb.length < 12, 'Morges → Genf by bike: few tiles: ' + tb.length);
  // positions at a share of the line, moved north by some km (1 km ≈ 0.009°)
  const at = (t, km) => ({ lat: morges.lat + (genf.lat - morges.lat) * t + km * 0.009, lon: morges.lon + (genf.lon - morges.lon) * t });
  const res = { staedte: [{ name: 'Rolle', q: 'Q1', ...at(0.3, 2), st: 2 }, { name: 'Ohne', q: 'Q9', ...at(0.4, 0.1), st: 0 }],
    orte: [
      { name: 'Schloss Prangins', q: 'Q2', ...at(0.6, 0.8), st: 1 },        // ★ within 1 km
      { name: 'Kleine Kapelle', q: 'Q3', ...at(0.5, 1.5), st: 0 },          // no star, 1,5 km off: not by bike (0,5 km)
      { name: 'Château de Joux', q: 'Q4', ...at(0.5, 30), st: 2 },          // far away
      { name: 'Genf Kathedrale', q: 'Q5', ...at(0.98, 0.2), st: 3 }] };
  const pick = core.corridorPick(res, [morges, genf], 'fahrrad', cfg);
  const names = pick.map((p) => p.x.name);
  ok(names.join(',') === 'Rolle,Schloss Prangins,Genf Kathedrale', 'bike corridor: in order along the route, widths by stars: ' + names.join(','));
  ok(pick.every((p, i) => i === 0 || p.along >= pick[i - 1].along) && pick.every((p) => p.d <= core.corridorWidths('fahrrad', cfg)[p.s]), 'sorted by km from start, all within their width');
  ok(Math.abs(pick[0].umweg - 2 * pick[0].d) <= 0.11, 'detour = there and back');
  // v0.9.2: the longer the route, the more important the stops
  const pb = core.routePlan([morges, genf], 'fahrrad', cfg), pc = core.routePlan([morges, lyon], 'auto', cfg), pw = core.routePlan([morges, { lat: 46.515, lon: 6.53 }], 'fuss', cfg);
  ok(pb.minStars === 2 && pb.maxStops === 5 && pb.hours > 2 && pb.hours < 3, 'bike Morges → Genf (~2,4 h): from ★★, 5 stops: ' + JSON.stringify({ h: pb.hours, s: pb.minStars, n: pb.maxStops }));
  ok(pc.minStars === 2 && pc.maxStops === 4 && pc.tiles.length < 12 && pc.deg === 1, 'car Morges → Lyon (~1,9 h): from ★★, 4 stops, few big tiles: ' + JSON.stringify({ h: pc.hours, s: pc.minStars, n: pc.maxStops, t: pc.tiles.length }));
  ok(pw.minStars === 1 && pw.maxStops === 3 && pw.rcfg.staedte.min_sprachversionen === 4, 'short walk: from ★, at least 3 stops, light query: ' + JSON.stringify({ h: pw.hours, s: pw.minStars, n: pw.maxStops }));
  ok(core.routePlan([morges, { lat: 43.3, lon: 5.37 }], 'auto', cfg).minStars === 3, 'long drive (> 3 h): only ★★★');
  const pk = core.corridorPick(res, [morges, genf], 'fahrrad', cfg, { minStars: 2, maxStops: 1 });
  ok(pk.length === 1 && pk[0].x.name === 'Genf Kathedrale', 'plan: only ★★ and more, best first, at most maxStops: ' + pk.map((p) => p.x.name).join(','));
  // behind the start: Chillon-like ★★★ 30 km the other way is not on the way; a town just behind the start still is
  const lyonPts = [morges, lyon];
  const back = core.corridorPick({ staedte: [{ name: 'Nah', q: 'Qa', lat: 46.55, lon: 6.62, st: 3 }], orte: [{ name: 'Weit', q: 'Qb', lat: 46.414, lon: 6.927, st: 3 }] }, lyonPts, 'auto', cfg);
  ok(back.map((p) => p.x.name).join(',') === 'Nah', 'behind the start only within the width of one star less: ' + back.map((p) => p.x.name + ' ' + p.d).join(','));
}

// ---- v0.9.3: labels in two lines, ordinal numbers, OSM only for small sections, small directory items only very close
{
  const L = (n) => JSON.stringify(core.mapLabel(n, 'Ingolstadt', 16, 2));
  eq(L('Deutsches Medizinhistorisches Museum'), '["Medizinhistorisches","Museum"]', 'two lines, "Deutsches" dropped');
  eq(L('Bayerisches Armeemuseum'), '["Armeemuseum"]', 'compound of a type word is enough');
  eq(L('Deutsches Museum'), '["Deutsches Museum"]', '"Deutsches Museum" stays');
  eq(L('Deutsches Eck'), '["Deutsches Eck"]', '"Deutsches Eck" stays');
  eq(L('St. Matthäus (Ingolstadt)'), '["St. Matthäus"]', 'bracket at the end dropped');
  ok(core.mapLabel('Münster Zur Schönen Unserer Lieben Frau', '', 16, 2).length === 2 && /…$/.test(core.mapLabel('Münster Zur Schönen Unserer Lieben Frau', '', 16, 2)[1]), 'too long: two lines, then …');
  eq(core.firstSentence('Die Moschee wurde in der Manisa Straße am 18. Oktober 2009 eröffnet. Sie ist groß.'),
    'Die Moschee wurde in der Manisa Straße am 18. Oktober 2009 eröffnet.', 'ordinal "18. Oktober" is no sentence end');
  eq(core.firstSentence('Das Haus wurde 2009 gebaut. Danach mehr.'), 'Das Haus wurde 2009 gebaut.', 'normal sentence end still works');
  // v0.10.0: the list short info has the same rule; Wikipedia no longer cuts the intro after 3 "sentences"
  eq(core.shortInfo('Das Museum Reinhard Ernst, abgekürzt mre, ist ein Museum für abstrakte Kunst. Es wurde am 23. Juni 2024 eröffnet. Es zeigt viel.'),
    'Das Museum Reinhard Ernst, abgekürzt mre, ist ein Museum für abstrakte Kunst. Es wurde am 23. Juni 2024 eröffnet.', 'short info: "am 23. Juni" is no sentence end');
  ok(!/exsentences/.test(fs.readFileSync(path.join(ROOT, 'docs/core.js'), 'utf8').replace(/\/\/.*$/gm, '')), 'no exsentences in Wikipedia requests (Wikipedia ended at "am 23.")');
  // v0.11.0: prepared OSM files before Overpass
  {
    const fcalls = [];
    const fF = async (u) => { fcalls.push(u); if (/overpass|kumi|mail\.ru/.test(u)) throw new Error('should not ask OSM');
      if (/list=geosearch/.test(u)) return { ok: true, json: async () => ({ query: { geosearch: [] } }) };
      return { ok: true, json: async () => ({ entities: {}, query: { pages: {} } }) }; };
    const bF = { south: 46.505, north: 46.545, west: 6.605, east: 6.655 };
    core.setOsmStatic((key) => ({ stand: '2026-11-04', load: () => Promise.resolve(key === '46.500,6.600' ? [{ id: 'node/1', lat: 46.52, lon: 6.63, name: 'Musée Datei', names: {}, wd: '', wp: '', k: 'tourism=museum', x: {} }] : []) }));
    const cF = core.circleFor(bF);
    const rF = await core.loadPlaces({ lat: cF.lat, lon: cF.lon, radius: cF.radius, bbox: bF, cfg, fetch: fF, langs: ['de'] });
    ok(!fcalls.some((u) => /overpass/.test(u)) && rF.places.some((p) => p.name === 'Musée Datei') && rF.stats.src.osm.state === 'ok', 'OSM from files: no Overpass, place found: ' + rF.stats.src.osm.state);
    const bBig = { south: 46.40, north: 46.60, west: 6.50, east: 6.64 };
    const cB = core.circleFor(bBig);
    const rBig = await core.loadPlaces({ lat: cB.lat, lon: cB.lon, radius: cB.radius, bbox: bBig, cfg, fetch: fF, langs: ['de'] });
    ok(rBig.stats.src.osm.state !== 'gross', 'file tiles do not count against max_kacheln: ' + rBig.stats.src.osm.state);
    core.setOsmStatic(null);
  }
  // v0.9.4: descriptions instead of names (monument lists)
  eq(core.displayName('Bodendenkmal in Geisenfeld, #D-1-7336-0006'), 'Bodendenkmal Geisenfeld', 'monument number never shown');
  eq(core.displayName('Pfarrhof, um einen geschlossenen Hof geordnete Anlage'), 'Pfarrhof', 'description after the comma dropped');
  eq(core.displayName('Ehemalige Klosterkirche, jetzt katholische Filialkirche St. Antonius'), 'Ehemalige Klosterkirche', 'long title shortened');
  eq(core.displayName('Kloster Ettal, Benediktinerabtei'), 'Kloster Ettal, Benediktinerabtei', 'capital after the comma is part of the name');
  eq(core.displayName('Köln, Dom'), 'Köln, Dom', 'short names stay');
  ok(core.isDescriptiveName('Bodendenkmal in Rohrbach (Ilm), #D-1-7335-0110') && !core.isDescriptiveName('Neues Schloss'), 'descriptive names recognised');
  eq(JSON.stringify(core.mapLabel('Bodendenkmal in Geisenfeld, #D-1-7336-0006', '', 16, 2)), '["Bodendenkmal","Geisenfeld"]', 'map label without number');
  {
    const dcx = core.directoryConfig(cfg);
    const its = [{ q: 'Qa', name: 'Pfarrhof, um einen geschlossenen Hof geordnete Anlage', lat: 48.7, lon: 11.4, sl: 3, land: [], _c: false, _s: { score: 5.5, typ: 'denkmal' } },
      { q: 'Qb', name: 'Burg Marching', lat: 48.71, lon: 11.4, sl: 3, land: [], _c: false, _s: { score: 5.5, typ: 'burg' } }];
    const rr = core.computeDirectory(its, dcx, null, { copy: true });
    ok(rr.orte.find((o) => o.q === 'Qa').low && !rr.orte.find((o) => o.q === 'Qb').low, 'descriptive monument names only from zoom.alle');
  }
  const b13 = { south: 48.725, north: 48.795, west: 11.365, east: 11.435 }, b12 = { south: 48.66, north: 48.86, west: 11.33, east: 11.47 };
  const k13 = core.osmTileKeys([core.circleFor(b13)], cfg, b13), k13c = core.osmTileKeys([core.circleFor(b13)], cfg);
  ok(k13.length <= cfg.osm.max_kacheln && k13.length < k13c.length, 'zoom-13 section: OSM tiles only where the section is (' + k13.length + ' instead of ' + k13c.length + ')');
  ok(core.osmTileKeys([core.circleFor(b12)], cfg, b12).length > cfg.osm.max_kacheln, 'zoom-12 section: too many OSM tiles');
  const calls = [];
  const fO = async (u) => { calls.push(u); if (/overpass|kumi|mail\.ru/.test(u)) throw new Error('should not ask OSM');
    if (/list=geosearch/.test(u)) return { ok: true, json: async () => ({ query: { geosearch: [] } }) };
    return { ok: true, json: async () => ({ entities: {}, query: { pages: {} } }) }; };
  const c = core.circleFor(b12);
  const rB = await core.loadPlaces({ lat: c.lat, lon: c.lon, radius: c.radius, bbox: b12, cfg, fetch: fO, langs: ['de'] }).catch((e) => ({ err: e.message }));
  ok(!calls.some((u) => /overpass/.test(u)) && (rB.err || rB.stats.src.osm.state === 'gross'), 'big section: no OSM request, state "gross": ' + (rB.err || rB.stats.src.osm.state));
  const dc = core.directoryConfig(cfg);
  const items = [{ q: 'Qm', name: 'Museum des Ersten Weltkriegs', lat: 48.759, lon: 11.427, sl: 1, land: [], _c: false, _s: { score: 3.6, typ: 'museum' } },
    { q: 'Qn', name: 'Neues Schloss', lat: 48.764, lon: 11.428, sl: 6, land: [], _c: false, _s: { score: 7.5, typ: 'burg' } }];
  const r = core.computeDirectory(items, dc, null, { copy: true });
  const m = r.orte.find((o) => o.q === 'Qm');
  ok(m && m.low && m.z === dc.verzeichnis.zoom.alle && !r.orte.find((o) => o.q === 'Qn').low, 'below nah_ab: kept, but only from zoom.alle: ' + JSON.stringify(m));
  ok(!core.corridorPick(r, [{ lat: 48.7, lon: 11.4 }, { lat: 48.8, lon: 11.45 }], 'fuss', cfg).some((p) => p.x.q === 'Qm'), 'small ones are no route stops');
}

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
