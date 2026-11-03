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

let fakeVersion = null;
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
    const u = new URL(route.request().url());
    const lang = u.hostname.split('.')[0];
    let body;
    if ((u.searchParams.get('prop') || '').includes('extracts')) {
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
    const ids = (new URL(route.request().url()).searchParams.get('ids') || '').split('|');
    const entities = {}; ids.forEach((id) => { entities[id] = fx.wikidata.entities[id] || { id, missing: '' }; });
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ entities }) });
  });
  await ctx.route(/nominatim\.openstreetmap\.org/, (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify((() => { const u = new URL(route.request().url());
      if (!u.pathname.startsWith('/search')) return fx.nominatim;
      return /imperial/i.test(u.searchParams.get('q')) ? fx.nominatimSearch.imperial : fx.nominatimSearch.default; })()) }));
  await ctx.route(/overpass-api\.de|overpass\.kumi\.systems|maps\.mail\.ru/, (route) => route.fulfill({ status: 200, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(fx.overpass) }));
  await ctx.route(/api\.mymemory\.translated\.net/, (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ responseData: { translatedText: 'Übersetzt: ' + new URL(route.request().url()).searchParams.get('q') }, responseStatus: 200 }) }));
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
  ok((await page.textContent('#version')) === 'v0.4.0', 'footer version');
  if (OUT) await page.screenshot({ path: OUT + '/01-start.png' });

  await page.click('#btnLocate');
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
  await page.waitForFunction(() => [...document.querySelectorAll('.it-desc')].some((e) => /Testort|Übersetzt:/.test(e.textContent)), null, { timeout: 8000 });
  await page.$eval('#list', (l) => { l.scrollTop = l.scrollHeight; });
  await page.waitForFunction(() => [...document.querySelectorAll('.it-desc')].some((e) => /^Übersetzt:/.test(e.textContent)), null, { timeout: 8000 }).catch(() => {});
  const descs = await page.$$eval('.it-desc', (els) => els.map((e) => e.textContent));
  await page.$eval('#list', (l) => { l.scrollTop = 0; });
  ok(descs.some((d) => d.startsWith('Übersetzt: ')), 'English intro translated in list: ' + descs.join(' | '));
  ok(descs.some((d) => /ist ein Testort\. Zweiter Satz\.$/.test(d)), 'German intro shown as is (2 short sentences)');
  ok(!descs.some((d) => /maschinell/.test(d)), 'no translation note');
  ok((await page.textContent('#ortLabel')) === 'Manchester', 'ort label');
  ok((await page.textContent('#status')).includes('★★★'), 'status counts');
  const names4 = await page.$$eval('.it-name', (els) => els.map((e) => e.textContent));
  ok(names4.filter((n) => n === 'Manchester Town Hall').length === 1, 'v0.4: Town Hall once in list');
  ok(names4.includes('Pankhurst Centre'), 'v0.4: OSM-only museum in list');

  // layout checks
  const lay = await page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const small = [...document.querySelectorAll('button, select, .btn')].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 44 && !b.closest('.leaflet-control'))
      .map((b) => (b.id || b.className) + ':' + Math.round(b.getBoundingClientRect().height));
    return { scrollW: document.documentElement.scrollWidth, w: innerWidth, h: innerHeight, map: r('#mapWrap').height, list: r('#list').height,
      footBottom: r('.foot').bottom, small };
  });
  ok(lay.scrollW <= lay.w, 'no horizontal scroll');
  ok(Math.abs(lay.footBottom - lay.h) < 2, 'footer at bottom, page fits viewport');
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
  ok((await page.textContent('#sheetBody')).includes('Quellen: OpenStreetMap') && (await page.textContent('#sheetBody')).includes('ODbL'), 'OSM source and license shown');
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

  // splitter drag
  const sp = await page.$('#splitter'); const b = await sp.boundingBox();
  const before = (await page.$('#mapWrap').then((e) => e.boundingBox())).height;
  await page.mouse.move(b.x + b.width / 2, b.y + 5); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y - 150, { steps: 5 }); await page.mouse.up();
  const after = (await page.$('#mapWrap').then((e) => e.boundingBox())).height;
  ok(after < before - 100, 'splitter shrinks map ' + before + ' -> ' + after);

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
  await page.waitForFunction(() => !document.getElementById('btnHere').disabled);
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
  const claudeHref = await page.getAttribute('#tellStatus a.btn', 'href');
  ok(claudeHref && claudeHref.startsWith('claude://claude.ai/new?q=Du%20bist%20mein%20Reisef'), 'Claude link with prompt');
  ok((await page.textContent('[data-a=heard]')).includes('Schon gehört'), 'marked as heard');
  if (OUT) await page.screenshot({ path: OUT + '/10-erzaehlen.png' });
  ok(!(await page.$('[data-a=share]')) && !(await page.$('a[href*="tripadvisor"]')), 'no share button, no Tripadvisor link in place window');
  await page.click('[data-a=review]');
  await page.waitForFunction(() => /Prompt kopiert/.test(document.getElementById('tellStatus').textContent));
  const rprompt = await page.evaluate(() => navigator.clipboard.readText());
  ok(rprompt.startsWith('Ich überlege, ob ich diese Sehenswürdigkeit besuchen soll.') && rprompt.includes('Tripadvisor'), 'review prompt copied');
  ok((await page.getAttribute('#tellStatus a.btn', 'href')).startsWith('claude://claude.ai/new?q=Ich%20%C3%BCberlege'), 'review Claude link');
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
  await page.waitForFunction(() => !document.getElementById('sheet').hidden && !document.getElementById('sheetTitle').textContent.includes('suchen'), null, { timeout: 10000 });
  ok(true, 'POI search opens a place sheet: ' + await page.textContent('#sheetTitle'));
  await page.evaluate(() => history.back());
  await page.waitForSelector('#sheet', { state: 'hidden' });

  // persistence after reload
  await page.reload();
  await page.waitForSelector('.item');
  ok((await page.textContent('#merkCount')) === '1', 'merk persisted');
  ok(Math.abs((await page.$('#mapWrap').then((e) => e.boundingBox())).height - after) < 10, 'split persisted');

  // update banner (fake newer version, then ?testupdate=1)
  fakeVersion = '0.4.1';
  await page.reload();
  await page.waitForSelector('#banner:not([hidden])');
  ok((await page.textContent('#bannerText')).includes('v0.4.1'), 'banner shows remote version');
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

  // ---------------- small viewport like the user's phone (display size enlarged)
  const ctxS = await newCtx(browser, { height: 626, width: 329 });
  const pS = await ctxS.newPage(); const errsS = []; watch(pS, errsS);
  await pS.goto(BASE + 'index.html');
  await pS.click('#btnLocate'); await pS.waitForSelector('.item');
  const layS = await pS.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const sel = [...document.querySelectorAll('.filters select')].map((x) => x.scrollWidth <= x.clientWidth + 1);
    const pillsOk = (() => { const a = r('#btnLocate'), b = r('#btnHere'); return a.right < b.left; })();
    return { scrollW: document.documentElement.scrollWidth, w: innerWidth, h: innerHeight, list: r('#list').height, foot: r('.foot').bottom, pillsOk, sel };
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
  await p2.click('#btnLocate'); await p2.waitForSelector('.item');
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
  ok(cacheKeys.includes('rf-app-0.4.0'), 'app cache with version: ' + cacheKeys.join(','));
  const cached = await p3.evaluate(async () => (await (await caches.open('rf-app-0.4.0')).keys()).map((r) => new URL(r.url).pathname + new URL(r.url).search));
  ok(cached.some((u) => u.includes('app.js?v=0.4.0')), 'shell precached');
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
  ok(await p4.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'diag no horizontal scroll');
  if (OUT) await p4.screenshot({ path: OUT + '/07-diag.png', fullPage: true });
  ok(errs4.length === 0, 'diag: no JS errors ' + errs4.join(' | '));
  await ctx4.close();
} finally {
  await browser.close();
  server.close();
}
console.log(`${passes} ok, ${fails} fehlgeschlagen`);
if (fails) process.exit(1);
