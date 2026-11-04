// UI test with Playwright and mocked APIs (synthetic fixture). Run: node tools/ui-test.mjs [screenshotDir]
// Needs Playwright with Chromium (pre-installed in Claude Code cloud sessions). Not needed for the app itself.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs');
const OUT = process.argv[2] || null;
const fx = JSON.parse(fs.readFileSync(path.join(DOCS, 'testdata/manchester-synthetisch.json'), 'utf8'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN49+7dfwAJbAPYqH3VQgAAAABJRU5ErkJggg==', 'base64');

// v0.7.0 synthetic city data (not real scores)
const CITIES_GB = { land: 'GB', stand: Date.parse('2026-11-03'), fehler: [], orte: [
  { name: 'Peak District', q: 'Q1', lat: 53.35, lon: -1.8, score: 9.5, typ: 'natur' }], staedte: [
  { name: 'Manchester', q: 'Q18125', lat: 53.4794, lon: -2.2453, score: 70, pop: 550000, n: 40, top: [['Manchester Town Hall', 53.4794, -2.2446, 9.1], ['Manchester Cathedral', 53.4851, -2.2446, 8.5], ['John Rylands Library', 53.4804, -2.2484, 8.4]] },
  { name: 'Liverpool', q: 'Q24826', lat: 53.4084, lon: -2.9916, score: 35, pop: 490000, n: 30, top: [['Royal Liver Building', 53.4058, -2.9958, 8]] },
  { name: 'Chester', q: 'Q170263', lat: 53.19, lon: -2.89, score: 20, pop: 80000, n: 8, top: [['Chester Cathedral', 53.1923, -2.8906, 8]] },
  { name: 'Stockport', q: 'Q2', lat: 53.4083, lon: -2.1494, score: 6, pop: 100000, n: 2, top: [['Stockport Viaduct', 53.4096, -2.1625, 5]] }] };
const B = (q, name, lon, lat, o) => ({ item: { value: 'http://www.wikidata.org/entity/' + q }, coord: { value: 'Point(' + lon + ' ' + lat + ')' },
  sl: { value: String(o.sl) }, de: { value: name }, en: { value: name }, p31: { value: o.p31 || '' }, cls: { value: o.cls }, land: { value: 'Q32' },
  ...(o.pop ? { pop: { value: String(o.pop) } } : {}), ...(o.km2 ? { area: { value: String(o.km2 * 1e6) } } : {}),
  ...(o.u ? { unesco: { value: 'x' } } : {}), ...(o.h ? { her: { value: o.h } } : {}), ...(o.cap ? { cap: { value: 'http://www.wikidata.org/entity/Q32' } } : {}) });
const SPARQL_LU = [
  B('Q1842', 'Luxemburg', 6.1319, 49.6116, { sl: 200, pop: 134000, km2: 51, cls: 'city|capital', p31: 'Q515', cap: 1 }),
  B('Q10', 'Altstadt Luxemburg', 6.133, 49.611, { sl: 60, cls: 'World Heritage Site', p31: 'Q9259', u: 1 }),
  B('Q11', 'Kathedrale Unserer Lieben Frau', 6.1307, 49.6097, { sl: 40, cls: 'cathedral', p31: 'Q2977' }),
  B('Q12', 'Großherzoglicher Palast', 6.1335, 49.6113, { sl: 45, cls: 'palace', p31: 'Q16560' }),
  B('Q13', 'Burg Vianden', 6.2015, 49.9353, { sl: 45, cls: 'castle', p31: 'Q23413', h: 'Q1' }),
  B('Q14', 'Kanton Luxemburg', 6.13, 49.62, { sl: 50, cls: 'canton of Luxembourg' })];

let fakeVersion = null;
const SPARQL_CALLS = [];
let OFFLINE = false, OSM_DELAY = 0;
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith('/')) p += 'index.html';
  if (p === '/version.json' && fakeVersion) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ version: fakeVersion })); }
  const f = path.join(DOCS, p);
  if (!f.startsWith(DOCS) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const BASE = 'http://localhost:' + server.address().port + '/';

let fails = 0, passes = 0;
function ok(c, m) { if (c) passes++; else { fails++; console.log('FAIL', m); } }

async function mockApis(ctx) {
  await ctx.route(/wikipedia\.org\/w\/api\.php/, (route) => {
    if (OFFLINE) return route.abort('internetdisconnected');
    const u = new URL(route.request().url());
    const lang = u.hostname.split('.')[0];
    let body;
    if (u.searchParams.get('prop') === 'pageviews') {
      // v0.8: page views of the synthetic LU places (Luxemburg 500 per day, others 50)
      const titles = u.searchParams.get('titles').split('|');
      body = { query: { pages: titles.map((t, i) => ({ pageid: 900 + i, ns: 0, title: t, pageviews: { '2026-11-01': (t === 'Luxemburg' ? 500 : 50) * 30 } })) } };
    } else if ((u.searchParams.get('prop') || '').includes('extracts')) {
      const titles = u.searchParams.get('titles').split('|');
      const intro = (t) => lang === 'de' ? t + ' ist ein Testort. Zweiter Satz.' : t + ' is a test place. Second sentence.';
      const full = (t) => intro(t) + '\n\n== History ==\n' + Array.from({ length: 400 }, (_, i) => 'Sentence ' + (i + 1) + ' about history.').join(' ') + '\n\n== References ==\nRef.';
      body = { query: { pages: titles.map((t, i) => ({ pageid: i + 1, ns: 0, title: t,
        extract: u.searchParams.get('exintro') ? intro(t) : full(t),
        ...((u.searchParams.get('prop') || '').includes('pageimages') ? { thumbnail: { source: BASE + 'icons/icon-512.png' } } : {}) })) } };
    } else {
      const arr = fx.wikipedia[lang] || [{ query: { pages: [] } }];
      body = u.searchParams.get('incontinue') ? arr[1] : arr[0];
    }
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
  await ctx.route(/www\.wikidata\.org/, (route) => {
    if (OFFLINE) return route.abort('internetdisconnected');
    const su = new URL(route.request().url()), ids = (su.searchParams.get('ids') || '').split('|');
    const entities = {};
    ids.forEach((id) => {
      const lu = SPARQL_LU.find((b) => b.item.value.endsWith('/' + id));
      // v0.8: article titles and Wikivoyage of the synthetic LU places (props=sitelinks)
      if (su.searchParams.get('props') === 'sitelinks' && lu) entities[id] = { id, sitelinks: { dewiki: { site: 'dewiki', title: lu.de.value }, ...(id === 'Q1842' ? { dewikivoyage: { site: 'dewikivoyage', title: 'Luxemburg' } } : {}) } };
      else entities[id] = fx.wikidata.entities[id] || { id, missing: '' };
    });
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ entities }) });
  });
  await ctx.route(/nominatim\.openstreetmap\.org/, (route) => OFFLINE ? route.abort('internetdisconnected') : route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify((() => { const u = new URL(route.request().url());
      if (!u.pathname.startsWith('/search')) return fx.nominatim;
      const q = u.searchParams.get('q');
      // v0.9 route test: two places in Luxembourg (synthetic SPARQL data lies there)
      if (/luxemburg/i.test(q)) return [{ place_id: 21, name: 'Luxemburg', addresstype: 'city', category: 'place', type: 'city', display_name: 'Luxemburg, Kanton Luxemburg, Luxemburg', lat: '49.6116', lon: '6.1319' }];
      if (/vianden/i.test(q)) return [{ place_id: 22, name: 'Vianden', addresstype: 'town', category: 'place', type: 'town', display_name: 'Vianden, Kanton Vianden, Luxemburg', lat: '49.9345', lon: '6.2070' }];
      return /imperial/i.test(q) ? fx.nominatimSearch.imperial : fx.nominatimSearch.default; })()) }));
  await ctx.route(/overpass-api\.de|overpass\.kumi\.systems|maps\.mail\.ru/, async (route) => {
    if (OFFLINE) return route.abort('internetdisconnected');
    if (OSM_DELAY) await new Promise((r) => setTimeout(r, OSM_DELAY));
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(fx.overpass) }).catch(() => {});
  });
  await ctx.route(/api\.mymemory\.translated\.net/, (route) => OFFLINE ? route.abort('internetdisconnected') : route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ responseData: { translatedText: 'Übersetzt: ' + new URL(route.request().url()).searchParams.get('q') }, responseStatus: 200 }) }));
  // v0.7.0: city stars – shipped files (synthetic GB) and the Wikidata query for "Neu berechnen" (synthetic LU)
  await ctx.route(/\/staedte\/[A-Z]{2}\.json/, (route) => {
    const code = route.request().url().match(/([A-Z]{2})\.json/)[1];
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(code === 'GB' ? CITIES_GB : { land: code, stand: Date.parse('2026-11-01'), staedte: [], orte: [], fehler: [] }) });
  });
  await ctx.route(/query\.wikidata\.org\/sparql/, (route) => {
    if (OFFLINE) return route.abort('internetdisconnected');
    const q = new URL(route.request().url()).searchParams.get('query');
    // only the items inside the asked box (1° tiles for "Neu berechnen", 0.25° tiles for the v0.8 directory)
    const m = /Point\(([-\d.]+) ([-\d.]+)\)"\^\^geo:wktLiteral; wikibase:cornerNorthEast "Point\(([-\d.]+) ([-\d.]+)\)/.exec(q);
    const inBox = (b) => { const p = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord.value); return m && +p[1] >= +m[1] && +p[1] <= +m[3] && +p[2] >= +m[2] && +p[2] <= +m[4]; };
    SPARQL_CALLS.push(m ? m.slice(1).join(',') : '?');
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ results: { bindings: SPARQL_LU.filter(inBox) } }) });
  });
  await ctx.route(/tile\.openstreetmap\.org/, (route) => route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: PNG }));
}

