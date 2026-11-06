// Einmaliger Test (nur Messung, v0.20-Vorarbeit „Gegend“): Was gibt es zu einem Ort an Wikipedia-Artikeln, auch ohne Koordinaten?
// 1. der Ortsartikel mit Abschnitten (Länge je Abschnitt) und Stellen zu einem Stichwort, 2. Wikidata: Dinge, die zum Ort gehören
// (liegt in, am Gewässer, geboren/gestorben in, Sitz, Ort), 3. Wikipedia-Volltextsuche nach Ort und Thema, 4. Artikel, die auf den Ortsartikel verlinken.
// Läuft nur auf GitHub (Workflow gegend-test.yml). Env: ORT (Artikeltitel), SPRACHE (de), THEMA (Suchwörter), STICHWORT (Regex für Textstellen).
const UA = 'ReisefuehrerBot/gegend-test (https://github.com/obitusde/reisefuehrer; einmaliger Test)';
const ORT = process.env.ORT || 'Neuenrade', L = /^[a-z]{2}$/.test(process.env.SPRACHE || '') ? process.env.SPRACHE : 'de';
const THEMA = process.env.THEMA || 'Reformation Protestanten Katholiken', STICH = new RegExp(process.env.STICHWORT || 'Reformation|evangelisch|katholisch|Protestant|Konfession|Gegenreformation', 'gi');
const q = (o) => Object.entries(o).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
const j = async (url) => { const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
const wp = (o) => j('https://' + L + '.wikipedia.org/w/api.php?' + q({ format: 'json', formatversion: 2, ...o }));
const safe = async (label, fn) => { try { await fn(); } catch (e) { console.log('  ' + label + ': Fehler ' + e.message); } };
const strip = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/\s+/g, ' ').trim();

console.log('================ Ortsartikel ' + L + ':' + ORT);
let qid = '';
await safe('Artikel', async () => {
  const d = await wp({ action: 'query', prop: 'extracts|info|pageprops', explaintext: 1, exsectionformat: 'wiki', redirects: 1, titles: ORT, inprop: 'url' });
  const pg = d.query.pages[0];
  if (pg.missing) { console.log('  Artikel fehlt'); return; }
  qid = (pg.pageprops || {}).wikibase_item || '';
  const text = pg.extract || '';
  console.log('  Titel ' + pg.title + ' | ' + pg.length + ' Bytes | Wikidata ' + qid + ' | ' + pg.fullurl);
  console.log('  Einleitung: ' + text.slice(0, 700).replace(/\n/g, ' '));
  // sections: "== Name ==" / "=== Name ==="
  const parts = text.split(/\n(?==+ [^=\n]+ =+\n)/), secs = [];
  parts.forEach((p) => { const m = /^(=+) ([^=\n]+) =+\n/.exec(p); if (m) secs.push({ lvl: m[1].length, name: m[2], len: p.length, text: p.replace(/^.*\n/, '') }); });
  console.log('  Abschnitte (' + secs.length + '): ' + secs.map((s) => (s.lvl === 3 ? '  – ' : '') + s.name + ' (' + s.len + ')').join(' | '));
  let n = 0;
  console.log('  Textstellen zu „' + STICH.source + '“ (Abschnitt: Ausschnitt):');
  for (const s of secs) {
    STICH.lastIndex = 0; const m = STICH.exec(s.text);
    if (m && n < 8) { n++; const i = Math.max(0, m.index - 120); console.log('   • [' + s.name + '] …' + s.text.slice(i, i + 380).replace(/\n/g, ' ') + '…'); }
  }
  if (!n) console.log('   (keine Stelle gefunden)');
});

if (qid) await safe('Wikidata', async () => {
  console.log('\n================ Wikidata: was zu ' + qid + ' gehört (nur mit ' + L + '-Artikel; nach Sprachversionen)');
  const sparql = `SELECT ?item ?itemLabel ?rel ?sl ?title ?desc WHERE {
    { ?item wdt:P131 wd:${qid}. BIND("liegt in" AS ?rel) }
    UNION { ?item wdt:P131/wdt:P131 wd:${qid}. BIND("liegt in (Ortsteil)" AS ?rel) }
    UNION { wd:${qid} wdt:P206 ?item. BIND("am Gewässer" AS ?rel) }
    UNION { ?item wdt:P19 wd:${qid}. BIND("geboren in" AS ?rel) }
    UNION { ?item wdt:P20 wd:${qid}. BIND("gestorben in" AS ?rel) }
    UNION { ?item wdt:P159 wd:${qid}. BIND("Sitz" AS ?rel) }
    UNION { ?item wdt:P276 wd:${qid}. BIND("Ort" AS ?rel) }
    UNION { ?item wdt:P17 ?c. ?item wdt:P706 wd:${qid}. BIND("Gewässer/Landschaft" AS ?rel) }
    ?item wikibase:sitelinks ?sl.
    ?art schema:about ?item; schema:isPartOf <https://${L}.wikipedia.org/>; schema:name ?title.
    OPTIONAL { ?item schema:description ?desc. FILTER(LANG(?desc) = "${L}") }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "${L},en". }
  } ORDER BY DESC(?sl) LIMIT 80`;
  const r = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(sparql), { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const rows = (await r.json()).results.bindings, seen = new Set(), byRel = {};
  rows.forEach((b) => { const t = b.title.value; if (seen.has(t)) return; seen.add(t); (byRel[b.rel.value] = byRel[b.rel.value] || []).push(t + ' (' + b.sl.value + ' Sprachen' + (b.desc ? ', ' + b.desc.value : '') + ')'); });
  console.log('  ' + seen.size + ' Artikel');
  Object.entries(byRel).forEach(([rel, l]) => console.log('  ' + rel + ' (' + l.length + '): ' + l.slice(0, 14).join(' | ')));
});

console.log('\n================ Wikipedia-Suche (Volltext, ' + L + ')');
for (const [label, term] of [['Ort', '"' + ORT + '"'], ['Thema', THEMA]]) {
  await safe('Suche ' + label, async () => {
    const d = await wp({ action: 'query', list: 'search', srsearch: term, srlimit: 20, srnamespace: 0, srprop: 'snippet|wordcount|sectiontitle', srinfo: 'totalhits' });
    console.log('  Suche „' + term + '“: ' + d.query.searchinfo.totalhits + ' Treffer; die ersten 20:');
    d.query.search.forEach((h, i) => console.log('   ' + (i + 1) + '. ' + h.title + (h.sectiontitle ? ' § ' + h.sectiontitle : '') + ' (' + h.wordcount + ' Wörter) – ' + strip(h.snippet).slice(0, 150)));
  });
}
await safe('Rückverweise', async () => {
  const d = await wp({ action: 'query', list: 'backlinks', bltitle: ORT, blnamespace: 0, bllimit: 500 });
  const t = (d.query.backlinks || []).map((x) => x.title);
  console.log('\n================ Artikel, die auf „' + ORT + '“ verlinken: ' + t.length + (t.length >= 500 ? ' (mindestens)' : '') + '; die ersten 60: ' + t.slice(0, 60).join(' | '));
});
await safe('Ausgehende Links', async () => {
  const d = await wp({ action: 'query', prop: 'links', titles: ORT, pllimit: 500, plnamespace: 0 });
  const t = ((d.query.pages[0] || {}).links || []).map((x) => x.title);
  console.log('\n================ Links im Ortsartikel: ' + t.length + '; ' + t.slice(0, 80).join(' | '));
});
