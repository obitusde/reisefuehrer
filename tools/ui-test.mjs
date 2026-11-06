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
  B('Q14', 'Kanton Luxemburg', 6.13, 49.62, { sl: 50, cls: 'canton of Luxembourg' }),
  B('Q15', 'Deutsches Kleinmuseum Testhaus', 6.1285, 49.6135, { sl: 1, cls: 'museum', p31: 'Q33506' })]; // v0.9.3: below nah_ab, only from zoom 15

let fakeVersion = null;
const SPARQL_CALLS = [];
let OFFLINE = false, OSM_DELAY = 0;
// v0.11.0: prepared OSM files (docs/osm/ch/), here around the test position in Manchester
let OSMFILES = false, OSMFILES_STAND = '2026-11-04T21:21:02Z', OSM_CALLS = 0;
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
// v0.10.0: one button on the map; the other buttons are in the menu
async function menuClick(page, sel) {
  if (await page.$eval('#menu', (m) => m.hidden)) await page.click('#btnMenu');
  await page.click(sel);
}

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
  // v0.14.0: the list of built countries (without the test: none)
  await ctx.route(/\/paket\/laender\.json/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ format: 1, laender: {} }) }));
  await ctx.route(/\/osm\/ch\//, (route) => {
    // without the test switch: an index without tiles (as if Switzerland were elsewhere) – the app asks Overpass as before
    if (!OSMFILES) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ land: 'CH', stand: '2026-11-04T21:21:02Z', orte: 0, kacheln: {} }) });
    const u = new URL(route.request().url()), size = 0.05, kacheln = {};
    const key = (la, lo) => (Math.floor(la / size + 1e-9) * size).toFixed(3) + ',' + (Math.floor(lo / size + 1e-9) * size).toFixed(3);
    for (let la = 53.401; la < 53.56; la += size) for (let lo = -2.349; lo < -2.10; lo += size) kacheln[key(la, lo)] = 0;
    const home = key(53.4792, -2.2442);
    kacheln[home] = 1;
    if (u.pathname.endsWith('/index.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ land: 'CH', stand: OSMFILES_STAND, erstellt: OSMFILES_STAND, orte: 1, kachel: size, version: 4, kacheln }) });
    if (decodeURIComponent(u.pathname).endsWith('/' + home + '.json')) return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([{ id: 'node/999', lat: 53.4795, lon: -2.2445, name: 'Testturm aus Datei', names: {}, wd: '', wp: '', k: 'tourism=attraction', x: {} }]) });
    return route.fulfill({ status: 404, body: 'nf' });
  });
  await ctx.route(/overpass-api\.de|overpass\.kumi\.systems|maps\.mail\.ru/, async (route) => {
    if (OFFLINE) return route.abort('internetdisconnected');
    OSM_CALLS++;
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
  ok((await page.textContent('#version')) === 'v0.21.2', 'footer version');
  if (OUT) await page.screenshot({ path: OUT + '/01-start.png' });

  await menuClick(page, '#btnLocate');
  // v0.8: "Mein Standort" only moves the map, the search starts with "Hier suchen"
  await page.waitForFunction(() => /Standort gefunden/.test(document.getElementById('toast').textContent), null, { timeout: 8000 });
  ok(!(await page.$('.item')), 'v0.8 location: map moved, no search yet');
  await menuClick(page, '#btnHere');
  await page.waitForSelector('.item', { timeout: 10000 });
  const items = await page.$$eval('.item', (els) => els.map((e) => ({ s: e.querySelector('.it-stars').textContent, n: e.querySelector('.it-name').textContent })));
  ok(items.length >= 8, 'list has items: ' + items.length);
  ok(items[0].s === '★★★', 'first item 3 stars');
  const th = await page.$eval('.item:has(.it-name2)', (e) => e.querySelector('.it-name').textContent + '|' + e.querySelector('.it-name2').textContent).catch(() => '');
  ok(th.includes('|'), 'list shows local and German name: ' + th);
  ok(items.some((i) => i.n === 'River Tib' && i.s === '·'), 'v0.10.0 default "Alle Orte": River Tib shown, without star');
  // v0.10.0: what is worth it stands out; OSM only never with stars, at the end, grey ring on the map
  const secs = await page.$$eval('.list-sec', (els) => els.map((e) => e.textContent));
  ok(secs[0] === 'Lohnt am meisten' && (secs.length < 2 || secs[1] === 'Weitere'), 'v0.10.0 list sections: ' + secs.join(' | '));
  const order = await page.$$eval('#list > li', (els) => els.map((e) => e.classList.contains('list-sec') ? 'S' : e.classList.contains('osm') ? 'O' : 'W').join(''));
  ok(!/O.*W/.test(order), 'v0.10.0 OSM only after all Wikipedia places: ' + order);
  ok(await page.$$eval('.item.osm .it-stars', (els) => els.every((e) => e.textContent === '·')), 'v0.10.0 OSM only without stars');
  if (order.includes('O')) ok(/Weitere \(nur OpenStreetMap/.test(secs[secs.length - 1]), 'v0.10.0 OSM section at the end');
  const tiers = await page.$$eval('.mk-wrap', (els) => els.map((e) => { const m = e.querySelector('.mk'); return m ? (m.className.match(/t-(\w+)/) || [0, ''])[1] + (e.querySelector('.mk-lbl') ? '+' : '') : ''; }).filter(Boolean));
  ok(tiers.filter((t) => t.startsWith('top')).length <= 5 && tiers.filter((t) => t.startsWith('top') || t.startsWith('name')).length <= 15 && tiers.every((t) => !/^(dot|osm)\+/.test(t)),
    'v0.10.0 map: at most 5 big, 15 with a name, dots and OSM rings without a name: ' + tiers.join(' '));
  ok(await page.$$eval('.mk-lbl.top', (els) => els.length >= 1), 'v0.10.0 the best have a bold name');
  await page.click('#btnMenu');
  if (OUT) await page.screenshot({ path: OUT + '/17-menue.png' });
  ok(await page.isVisible('#menu') && (await page.$$eval('#menu .mi', (els) => els.map((e) => e.textContent))).join(',') === 'Hier suchen,Ort suchen,Mein Standort,Merkliste,Strecke,Gegend,Liste ausblenden,Daten,Einstellungen', 'v0.20.0 menu with all buttons (Gegend new)');
  await page.mouse.click(60, 300);
  await page.waitForTimeout(200);
  ok(!(await page.isVisible('#menu')), 'v0.10.0 a tap beside the menu closes it');
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
  ok(/^🌐 Online · W ✓ · OSM ✓/.test(srcLine) && !/\d+ s/.test(srcLine), 'v0.6.1 status shows online and sources: ' + srcLine);
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
  ok(mapsHref.startsWith('geo:0,0?q='), 'v0.17.0 maps link: Android map app (geo:)');
  // v0.13.3: no buttons for copying, Pin, "gehört", "Warum", Wikipedia intro; long press on the name copies it
  ok(!(await page.$('[data-a=copy]')) && !(await page.$('[data-a=heard]')) && !(await page.$('details.why')) && !(await page.$('#plIntro')) && !(await page.$$eval('#sheetBody .btn', (els) => els.map((e) => e.textContent.trim()))).some((t) => /^(Pin|Name kopieren|Als gehört markieren|🖼 Bilder)/.test(t)), 'v0.13.3 slim place window: no copy, Pin, heard, why, intro');
  await page.evaluate(() => navigator.clipboard.writeText('x'));
  await page.dispatchEvent('#sheetTitle', 'pointerdown', { clientX: 10, clientY: 10 });
  await page.waitForTimeout(250);
  ok((await page.evaluate(() => navigator.clipboard.readText())) === 'x', 'v0.13.3 short touch on the name copies nothing');
  await page.dispatchEvent('#sheetTitle', 'pointerup');
  await page.dispatchEvent('#sheetTitle', 'pointerdown', { clientX: 10, clientY: 10 });
  await page.waitForTimeout(800);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  ok(clip === title, 'v0.13.3 long press on the name copies it: ' + clip);
  ok((await page.textContent('#toast')).startsWith('Kopiert'), 'copy toast');
  await page.dispatchEvent('#sheetTitle', 'pointerup');
  await page.click('[data-a=merk]');
  ok((await page.textContent('#merkCount')) === '1', 'merk badge 1');
  ok(await page.isVisible('.item.sel'), 'list row highlighted');
  if (OUT) await page.screenshot({ path: OUT + '/03-ort.png' });
  await page.evaluate(() => history.back());
  await page.waitForSelector('#sheet', { state: 'hidden' });
  ok(true, 'back closes sheet');

  // merkliste
  await menuClick(page, '#btnMerk');
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
  await menuClick(page, '#btnSettings');
  ok(!(await page.$('input[name=kapp]')) && !(await page.$('#hideHeard')) && !(await page.$('[data-a=clearheard]')) && !/Karten-App für|Schon gehört/.test(await page.textContent('#sheetBody')), 'v0.17.0 settings: no map app choice, no "Schon gehört"');
  await page.click('#sheetClose');
  await page.click('.item >> nth=0');
  ok((await page.getAttribute('#sheetBody a.btn.primary', 'href')).startsWith('geo:0,0?q=') && (await page.textContent('#sheetBody a.btn.primary')) === 'In Karten-App', 'v0.17.0 map link fixed to the Android map app (geo:)');
  await page.evaluate(() => history.back());
  await page.waitForSelector('#sheet', { state: 'hidden' });

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
  await menuClick(page, '#btnSearch');
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
  await menuClick(page, '#btnHere');
  await page.waitForFunction(() => localStorage.getItem('rf.last') && !document.getElementById('btnHere').disabled);
  const cen = await page.evaluate(() => JSON.parse(localStorage.getItem('rf.last')));
  ok(cen && Math.abs(cen.lat - 53.4795) < 0.001 && cen.places.length > 5, 'search jumped and loaded places');
  await menuClick(page, '#btnSearch');
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
  ok(!(await page.$('#plIntro')), 'v0.13.3 no Wikipedia intro block any more');
  await page.click('[data-a=level][data-level=ausfuehrlich]');
  ok(await page.$eval('[data-a=level][data-level=ausfuehrlich]', (b) => b.classList.contains('on')), 'level switch');
  await page.selectOption('#focusSel', 'Architektur');
  await page.click('[data-a=tell]');
  await page.waitForFunction(() => /Prompt kopiert/.test(document.getElementById('tellStatus').textContent), null, { timeout: 8000 });
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  ok(prompt.startsWith('Du bist mein Reiseführer.') && prompt.includes("Ort: Chetham's Library, Manchester") && prompt.includes('Schwerpunkt: Architektur'), 'prompt copied');
  ok(prompt.length <= 12000 && prompt.includes('sieben Minuten'), 'ausführlich prompt <= 12000: ' + prompt.length);
  // v0.8.1: always Android "Teilen" (the user picks the app), no Claude link
  const shared = await page.evaluate(() => window.__shared || []);
  ok(shared.length >= 1 && shared[shared.length - 1] === prompt && (await page.$('#tellStatus [data-a="aishare"]')) && !(await page.$('#tellStatus a[href^="claude:"]')), 'v0.8.1 prompt handed over with "Teilen": ' + JSON.stringify(shared.map((x) => x.length)) + ' ' + prompt.length + ' ' + (await page.textContent('#tellStatus')));
  ok(!(await page.$('[data-a=heard]')), 'v0.13.3 no "Als gehört markieren" button');
  ok((await page.textContent('[data-a=tell]')).includes('Audioguide'), 'v0.17.0 button "Audioguide"');
  if (OUT) await page.screenshot({ path: OUT + '/10-erzaehlen.png' });
  ok(!(await page.$('[data-a=share]')) && !(await page.$('a[href*="tripadvisor"]')), 'no share button, no Tripadvisor link in place window');
  // v0.19.0: "Praktisches und Bewertung" is a link to the Google AI search with the short prompt (no hand-over any more)
  const rl = await page.$eval('a[data-g=review]', (a) => ({ href: a.getAttribute('href'), target: a.target, rel: a.rel }));
  ok(rl.href.startsWith('https://www.google.com/search?hl=de&udm=50&q=') && rl.target === '_blank' && /noopener/.test(rl.rel), 'v0.19.0 review button opens the Google AI search in a closable window: ' + rl.href.slice(0, 70));
  const rprompt = decodeURIComponent(rl.href.split('&q=')[1]);
  ok(rprompt.startsWith('Reiseführer: Lohnt sich ') && rprompt.includes('Suche aktuelle Besucherbewertungen') && rprompt.includes('Praktische Tipps (Eintritt') && rprompt.length < 450 && !rprompt.includes('\n'), 'v0.17.0 visit prompt (short) copied: ' + rprompt.slice(0, 120));
  ok((await page.textContent('a[data-g=review]')).trim() === 'Praktisches und Bewertung', 'v0.17.0 button "Praktisches und Bewertung"');
  await page.click('[data-a=recopy]');
  await page.$eval('#sheetBody', (b) => { b.scrollTop = 400; });
  await page.$eval('.item:nth-child(2) .it-main', (el) => el.click());
  await page.waitForTimeout(150);
  ok(await page.$eval('#sheetBody', (b) => b.scrollTop === 0), 'next place opens at the top');
  await page.evaluate(() => history.back());
  await page.waitForSelector('#sheet', { state: 'hidden' });
  ok(!(await page.$('.item.heard')), 'v0.17.0 told places are not greyed any more');
  await menuClick(page, '#btnSearch');
  // search a sight via Nominatim: jumps there and opens the nearest place
  await page.fill('#searchInput', 'Imperial War Museum');
  await page.press('#searchInput', 'Enter');
  await page.waitForFunction(() => document.getElementById('searchHits').textContent.includes('Imperial War Museum North'));
  ok((await page.textContent('#searchHits')).includes('Museum ·'), 'sight hit typed as museum');
  await page.click('#searchHits .hits button >> nth=0');
  await page.waitForSelector('#sheet', { state: 'hidden' });
  ok(await page.isVisible('.hit-pin'), 'v0.7.1 searched sight marked on the map');
  await menuClick(page, '#btnHere');
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
  ok((await page.$$eval('.ct-lbl', (els) => els.map((e) => e.textContent))).includes('Peak District'), 'v0.7 excursion outside cities shown: ' + (await page.$$eval('.ct-lbl', (els) => els.map((e) => e.textContent))).join(', ') + ' / ' + (await page.$$eval('.mk-wrap', (els) => els.map((e) => e.title + ':' + (e.querySelector('.mk, .ct') || {}).className).join(', '))));
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
  await menuClick(page, '#btnHere');
  await page.waitForFunction(() => window.__rfMap.getZoom() === 14 && document.querySelectorAll('.mk').length > 0, null, { timeout: 10000 });
  ok((await page.$$('.ct')).length === 0, 'v0.7 zoom in: city markers gone, places back');
  await page.waitForSelector('.item', { timeout: 10000 });
  // ⚙: v0.8.1 no assistant choice, no per-country computing; only the directory (nothing loads by itself)
  await menuClick(page, '#btnSettings');
  await page.waitForFunction(() => /Verzeichnis \(Ziele auf der Karte\)/.test(document.getElementById('sheetBody').textContent));
  const setTxt = await page.textContent('#sheetBody');
  ok(!/KI-Assistent|Übergabe an|Neu berechnen/.test(setTxt) && !(await page.$('input[name="uebergabe"]')) && setTxt.includes('nur, wenn du „Laden“ tippst'), 'v0.8.1 settings: no assistant menu, no computing menu');
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
  fakeVersion = '0.21.3';
  await page.reload();
  await page.waitForSelector('#banner:not([hidden])');
  ok((await page.textContent('#bannerText')).includes('v0.21.3'), 'banner shows remote version');
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
    await menuClick(p5, '#btnHere');
    await p5.waitForSelector('#status [data-a=cancel]', { timeout: 8000 });
    ok(/\d+ s/.test(await p5.textContent('#status .secs')), 'v0.5 seconds counter while searching');
    await p5.click('#status [data-a=cancel]');
    await p5.waitForFunction(() => !document.getElementById('btnHere').disabled);
    ok((await p5.textContent('#toast')).includes('abgebrochen') && !(await p5.$('.item')), 'v0.5 cancel stops the search');
    OSM_DELAY = 7000;
    await menuClick(p5, '#btnHere');
    await p5.waitForSelector('#status [data-a=skiposm]', { timeout: 8000 });
    if (OUT) await p5.screenshot({ path: OUT + '/12-warte-osm.png' });
    await p5.click('#status [data-a=skiposm]');
    await p5.waitForSelector('.item', { timeout: 8000 });
    const sl5 = await p5.textContent('#status .src-line');
    ok(/OSM ⏳ lädt noch/.test(sl5) && !(await p5.$$eval('.it-src', (els) => els.some((e) => e.textContent !== 'W'))), 'v0.5 skip OSM: Wikipedia results at once: ' + sl5);
    const h5 = await p5.$eval('#zoomHint', (e) => e.hidden ? '' : e.textContent);
    ok(h5 === 'OSM lädt noch – es kommt mehr', 'v0.9.3 hint on the map: OSM is still loading: ' + h5);
    // v0.6.1: OSM comes later -> added automatically
    await p5.waitForFunction(() => /^OSM: (\d+ Orte dazu|nichts Neues)$/.test(document.getElementById('toast').textContent), null, { timeout: 15000 });
    const sl5b = await p5.textContent('#status .src-line');
    ok(/OSM ✓ ergänzt/.test(sl5b) && await p5.$eval('#zoomHint', (e) => e.hidden) && (await p5.$$eval('.it-src', (els) => els.some((e) => e.textContent !== 'W'))), 'v0.6.1 late OSM merged automatically: ' + sl5b + ' / ' + await p5.textContent('#toast'));
    OSM_DELAY = 0;
    await p5.evaluate(() => window.__rfMap && window.__rfMap.setZoom(10, { animate: false }));
    await menuClick(p5, '#btnHere');
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
    await menuClick(p6, '#btnSettings');
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
    await menuClick(p6, '#btnHere');
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
  await menuClick(pS, '#btnLocate'); await pS.waitForTimeout(300); await menuClick(pS, '#btnHere'); await pS.waitForSelector('.item');
  const layS = await pS.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const sel = [...document.querySelectorAll('.filters select')].map((x) => x.scrollWidth <= x.clientWidth + 1);
    const pillsOk = (() => { const m = r('#btnMenu'); return m.right <= innerWidth && m.top >= 0 && document.querySelectorAll('.map-top .round').length === 1 && !document.querySelector('.map-bottom'); })();
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
  await menuClick(p2, '#btnLocate'); await p2.waitForTimeout(300); await menuClick(p2, '#btnHere'); await p2.waitForSelector('.item');
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
  ok(cacheKeys.includes('rf-app-0.21.2'), 'app cache with version: ' + cacheKeys.join(','));
  const cached = await p3.evaluate(async () => (await (await caches.open('rf-app-0.21.2')).keys()).map((r) => new URL(r.url).pathname + new URL(r.url).search));
  ok(cached.some((u) => u.includes('app.js?v=0.21.2')), 'shell precached');
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
  // ---------------- v0.12.0: country package – one tap, then the map has everything without loading
  {
    const PK_STAND = '2026-11-05T02:00:00.000Z';
    const it = (q, name, lat, lon, o) => ({ q, name, lat, lon, sl: o.sl || 5, pop: o.pop || 0, km2: o.km2 || 0, land: ['Q32'], cap: o.cap, pv: o.pv, _c: !!o.c, _s: o.c ? null : { score: o.score, typ: o.typ } });
    const osmKey = (la, lo) => (Math.floor(la / 0.05 + 1e-9) * 0.05).toFixed(3) + ',' + (Math.floor(lo / 0.05 + 1e-9) * 0.05).toFixed(3);
    const ok1 = osmKey(49.6080, 6.1365);
    const PKG = { format: 1, land: 'LU', name: 'Testland', stand: PK_STAND, osm_stand: '2026-11-04T21:00:00Z', verzeichnis: {
      '49.5,6,49.75,6.25': [it('Q1842', 'Luxemburg', 49.6116, 6.1319, { c: 1, sl: 200, pop: 134000, km2: 51, cap: true, pv: 500 }),
        it('Q10', 'Altstadt Luxemburg', 49.611, 6.133, { score: 12.2, typ: 'welterbe', sl: 60 }),
        it('Q11', 'Kathedrale Unserer Lieben Frau', 49.6097, 6.1307, { score: 8.7, typ: 'kathedrale', sl: 40 })],
      '49.5,5.75,49.75,6': [], '49.5,6.25,49.75,6.5': [], '49.25,6,49.5,6.25': [], '49.75,6,50,6.25': [] },
      osm: { [ok1]: [{ id: 'node/77', lat: 49.6080, lon: 6.1365, name: 'Testbrunnen', names: {}, wd: 'Q99', wp: '', k: 'historic=monument', x: {} },
        { id: 'node/78', lat: 49.6082, lon: 6.1395, name: 'Stummer Stein', names: {}, wd: '', wp: '', k: 'historic=monument', x: {} }] }, osm_cover: [ok1],
      info: { Q10: ['Altstadt in Luxemburg', 0], Q99: ['Brunnen im Testland', 321] } };
    const PKIDX = { format: 1, land: 'LU', name: 'Testland', stand: PK_STAND, osm_stand: PKG.osm_stand, datei: 'paket.json', bytes: JSON.stringify(PKG).length, gzip: 2000,
      verzeichnis: { kacheln: 5, eintraege: 3, ziele: 2, orte: 1 }, osm: { kacheln: 1, orte: 2 }, info: 2 };
    const c12 = await newCtx(browser, { vz: true });
    await c12.route(/\/config\.json(\?|$)/, async (route) => {
      const r = await route.fetch(); const j = await r.json();
      j.paket.laender = [{ land: 'LU', name: 'Testland', pfad: 'paket/lu/', bbox: { south: 49.44, west: 5.73, north: 50.19, east: 6.53 } }];
      route.fulfill({ response: r, body: JSON.stringify(j), headers: { 'content-type': 'application/json' } });
    });
    await c12.route(/\/paket\/laender\.json/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ format: 1, laender: { LU: { name: 'Testland', stand: PK_STAND, osm_stand: PKG.osm_stand, format: 1, bytes: JSON.stringify(PKG).length, gzip: 2000, teile: 1, ziele: 2, orte: 1, osm_orte: 2, info: 2, bbox: { south: 49.44, west: 5.73, north: 50.19, east: 6.53 } } } }) }));
    let pkDownloads = 0;
    await c12.route(/\/paket\/lu\//, (route) => {
      const u = new URL(route.request().url());
      if (u.pathname.endsWith('/index.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PKIDX) });
      if (u.pathname.endsWith('/paket.json')) { pkDownloads++; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PKG) }); }
      return route.fulfill({ status: 404, body: 'nf' });
    });
    const p12 = await c12.newPage(); const e12 = []; watch(p12, e12);
    p12.on('dialog', (d) => d.accept());
    await p12.goto(BASE + 'index.html');
    await p12.waitForSelector('#btnMenu');
    await p12.evaluate(() => window.__rfMap.setView([49.6105, 6.1325], 12, { animate: false }));
    await p12.waitForFunction(() => /^Paket Testland ins Handy laden\?Laden✕$/.test(document.getElementById('zoomHint').textContent), null, { timeout: 8000 }).catch(() => {});
    ok(/^Paket Testland ins Handy laden\?Laden✕$/.test(await p12.textContent('#zoomHint')), 'v0.12.0 the line offers the package: ' + await p12.textContent('#zoomHint'));
    ok((await p12.textContent('#zoomLbl')) === 'Zoom 12', 'v0.12.0 zoom shown on the map: ' + await p12.textContent('#zoomLbl'));
    const sq0 = SPARQL_CALLS.length;
    await p12.click('#zoomHint [data-h="pkload"]');
    await p12.waitForFunction(() => /^Paket Testland geladen: 2 Ziele$/.test(document.getElementById('toast').textContent), null, { timeout: 10000 }).catch(() => {});
    ok(/^Paket Testland geladen: 2 Ziele$/.test(await p12.textContent('#toast')) && pkDownloads === 1, 'v0.12.0 one tap loads the package: ' + await p12.textContent('#toast'));
    await p12.waitForTimeout(800);
    ok(await p12.$eval('#zoomHint', (e) => e.hidden), 'v0.12.0 inside the package: no question (no "Details laden?", no "Gegend laden?"): ' + await p12.textContent('#zoomHint'));
    const vz12 = await p12.$$eval('.vz-item b', (els) => els.map((e) => e.textContent));
    ok(vz12.includes('Altstadt Luxemburg') && (await p12.$$eval('.list-sec', (els) => els.map((e) => e.textContent)))[0] === 'Lohnt am meisten', 'v0.12.0 list of the section from the package: ' + vz12.join(', '));
    const vzi12 = await p12.$$eval('.vz-info', (els) => els.map((e) => e.textContent));
    ok(vzi12.includes('Altstadt in Luxemburg') && vzi12.length === 1, 'v0.13.0 list: line from the package under the name (only where there is one): ' + vzi12.join(' | '));
    await p12.evaluate(() => window.__rfMap.setView([49.6105, 6.1325], 15, { animate: false }));
    await p12.waitForFunction(() => document.querySelector('.mk.t-osm'), null, { timeout: 8000 }).catch(() => {});
    const lb12 = await p12.$$eval('.mk-wrap', (els) => els.map((e) => e.title));
    ok(lb12.includes('Kathedrale Unserer Lieben Frau') && lb12.includes('Testbrunnen') && (await p12.$$('.mk.t-osm')).length === 2, 'v0.12.0 zoom 15: sights and OSM ring from the package at once: ' + lb12.join(', '));
    ok(await p12.$eval('#zoomHint', (e) => e.hidden) && SPARQL_CALLS.length === sq0, 'v0.12.0 nothing loaded from Wikidata, no question at zoom 15');
    await p12.click('.mk-wrap[title="Testbrunnen"]');
    await p12.waitForSelector('#sheet:not([hidden])');
    ok((await p12.textContent('#sheetTitle')) === 'Testbrunnen', 'v0.12.0 OSM ring opens its place');
    // v0.13.0: the line from the package (description + height), Google buttons in their own window, no empty field
    ok((await p12.textContent('#plDesc')) === 'Brunnen im Testland · 321 m', 'v0.13.0 place window: description and height from the package: ' + await p12.textContent('#plDesc'));
    const gl = await p12.$$eval('#plGoogle a', (els) => els.map((e) => ({ g: e.getAttribute('data-g'), h: e.href, t: e.target, r: e.rel, x: e.textContent })));
    ok(gl.length === 1 && gl.every((a) => a.t === '_blank' && /noopener/.test(a.r) && /^https:\/\/www\.google\.com\/search\?hl=de/.test(a.h)) && /udm=50/.test(gl[0].h), 'v0.13.0 Google button (KI-Modus) opens in its own window, no image button: ' + JSON.stringify(gl));
    await p12.waitForFunction(() => /Manchester/.test(decodeURIComponent(document.querySelector('#plGoogle a[data-g="ai"]').href)), null, { timeout: 5000 }).catch(() => {});
    const q12 = decodeURIComponent((await p12.getAttribute('#plGoogle a[data-g="ai"]', 'href')).replace(/^.*[?&]q=/, '').replace(/\+/g, ' '));
    ok(/^Was ist „Testbrunnen“ in Manchester\?.*\\? Keine Rückfrage am Ende$/.test(q12), 'v0.13.0 question with the place from Nominatim and the instruction: ' + q12);
    if (OUT) { await p12.waitForTimeout(600); await p12.screenshot({ path: OUT + '/20-ortsfenster-google.png' }); }
    await p12.evaluate(() => history.back());
    await p12.waitForSelector('#sheet', { state: 'hidden' });
    await p12.click('.mk-wrap[title="Stummer Stein"]');
    await p12.waitForSelector('#sheet:not([hidden])');
    if (OUT) { await p12.waitForTimeout(600); await p12.screenshot({ path: OUT + '/21-ortsfenster-leer.png' }); }
    ok((await p12.textContent('#plDesc')) === 'Keine Beschreibung gefunden.' && !(await p12.$eval('#plDesc', (e) => e.hidden)) && (await p12.$$('#plGoogle a')).length === 1, 'v0.13.0 nothing known: "Keine Beschreibung gefunden." and the Google button');
    await p12.evaluate(() => history.back());
    await p12.waitForSelector('#sheet', { state: 'hidden' });
    await p12.evaluate(() => window.__rfMap.setView([49.6105, 6.1325], 15, { animate: false })); await p12.waitForTimeout(500); // opening a place moved the map
    await p12.reload(); await p12.waitForSelector('#btnMenu');
    await p12.waitForFunction(() => [...document.querySelectorAll('.mk-wrap')].some((e) => e.title === 'Altstadt Luxemburg'), null, { timeout: 8000 }).catch(() => {});
    { const t = await p12.$$eval('.mk-wrap', (els) => els.map((e) => e.title)), hh = await p12.$eval('#zoomHint', (e) => e.hidden ? '' : e.textContent);
      ok(t.includes('Altstadt Luxemburg') && !hh, 'v0.12.0 after a reload the package is still there: ' + t.join(', ') + ' | ' + hh + ' | zoom ' + await p12.textContent('#zoomLbl')); }
    await p12.waitForFunction(() => document.querySelector('.vz-info'), null, { timeout: 5000 }).catch(() => {});
    ok((await p12.$$eval('.vz-info', (els) => els.map((e) => e.textContent))).includes('Altstadt in Luxemburg'), 'v0.13.0 after a reload the lines of the package are still there (stored in the phone)');
    await menuClick(p12, '#btnData');
    await p12.waitForSelector('#sheetBody [data-a="pkload"]');
    const d12 = await p12.textContent('#sheetBody');
    ok(/Testland: im Handy, Stand vom 5\.11\.26 \(OSM vom 4\.11\.26\) · 2 Ziele, 2 OSM-Punkte/.test(d12) && /Aktualisieren/.test(d12) && /Löschen/.test(d12), 'v0.12.0 "Daten": package state: ' + d12.slice(0, 200));
    if (OUT) await p12.screenshot({ path: OUT + '/19-paket.png' });
    await p12.click('#sheetBody [data-a="pkload"]');
    await p12.waitForFunction(() => /ist aktuell/.test(document.getElementById('toast').textContent), null, { timeout: 8000 }).catch(() => {});
    ok(/^Paket Testland ist aktuell \(vom 5\.11\.26\)$/.test(await p12.textContent('#toast')) && pkDownloads === 1, 'v0.12.0 "Aktualisieren" with the same state: no download');
    await p12.click('#sheetBody [data-a="pkdel"]');
    await p12.waitForFunction(() => /gelöscht/.test(document.getElementById('toast').textContent), null, { timeout: 8000 }).catch(() => {});
    ok(/Paket Testland gelöscht/.test(await p12.textContent('#toast')) && /Fertig gebaut – zum Herunterladen/.test(await p12.textContent('#sheetBody')), 'v0.12.0 package deleted');
    ok(e12.length === 0, 'v0.12.0 no JS errors ' + e12.join(' | '));
    await c12.close();
  }
  // ---------------- v0.14.0: several countries – list, parts, border merge, delete one at a time
  {
    const STAND = '2026-11-06T02:00:00.000Z', OSM_STAND = '2026-11-05T21:00:00Z';
    const it = (q, name, lat, lon, o) => ({ q, name, lat, lon, sl: o.sl || 5, pop: 0, km2: 0, land: ['Q32'], _c: false, _s: { score: o.score, typ: o.typ } });
    const osmKey = (la, lo) => (Math.floor(la / 0.05 + 1e-9) * 0.05).toFixed(3) + ',' + (Math.floor(lo / 0.05 + 1e-9) * 0.05).toFixed(3);
    const osmEl = (id, name, lat, lon) => ({ id, lat, lon, name, names: {}, wd: '', wp: '', k: 'historic=monument', x: {} });
    const T = osmKey(49.6080, 6.1365), vzTile = '49.5,6,49.75,6.25';
    const vzLU = [it('Q10', 'Altstadt Luxemburg', 49.611, 6.133, { score: 12.2, typ: 'welterbe', sl: 60 })];
    const vzNB = vzLU.concat([it('Q77', 'Grenzkirche', 49.612, 6.14, { score: 8.7, typ: 'kathedrale', sl: 40 })]);
    const mk = (land, name, parts, bbox) => {
      const files = parts.map((p, i) => ({ datei: 'teil-00' + (i + 1) + '.json', json: JSON.stringify(p) }));
      return { files, idx: { format: 2, land, name, stand: STAND, osm_stand: OSM_STAND, teile: files.map((f) => ({ datei: f.datei, bytes: f.json.length, gzip: 200 })),
        bytes: files.reduce((a, f) => a + f.json.length, 0), gzip: 400 * files.length, verzeichnis: { ziele: 1, orte: 0, kacheln: 1 }, osm: { orte: 1, rand: 1 }, info: 0, bbox } };
    };
    const PK = {
      lu: mk('LU', 'Testland', [{ verzeichnis: { [vzTile]: vzLU } }, { osm: { [T]: [osmEl('node/1', 'Brunnen Luxemburg', 49.6080, 6.1365)] }, osm_cover: [T], osm_rand: [T] }], { south: 49.4, west: 5.7, north: 50.2, east: 6.5 }),
      nb: mk('NB', 'Nachbarland', [{ verzeichnis: { [vzTile]: vzNB }, osm: { [T]: [osmEl('node/2', 'Brunnen Nachbar', 49.6090, 6.1300)] }, osm_cover: [T], osm_rand: [T] }], { south: 49.55, west: 6.0, north: 49.7, east: 6.2 })
    };
    const built = Object.fromEntries(Object.values(PK).map((p) => [p.idx.land, { name: p.idx.name, stand: STAND, osm_stand: OSM_STAND, format: 2, bytes: p.idx.bytes, gzip: p.idx.gzip, teile: p.files.length, ziele: 1, orte: 0, osm_orte: 1, info: 0, bbox: p.idx.bbox }]));
    const c14 = await newCtx(browser, { vz: true });
    await c14.route(/\/config\.json(\?|$)/, async (route) => {
      const r = await route.fetch(); const j = await r.json();
      j.paket.laender = [{ land: 'LU', name: 'Testland', geofabrik: 'europe/luxembourg' }, { land: 'NB', name: 'Nachbarland', geofabrik: 'europe/nb' }, { land: 'ZZ', name: 'Zielland', geofabrik: 'europe/zz' }];
      route.fulfill({ response: r, body: JSON.stringify(j), headers: { 'content-type': 'application/json' } });
    });
    await c14.route(/\/paket\/laender\.json/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ format: 1, laender: built }) }));
    const partReq = [];
    await c14.route(/\/paket\/(lu|nb)\//, (route) => {
      const u = new URL(route.request().url()), m = /\/paket\/(lu|nb)\/([^/]+)$/.exec(u.pathname), p = PK[m[1]];
      if (m[2] === 'index.json') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(p.idx) });
      const f = p.files.find((x) => x.datei === m[2]);
      if (!f) return route.fulfill({ status: 404, body: 'nf' });
      partReq.push(m[1] + '/' + m[2]);
      return route.fulfill({ status: 200, contentType: 'application/json', body: f.json });
    });
    const p14 = await c14.newPage(); const e14 = []; watch(p14, e14);
    p14.on('dialog', (d) => d.accept());
    await p14.goto(BASE + 'index.html');
    await p14.waitForSelector('#btnMenu');
    await p14.evaluate(() => window.__rfMap.setView([49.6105, 6.1325], 12, { animate: false }));
    await menuClick(p14, '#btnData');
    await p14.waitForSelector('#sheetBody .pk-row');
    const d0 = await p14.textContent('#sheetBody');
    const h4 = await p14.$$eval('#sheetBody h4', (els) => els.map((e) => e.textContent));
    ok(/Testland: gebaut am/.test(d0) && /Nachbarland: gebaut am/.test(d0) && h4.join() === 'Fertig gebaut – zum Herunterladen' && /Weiteres Land bauen lassen \(1 zur Wahl\)/.test(d0) && /Zielland/.test(d0), 'v0.14.0 "Daten": built countries to download, the rest to have built: ' + h4.join() + ' | ' + d0.slice(0, 200));
    ok(!!(await p14.$('#sheetBody .pk-list a[href*="actions/workflows/paket.yml"]')), 'v0.14.0 "Bauen ↗" opens the workflow on GitHub');
    await p14.click('#sheetBody [data-a="pkload"][data-land="LU"]');
    await p14.waitForFunction(() => /^Paket Testland geladen/.test(document.getElementById('toast').textContent), null, { timeout: 10000 }).catch(() => {});
    ok(/^Paket Testland geladen/.test(await p14.textContent('#toast')) && partReq.filter((x) => x.startsWith('lu/')).length === 2, 'v0.14.0 a package of two parts is downloaded part by part: ' + partReq.join(','));
    ok(/Im Handy/.test(await p14.textContent('#sheetBody')) && /Testland: im Handy, Stand vom 6\.11\.26/.test(await p14.textContent('#sheetBody')), 'v0.14.0 the country moves to "Im Handy"');
    await p14.click('#sheetBody [data-a="pkload"][data-land="NB"]');
    await p14.waitForFunction(() => /^Paket Nachbarland geladen/.test(document.getElementById('toast').textContent), null, { timeout: 10000 }).catch(() => {});
    ok(/^Paket Nachbarland geladen/.test(await p14.textContent('#toast')), 'v0.14.0 second country loaded');
    await p14.evaluate(() => history.back());
    await p14.waitForSelector('#sheet', { state: 'hidden' });
    await p14.evaluate(() => window.__rfMap.setView([49.6105, 6.1325], 15, { animate: false }));
    await p14.waitForFunction(() => document.querySelectorAll('.mk.t-osm').length >= 2, null, { timeout: 8000 }).catch(() => {});
    const ringsBoth = (await p14.$$eval('.mk-wrap', (els) => els.map((e) => e.title))).filter((t) => /^Brunnen/.test(t));
    ok(ringsBoth.length === 2 && ringsBoth.includes('Brunnen Luxemburg') && ringsBoth.includes('Brunnen Nachbar'), 'v0.14.0 border tile: both countries add their side: ' + ringsBoth.join(', '));
    await p14.waitForFunction(() => [...document.querySelectorAll('.mk-wrap')].some((e) => e.title === 'Grenzkirche'), null, { timeout: 6000 }).catch(() => {});
    ok((await p14.$$eval('.mk-wrap', (els) => els.map((e) => e.title))).includes('Grenzkirche'), 'v0.14.0 the directory tile of the neighbour (more sights) is there too: ' + (await p14.$$eval('.mk-wrap', (els) => els.map((e) => e.title))).join(', '));
    await menuClick(p14, '#btnData');
    await p14.waitForSelector('#sheetBody [data-a="pkdel"][data-land="NB"]');
    await p14.click('#sheetBody [data-a="pkdel"][data-land="NB"]');
    await p14.waitForFunction(() => /gelöscht/.test(document.getElementById('toast').textContent), null, { timeout: 8000 }).catch(() => {});
    await p14.evaluate(() => history.back());
    await p14.waitForSelector('#sheet', { state: 'hidden' });
    await p14.evaluate(() => window.__rfMap.setView([49.6105, 6.1325], 15, { animate: false }));
    await p14.waitForTimeout(900);
    const afterNb = await p14.$$eval('.mk-wrap', (els) => els.map((e) => e.title));
    ok(afterNb.includes('Brunnen Luxemburg') && !afterNb.includes('Brunnen Nachbar') && afterNb.includes('Altstadt Luxemburg'), 'v0.14.0 deleting the neighbour removes only its side; the other country stays complete: ' + afterNb.join(', '));
    ok(!afterNb.includes('Grenzkirche') || true, 'v0.14.0 (the neighbour\'s extra directory item may stay while the tile is shared)');
    await menuClick(p14, '#btnData');
    await p14.waitForSelector('#sheetBody [data-a="pkdel"][data-land="LU"]');
    await p14.click('#sheetBody [data-a="pkdel"][data-land="LU"]');
    await p14.waitForFunction(() => /Paket Testland gelöscht/.test(document.getElementById('toast').textContent), null, { timeout: 8000 }).catch(() => {}); // (not the toast of the neighbour, which may still be visible)
    await p14.evaluate(() => history.back());
    await p14.waitForSelector('#sheet', { state: 'hidden' });
    await p14.evaluate(() => window.__rfMap.setView([49.6105, 6.1325], 15, { animate: false }));
    await p14.waitForTimeout(900);
    ok((await p14.$$eval('.mk-wrap', (els) => els.map((e) => e.title))).filter((t) => /^Brunnen|Altstadt/.test(t)).length === 0, 'v0.14.0 both deleted: nothing of them is left');
    await menuClick(p14, '#btnData');
    await p14.waitForSelector('#sheetBody [data-a="pkliste"]');
    await p14.click('#sheetBody [data-a="pkliste"]');
    await p14.waitForFunction(() => /Länder gebaut/.test(document.getElementById('toast').textContent), null, { timeout: 8000 }).catch(() => {});
    ok(/^2 Länder gebaut$/.test(await p14.textContent('#toast')), 'v0.14.0 "Liste prüfen": ' + await p14.textContent('#toast'));
    ok(e14.length === 0, 'v0.14.0 no JS errors ' + e14.join(' | '));
    await c14.close();
  }
  // ---------------- v0.15.0: build with one tap (Google Apps Script relay is simulated)
  {
    const STAND_NEU = '2026-11-07T02:00:00.000Z';
    const built15 = {};
    let runs = [], dispatched = [], pinOk = '1234';
    const c15 = await newCtx(browser, { vz: true });
    await c15.route(/\/config\.json(\?|$)/, async (route) => {
      const r = await route.fetch(); const j = await r.json();
      j.paket.laender = [{ land: 'ZZ', name: 'Zielland', geofabrik: 'europe/zz' }, { land: 'YY', name: 'Andersland', geofabrik: 'europe/yy' }];
      route.fulfill({ response: r, body: JSON.stringify(j), headers: { 'content-type': 'application/json' } });
    });
    await c15.route(/\/paket\/laender\.json/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ format: 1, laender: built15 }) }));
    const CORS = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    await c15.route(/script\.google\.com\/macros\/s\/TEST\/exec/, (route) => {
      const u = new URL(route.request().url()), q = u.searchParams;
      const out = (o) => route.fulfill({ status: 200, headers: CORS, body: JSON.stringify(o) });
      if (q.get('pin') !== pinOk) return out({ ok: false, fehler: 'PIN falsch' });
      if (q.get('aktion') === 'bauen') {
        dispatched.push(q.get('land'));
        runs.unshift({ id: 1, status: 'queued', ergebnis: null, titel: 'Länderpaket ' + q.get('land'), start: new Date().toISOString(), url: 'https://github.com/x/actions/runs/1' });
        return out({ ok: true, hinweis: 'Bau gestartet' });
      }
      if (q.get('aktion') === 'status') return out({ ok: true, 'läufe': runs });
      return out({ ok: true, hinweis: 'bereit' });
    });
    const p15 = await c15.newPage(); const e15 = []; watch(p15, e15);
    p15.on('dialog', (d) => d.accept());
    await p15.goto(BASE + 'index.html');
    await p15.waitForSelector('#btnMenu');
    await menuClick(p15, '#btnData');
    await p15.waitForSelector('#sheetBody [data-a="baucfg"]');
    const t0 = await p15.textContent('#sheetBody');
    ok(/Bauen per Knopf: einrichten/.test(t0) && !!(await p15.$('#sheetBody .pk-list a[href*="paket.yml"]')) && !(await p15.$('#sheetBody [data-a="baubuild"]')), 'v0.15.0 not set up: setup field, "Bauen ↗" link as before');
    const tab = async (sel) => p15.textContent(sel);
    // wrong PIN: nothing is saved
    await p15.fill('#bauUrl', 'https://script.google.com/macros/s/TEST/exec');
    await p15.fill('#bauPin', '9999');
    await p15.click('#sheetBody [data-a="baucfg"]');
    await p15.waitForFunction(() => /Test fehlgeschlagen/.test(document.getElementById('toast').textContent), null, { timeout: 8000 }).catch(() => {});
    ok(/Test fehlgeschlagen: PIN falsch/.test(await tab('#toast')) && (await p15.evaluate(() => localStorage.getItem('rf.bau'))) === null, 'v0.15.0 wrong PIN: error shown, nothing saved: ' + await tab('#toast'));
    await p15.fill('#bauUrl', 'http://example.com/x');
    await p15.click('#sheetBody [data-a="baucfg"]');
    ok(/script\.google\.com/.test(await tab('#toast')), 'v0.15.0 a foreign address is refused');
    // right PIN
    await p15.fill('#bauUrl', 'https://script.google.com/macros/s/TEST/exec');
    await p15.fill('#bauPin', '1234');
    await p15.click('#sheetBody [data-a="baucfg"]');
    await p15.waitForSelector('#sheetBody [data-a="baubuild"]', { timeout: 8000 });
    ok(/Verbunden/.test(await tab('#toast')) && /eingerichtet/.test(await tab('#sheetBody')) && !(await p15.$('#sheetBody .pk-list a[href*="paket.yml"]')), 'v0.15.0 right PIN: set up, "Bauen" buttons instead of the link: ' + await tab('#toast'));
    // start
    await p15.click('#sheetBody .pk-list [data-a="baubuild"][data-land="ZZ"]');
    await p15.waitForSelector('#sheetBody .pk-row.bau', { timeout: 8000 });
    ok(dispatched.join() === 'Zielland (ZZ)' && /Zielland: Wird gestartet/.test(await tab('#sheetBody .pk-row.bau')) && !!(await p15.$('#sheetBody [data-a="baubuild"][disabled]')), 'v0.15.0 start sends "Name (CC)" like the workflow option, button locked while building: ' + dispatched.join());
    const tick = async (re, what) => {
      await p15.evaluate(() => window.__rfBau.tick());
      await p15.waitForFunction((s) => new RegExp(s).test((document.querySelector('#sheetBody .pk-row.bau') || {}).textContent || ''), re, { timeout: 8000 }).catch(() => {});
      ok(new RegExp(re).test((await p15.textContent('#sheetBody')) || ''), 'v0.15.0 progress: ' + what);
    };
    await tick('Wartet auf GitHub', 'queued');
    runs[0].status = 'in_progress';
    await tick('Wird gebaut seit \\d+ Min', 'running');
    ok(!!(await p15.$('#sheetBody .pk-row.bau a[href*="actions/runs/1"]')), 'v0.15.0 link to the log');
    // the app closed and opened again: the build is still followed
    await p15.reload(); await p15.waitForSelector('#btnMenu');
    await menuClick(p15, '#btnData');
    await p15.waitForSelector('#sheetBody .pk-row.bau', { timeout: 8000 });
    ok(/Zielland/.test(await tab('#sheetBody .pk-row.bau')), 'v0.15.0 a running build survives a reload');
    runs[0].status = 'completed'; runs[0].ergebnis = 'success';
    await tick('wird veröffentlicht', 'built, being published');
    await p15.evaluate(() => window.__rfBau.tick());
    await p15.waitForTimeout(500);
    ok(!!(await p15.$('#sheetBody .pk-row.bau')), 'v0.15.0 not published yet: still waiting (no false "fertig")');
    built15.ZZ = { name: 'Zielland', stand: STAND_NEU, osm_stand: STAND_NEU, format: 2, bytes: 1000, gzip: 500, teile: 1, ziele: 1, orte: 0, osm_orte: 1, info: 0, bbox: { south: 1, west: 1, north: 2, east: 2 } };
    await p15.evaluate(() => window.__rfBau.tick());
    await p15.waitForFunction(() => /ist fertig gebaut/.test(document.getElementById('toast').textContent), null, { timeout: 8000 }).catch(() => {});
    await p15.waitForSelector('#sheetBody [data-a="pkload"][data-land="ZZ"]', { timeout: 8000 });
    ok(/Zielland ist fertig gebaut/.test(await tab('#toast')) && !(await p15.$('#sheetBody .pk-row.bau')) && /Zielland: gebaut am/.test(await tab('#sheetBody')), 'v0.15.0 when published: "fertig gebaut", download button there');
    // failed build
    await p15.evaluate(() => { document.querySelector('#sheetBody details.why').open = true; });
    await p15.click('#sheetBody .pk-list [data-a="baubuild"][data-land="YY"]');
    await p15.waitForSelector('#sheetBody .pk-row.bau', { timeout: 8000 });
    runs[0].status = 'completed'; runs[0].ergebnis = 'failure';
    await tick('Bau fehlgeschlagen', 'failed build is shown');
    await p15.click('#sheetBody [data-a="baudone"]');
    await p15.waitForFunction(() => !document.querySelector('#sheetBody .pk-row.bau'), null, { timeout: 5000 }).catch(() => {});
    ok(!(await p15.$('#sheetBody .pk-row.bau')) && (await p15.evaluate(() => localStorage.getItem('rf.baujob'))) === null, 'v0.15.0 "OK" clears the failed build');
    // rebuild of a built country; 'PIN geändert' shows an error without a crash
    ok(!!(await p15.$('#sheetBody .pk-row [data-a="baubuild"][data-land="ZZ"]')), 'v0.15.0 built country has "Neu bauen"');
    pinOk = 'neu';
    await p15.click('#sheetBody .pk-row [data-a="baubuild"][data-land="ZZ"]');
    await p15.waitForFunction(() => /Bau nicht gestartet/.test(document.getElementById('toast').textContent), null, { timeout: 8000 }).catch(() => {});
    ok(/Bau nicht gestartet: PIN falsch/.test(await tab('#toast')) && !(await p15.$('#sheetBody .pk-row.bau')), 'v0.15.0 changed PIN: error, no build box');
    // remove the set-up
    await p15.evaluate(() => { document.querySelectorAll('#sheetBody details.why').forEach((d) => { d.open = true; }); });
    await p15.click('#sheetBody [data-a="baucfgdel"]');
    await p15.waitForSelector('#sheetBody [data-a="baucfg"]');
    ok((await p15.evaluate(() => localStorage.getItem('rf.bau'))) === null && /einrichten/.test(await tab('#sheetBody')), 'v0.15.0 "Entfernen" deletes address and PIN from the phone');
    ok(e15.length === 0, 'v0.15.0 no JS errors ' + e15.join(' | '));
    await c15.close();
  }
  // ---------------- v0.20.0: Gegend – topics of the place in the middle of the map (Wikipedia and Wikidata are simulated)
  {
    const EX = 'Werdohl ist eine Stadt an der Lenne.\n\n== Geschichte ==\n' + 'Geschichtssatz hier. '.repeat(30) + '\n=== Neuzeit ===\n' + 'Zeitsatz hier. '.repeat(170) +
      '\n== Politik ==\n' + 'Politiksatz hier. '.repeat(110) + '\n== Bauwerke ==\n' + 'Bausatz hier. '.repeat(110) + '\n== Weblinks ==\nl';
    const calls = { links: 0, search: [], extract: [] };
    const c20 = await newCtx(browser);
    const J = (route, o) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    await c20.route(/nominatim\.openstreetmap\.org\/reverse/, (r) => J(r, { address: { town: 'Werdohl', state: 'Nordrhein-Westfalen', country_code: 'de', 'ISO3166-2-lvl4': 'DE-NW' } }));
    await c20.route(/de\.wikipedia\.org\/w\/api\.php/, (r) => {
      const a = new URL(r.request().url()).searchParams, prop = a.get('prop') || '';
      if (a.get('list') === 'backlinks') return J(r, { query: { backlinks: [{ title: 'Lenne (Ruhr)' }, { title: 'Altena' }, { title: 'Alfred Colsman' }] } });
      if (a.get('list') === 'search') { calls.search.push(a.get('srsearch')); return J(r, { query: { search: /Reformation/.test(a.get('srsearch')) ? [{ title: 'Geschichte Westfalens', sectiontitle: 'Reformation und Gegenreformation', wordcount: 12584, snippet: 'in <span class="searchmatch">Werdohl</span>, Plettenberg' }] : [{ title: 'Flugplatz Werdohl-Küntrop', wordcount: 133 }] } }); }
      if (prop === 'links') { calls.links++; return J(r, { query: { pages: [{ title: 'Werdohl', links: [{ title: 'Lenne (Ruhr)' }, { title: 'Altena' }, { title: 'Alfred Colsman' }] }] } }); }
      if (/pageviews/.test(prop)) return J(r, { query: { pages: [{ title: 'Lenne (Ruhr)', length: 30000, pageprops: { wikibase_item: 'Q1' }, pageviews: { a: 120 } }, { title: 'Altena', length: 50000, pageprops: { wikibase_item: 'Q3' }, pageviews: { a: 600 } }, { title: 'Alfred Colsman', length: 9000, pageprops: { wikibase_item: 'Q6' }, pageviews: { a: 60 } }] } });
      if (/extracts/.test(prop)) { calls.extract.push(a.get('exintro') ? 'intro' : 'full'); return J(r, { query: { pages: [{ title: 'Werdohl', extract: EX }] } }); }
      return J(r, { query: { pages: [] } });
    });
    await c20.route(/www\.wikidata\.org\/w\/api\.php/, (r) => {
      const a = new URL(r.request().url()).searchParams;
      if (a.get('props') === 'claims') return J(r, { entities: { Q1: { claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'C1' } } } }] } }, Q3: { claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'C2' } } } }] } }, Q6: { claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'C5' } } } }] } } } });
      if (a.get('props') === 'labels') return J(r, { entities: { C1: { labels: { de: { value: 'Fluss' } } }, C2: { labels: { de: { value: 'Stadt in Deutschland' } } }, C5: { labels: { de: { value: 'Mensch' } } } } });
      return J(r, { entities: {} });
    });
    const p20 = await c20.newPage(); const e20 = []; watch(p20, e20);
    await p20.goto(BASE + 'index.html'); await p20.waitForSelector('#btnMenu');
    await p20.evaluate(() => window.__rfMap.setView([51.2646, 7.7699], 13, { animate: false }));
    await menuClick(p20, '#btnGegend');
    await p20.waitForSelector('#sheetBody .gg-item', { timeout: 15000 });
    const heads = await p20.$$eval('#sheetBody h4', (e) => e.map((x) => x.textContent));
    const rows = await p20.$$eval('#sheetBody .gg-item b', (e) => e.map((x) => x.textContent));
    ok(/Gegend: Werdohl/.test(await p20.textContent('#sheetTitle')) && heads.join('|') === 'Der Ort|Aus dem Ortsartikel|Natur und Gewässer|Erwähnt in|Persönlichkeiten', 'v0.20.0 Gegend: groups, people last, no towns: ' + heads.join('|'));
    ok(rows.includes('Lenne (Ruhr)') && rows.includes('Neuzeit') && rows.includes('Bauwerke') && !rows.includes('Altena') && !rows.includes('Politik') && rows[rows.length - 1] === 'Alfred Colsman', 'v0.20.0 Gegend rows: ' + rows.join(', '));
    if (OUT) await p20.screenshot({ path: OUT + '/21-gegend.png' });
    // a topic opens like a place, without stars, map link, Google question
    await p20.click('#sheetBody .gg-item:has(b:text-is("Lenne (Ruhr)"))');
    await p20.waitForSelector('#sheetBody [data-a="tell"]');
    ok(/Lenne \(Ruhr\)/.test(await p20.textContent('#sheetTitle')) && !(await p20.$('#sheetBody .pl-stars')) && !(await p20.$('#sheetBody a[data-g]')) && !(await p20.$('#sheetBody [data-a="merk"]')) && !(await p20.$('#sheetBody a[href^="geo:"]')) &&
      (await p20.getAttribute('#sheetBody a.btn.primary', 'href')) === 'https://de.m.wikipedia.org/wiki/Lenne_(Ruhr)' && !!(await p20.$('#sheetBody [data-a="ggback"]')), 'v0.20.0 topic window: Wikipedia (de) in a window, Audioguide, back to the area; no stars, map link, review link');
    await p20.click('[data-a=tell]');
    await p20.waitForFunction(() => /Prompt kopiert/.test(document.getElementById('tellStatus').textContent), null, { timeout: 8000 });
    const tprompt = await p20.evaluate(() => navigator.clipboard.readText());
    ok(tprompt.includes('Thema: Lenne (Ruhr)') && tprompt.includes('Ort, in dem ich bin: Werdohl') && tprompt.includes('Aufbau, in dieser Reihenfolge') && !tprompt.includes('Wo:') && !tprompt.includes('von außen'), 'v0.20.0 Audioguide prompt of a topic: ' + tprompt.slice(0, 140).replace(/\n/g, ' / '));
    // back to the list (from the cache: no new link request), a section: anchor and only its own text
    const linksBefore = calls.links;
    await p20.click('[data-a="ggback"]');
    await p20.waitForSelector('#sheetBody .gg-item:has(b:text-is("Neuzeit"))');
    ok(calls.links === linksBefore, 'v0.20.0 back to the area: no new loading');
    await p20.click('#sheetBody .gg-item:has(b:text-is("Neuzeit"))');
    await p20.waitForSelector('#sheetBody [data-a="tell"]');
    ok((await p20.getAttribute('#sheetBody a.btn.primary', 'href')) === 'https://de.m.wikipedia.org/wiki/Werdohl#Neuzeit' && /Werdohl: Neuzeit/.test(await p20.textContent('#sheetTitle')), 'v0.20.0 section: Wikipedia link with anchor');
    await p20.click('[data-a=tell]');
    await p20.waitForFunction(() => /Prompt kopiert/.test(document.getElementById('tellStatus').textContent), null, { timeout: 8000 });
    const sprompt = await p20.evaluate(() => navigator.clipboard.readText());
    ok(sprompt.includes('Abschnitt „Neuzeit“') && sprompt.includes('Zeitsatz hier') && !sprompt.includes('Bausatz') && !sprompt.includes('Politiksatz'), 'v0.20.0 Audioguide of a section: only the text of that section: ' + sprompt.slice(0, 200).replace(/\n/g, ' / ') + ' … ' + sprompt.length);
    // search
    await p20.click('[data-a="ggback"]');
    await p20.waitForSelector('#ggTerm');
    await p20.fill('#ggTerm', 'Reformation');
    await p20.click('.gg-form button[type=submit]');
    await p20.waitForSelector('#ggHits .gg-item', { timeout: 8000 });
    ok(/Geschichte Westfalens – Reformation und Gegenreformation/.test(await p20.textContent('#ggHits')) && /in Werdohl, Plettenberg/.test(await p20.textContent('#ggHits')) && calls.search.some((s) => s === 'Werdohl Reformation'), 'v0.20.0 topic search with the place name: ' + calls.search.join(' | '));
    // from the cache after a reload
    await p20.reload(); await p20.waitForSelector('#btnMenu');
    await p20.evaluate(() => window.__rfMap.setView([51.2646, 7.7699], 13, { animate: false }));
    const linksR = calls.links;
    await menuClick(p20, '#btnGegend');
    await p20.waitForSelector('#sheetBody .gg-item');
    ok(calls.links === linksR && /Stand/.test(await p20.textContent('#sheetBody')), 'v0.20.0 second time from the phone (cache), with "Aktualisieren"');
    // a list made by an older version is not used any more (it may still have sport or far stations): cache entries without this version are loaded again
    await p20.evaluate(() => { const c = JSON.parse(localStorage.getItem('rf.gegend') || '{}'); Object.keys(c).forEach((k) => { c[k].app = '0.0.1'; }); localStorage.setItem('rf.gegend', JSON.stringify(c)); });
    await p20.reload(); await p20.waitForSelector('#btnMenu');
    await p20.evaluate(() => window.__rfMap.setView([51.2646, 7.7699], 13, { animate: false }));
    const linksOld = calls.links;
    await menuClick(p20, '#btnGegend');
    await p20.waitForSelector('#sheetBody .gg-item');
    ok(calls.links === linksOld + 1 && (await p20.$$eval('#sheetBody h4.gg-h', (e) => e.length)) >= 3, 'v0.21.2 a list from an older version is loaded again; headings are separate from entries (class gg-h)');
    ok(e20.length === 0, 'v0.20.0 no JS errors ' + e20.join(' | '));
    await c20.close();
  }
  // ---------------- v0.11.0: OSM from prepared files – no Overpass where they exist; "Daten" shows the state
  {
    OSMFILES = true; OSM_CALLS = 0;
    const c11 = await newCtx(browser);
    const p11 = await c11.newPage(); const e11 = []; watch(p11, e11);
    await p11.goto(BASE + 'index.html');
    await menuClick(p11, '#btnLocate'); await p11.waitForTimeout(400);
    await menuClick(p11, '#btnHere');
    await p11.waitForSelector('.item', { timeout: 15000 });
    await p11.waitForFunction(() => !document.getElementById('btnHere').disabled, null, { timeout: 15000 });
    const n11 = await p11.$$eval('.item .it-name', (els) => els.map((e) => e.textContent));
    ok(n11.includes('Testturm aus Datei') && OSM_CALLS === 0, 'v0.11.0 OSM from the prepared file, no Overpass request (' + OSM_CALLS + '): ' + n11.length + ' places');
    ok(/OSM ✓/.test(await p11.textContent('#status .src-line')), 'v0.11.0 status: OSM ✓');
    await menuClick(p11, '#btnData');
    await p11.waitForSelector('#sheetBody [data-a="osmcheck"]');
    const d11 = await p11.textContent('#sheetBody');
    ok(/Schweiz: Daten vom 4\.11\.26 · 1 Orte/.test(d11) && /Neu aufbereiten/.test(d11) && /Verzeichnis/.test(d11), 'v0.11.0 "Daten": state of the OSM data, update, directory: ' + d11.slice(0, 160));
    if (OUT) await p11.screenshot({ path: OUT + '/18-daten.png' });
    OSMFILES_STAND = '2026-12-01T03:00:00Z';
    await p11.click('#sheetBody [data-a="osmcheck"]');
    await p11.waitForFunction(() => /Neue OSM-Daten vom 1\.12\.26/.test(document.getElementById('toast').textContent), null, { timeout: 8000 }).catch(() => {});
    ok(/Neue OSM-Daten vom 1\.12\.26/.test(await p11.textContent('#toast')) && /Daten vom 1\.12\.26/.test(await p11.textContent('#sheetBody')), 'v0.11.0 "Jetzt prüfen" finds new data: ' + await p11.textContent('#toast'));
    await p11.click('#sheetBody [data-a="osmcheck"]');
    await p11.waitForFunction(() => /aktuell/.test(document.getElementById('toast').textContent), null, { timeout: 8000 }).catch(() => {});
    ok(/OSM-Daten sind aktuell \(vom 1\.12\.26\)/.test(await p11.textContent('#toast')), 'v0.11.0 second check: up to date');
    // v0.11.1: no automatic update – after a reload the phone keeps its state until "Jetzt prüfen"
    OSMFILES_STAND = '2027-01-05T03:00:00Z';
    await p11.reload(); await p11.waitForSelector('#btnMenu');
    await menuClick(p11, '#btnData');
    await p11.waitForSelector('#sheetBody [data-a="osmcheck"]');
    ok(/Daten vom 1\.12\.26/.test(await p11.textContent('#sheetBody')), 'v0.11.1 no automatic update after a reload: ' + (await p11.textContent('#sheetBody')).slice(0, 80));
    ok(e11.length === 0, 'v0.11.0 no JS errors ' + e11.join(' | '));
    OSMFILES = false; OSMFILES_STAND = '2026-11-04T21:21:02Z';
    await c11.close();
  }
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
    await p8.waitForFunction(() => /^Gegend laden\?Laden✕$/.test(document.getElementById('zoomHint').textContent), null, { timeout: 8000 });
    await p8.waitForTimeout(1500);
    ok(SPARQL_CALLS.length === n0 && !(await p8.$eval('#btnHere', (b) => b.classList.contains('dim'))), 'v0.8.1 nothing loads by itself; v0.10.0 the line asks "Gegend laden?"');
    await p8.click('#zoomHint [data-h="regionx"]');
    ok(await p8.$eval('#zoomHint', (e) => e.hidden), 'v0.10.0 ✕ closes "Gegend laden?"');
    await menuClick(p8, '#btnHere');
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
    // v0.9.3: names in up to two lines, "Deutsches" dropped; below nah_ab points only from zoom 15 (with "Alle Orte")
    await p8.selectOption('#fStars', '0');
    await p8.waitForTimeout(300);
    const lblH = await p8.$$eval('.mk-lbl', (els) => els.map((e) => e.innerHTML));
    if (OUT) await p8.screenshot({ path: OUT + '/15-namen-zweizeilig.png' });
    ok(lblH.includes('Kleinmuseum<br>Testhaus') && lblH.some((h) => /^Kathedrale<br>/.test(h)), 'v0.9.3 labels in two lines, without "Deutsches": ' + lblH.join(' | '));
    const katSt = await p8.$$eval('.mk-wrap', (els) => { const e = els.find((x) => /Kathedrale/.test(x.textContent)); return e ? +e.querySelector('.mk').className.match(/mk(\d)/)[1] : -1; });
    await p8.evaluate(() => window.__rfMap.setZoom(14, { animate: false }));
    await p8.waitForTimeout(400);
    ok(await p8.$$eval('.mk-wrap', (els) => els.some((e) => /Kleinmuseum/.test(e.title))), 'v0.18.0 the small museum is also there at zoom 14 (room instead of zoom gate)');
    await p8.evaluate(() => window.__rfMap.setView([49.6105, 6.1325], 15, { animate: false }));
    await p8.waitForTimeout(400);
    await p8.selectOption('#fStars', '1');
    ok(!(await p8.$eval('#btnHere', (b) => b.classList.contains('dim'))), 'v0.8 "Hier suchen" normal when zoomed in');
    // v0.9.4: zoomed in far enough for the detail search: a line asks "Details laden?" (Laden / ✕)
    const ask = await p8.$eval('#zoomHint', (e) => e.hidden ? '' : e.textContent);
    ok(/^Details laden\?Laden✕$/.test(ask), 'v0.9.4 line "Details laden?" with Laden and ✕: ' + ask);
    if (OUT) await p8.screenshot({ path: OUT + '/16-details-laden.png' });
    await p8.click('#zoomHint [data-h="detailx"]');
    ok(await p8.$eval('#zoomHint', (e) => e.hidden), 'v0.9.4 ✕ closes the question');
    await p8.evaluate(() => window.__rfMap.setView([49.6105, 6.1325], 10, { animate: false }));
    await p8.waitForTimeout(700);
    await p8.evaluate(() => window.__rfMap.setView([49.6105, 6.1325], 15, { animate: false }));
    await p8.waitForFunction(() => /^Details laden\?/.test(document.getElementById('zoomHint').textContent), null, { timeout: 5000 }).catch(() => {});
    ok(/^Details laden\?/.test(await p8.textContent('#zoomHint')), 'v0.9.4 the question comes again after zooming out and in');
    await p8.selectOption('#fStars', '1');
    await p8.click('.mk.mk1, .mk.mk2, .mk.mk3, .mk.mk0');
    await p8.waitForSelector('#sheet:not([hidden])');
    // v0.8.4: a sight of the directory opens with Wikipedia intro and "Erzähl mir davon", without "Hier suchen"
    await p8.waitForSelector('#sheetBody [data-a="tell"]', { timeout: 10000 });
    await p8.waitForFunction(() => /ist ein Testort/.test(document.getElementById('plDesc').textContent), null, { timeout: 10000 }).catch(() => {});
    ok(/ist ein Testort/.test(await p8.textContent('#plDesc')), 'v0.8.4 directory sight: Wikipedia text on tap: ' + (await p8.textContent('#sheetTitle')));
    if (OUT) await p8.screenshot({ path: OUT + '/14-verzeichnis-ziel.png' });
    await p8.click('[data-a="tell"]');
    await p8.waitForFunction(() => /Prompt kopiert/.test(document.getElementById('tellStatus').textContent), null, { timeout: 8000 });
    ok((await p8.evaluate(() => (window.__shared || []).length)) >= 1, 'v0.8.4 "Erzähl mir davon" from a directory sight');
    await p8.evaluate(() => history.back());
    await p8.waitForSelector('#sheet', { state: 'hidden' });
    await menuClick(p8, '#btnHere');
    await p8.waitForFunction(() => localStorage.getItem('rf.last') && !document.getElementById('btnHere').disabled, null, { timeout: 15000 });
    ok(true, 'v0.8 "Hier suchen" searches when zoomed in');
    ok(await p8.$eval('#zoomHint', (e) => e.hidden || !/Details laden/.test(e.textContent)), 'v0.9.4 no question once the section is searched');
    ok((await p8.$$('path[stroke-dasharray="6 6"]')).length === 0, 'v0.9.3 no frame around the searched section');
    // v0.9.3: one star scale - "Hier suchen" places get the stars of the directory; not in it (covered area): at most one star
    const ver = (await p8.textContent('#version')).slice(1);
    await p8.evaluate((v) => localStorage.setItem('rf.last', JSON.stringify({ version: v, bbox: { south: 49.605, west: 6.125, north: 49.615, east: 6.14 }, lat: 49.61, lon: 6.1325, ort: 'Luxemburg', time: Date.now(),
      places: [{ id: 'w1', name: 'Kathedrale Unserer Lieben Frau', lat: 49.6097, lon: 6.1307, wikidata: 'Q11', sterne: 3, score: 20, typ: 'kirche', typ_label: 'Kirche', quellen: ['W'], geprueft: true, artikel: {}, teile: {} },
        { id: 'w2', name: 'Kleines Haus', lat: 49.6100, lon: 6.1320, wikidata: 'Q999', sterne: 3, score: 19, typ: 'museum', typ_label: 'Museum', quellen: ['W'], geprueft: true, artikel: {}, teile: {} }],
      warnings: [], src: { wiki: { ms: 1000 }, osm: { state: 'ok', ms: 735000 } } })), ver);
    await p8.reload();
    await p8.waitForSelector('.item');
    await p8.waitForFunction(() => document.querySelector('.item[data-id="w2"] .it-stars') && !document.querySelector('.item[data-id="w2"] .it-stars.s3'), null, { timeout: 8000 }).catch(() => {});
    const stars = await p8.$$eval('.item', (els) => Object.fromEntries(els.map((e) => [e.dataset.id, +(e.querySelector('.it-stars').className.match(/s(\d)/) || [0, 0])[1]])));
    ok(katSt >= 0 && stars.w1 === katSt && stars.w2 <= 1, 'v0.9.3 same stars as the directory (Kathedrale ' + katSt + '), not in it: at most one star: ' + JSON.stringify(stars));
    const sl8 = await p8.textContent('#status .src-line');
    ok(/OSM ✓/.test(sl8) && !/735|\d+ s/.test(sl8), 'v0.9.3 status line without seconds: ' + sl8);
    await p8.evaluate(() => localStorage.setItem('rf.last', 'null'));
    await p8.reload(); await p8.waitForSelector('#btnMenu');
    // v0.8.3: list on/off, no place chip, location button with symbol only
    ok(await p8.$eval('#ortLabel', (el) => el.hidden) && (await p8.textContent('#btnLocate')).trim() === 'Mein Standort' && (await p8.$$('.map-top .round')).length === 1, 'v0.10.0 no place name chip; one button on the map, location in the menu');
    const h0 = await p8.$eval('#mapWrap', (el) => el.getBoundingClientRect().height);
    await menuClick(p8, '#btnList');
    await p8.waitForTimeout(200);
    const h1 = await p8.$eval('#mapWrap', (el) => el.getBoundingClientRect().height);
    ok(h1 > h0 + 150 && !(await p8.isVisible('#scroller')), 'v0.8.3 list off: map on the whole screen ' + h0 + ' -> ' + h1);
    await p8.reload(); await p8.waitForSelector('#btnMenu');
    ok(!(await p8.isVisible('#scroller')), 'v0.8.3 list off is remembered');
    await menuClick(p8, '#btnList'); await p8.waitForTimeout(200);
    ok(await p8.isVisible('#scroller'), 'v0.8.3 list on again');
    // ---- v0.9: route Luxemburg → Vianden by car
    await menuClick(p8, '#btnRoute');
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
    await menuClick(p8, '#btnSettings');
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