async function newCtx(browser, opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: opts.width || 412, height: opts.height || 780 }, deviceScaleFactor: opts.dpr || 1, isMobile: true, hasTouch: true,
    geolocation: { latitude: 53.4792, longitude: -2.2442, accuracy: 20 }, permissions: ['geolocation'],
    colorScheme: opts.dark ? 'dark' : 'light', serviceWorkers: opts.sw ? 'allow' : 'block', locale: 'de-DE'
  });
  await ctx.grantPermissions(['geolocation', 'clipboard-read', 'clipboard-write'], { origin: BASE.slice(0, -1) });
  await mockApis(ctx);
  // Android "Teilen" (not in desktop Chromium): record what would be shared
  await ctx.addInitScript(() => { navigator.share = (d) => { window.__shared = (window.__shared || []).concat([d.text]); return Promise.resolve(); }; });
  // the v0.8 directory loads tiles by itself; only its own test section has it on
  if (!opts.vz) await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('rf.settings') || '{}'); if (s.verzeichnis === undefined) { s.verzeichnis = false; localStorage.setItem('rf.settings', JSON.stringify(s)); } } catch (e) { /* ignore */ } });
  return ctx;
}
function watch(page, errs) {
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
}

const browser = await chromium.launch();
try {
  // ---------------- main flow, browser-sized Pixel 8 viewport
  const ctx = await newCtx(browser);
  const page = await ctx.newPage(); const errs = []; watch(page, errs);
  if (process.env.DEBUG) { page.on('request', (r) => { if (/extracts|mymemory/.test(r.url())) console.log('REQ', decodeURIComponent(r.url()).slice(0, 160)); }); page.on('requestfailed', (r) => console.log('FAILED', r.url().slice(0, 120), r.failure() && r.failure().errorText)); page.on('console', (m) => console.log('CONSOLE', m.text())); }
  await page.goto(BASE + 'index.html');
  await page.waitForSelector('.empty');
  ok((await page.textContent('#version')) === 'v0.9.2', 'footer version');
  if (OUT) await page.screenshot({ path: OUT + '/01-start.png' });

  await page.click('#btnLocate');
  // v0.8: "Mein Standort" only moves the map, the search starts with "Hier suchen"
  await page.waitForFunction(() => /Standort – jetzt „Hier suchen“/.test(document.getElementById('toast').textContent), null, { timeout: 8000 });
  ok(!(await page.$('.item')), 'v0.8 location: map moved, no search yet');
  await page.click('#btnHere');
  await page.waitForSelector('.item', { timeout: 10000 });
  const items = await page.$$eval('.item', (els) => els.map((e) => ({ s: e.querySelector('.it-stars').textContent, n: e.querySelector('.it-name').textContent })));
  ok(items.length >= 8, 'list has items: ' + items.length);
  ok(items[0].s === '★★★', 'first item 3 stars');
  const th = await page.$eval('.item:has(.it-name2)', (e) => e.querySelector('.it-name').textContent + '|' + e.querySelector('.it-name2').textContent).catch(() => '');
  ok(th.includes('|'), 'list shows local and German name: ' + th);
  ok(!items.some((i) => i.n === 'River Tib'), 'River Tib hidden at ★+ filter');
  ok((await page.$$('.mk3')).length >= 4, '3-star markers on map');
  const lblCount = await page.$$eval('.mk-lbl', (els) => els.length);
  const dotCount = await page.$$eval('.mk', (els) => els.length);
  ok(lblCount >= 4 && lblCount <= dotCount, 'short labels on markers: ' + lblCount + '/' + dotCount);
  const lblOverlap = await page.$$eval('.mk-lbl', (els) => { const r = els.map((e) => e.getBoundingClientRect());
    return r.some((a, i) => r.some((b, j) => j > i && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)); });
  ok(!lblOverlap, 'labels do not overlap');
  ok(!(await page.$$eval('.mk-lbl', (els) => els.map((e) => e.textContent))).some((t) => /^Manchester /.test(t)), 'labels without city name');
  // v0.7.0: symbols in the dots (museum, church, …), other places plain
  const icons = await page.$$eval('.mk.ic svg', (els) => els.length);
  const plain = await page.$$eval('.mk:not(.ic)', (els) => els.length);
  ok(icons >= 3 && plain >= 1, 'v0.7 symbols in dots: ' + icons + ' with, ' + plain + ' without');
  await page.waitForFunction(() => [...document.querySelectorAll('.it-desc')].some((e) => /Testort|Übersetzt:/.test(e.textContent)), null, { timeout: 8000 });
  await page.$eval('#scroller', (l) => { l.scrollTop = l.scrollHeight; });
  await page.waitForFunction(() => [...document.querySelectorAll('.it-desc')].some((e) => /^Übersetzt:/.test(e.textContent)), null, { timeout: 8000 }).catch(() => {});
  const descs = await page.$$eval('.it-desc', (els) => els.map((e) => e.textContent));
  await page.$eval('#scroller', (l) => { l.scrollTop = 0; });
  ok(descs.some((d) => d.startsWith('Übersetzt: ')), 'English intro translated in list: ' + descs.join(' | '));
  ok(descs.some((d) => /ist ein Testort\. Zweiter Satz\.$/.test(d)), 'German intro shown as is (2 short sentences)');
  ok(!descs.some((d) => /maschinell/.test(d)), 'no translation note');
  ok(await page.$eval('#ortLabel', (el) => el.hidden), 'v0.8.3 no place name chip on the map');
  ok((await page.textContent('#status')).includes('★★★'), 'status counts');
  const names4 = await page.$$eval('.it-name', (els) => els.map((e) => e.textContent));
  ok(names4.filter((n) => n === 'Manchester Town Hall').length === 1, 'v0.4: Town Hall once in list');
  ok(names4.includes('Pankhurst Centre'), 'v0.4: OSM-only museum in list');
  // v0.5: where results come from
  const srcLine = await page.textContent('#status .src-line');
  ok(/^🌐 Online · W ✓ .* · OSM ✓/.test(srcLine), 'v0.6.1 status shows online and sources: ' + srcLine);
  const stH = await page.$eval('#status', (e) => e.getBoundingClientRect().height);
  ok(stH <= 48, 'v0.6.1 status at most two lines: ' + stH);
  ok(await page.$eval('#scroller', (sc) => sc.contains(document.getElementById('status')) && sc.contains(document.querySelector('.foot'))), 'v0.6.1 version line and status scroll with the list');
  await page.selectOption('#fKat', '__osm');
  const onlyOsm = await page.$$eval('.it-src', (els) => els.map((e) => e.textContent));
  ok(onlyOsm.length > 0 && onlyOsm.every((t) => t === 'OSM'), 'v0.6.1 filter "Nur aus OSM": ' + onlyOsm.length);
  await page.selectOption('#fKat', '');
  const tags = await page.$$eval('.it-src', (els) => els.map((e) => e.textContent));
  ok(tags.includes('W+OSM') && tags.includes('OSM') && tags.includes('W'), 'v0.5 source tags in list: ' + [...new Set(tags)].join(','));
  ok(!(await page.$('#fRadius')), 'v0.5 no radius filter');
  const frame = await page.evaluate(() => document.querySelectorAll('.leaflet-overlay-pane path').length);
  ok(frame >= 1, 'search frame drawn');
  await page.click('#status .st-info');
  await page.waitForFunction(() => document.getElementById('sheetTitle').textContent === 'Suche – Details');
  const det = await page.textContent('#sheetBody');
  ok(det.includes('OpenStreetMap') && det.includes('nur Wikipedia') && det.includes('Ausschnitt'), 'v0.5 search details sheet');
  if (OUT) await page.screenshot({ path: OUT + '/11-details.png' });
  await page.click('#sheetClose');
  await page.waitForSelector('#sheet', { state: 'hidden' });

  // layout checks
  const lay = await page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const small = [...document.querySelectorAll('button, select, .btn')].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 44 && !b.closest('.leaflet-control'))
      .map((b) => (b.id || b.className) + ':' + Math.round(b.getBoundingClientRect().height));
    return { scrollW: document.documentElement.scrollWidth, w: innerWidth, h: innerHeight, map: r('#mapWrap').height, list: r('#scroller').height,
      footBottom: r('#scroller').bottom, small };
  });
  ok(lay.scrollW <= lay.w, 'no horizontal scroll');
  ok(Math.abs(lay.footBottom - lay.h) < 2, 'list area reaches the bottom, page fits viewport');
  ok(lay.map > lay.h * 0.45 && lay.map < lay.h * 0.6, 'map ~55%: ' + lay.map);
  ok(lay.list > 150, 'list visible height ' + lay.list);
  ok(lay.small.length === 0, 'tap targets >= 44px: ' + lay.small.join(', '));
  if (OUT) await page.screenshot({ path: OUT + '/02-liste.png' });

  // place sheet + actions
  await page.click('.item >> nth=0');
  await page.waitForSelector('#sheet:not([hidden])');
  const title = await page.textContent('#sheetTitle');
  ok(title === items[0].n, 'sheet title = item');
  const mapsHref = await page.getAttribute('#sheetBody a.btn.primary', 'href');
  ok(mapsHref.startsWith('https://www.google.com/maps/search/?api=1&query='), 'maps link');
  await page.click('[data-a=copy]');
  await page.waitForTimeout(200);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  ok(clip.startsWith(title.split(',')[0]), 'name copied: ' + clip);
  ok((await page.textContent('#toast')).startsWith('Kopiert'), 'copy toast');
  await page.click('[data-a=merk]');
  ok((await page.textContent('#merkCount')) === '1', 'merk badge 1');
  ok(await page.isVisible('.item.sel'), 'list row highlighted');
  if (OUT) await page.screenshot({ path: OUT + '/03-ort.png' });
  await page.evaluate(() => history.back());
  await page.waitForSelector('#sheet', { state: 'hidden' });
  ok(true, 'back closes sheet');

  // merkliste
  await page.click('#btnMerk');
  await page.waitForSelector('.merk-list li');
  await page.click('[data-a=mcopy]');
  await page.waitForTimeout(200);
  const mclip = await page.evaluate(() => navigator.clipboard.readText());
  ok(/ – ★★★ – .* – https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/.test(mclip), 'merkliste text: ' + mclip);
  if (OUT) await page.screenshot({ path: OUT + '/04-merkliste.png' });
  await page.click('#sheetClose');

  // filters
  await page.selectOption('#fStars', '3');
  const s3 = await page.$$eval('.it-stars', (els) => els.map((e) => e.textContent));
  ok(s3.length > 0 && s3.every((x) => x === '★★★'), 'filter ★★★');
  await page.selectOption('#fStars', '0');
  ok((await page.$$eval('.it-name', (els) => els.map((e) => e.textContent))).includes('River Tib'), 'filter alle shows River Tib');
  await page.selectOption('#fKat', 'museum');
  // OSM-only place: sources and narration with OSM facts
  await page.selectOption('#fKat', '');
  await page.$eval('#list', (l) => { const li = [...l.querySelectorAll('.item')].find((x) => x.textContent.includes('Alan Turing Memorial')); li.querySelector('.it-main').click(); });
  await page.waitForFunction(() => document.getElementById('sheetTitle').textContent === 'Alan Turing Memorial');
  ok(!(await page.$('#sheetBody p.src')) && !(await page.textContent('#sheetBody')).includes('Lizenzen:'), 'v0.6.1: no sources/licence line in the place window');
  ok((await page.textContent('#plDesc')).includes('Glyn Hughes'), 'OSM facts as short info');
  await page.click('[data-a=tell]');
  await page.waitForFunction(() => /Prompt kopiert/.test(document.getElementById('tellStatus').textContent));
  ok((await page.evaluate(() => navigator.clipboard.readText())).includes('Angaben aus OpenStreetMap: Künstler: Glyn Hughes'), 'OSM-only narration uses OSM facts');
  await page.evaluate(() => history.back());
  await page.waitForSelector('#sheet', { state: 'hidden' });
  await page.selectOption('#fKat', 'museum');
  const kat = await page.$$eval('.it-meta', (els) => els.map((e) => e.textContent));
  ok(kat.length > 0 && kat.every((m) => /Museum/.test(m)), 'filter kategorie museum');
  await page.selectOption('#fKat', '');
  await page.selectOption('#fStars', '1');

  // settings + geo links
  await page.click('#btnSettings');
  await page.check('input[name=kapp][value=geo]');
  await page.click('#sheetClose');
  await page.click('.item >> nth=0');
  ok((await page.getAttribute('#sheetBody a.btn.primary', 'href')).startsWith('geo:0,0?q='), 'geo link setting');
  await page.evaluate(() => history.back());
  await page.waitForSelector('#sheet', { state: 'hidden' });
  await page.click('#btnSettings');
  await page.check('input[name=kapp][value=osmand]');
  await page.click('#sheetClose');
  await page.click('.item >> nth=0');
  const osmHref = await page.getAttribute('#sheetBody a.btn.primary', 'href');
  ok(osmHref.startsWith('intent://osmand.net/map?pin=') && osmHref.includes('package=net.osmand.plus') && (await page.textContent('#sheetBody a.btn.primary')) === 'In OsmAnd', 'v0.5 OsmAnd link: ' + osmHref.slice(0, 60));
  await page.evaluate(() => history.back());
  await page.waitForSelector('#sheet', { state: 'hidden' });
  await page.click('#btnSettings');
  await page.check('input[name=kapp][value=google]');
  await page.click('#sheetClose');

  // splitter drag
  const sp = await page.$('#splitter'); const b = await sp.boundingBox();
  const before = (await page.$('#mapWrap').then((e) => e.boundingBox())).height;
  await page.mouse.move(b.x + b.width / 2, b.y + 5); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y - 150, { steps: 5 }); await page.mouse.up();
  const after = (await page.$('#mapWrap').then((e) => e.boundingBox())).height;
  ok(after < before - 100, 'splitter shrinks map ' + before + ' -> ' + after);
  const sb = await (await page.$('#splitter')).boundingBox();
  await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.waitForTimeout(100);
  const tapped = (await page.$('#mapWrap').then((e) => e.boundingBox())).height;
  ok(tapped > after + 100, 'v0.6.1 tap on splitter: map big ' + after + ' -> ' + tapped);
  await page.mouse.click(sb.x + sb.width / 2, (await (await page.$('#splitter')).boundingBox()).y + 10);
  await page.waitForTimeout(100);
  const tapped2 = (await page.$('#mapWrap').then((e) => e.boundingBox())).height;
  ok(tapped2 < tapped - 150, 'v0.6.1 tap again: list big ' + tapped + ' -> ' + tapped2);
  await page.mouse.move(sb.x + sb.width / 2, (await (await page.$('#splitter')).boundingBox()).y + 10); await page.mouse.down();
  await page.mouse.move(sb.x + sb.width / 2, after + 30, { steps: 6 }); await page.mouse.up();

  // place search: jump to a place and search there
  await page.evaluate(() => { localStorage.removeItem('rf.last'); });
  await page.click('#btnSearch');
  await page.waitForSelector('#searchInput');
  await page.fill('#searchInput', 'Manchester');
  await page.press('#searchInput', 'Enter');
  await page.waitForFunction(() => document.querySelector('#searchHits .hits') && !document.getElementById('searchHits').textContent.includes('Suche „'));
  const hitTexts = await page.$$eval('.hits b', (els) => els.map((e) => e.textContent));
  ok(hitTexts.length === 2, 'search shows hits without duplicate: ' + hitTexts.join(','));
  ok((await page.textContent('#searchHits')).includes('Stadt · Greater Manchester'), 'hit shows type');
  if (OUT) await page.screenshot({ path: OUT + '/09-suche.png' });
  await page.click('.hits button >> nth=0');
  await page.waitForSelector('#sheet', { state: 'hidden' });
  // v0.7.1: the hit only moves the map, the search starts with "Hier suchen"
  await page.waitForTimeout(400);
  ok(!(await page.evaluate(() => localStorage.getItem('rf.last'))) && (await page.textContent('#btnHere')) === 'Hier suchen' && Math.abs((await page.evaluate(() => window.__rfMap.getCenter().lat)) - 53.4795) < 0.01,
    'v0.7.1 search hit moves the map without searching');
  await page.click('#btnHere');
  await page.waitForFunction(() => localStorage.getItem('rf.last') && !document.getElementById('btnHere').disabled);
  const cen = await page.evaluate(() => JSON.parse(localStorage.getItem('rf.last')));
  ok(cen && Math.abs(cen.lat - 53.4795) < 0.001 && cen.places.length > 5, 'search jumped and loaded places');
  await page.click('#btnSearch');
  ok((await page.textContent('#searchHits')).includes('Zuletzt gesucht'), 'recent searches remembered');
  // search a sight that is in the loaded list
  await page.fill('#searchInput', 'Chetham');
  await page.press('#searchInput', 'Enter');
  await page.waitForFunction(() => document.getElementById('searchHits').textContent.includes('In der Liste'));
  ok(true, 'local list hit');
  await page.click('#searchHits .hits button >> nth=0');
  await page.waitForFunction(() => document.getElementById('sheetTitle').textContent.includes('Chetham'));
  ok(true, 'local hit opens place');
  // v0.3: picture, narration prompt, handover, "schon gehört"
  await page.waitForSelector('#plImg:not([hidden]) img', { timeout: 8000 });
  ok(true, 'detail view shows picture');
  ok(await page.isVisible('#plIntro'), 'detail view has Wikipedia intro');
  await page.click('[data-a=level][data-level=ausfuehrlich]');
  ok(await page.$eval('[data-a=level][data-level=ausfuehrlich]', (b) => b.classList.contains('on')), 'level switch');
  await page.selectOption('#focusSel', 'Architektur');
  await page.click('[data-a=tell]');
  await page.waitForFunction(() => /Prompt kopiert/.test(document.getElementById('tellStatus').textContent), null, { timeout: 8000 });
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  ok(prompt.startsWith('Du bist mein Reiseführer.') && prompt.includes("Ort: Chetham's Library, Manchester") && prompt.includes('Schwerpunkt: Architektur'), 'prompt copied');
  ok(prompt.length <= 12000 && prompt.includes('fünf Minuten'), 'ausführlich prompt <= 12000: ' + prompt.length);
  // v0.8.1: always Android "Teilen" (the user picks the app), no Claude link
  const shared = await page.evaluate(() => window.__shared || []);
  ok(shared.length >= 1 && shared[shared.length - 1] === prompt && (await page.$('#tellStatus [data-a="aishare"]')) && !(await page.$('#tellStatus a[href^="claude:"]')), 'v0.8.1 prompt handed over with "Teilen": ' + JSON.stringify(shared.map((x) => x.length)) + ' ' + prompt.length + ' ' + (await page.textContent('#tellStatus')));
  ok((await page.textContent('[data-a=heard]')).includes('Schon gehört'), 'marked as heard');
  if (OUT) await page.screenshot({ path: OUT + '/10-erzaehlen.png' });
  ok(!(await page.$('[data-a=share]')) && !(await page.$('a[href*="tripadvisor"]')), 'no share button, no Tripadvisor link in place window');
  await page.click('[data-a=review]');
  await page.waitForFunction(() => /Prompt kopiert/.test(document.getElementById('tellStatus').textContent));
  const rprompt = await page.evaluate(() => navigator.clipboard.readText());
  ok(rprompt.startsWith('Gib mir eine Übersicht') && rprompt.includes('Tripadvisor') && rprompt.includes('## Auf einen Blick'), 'overview prompt copied');
  ok((await page.evaluate(() => window.__shared || [])).slice(-1)[0] === rprompt, 'v0.8.1 overview handed over with "Teilen"');
  ok((await page.textContent('[data-a=review]')).includes('Übersicht und Bewertung'), 'v0.5 button "Übersicht und Bewertung"');
  await page.click('[data-a=recopy]');
  await page.$eval('#sheetBody', (b) => { b.scrollTop = 400; });
  await page.$eval('.item:nth-child(2) .it-main', (el) => el.click());
  await page.waitForTimeout(150);
  ok(await page.$eval('#sheetBody', (b) => b.scrollTop === 0), 'next place opens at the top');
  await page.evaluate(() => history.back());
  await page.waitForSelector('#sheet', { state: 'hidden' });
  ok(await page.$eval('.item.heard', (e) => e.textContent.includes('✓ gehört')).catch(() => false), 'heard row greyed in list');
  await page.click('#btnSearch');
  // search a sight via Nominatim: jumps there and opens the nearest place
  await page.fill('#searchInput', 'Imperial War Museum');
  await page.press('#searchInput', 'Enter');
  await page.waitForFunction(() => document.getElementById('searchHits').textContent.includes('Imperial War Museum North'));
  ok((await page.textContent('#searchHits')).includes('Museum ·'), 'sight hit typed as museum');
  await page.click('#searchHits .hits button >> nth=0');
  await page.waitForSelector('#sheet', { state: 'hidden' });
  ok(await page.isVisible('.hit-pin'), 'v0.7.1 searched sight marked on the map');
  await page.click('#btnHere');
  await page.waitForFunction(() => !document.getElementById('sheet').hidden && !document.getElementById('sheetTitle').textContent.includes('suchen'), null, { timeout: 10000 });
  ok(!(await page.$('.hit-pin')), 'v0.7.1 mark removed after the search');
  ok(true, 'POI search opens a place sheet: ' + await page.textContent('#sheetTitle'));
  await page.evaluate(() => history.back());
  await page.waitForSelector('#sheet', { state: 'hidden' });

  // ---- v0.7.0: city stars when zoomed out
  const view0 = await page.evaluate(() => { const c = window.__rfMap.getCenter(); return [c.lat, c.lng, window.__rfMap.getZoom()]; });
  await page.evaluate(() => window.__rfMap.setView([53.35, -2.45], 9, { animate: false }));
  await page.waitForSelector('.ct', { timeout: 8000 });
  const cts = await page.$$eval('.ct', (els) => els.map((e) => e.textContent));
  ok(cts.includes('★★★') && cts.includes('★★') && cts.includes('★') && cts.length === 3, 'v0.7 cities with stars at zoom 9 (Stockport without star hidden): ' + cts.join(' '));
  ok((await page.$$('.mk-lbl')).length === 0, 'v0.7 single places hidden when zoomed out');
  ok((await page.$$eval('.ct-lbl', (els) => els.map((e) => e.textContent))).includes('Peak District'), 'v0.7 excursion outside cities shown');
  if (OUT) await page.screenshot({ path: OUT + '/10-stadt-sterne.png' });
  await page.evaluate(() => window.__rfMap.setView([53.35, -2.45], 7, { animate: false }));
  await page.waitForFunction(() => document.querySelectorAll('.ct').length === 2, null, { timeout: 5000 }).catch(() => {});
  const cts7 = await page.$$eval('.ct', (els) => els.map((e) => e.textContent));
  ok(cts7.length === 2 && !cts7.includes('★') && !(await page.$$eval('.ct-lbl', (els) => els.map((e) => e.textContent))).includes('Peak District'), 'v0.7 zoom 7: only ★★/★★★ cities: ' + cts7.join(' '));
  await page.evaluate(() => window.__rfMap.setView([53.35, -2.45], 9, { animate: false }));
  await page.waitForSelector('.ct3');
  await page.click('.ct3');
  await page.waitForSelector('#sheet:not([hidden])');
  ok((await page.textContent('#sheetTitle')) === 'Manchester' && (await page.textContent('#sheetBody')).includes('Manchester Town Hall'), 'v0.7 city sheet with best sights');
  ok((await page.getAttribute('#sheetBody a.btn', 'href')).includes('Special:GoToLinkedPage/dewiki/Q18125'), 'v0.7 city Wikipedia link');
  if (OUT) await page.screenshot({ path: OUT + '/11-stadt.png' });
  await page.click('[data-a="cityzoom"]');
  await page.waitForFunction(() => window.__rfMap.getZoom() === 14);
  await page.click('#btnHere');
  await page.waitForFunction(() => window.__rfMap.getZoom() === 14 && document.querySelectorAll('.mk').length > 0, null, { timeout: 10000 });
  ok((await page.$$('.ct')).length === 0, 'v0.7 zoom in: city markers gone, places back');
  await page.waitForSelector('.item', { timeout: 10000 });
  // ⚙: v0.8.1 no assistant choice, no per-country computing; only the directory (nothing loads by itself)
  await page.click('#btnSettings');
  await page.waitForFunction(() => /Verzeichnis \(Ziele auf der Karte\)/.test(document.getElementById('sheetBody').textContent));
  const setTxt = await page.textContent('#sheetBody');
  ok(!/KI-Assistent|Übergabe an|Neu berechnen/.test(setTxt) && !(await page.$('input[name="uebergabe"]')) && setTxt.includes('nur mit „Hier suchen“'), 'v0.8.1 settings: no assistant menu, no computing menu');
  if (OUT) await page.screenshot({ path: OUT + '/12-einstellungen-staedte.png' });
  await page.evaluate(() => history.back());
  await page.waitForSelector('#sheet', { state: 'hidden' });
  await page.evaluate((v) => window.__rfMap.setView([v[0], v[1]], v[2], { animate: false }), view0);

  // persistence after reload
  await page.reload();
  await page.waitForSelector('.item');
  ok((await page.textContent('#merkCount')) === '1', 'merk persisted');
  const splitNow = await page.evaluate(() => localStorage.getItem('rf.split'));
  ok(splitNow && +splitNow > 12, 'split persisted: ' + splitNow);

  // update banner (fake newer version, then ?testupdate=1)
  fakeVersion = '0.9.3';
  await page.reload();
  await page.waitForSelector('#banner:not([hidden])');
  ok((await page.textContent('#bannerText')).includes('v0.9.3'), 'banner shows remote version');
  if (OUT) await page.screenshot({ path: OUT + '/05-banner.png' });
  fakeVersion = null;
  await page.click('#bannerBtn');
  await page.waitForLoadState('load'); await page.waitForTimeout(500);
  ok(await page.isHidden('#banner'), 'banner gone after reload');
  ok((await page.textContent('#merkCount')) === '1', 'user data kept after update reload');
  await page.goto(BASE + 'index.html?testupdate=1');
  await page.waitForSelector('#banner:not([hidden])');
  ok((await page.textContent('#bannerText')).includes('(Test)'), 'testupdate banner');
  ok(errs.length === 0, 'no JS errors: ' + errs.join(' | '));
  await ctx.close();

  // ---------------- v0.5: slow OpenStreetMap: seconds, "Abbrechen", "Ohne OSM weiter", too big section
  {
    const c5 = await newCtx(browser);
    const p5 = await c5.newPage(); const e5 = []; watch(p5, e5);
    await p5.goto(BASE + 'index.html');
    await p5.waitForSelector('.empty');
    await p5.evaluate(() => { localStorage.setItem('rf.view', JSON.stringify({ lat: 53.4792, lon: -2.2442, z: 15 })); });
    await p5.reload(); await p5.waitForSelector('.empty');
    OSM_DELAY = 60000;
    await p5.click('#btnHere');
    await p5.waitForSelector('#status [data-a=cancel]', { timeout: 8000 });
    ok(/\d+ s/.test(await p5.textContent('#status .secs')), 'v0.5 seconds counter while searching');
    await p5.click('#status [data-a=cancel]');
    await p5.waitForFunction(() => !document.getElementById('btnHere').disabled);
    ok((await p5.textContent('#toast')).includes('abgebrochen') && !(await p5.$('.item')), 'v0.5 cancel stops the search');
    OSM_DELAY = 7000;
    await p5.click('#btnHere');
    await p5.waitForSelector('#status [data-a=skiposm]', { timeout: 8000 });
    if (OUT) await p5.screenshot({ path: OUT + '/12-warte-osm.png' });
    await p5.click('#status [data-a=skiposm]');
    await p5.waitForSelector('.item', { timeout: 8000 });
    const sl5 = await p5.textContent('#status .src-line');
    ok(/OSM übersprungen/.test(sl5) && !(await p5.$$eval('.it-src', (els) => els.some((e) => e.textContent !== 'W'))), 'v0.5 skip OSM: Wikipedia results at once: ' + sl5);
    // v0.6.1: OSM comes later -> added automatically
    await p5.waitForFunction(() => /^OSM: (\d+ Orte dazu|nichts Neues)$/.test(document.getElementById('toast').textContent), null, { timeout: 15000 });
    const sl5b = await p5.textContent('#status .src-line');
    ok(/nachgeladen/.test(sl5b) && (await p5.$$eval('.it-src', (els) => els.some((e) => e.textContent !== 'W'))), 'v0.6.1 late OSM merged automatically: ' + sl5b + ' / ' + await p5.textContent('#toast'));
    OSM_DELAY = 0;
    await p5.evaluate(() => window.__rfMap && window.__rfMap.setZoom(10, { animate: false }));
    await p5.click('#btnHere');
    await p5.waitForFunction(() => /Zu groß/.test(document.getElementById('toast').textContent), null, { timeout: 4000 }).catch(() => {});
    ok((await p5.textContent('#toast')).includes('Zu groß – näher heranzoomen') && await p5.$eval('#toast', (el) => el.getBoundingClientRect().height < 50), 'v0.5 too big section: hint to zoom in: ' + await p5.textContent('#toast') + ' ' + await p5.$eval('#toast', (el) => el.getBoundingClientRect().height));
    ok(e5.length === 0, 'v0.5: no JS errors ' + e5.join(' | '));
    await c5.close();
  }

  // ---------------- v0.6: prepare an area, then use it offline
  {
    const c6 = await newCtx(browser);
    const p6 = await c6.newPage(); const e6 = []; watch(p6, e6);
    await p6.goto(BASE + 'index.html');
    await p6.waitForSelector('.empty');
    await p6.evaluate(() => { localStorage.setItem('rf.view', JSON.stringify({ lat: 53.4792, lon: -2.2442, z: 15 })); });
    await p6.reload(); await p6.waitForSelector('.empty');
    await p6.click('#btnSettings');
    ok((await p6.textContent('#sheetBody')).includes('Gebiet vorbereiten'), 'v0.6 settings: prepare section');
    await p6.click('[data-a=prep]');
    await p6.waitForSelector('#prep:not([hidden])');
    if (OUT) await p6.screenshot({ path: OUT + '/13-vorbereiten.png' });
    await p6.waitForFunction(() => /ist vorbereitet/.test(document.getElementById('toast').textContent), null, { timeout: 30000 });
    const done6 = await p6.textContent('#toast');
    ok(/\d+ Orte, \d+ Kurzinfos, \d+ Texte/.test(done6), 'v0.6 area prepared: ' + done6);
    const areaTxt = await p6.textContent('.areas li');
    ok(areaTxt.includes('Manchester') && areaTxt.includes('fertig') && /nur aus OSM/.test(areaTxt) && areaTxt.includes('OSM ✓'), 'v0.6 area listed: ' + areaTxt.replace(/\s+/g, ' ').slice(0, 160));
    if (OUT) await p6.screenshot({ path: OUT + '/14-gebiete.png' });
    await p6.click('#sheetClose');
    // offline now
    OFFLINE = true; await c6.setOffline(true);
    await p6.click('#btnHere');
    await p6.waitForSelector('.item', { timeout: 5000 });
    const sl6 = await p6.textContent('#status .src-line');
    ok(sl6.includes('📥 Offline: Gebiet „Manchester“'), 'v0.6 offline search uses the area: ' + sl6);
    const d6 = await p6.$$eval('.it-desc', (els) => els.map((e) => e.textContent).filter(Boolean));
    ok(d6.length >= 5 && d6.some((d) => /Übersetzt:|Testort/.test(d)), 'v0.6 short infos offline: ' + d6.length);
    await p6.$eval('#list', (l) => { const li = [...l.querySelectorAll('.item')].find((x) => x.textContent.includes('Town Hall')); li.querySelector('.it-main').click(); });
    await p6.waitForSelector('#sheet:not([hidden])');
    await p6.click('[data-a=level][data-level=normal]');
    await p6.click('[data-a=tell]');
    await p6.waitForFunction(() => /Prompt kopiert/.test(document.getElementById('tellStatus').textContent), null, { timeout: 5000 });
    const pr6 = await p6.evaluate(() => navigator.clipboard.readText());
    ok(pr6.includes('Sentence 3 about history') && !pr6.includes('ohne Wikipedia-Text'), 'v0.6 narration offline from the stored article');
    if (OUT) await p6.screenshot({ path: OUT + '/15-offline.png' });
    OFFLINE = false; await c6.setOffline(false);
    ok(e6.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e)).length === 0, 'v0.6: no JS errors ' + e6.join(' | '));
    await c6.close();
  }

  // ---------------- small viewport like the user's phone (display size enlarged)
  const ctxS = await newCtx(browser, { height: 626, width: 329 });
  const pS = await ctxS.newPage(); const errsS = []; watch(pS, errsS);
  await pS.goto(BASE + 'index.html');
  await pS.click('#btnLocate'); await pS.waitForTimeout(300); await pS.click('#btnHere'); await pS.waitForSelector('.item');
  const layS = await pS.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const sel = [...document.querySelectorAll('.filters select')].map((x) => x.scrollWidth <= x.clientWidth + 1);
    const pillsOk = (() => { const a = r('#btnLocate'), b = r('#btnHere'); return a.right < b.left; })();
    return { scrollW: document.documentElement.scrollWidth, w: innerWidth, h: innerHeight, list: r('#scroller').height, foot: r('#scroller').bottom, pillsOk, sel };
  });
  ok(layS.scrollW <= layS.w, 'small: no horizontal scroll');
  ok(Math.abs(layS.foot - layS.h) < 2, 'small: fits viewport');
  ok(layS.list > 100, 'small: list visible ' + layS.list);
  ok(layS.pillsOk, 'small: map buttons do not overlap');
  ok(layS.sel.every(Boolean), 'small: filter texts not cut ' + JSON.stringify(layS.sel));
  if (OUT) await pS.screenshot({ path: OUT + '/08-klein-liste.png' });
  await pS.click('.item >> nth=0'); await pS.waitForSelector('#sheet:not([hidden])');
  const sheetS = await pS.evaluate(() => { const b = document.querySelector('.actions').getBoundingClientRect(); return b.right <= innerWidth && b.left >= 0; });
  ok(sheetS, 'small: action buttons inside screen');
  await pS.waitForTimeout(400);
  if (OUT) await pS.screenshot({ path: OUT + '/08-klein-ort.png' });
  ok(errsS.length === 0, 'small: no JS errors ' + errsS.join(' | '));
  await ctxS.close();

  // ---------------- standalone height, dark mode, screenshot at real DPR
  const ctx2 = await newCtx(browser, { height: 870, dark: true, dpr: OUT ? 2.625 : 1 });
  const p2 = await ctx2.newPage(); const errs2 = []; watch(p2, errs2);
  await p2.goto(BASE + 'index.html');
  await p2.click('#btnLocate'); await p2.waitForTimeout(300); await p2.click('#btnHere'); await p2.waitForSelector('.item');
  if (OUT) await p2.screenshot({ path: OUT + '/06-dunkel.png' });
  ok(errs2.length === 0, 'dark: no JS errors ' + errs2.join(' | '));
  await ctx2.close();

  // ---------------- service worker
  const ctx3 = await newCtx(browser, { sw: true });
  const p3 = await ctx3.newPage(); const errs3 = []; watch(p3, errs3);
  await p3.goto(BASE + 'index.html');
  const swOk = await p3.evaluate(() => navigator.serviceWorker.ready.then((r) => !!r.active)).catch(() => false);
  ok(swOk, 'service worker active');
  const cacheKeys = await p3.evaluate(async () => { await new Promise((r) => setTimeout(r, 800)); return caches.keys(); });
  ok(cacheKeys.includes('rf-app-0.9.2'), 'app cache with version: ' + cacheKeys.join(','));
  const cached = await p3.evaluate(async () => (await (await caches.open('rf-app-0.9.2')).keys()).map((r) => new URL(r.url).pathname + new URL(r.url).search));
  ok(cached.some((u) => u.includes('app.js?v=0.9.2')), 'shell precached');
  ok(errs3.length === 0, 'sw: no JS errors ' + errs3.join(' | '));
  await ctx3.close();

  // ---------------- diag page
  const ctx4 = await newCtx(browser, { dpr: 1 });
  const p4 = await ctx4.newPage(); const errs4 = []; watch(p4, errs4);
  await p4.goto(BASE + 'diag.html');
  await p4.click('#btnGold');
  await p4.waitForSelector('#goldOut .pass, #goldOut .fail', { timeout: 10000 });
  await p4.waitForFunction(() => !document.getElementById('btnGold').disabled, null, { timeout: 15000 });
  ok((await p4.textContent('#goldOut')).includes('Goldliste Manchester BESTANDEN'), 'diag gold list Manchester passes on synthetic data');
  ok((await p4.textContent('#goldOut')).includes('Goldliste Morges'), 'diag runs Morges list');
  await p4.click('#btnApi');
  await p4.waitForSelector('#apiOut table', { timeout: 10000 });
  const sum = await p4.inputValue('#v2summary');
  ok(sum.includes('Übersetzer MyMemory: OK'), 'diag translation check');
  ok(sum.includes('Overpass (OSM-Orte): OK') && sum.includes('Manchester Town Hall: 1× in der Liste') && sum.includes('Duplikate: vorher'), 'diag v0.4 checks: ' + (sum.match(/Duplikate[^\n]*/) || [''])[0]);
  ok(sum.includes('Wikipedia en: OK') && sum.includes('Goldliste Manchester BESTANDEN') && sum.includes('Sprachen de,en'), 'diag summary:\n' + sum.slice(0, 900));
  const s6 = await p4.inputValue('#v6summary');
  ok(s6.includes('Abnahme v0.5/v0.6') && s6.includes('A Intent-Link für OsmAnd+') && s6.includes('Vorbereitete Gebiete:'), 'diag v0.6 summary');
  ok((await p4.getAttribute('#osmandTests a.btn >> nth=0', 'href')).startsWith('intent://osmand.net/map?pin=46.510700,6.498300'), 'diag OsmAnd intent link');
  await p4.check('input[name=osA][value=app]');
  ok((await p4.inputValue('#v6summary')).includes('A Intent-Link für OsmAnd+ (App-Standard): OsmAnd öffnet mit Pin'), 'diag OsmAnd result recorded');
  ok(await p4.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'diag no horizontal scroll');
  if (OUT) await p4.screenshot({ path: OUT + '/07-diag.png', fullPage: true });
  ok(errs4.length === 0, 'diag: no JS errors ' + errs4.join(' | '));
  await ctx4.close();
  // ---------------- v0.8: directory – loaded with "Hier suchen" only (v0.8.1), three zoom levels, hint line
  {
    const c8 = await newCtx(browser, { vz: true });
    const p8 = await c8.newPage(); const e8 = []; watch(p8, e8);
    await p8.goto(BASE + 'index.html');
    await p8.waitForSelector('#zoomHint:not([hidden])');
    await p8.evaluate(() => window.__rfMap.setView([49.61, 6.13], 6, { animate: false }));
    await p8.waitForFunction(() => /^Zu weit draußen – näher heranzoomen$/.test(document.getElementById('zoomHint').textContent), null, { timeout: 8000 });
    ok(await p8.$eval('#btnHere', (b) => b.classList.contains('dim')), 'v0.8 "Hier suchen" greyed when too far out');
    const n0 = SPARQL_CALLS.length;
    await p8.evaluate(() => window.__rfMap.setView([49.61, 6.13], 10, { animate: false }));
    await p8.waitForFunction(() => /^„Hier suchen“ lädt die Gegend \(ca\./.test(document.getElementById('zoomHint').textContent), null, { timeout: 8000 });
    await p8.waitForTimeout(1500);
    ok(SPARQL_CALLS.length === n0 && !(await p8.$eval('#btnHere', (b) => b.classList.contains('dim'))), 'v0.8.1 nothing loads by itself; hint says what "Hier suchen" loads');
    await p8.click('#btnHere');
    await p8.waitForFunction(() => /Lade Gegend/.test(document.getElementById('zoomHint').textContent), null, { timeout: 8000 }).catch(() => {});
    await p8.waitForFunction(() => /Lade \d+\/\d+ …/.test(document.getElementById('btnHere').textContent), null, { timeout: 5000 }).catch(() => {});
    await p8.waitForFunction(() => document.getElementById('zoomHint').hidden && /^Fertig: /.test(document.getElementById('toast').textContent), null, { timeout: 30000 });
    ok(/^Fertig: \d+ Ziele im Ausschnitt$/.test(await p8.textContent('#toast')) && (await p8.textContent('#btnHere')) === 'Hier suchen', 'v0.8.2 clear end: message "Fertig", button back: ' + await p8.textContent('#toast'));
    const vzl = await p8.$$eval('.vz-item b', (els) => els.map((e) => e.textContent));
    ok(vzl[0] === 'Luxemburg' && vzl.includes('Burg Vianden') === false && vzl.length >= 3, 'v0.8.2 list shows what was found, most important first: ' + vzl.join(', '));
    ok(await p8.$eval('#zoomHint', (el) => el.hidden), 'v0.8.3 no hint when there is nothing to say');
    ok(SPARQL_CALLS.length > n0 && SPARQL_CALLS.slice(n0).every((c) => { const [w, s, e, n] = c.split(',').map(Number); return Math.abs(e - w - 0.25) < 1e-6 && Math.abs(n - s - 0.25) < 1e-6; }),
      'v0.8 "Hier suchen" at zoom 10 loads 0.25° tiles: ' + SPARQL_CALLS.slice(n0).length);
    const ix = await p8.evaluate(() => new Promise((res) => { const r = indexedDB.open('reisefuehrer', 1); r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get('vz:index'); q.onsuccess = () => res(q.result); }; }));
    ok(ix && Object.keys(ix).length >= 4 && Object.values(ix).some((e) => e.n >= 3), 'v0.8 tiles stored in the phone: ' + JSON.stringify(ix).slice(0, 200));
    await p8.waitForFunction(() => [...document.querySelectorAll('.ct-lbl')].some((e) => e.textContent === 'Luxemburg'), null, { timeout: 8000 }).catch(() => {});
    const lbl10 = await p8.$$eval('.ct-lbl', (els) => els.map((e) => e.textContent));
    ok(lbl10.includes('Luxemburg'), 'v0.8 town with stars from the directory at zoom 10: ' + lbl10.join(', '));
    if (OUT) await p8.screenshot({ path: OUT + '/13-verzeichnis-zoom10.png' });
    // zoom 14: all sights of the directory without "Hier suchen"
    await p8.evaluate(() => window.__rfMap.setView([49.6105, 6.1325], 15, { animate: false }));
    await p8.waitForFunction(() => document.querySelectorAll('.mk-lbl').length >= 2, null, { timeout: 10000 })
      .catch(() => {});
    const lbl15 = await p8.$$eval('.mk-lbl', (els) => els.map((e) => e.textContent));
    ok(lbl15.some((t) => /Kathedrale/.test(t)) && !(await p8.$('.item')), 'v0.8 zoom 15: loaded sights shown before the detail search: ' + lbl15.join(', '));
    ok(!(await p8.$eval('#btnHere', (b) => b.classList.contains('dim'))), 'v0.8 "Hier suchen" normal when zoomed in');
    await p8.click('.mk.mk1, .mk.mk2, .mk.mk3, .mk.mk0');
    await p8.waitForSelector('#sheet:not([hidden])');
    // v0.8.4: a sight of the directory opens with Wikipedia intro and "Erzähl mir davon", without "Hier suchen"
    await p8.waitForSelector('#sheetBody [data-a="tell"]', { timeout: 10000 });
    await p8.waitForSelector('#plIntro:not([hidden])', { timeout: 10000 });
    ok(/ist ein Testort/.test(await p8.textContent('#plIntroText')), 'v0.8.4 directory sight: Wikipedia intro on tap: ' + (await p8.textContent('#sheetTitle')));
    if (OUT) await p8.screenshot({ path: OUT + '/14-verzeichnis-ziel.png' });
    await p8.click('[data-a="tell"]');
    await p8.waitForFunction(() => /Prompt kopiert/.test(document.getElementById('tellStatus').textContent), null, { timeout: 8000 });
    ok((await p8.evaluate(() => (window.__shared || []).length)) >= 1, 'v0.8.4 "Erzähl mir davon" from a directory sight');
    await p8.evaluate(() => history.back());
    await p8.waitForSelector('#sheet', { state: 'hidden' });
    await p8.click('#btnHere');
    await p8.waitForFunction(() => localStorage.getItem('rf.last') && !document.getElementById('btnHere').disabled, null, { timeout: 15000 });
    ok(true, 'v0.8 "Hier suchen" searches when zoomed in');
    // v0.8.3: list on/off, no place chip, location button with symbol only
    ok(await p8.$eval('#ortLabel', (el) => el.hidden) && (await p8.textContent('#btnLocate')).trim() === '◎', 'v0.8.3 no place name chip; location button only ◎');
    const h0 = await p8.$eval('#mapWrap', (el) => el.getBoundingClientRect().height);
    await p8.click('#btnList');
    await p8.waitForTimeout(200);
    const h1 = await p8.$eval('#mapWrap', (el) => el.getBoundingClientRect().height);
    ok(h1 > h0 + 150 && !(await p8.isVisible('#scroller')), 'v0.8.3 list off: map on the whole screen ' + h0 + ' -> ' + h1);
    await p8.reload(); await p8.waitForSelector('#btnList');
    ok(!(await p8.isVisible('#scroller')), 'v0.8.3 list off is remembered');
    await p8.click('#btnList'); await p8.waitForTimeout(200);
    ok(await p8.isVisible('#scroller'), 'v0.8.3 list on again');
    // ---- v0.9: route Luxemburg → Vianden by car
    await p8.click('#btnRoute');
    await p8.waitForSelector('.rt-in[data-rt="ziel"]');
    await p8.fill('.rt-in[data-rt="start"]', 'Luxemburg'); await p8.press('.rt-in[data-rt="start"]', 'Enter');
    await p8.waitForSelector('[data-a="rtpick"][data-f="start"]'); await p8.click('[data-a="rtpick"][data-f="start"]');
    await p8.fill('.rt-in[data-rt="ziel"]', 'Vianden'); await p8.click('[data-a="rtsearch"][data-f="ziel"]');
    await p8.waitForSelector('[data-a="rtpick"][data-f="ziel"]'); await p8.click('[data-a="rtpick"][data-f="ziel"]');
    ok((await p8.inputValue('.rt-in[data-rt="start"]')) === 'Luxemburg' && (await p8.inputValue('.rt-in[data-rt="ziel"]')) === 'Vianden', 'v0.9 route: start and destination picked');
    await p8.click('[data-a="rtmode"][data-m="auto"]');
    if (OUT) await p8.screenshot({ path: OUT + '/15-strecke-eingabe.png' });
    await p8.click('[data-a="rtgo"]');
    await p8.waitForFunction(() => /Halte? entlang der Strecke/.test(document.getElementById('toast').textContent), null, { timeout: 30000 });
    const rt = await p8.$$eval('.vz-item', (els) => els.map((e) => e.querySelector('b').textContent + ' | ' + e.querySelector('.small').textContent));
    ok(rt.length === 2 && /^Luxemburg \| km 0/.test(rt[0]) && /^Burg Vianden \| km \d+/.test(rt[1]) && !rt.some((t) => /Kanton|Altstadt/.test(t)),
      'v0.9.2 short drive: best stops, one per town (Luxemburg stands for its old town), in order with km and detour: ' + rt.join(' / '));
    ok(/2 Halte, ab ★/.test(await p8.textContent('.rt-head')), 'v0.9.2 header: stops and stars: ' + await p8.textContent('.rt-head'));
    const kms = rt.map((t) => +(/km (\d+)/.exec(t) || [0, 0])[1]);
    ok(kms.every((k, i) => i === 0 || k >= kms[i - 1]), 'v0.9 sorted by km from start: ' + kms.join(','));
    ok((await p8.textContent('.rt-head')).includes('Luxemburg → Vianden') && (await p8.textContent('.rt-head')).includes('Luftlinie'), 'v0.9 route header');
    ok(await p8.evaluate(() => document.querySelectorAll('.leaflet-overlay-pane path').length >= 1), 'v0.9 route line on the map');
    await p8.waitForFunction(() => document.querySelectorAll('.ct, .mk').length >= 2, null, { timeout: 5000 }).catch(() => {});
    const rtMarks = await p8.$$eval('.ct-lbl, .mk-lbl', (els) => els.map((e) => e.textContent));
    ok(rtMarks.includes('Luxemburg') && rtMarks.includes('Burg Vianden') && !rtMarks.includes('Altstadt Luxemburg'), 'v0.9 route: stops on the map: ' + rtMarks.join(', '));
    ok(await p8.$eval('#zoomHint', (el) => el.hidden), 'v0.9 no "Hier suchen" hint with a route');
    if (OUT) await p8.screenshot({ path: OUT + '/16-strecke.png' });
    await p8.click('[data-a="rtend2"]');
    await p8.waitForFunction(() => !document.querySelector('.rt-head'));
    ok(true, 'v0.9 route ended');
    // settings
    await p8.click('#btnSettings');
    await p8.waitForFunction(() => /Stücke gespeichert/.test(document.getElementById('sheetBody').textContent));
    ok((await p8.textContent('#sheetBody')).includes('Verzeichnis (Ziele auf der Karte)'), 'v0.8 settings section');
    ok(e8.filter((e) => !/Failed to load resource/.test(e)).length === 0, 'v0.8: no JS errors ' + e8.join(' | '));
    await c8.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`${passes} ok, ${fails} fehlgeschlagen`);
if (fails) process.exit(1);
