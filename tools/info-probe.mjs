// Test (v0.12.x): what can the app find about a point that has no Wikipedia article in our six languages?
// node tools/info-probe.mjs  (env PUNKTE = "Name|Q-Nummer oder leer|lat|lon;Name2|Q|lat|lon")
// Asks Wikidata (description, height, image), the Wikipedia search of several languages (articles that MENTION the name),
// Wikimedia Commons (photos near the point, and by name) and Wikivoyage. Nothing is written. Runs on GitHub (workflow info-test.yml),
// because the cloud session of the developer cannot reach these servers.
const UA = 'ReisefuehrerBot/probe (https://github.com/obitusde/reisefuehrer; einmaliger Test)';
const j = async (url) => {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
};
const q = (o) => Object.entries(o).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
const strip = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/\s+/g, ' ').trim();
const trim = (s, n) => (s.length > n ? s.slice(0, n) + ' …' : s);
const safe = async (label, fn) => { try { return await fn(); } catch (e) { console.log('  ' + label + ': Fehler ' + e.message); return null; } };

const points = (process.env.PUNKTE || '').split(';').map((x) => x.trim()).filter(Boolean).map((x) => { const [name, qid, lat, lon] = x.split('|'); return { name, qid, lat: +lat, lon: +lon }; });
for (const p of points) {
  console.log('\n================ ' + p.name + ' (' + p.lat + ', ' + p.lon + (p.qid ? ', ' + p.qid : ', ohne Wikidata') + ')');

  // 1) Wikidata
  if (p.qid) await safe('Wikidata', async () => {
    const d = await j('https://www.wikidata.org/w/api.php?' + q({ action: 'wbgetentities', format: 'json', ids: p.qid, props: 'labels|descriptions|claims|sitelinks', languages: 'de|en|fr|it' }));
    const e = d.entities[p.qid] || {};
    console.log('[Wikidata] Beschreibung: ' + (['de', 'en', 'fr', 'it'].map((l) => e.descriptions && e.descriptions[l] ? l + ': ' + e.descriptions[l].value : '').filter(Boolean).join(' | ') || '– keine –'));
    console.log('[Wikidata] Sprachversionen: ' + (Object.keys(e.sitelinks || {}).join(', ') || '–'));
    const c = e.claims || {}, v = (id) => (c[id] || []).map((x) => x.mainsnak && x.mainsnak.datavalue && x.mainsnak.datavalue.value);
    const ele = v('P2044')[0];
    console.log('[Wikidata] Höhe: ' + (ele ? ele.amount + ' m' : '–') + ' | Bild: ' + (v('P18')[0] || '–') + ' | Commons-Kategorie: ' + (v('P373')[0] || '–') + ' | Ort(P131): ' + (v('P131')[0] ? v('P131')[0].id : '–') + ' | Art(P31): ' + v('P31').map((x) => x && x.id).join(','));
  });

  // 2) Wikipedia: articles that mention the name
  for (const l of ['de', 'en', 'fr', 'it']) await safe('Wikipedia ' + l, async () => {
    const d = await j('https://' + l + '.wikipedia.org/w/api.php?' + q({ action: 'query', format: 'json', list: 'search', srsearch: '"' + p.name + '"', srlimit: 4, srprop: 'snippet' }));
    const hits = (d.query && d.query.search) || [];
    console.log('[Wikipedia ' + l + '] ' + (hits.length ? hits.length + ' Treffer' : '– keine –') + (d.query && d.query.searchinfo ? ' (gesamt ' + d.query.searchinfo.totalhits + ')' : ''));
    hits.forEach((h) => console.log('    • ' + h.title + ': ' + trim(strip(h.snippet), 230)));
  });

  // 3) Commons: photos near the point, and by name
  await safe('Commons Umkreis', async () => {
    const d = await j('https://commons.wikimedia.org/w/api.php?' + q({ action: 'query', format: 'json', generator: 'geosearch', ggscoord: p.lat + '|' + p.lon, ggsradius: 1000, ggsnamespace: 6, ggslimit: 8, prop: 'imageinfo|coordinates', iiprop: 'url|extmetadata', iiurlwidth: 320, iiextmetadatafilter: 'ImageDescription|ObjectName' }));
    const pages = Object.values((d.query && d.query.pages) || {}).sort((a, b) => ((a.coordinates || [{}])[0].dist || 0) - ((b.coordinates || [{}])[0].dist || 0));
    console.log('[Commons Fotos im Umkreis 1 km] ' + (pages.length ? pages.length + ' Fotos' : '– keine –'));
    pages.slice(0, 5).forEach((pg) => {
      const m = (pg.imageinfo && pg.imageinfo[0] && pg.imageinfo[0].extmetadata) || {}, dist = Math.round(((pg.coordinates || [{}])[0].dist) || 0);
      console.log('    • ' + dist + ' m: ' + pg.title.replace(/^File:/, '') + (m.ImageDescription ? ' – ' + trim(strip(m.ImageDescription.value), 120) : ''));
    });
    if (pages[0] && pages[0].imageinfo) console.log('    Vorschaubild (320 px): ' + pages[0].imageinfo[0].thumburl);
  });
  await safe('Commons Name', async () => {
    const d = await j('https://commons.wikimedia.org/w/api.php?' + q({ action: 'query', format: 'json', list: 'search', srsearch: p.name, srnamespace: '6|14', srlimit: 5, srprop: '' }));
    const hits = (d.query && d.query.search) || [];
    console.log('[Commons Suche nach dem Namen] ' + (hits.length ? hits.map((h) => h.title.replace(/^File:/, '')).join(' | ') : '– keine –'));
  });

  // 4) Wikivoyage
  for (const l of ['de', 'en', 'fr']) await safe('Wikivoyage ' + l, async () => {
    const d = await j('https://' + l + '.wikivoyage.org/w/api.php?' + q({ action: 'query', format: 'json', list: 'search', srsearch: '"' + p.name + '"', srlimit: 3, srprop: 'snippet' }));
    const hits = (d.query && d.query.search) || [];
    if (hits.length) { console.log('[Wikivoyage ' + l + '] ' + hits.length + ' Treffer'); hits.forEach((h) => console.log('    • ' + h.title + ': ' + trim(strip(h.snippet), 200))); }
  });
}
console.log('\nFertig.');
