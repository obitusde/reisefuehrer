// Einmaliger Test (nur Messung): Themen zu einem Ort automatisch aus Wikipedia ableiten (Vorarbeit „Gegend“).
// Ablauf wie später in der App: Ortsartikel (Abschnitte) + Verweise in beide Richtungen (der Artikel verlinkt auf X UND X verlinkt auf den Ort)
// + Seitenaufrufe + Art des Gegenstands aus Wikidata (P31) → Gruppen; Verwaltung/Politik/Ortsteile werden weggelassen, Persönlichkeiten kommen ans Ende.
// Läuft nur auf GitHub (Workflow themen-test.yml). Env: ORT (Artikeltitel), SPRACHE.
const UA = 'ReisefuehrerBot/themen-test (https://github.com/obitusde/reisefuehrer; einmaliger Test)';
const ORT = process.env.ORT || 'Werdohl', L = /^[a-z]{2}$/.test(process.env.SPRACHE || '') ? process.env.SPRACHE : 'de';
const q = (o) => Object.entries(o).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function j(url) {
  for (let i = 0; i < 4; i++) {
    try { const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    catch (e) { if (i === 3) throw e; await sleep(1500 * (i + 1)); }
  }
}
const wp = (o) => j('https://' + L + '.wikipedia.org/w/api.php?' + q({ format: 'json', formatversion: 2, ...o }));
const wd = (o) => j('https://www.wikidata.org/w/api.php?' + q({ format: 'json', ...o }));
const t0 = Date.now(), calls = { n: 0 };
const W = async (o) => { calls.n++; return wp(o); }, D = async (o) => { calls.n++; return wd(o); };

// ---- 1. Ortsartikel und Abschnitte
const art = (await W({ action: 'query', prop: 'extracts|info|pageprops', explaintext: 1, exsectionformat: 'wiki', redirects: 1, titles: ORT })).query.pages[0];
console.log('Ort: ' + art.title + ' (' + art.length + ' Bytes), Wikidata ' + (art.pageprops || {}).wikibase_item);
const text = art.extract || '', parts = text.split(/\n(?==+ [^=\n]+ =+\n)/), secs = [];
parts.forEach((p) => { const m = /^(=+) ([^=\n]+) =+\n/.exec(p); if (m) secs.push({ lvl: m[1].length, name: m[2].trim(), len: p.length }); });
const SKIP_SEC = /Einzelnachweise|Weblinks|Literatur|Anmerkung|Siehe auch|Politik|Stadtrat|Gemeinderat|Bürgermeister|Wahl|Wappen|Flagge|Partnerschaft|Partnerstädte|Verwaltung|Eingemeind|Einwohner|Bevölkerung|Statistik|Konfession|Religion|Klima|Nachbar|gliederung|Ausdehnung|Öffentliche|Medien|Bildung|Persönlichkeit|Ehrenbürger|Söhne|Gesundheit|Behörden|Gerichte|Justiz|Feuerwehr|Ortsteile|Stadtteile|Gliederung|Lage|Geschichte der Stadtteile|Namensherkunft|Name$/i;
const sectionTopics = secs.filter((s) => !SKIP_SEC.test(s.name) && s.len >= 500 && s.name !== art.title).sort((a, b) => b.len - a.len);

// ---- 2. Verweise in beide Richtungen
const out = [], back = [];
for (let cont = {}, n = 0; n < 3; n++) { const d = await W({ action: 'query', prop: 'links', titles: ORT, pllimit: 500, plnamespace: 0, ...cont }); out.push(...(((d.query.pages[0] || {}).links || []).map((x) => x.title))); if (!d.continue) break; cont = d.continue; }
for (let cont = {}, n = 0; n < 4; n++) { const d = await W({ action: 'query', list: 'backlinks', bltitle: ORT, blnamespace: 0, bllimit: 500, ...cont }); back.push(...(d.query.backlinks || []).map((x) => x.title)); if (!d.continue) break; cont = d.continue; }
const backSet = new Set(back), both = out.filter((t) => backSet.has(t) && t !== ORT);
console.log('Verweise: ' + out.length + ' im Ortsartikel, ' + back.length + ' Artikel verlinken auf den Ort, in beide Richtungen: ' + both.length);

// ---- 3. Infos zu den Kandidaten: Länge, Aufrufe (60 Tage), Wikidata-Nummer
const info = {};
for (let i = 0; i < both.length; i += 50) {
  const d = await W({ action: 'query', prop: 'info|pageprops|pageviews', ppprop: 'wikibase_item', pvipdays: 60, redirects: 1, titles: both.slice(i, i + 50).join('|') });
  const red = {}; (d.query.redirects || []).forEach((r) => { red[r.to] = r.from; });
  (d.query.pages || []).forEach((p) => { if (p.missing) return; const views = Object.values(p.pageviews || {}).reduce((a, b) => a + (b || 0), 0) / 60; info[p.title] = { title: p.title, len: p.length || 0, views: Math.round(views * 10) / 10, q: (p.pageprops || {}).wikibase_item || '' }; });
}
// ---- 4. Art des Gegenstands (Wikidata P31) → Klassenbezeichnungen
const qs = Object.values(info).map((x) => x.q).filter(Boolean), p31 = {};
for (let i = 0; i < qs.length; i += 50) {
  const d = await D({ action: 'wbgetentities', ids: qs.slice(i, i + 50).join('|'), props: 'claims', languages: 'de' });
  Object.entries(d.entities || {}).forEach(([id, e]) => { p31[id] = ((e.claims || {}).P31 || []).map((c) => c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value && c.mainsnak.datavalue.value.id).filter(Boolean); });
}
const cls = [...new Set(Object.values(p31).flat())], clsLabel = {};
for (let i = 0; i < cls.length; i += 50) {
  const d = await D({ action: 'wbgetentities', ids: cls.slice(i, i + 50).join('|'), props: 'labels', languages: L + '|en' });
  Object.entries(d.entities || {}).forEach(([id, e]) => { clsLabel[id] = ((e.labels || {})[L] || (e.labels || {}).en || {}).value || id; });
}
const EXCL = /Gemeinde|Stadt$|Kleinstadt|Großstadt|Ortsteil|Stadtteil|Ortschaft|Dorf|Landkreis|Kreis$|Amt$|Verwaltung|Partei|Bundesstraße|Landesstraße|Autobahn|Wahlkreis|Gebietsreform|Begriffsklärung|Liste|Gemarkung|Regierungsbezirk|Bundesland|Staat|Gerichtsbezirk|Gericht|Behörde|Postleitzahl|Jahr$|Kalender|Land$|Region|Landschaftsverband|Zeitung|Radiosender|Wikimedia/i;
const GROUPS = [
  ['Natur und Gewässer', /Fluss|Bach|Nebenfluss|Berg|Gipfel|See$|Talsperre|Stausee|Tal$|Naturschutz|Landschaftsschutz|Naturpark|Wald|Gebirge|Höhle|Quelle|Gewässer|Naturdenkmal|Schutzgebiet/i],
  ['Verkehr und Technik', /Bahnstrecke|Eisenbahn|Bahnhof|Brücke|Tunnel|Flugplatz|Bahn$|Haltepunkt|Kraftwerk|Staumauer|Talsperre/i],
  ['Bauwerke und Kultur', /Burg|Schloss|Kirche|Kapelle|Museum|Denkmal|Turm|Rathaus|Gut$|Herrenhaus|Kloster|Synagoge|Friedhof|Theater|Kunst|Skulptur|Gebäude|Bauwerk|Villa|Mühle|Fabrik|Hammer/i],
  ['Wirtschaft', /Unternehmen|Firma|Hersteller|Gesellschaft|Betrieb|Aktiengesellschaft|Marke|Handelsunternehmen/i],
  ['Sport und Vereine', /Sportverein|Verein|Stadion|Sport|Mannschaft|Fußball/i],
  ['Persönlichkeiten', /^Mensch$/]
];
const topics = Object.values(info).map((x) => {
  const labels = (p31[x.q] || []).map((c) => clsLabel[c] || c);
  const lab = labels.join(' / ');
  const grp = labels.some((l) => l === 'Mensch') ? 'Persönlichkeiten' : (GROUPS.find(([, re]) => labels.some((l) => re.test(l))) || [''])[0];
  return { ...x, lab, grp, excl: !grp && EXCL.test(lab), score: Math.log10(1 + x.views) * 2 + Math.log10(1 + x.len / 1000) };
});
const show = (g, n) => topics.filter((t) => t.grp === g && !t.excl).sort((a, b) => b.score - a.score).slice(0, n);

// ---- 5. Erwähnt in (Volltextsuche), ohne die schon genannten und ohne Listen
const sr = (await W({ action: 'query', list: 'search', srsearch: '"' + ORT + '"', srlimit: 40, srnamespace: 0, srprop: 'wordcount' })).query.search.filter((h) => h.title !== ORT && !backSet.has(h.title) && !/^Liste |^Liste der|Wahlkreis/.test(h.title)).slice(0, 8);

console.log('\n================ THEMEN FÜR ' + ORT.toUpperCase() + ' (so würde die App sie zeigen)');
console.log('1. Aus dem Ortsartikel (nach Länge): ' + (sectionTopics.slice(0, 8).map((s) => s.name + ' (' + s.len + ')').join(' | ') || '–'));
for (const [g] of GROUPS.slice(0, 5)) { const l = show(g, 6); if (l.length) console.log('2. ' + g + ': ' + l.map((t) => t.title + ' [' + t.lab.slice(0, 40) + '; ' + t.views + '/Tag; ' + Math.round(t.len / 1000) + ' kB]').join(' | ')); }
console.log('3. Erwähnt in: ' + (sr.map((h) => h.title + ' (' + h.wordcount + ' W.)').join(' | ') || '–'));
console.log('4. Persönlichkeiten (am Ende): ' + (show('Persönlichkeiten', 8).map((t) => t.title + ' [' + t.views + '/Tag]').join(' | ') || '–'));
const rest = topics.filter((t) => !t.grp && !t.excl).sort((a, b) => b.score - a.score).slice(0, 10);
console.log('(ohne Gruppe, sonstiges: ' + rest.map((t) => t.title + ' [' + t.lab.slice(0, 30) + ']').join(' | ') + ')');
console.log('(weggelassen als Verwaltung/Politik/Ort: ' + topics.filter((t) => t.excl).sort((a, b) => b.views - a.views).slice(0, 14).map((t) => t.title + ' [' + t.lab.slice(0, 25) + ']').join(' | ') + ')');
console.log('\nAnfragen: ' + calls.n + ', Zeit ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
