// Einmaliger Faktencheck (v0.13.x): holt Wikipedia-Artikel (volltext), Wikidata, Webseiten/PDFs und Commons-Fotos zu EINEM Ort
// und schreibt alles ins Protokoll. Läuft nur auf GitHub (Workflow fakten-test.yml), weil die Cloud-Sitzung des Entwicklers diese Server nicht erreicht.
// Env: WIKI = "fr:Titel;de:Titel", SEITEN = "https://…;https://…" (nur erlaubte Hosts), KATEGORIE = Commons-Kategorie, WD = Suchbegriff Wikidata, FOTOS = Anzahl
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const UA = 'ReisefuehrerBot/faktencheck (https://github.com/obitusde/reisefuehrer; einmaliger Test)';
const OK_HOSTS = [/(^|\.)wikipedia\.org$/, /(^|\.)wikimedia\.org$/, /(^|\.)wikidata\.org$/, /^data\.geo\.admin\.ch$/, /^dominikgehl\.com$/, /^museris\.lausanne\.ch$/, /^notrehistoire\.ch$/, /^hls-dhs-dss\.ch$/, /^patrinum\.ch$/, /(^|\.)vd\.ch$/, /^www\.archinform\.net$/, /^serval\.unil\.ch$/];
const q = (o) => Object.entries(o).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
const trim = (s, n) => (s.length > n ? s.slice(0, n) + ' …[gekürzt, ' + s.length + ' Zeichen]' : s);
const safe = async (label, fn) => { try { return await fn(); } catch (e) { console.log('  ' + label + ': Fehler ' + e.message); return null; } };
const get = async (url, accept) => {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept || '*/*' }, redirect: 'follow' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r;
};
const j = async (url) => (await get(url, 'application/json')).json();
const textOf = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&eacute;/g, 'é').replace(/\s+/g, ' ').trim();
const list = (s) => String(s || '').split(';').map((x) => x.trim()).filter(Boolean);

// 1) Wikipedia: Volltext
for (const w of list(process.env.WIKI)) {
  const [lang, ...rest] = w.split(':'), title = rest.join(':');
  console.log('\n================ Wikipedia ' + lang + ': ' + title);
  await safe('Wikipedia ' + lang, async () => {
    const d = await j('https://' + lang + '.wikipedia.org/w/api.php?' + q({ action: 'query', format: 'json', formatversion: 2, redirects: 1, prop: 'extracts|info|pageprops', explaintext: 1, exsectionformat: 'wiki', titles: title, inprop: 'url' }));
    const pg = (d.query.pages || [])[0] || {};
    if (pg.missing) { console.log('  – Artikel existiert nicht'); return; }
    console.log('  Titel: ' + pg.title + ' | Länge: ' + pg.length + ' Bytes | ' + pg.fullurl + ' | Wikidata: ' + ((pg.pageprops || {}).wikibase_item || '–'));
    console.log(trim(pg.extract || '', 14000));
  });
}

