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
    const arr = fx.wikipedia[u.hostname.split('.')[0]];
    const body = u.searchParams.get('pvipcontinue') ? arr[1] : arr[0];
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
  await ctx.route(/www\.wikidata\.org/, (route) => {
    const ids = (new URL(route.request().url()).searchParams.get('ids') || '').split('|');
    const entities = {}; ids.forEach((id) => { entities[id] = fx.wikidata.entities[id] || { id, missing: '' }; });
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ entities }) });
  });
  await ctx.route(/nominatim\.openstreetmap\.org/, (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(fx.nominatim) }));
  await ctx.route(/tile\.openstreetmap\.org/, (route) => route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: PNG }));
}

async function newCtx(browser, opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 412, height: opts.height || 780 }, deviceScaleFactor: opts.dpr || 1, isMobile: true, hasTouch: true,
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
  await page.goto(BASE + 'index.html');
  await page.waitForSelector('.empty');
  ok((await page.textContent('#version')) === 'v0.2.0', 'footer version');
  if (OUT) await page.screenshot({ path: OUT + '/01-start.png' });

  await page.click('#btnLocate');
  await page.waitForSelector('.item', { timeout: 10000 });
  const items = await page.$$eval('.item', (els) => els.map((e) => ({ s: e.querySelector('.it-stars').textContent, n: e.querySelector('.it-name').textContent })));
  ok(items.length >= 8, 'list has items: ' + items.length);
  ok(items[0].s === '★★★', 'first item 3 stars');
  ok(!items.some((i) => i.n === 'River Tib'), 'River Tib hidden at ★+ filter');
  ok((await page.$$('.mk3')).length >= 4, '3-star markers on map');
  ok((await page.textContent('#ortLabel')) === 'Manchester', 'ort label');
  ok((await page.textContent('#status')).includes('★★★'), 'status counts');

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

  // persistence after reload
  await page.reload();
  await page.waitForSelector('.item');
  ok((await page.textContent('#merkCount')) === '1', 'merk persisted');
  ok(Math.abs((await page.$('#mapWrap').then((e) => e.boundingBox())).height - after) < 10, 'split persisted');

  // update banner (fake newer version, then ?testupdate=1)
  fakeVersion = '0.2.1';
  await page.reload();
  await page.waitForSelector('#banner:not([hidden])');
  ok((await page.textContent('#bannerText')).includes('v0.2.1'), 'banner shows remote version');
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
  ok(cacheKeys.includes('rf-app-0.2.0'), 'app cache with version: ' + cacheKeys.join(','));
  const cached = await p3.evaluate(async () => (await (await caches.open('rf-app-0.2.0')).keys()).map((r) => new URL(r.url).pathname + new URL(r.url).search));
  ok(cached.some((u) => u.includes('app.js?v=0.2.0')), 'shell precached');
  ok(errs3.length === 0, 'sw: no JS errors ' + errs3.join(' | '));
  await ctx3.close();

  // ---------------- diag page
  const ctx4 = await newCtx(browser, { dpr: 1 });
  const p4 = await ctx4.newPage(); const errs4 = []; watch(p4, errs4);
  await p4.goto(BASE + 'diag.html');
  await p4.click('#btnGold');
  await p4.waitForSelector('#goldOut .pass, #goldOut .fail', { timeout: 10000 });
  ok((await p4.textContent('#goldOut')).includes('BESTANDEN'), 'diag gold list passes on synthetic data');
  await p4.click('#btnApi');
  await p4.waitForSelector('#apiOut table', { timeout: 10000 });
  const sum = await p4.inputValue('#v2summary');
  ok(sum.includes('Wikipedia en: OK') && sum.includes('Goldliste BESTANDEN'), 'diag summary:\n' + sum.slice(0, 900));
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