// 2) Wikidata
if (process.env.WD) {
  console.log('\n================ Wikidata: ' + process.env.WD);
  await safe('Wikidata', async () => {
    const s = await j('https://www.wikidata.org/w/api.php?' + q({ action: 'wbsearchentities', format: 'json', search: process.env.WD, language: 'fr', limit: 5 }));
    (s.search || []).forEach((x) => console.log('  Treffer: ' + x.id + ' – ' + x.label + ' – ' + (x.description || '')));
    const id = process.env.WDQ || ((s.search || [])[0] || {}).id;
    if (!id) return;
    const d = await j('https://www.wikidata.org/w/api.php?' + q({ action: 'wbgetentities', format: 'json', ids: id, props: 'labels|descriptions|claims|sitelinks', languages: 'de|fr|en' }));
    const e = d.entities[id], c = e.claims || {};
    console.log('  ' + id + ': ' + Object.values(e.labels || {}).map((l) => l.language + '=' + l.value).join(' | '));
    console.log('  Beschreibungen: ' + Object.values(e.descriptions || {}).map((l) => l.language + '=' + l.value).join(' | '));
    console.log('  Sprachversionen: ' + Object.keys(e.sitelinks || {}).join(', '));
    const refs = new Set(), vals = {};
    for (const [p, arr] of Object.entries(c)) {
      vals[p] = arr.map((x) => x.mainsnak && x.mainsnak.datavalue && x.mainsnak.datavalue.value).filter(Boolean);
      vals[p].forEach((v) => { if (v && v.id) refs.add(v.id); });
    }
    const lab = {};
    if (refs.size) {
      const l = await j('https://www.wikidata.org/w/api.php?' + q({ action: 'wbgetentities', format: 'json', ids: [...refs].slice(0, 50).join('|'), props: 'labels', languages: 'de|fr|en' }));
      for (const [k, v] of Object.entries(l.entities)) lab[k] = (v.labels.de || v.labels.fr || v.labels.en || {}).value || k;
    }
    for (const [p, arr] of Object.entries(vals)) console.log('  ' + p + ': ' + arr.map((v) => v.id ? lab[v.id] + ' (' + v.id + ')' : v.time ? v.time : v.amount ? v.amount : typeof v === 'string' ? v : JSON.stringify(v)).join(' ; ').slice(0, 300));
  });
}

// 3) Webseiten und PDFs (nur erlaubte Hosts)
for (const u of list(process.env.SEITEN)) {
  console.log('\n================ Seite: ' + u);
  await safe('Seite', async () => {
    const host = new URL(u).hostname;
    if (!OK_HOSTS.some((re) => re.test(host))) { console.log('  Host nicht erlaubt: ' + host); return; }
    const r = await get(u);
    const type = r.headers.get('content-type') || '';
    if (/pdf/i.test(type) || /\.pdf(\?|$)/i.test(u)) {
      fs.writeFileSync('seite.pdf', Buffer.from(await r.arrayBuffer()));
      const t = execFileSync('pdftotext', ['-layout', 'seite.pdf', '-'], { encoding: 'utf8', maxBuffer: 20e6 });
      console.log('  PDF, ' + t.length + ' Zeichen Text');
      console.log(trim(t.replace(/\n{3,}/g, '\n\n'), 6000));
    } else {
      const t = textOf(await r.text());
      console.log('  HTML, ' + t.length + ' Zeichen Text');
      console.log(trim(t, 6000));
    }
  });
}

// 4) Commons: Fotos der Kategorie (Beschreibung + Bild als base64 im Protokoll, damit man es ansehen kann)
if (process.env.KATEGORIE) {
  const n = Math.min(+process.env.FOTOS || 3, 5);
  console.log('\n================ Commons: Kategorie ' + process.env.KATEGORIE);
  await safe('Commons', async () => {
    const d = await j('https://commons.wikimedia.org/w/api.php?' + q({ action: 'query', format: 'json', formatversion: 2, generator: 'categorymembers', gcmtitle: 'Category:' + process.env.KATEGORIE, gcmtype: 'file', gcmlimit: 20, prop: 'imageinfo', iiprop: 'url|extmetadata|size', iiurlwidth: 1000, iiextmetadatafilter: 'ImageDescription|DateTimeOriginal|Artist|ObjectName' }));
    const pages = d.query ? d.query.pages : [];
    console.log('  ' + pages.length + ' Dateien');
    pages.forEach((pg) => { const m = (pg.imageinfo || [{}])[0].extmetadata || {}; console.log('  • ' + pg.title + ' – ' + (m.ImageDescription ? textOf(m.ImageDescription.value) : '') + ' [' + (m.DateTimeOriginal ? textOf(m.DateTimeOriginal.value) : '') + ']'); });
    for (const pg of pages.slice(0, n)) {
      const ii = (pg.imageinfo || [])[0];
      if (!ii || !ii.thumburl) continue;
      const buf = Buffer.from(await (await get(ii.thumburl)).arrayBuffer());
      console.log('===IMG ' + pg.title.replace(/\s/g, '_') + ' ' + buf.length + '===');
      console.log(buf.toString('base64'));
      console.log('===END===');
    }
  });
}
console.log('\nFertig.');
