// Einmaliger Test (nur Messung, baut nichts ein): was liefert Wikivoyage für eine Stadt?
// Holt die Artikel (de, en, fr) und liest die Einträge (Sehenswürdigkeit/see/voir, Aktivität/do/faire) samt Koordinaten, Wikidata-Nummer, Beschreibung.
// Läuft nur auf GitHub (Workflow wikivoyage-test.yml), weil die Cloud-Sitzung des Entwicklers diese Server nicht erreicht. Env: STADT, SPRACHEN.
const UA = 'ReisefuehrerBot/wikivoyage-test (https://github.com/obitusde/reisefuehrer; einmaliger Test)';
const STADT = process.env.STADT || 'Lausanne';
const SPR = (process.env.SPRACHEN || 'de,en,fr').split(',').map((x) => x.trim()).filter((x) => /^[a-z]{2}$/.test(x));
const q = (o) => Object.entries(o).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
const j = async (url) => { const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
const api = (lang, o) => j('https://' + lang + '.wikivoyage.org/w/api.php?' + q({ format: 'json', formatversion: 2, ...o }));
const SEE = /^(see|voir|sehenswürdigkeit|vedere|ver|listing)$/i, DO = /^(do|faire|aktivität|fare|hacer)$/i;

// {{Name|a=b|c=d}} mit verschachtelten Klammern lesen
function templates(t) {
  const out = []; let i = 0;
  while ((i = t.indexOf('{{', i)) >= 0) {
    let d = 0, k = i;
    for (; k < t.length - 1; k++) {
      if (t.startsWith('{{', k)) { d++; k++; } else if (t.startsWith('}}', k)) { d--; k++; if (d === 0) break; }
    }
    const body = t.slice(i + 2, k - 1);
    let depth = 0, parts = [], cur = '';
    for (let c = 0; c < body.length; c++) {
      const two = body.slice(c, c + 2);
      if (two === '{{' || two === '[[') { depth++; cur += two; c++; } else if (two === '}}' || two === ']]') { depth--; cur += two; c++; }
      else if (body[c] === '|' && depth === 0) { parts.push(cur); cur = ''; } else cur += body[c];
    }
    parts.push(cur);
    const name = parts.shift().trim(), args = {};
    parts.forEach((p) => { const e = p.indexOf('='); if (e > 0) args[p.slice(0, e).trim().toLowerCase()] = p.slice(e + 1).trim(); });
    out.push({ name, args });
    i = k + 1;
  }
  return out;
}
const clean = (s) => String(s || '').replace(/<ref[\s\S]*?(<\/ref>|\/>)/gi, '').replace(/<[^>]+>/g, '').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/\{\{[^}]*\}\}/g, '').replace(/'{2,}/g, '').replace(/\s+/g, ' ').trim();
const first = (a, ks) => { for (const k of ks) if (a[k]) return a[k]; return ''; };

for (const lang of SPR) {
  console.log('\n================ Wikivoyage ' + lang + ': ' + STADT);
  try {
    const d = await api(lang, { action: 'parse', page: STADT, prop: 'wikitext|sections|links', redirects: 1 });
    if (d.error) { console.log('  ' + (d.error.info || 'Fehler')); continue; }
    const wt = d.parse.wikitext || '';
    const tp = templates(wt);
    const names = {}; tp.forEach((x) => { names[x.name.toLowerCase()] = (names[x.name.toLowerCase()] || 0) + 1; });
    console.log('  Artikel: ' + d.parse.title + ' | Wikitext ' + wt.length + ' Zeichen | Abschnitte: ' + (d.parse.sections || []).filter((s) => s.toclevel === 1).map((s) => s.line).join(' / '));
    console.log('  Vorlagen (häufigste): ' + Object.entries(names).sort((a, b) => b[1] - a[1]).slice(0, 12).map((e) => e[0] + ' ×' + e[1]).join(', '));
    const vc = tp.filter((x) => /^vcard$/i.test(x.name)), types = {};
    vc.forEach((x) => { const t = (x.args.type || x.args.typ || '(ohne)').toLowerCase(); types[t] = (types[t] || 0) + 1; });
    if (vc.length) console.log('  vcard-Typen: ' + Object.entries(types).map((e) => e[0] + ' ×' + e[1]).join(', ') + ' | Beispiel-Felder: ' + Object.keys(vc[0].args).join(','));
    const isT = (x, re) => SEE.test(x.name) && re === 'see' || DO.test(x.name) && re === 'do' || /^vcard$/i.test(x.name) && new RegExp(re === 'see' ? '^(see|sight|sehenswürdigkeit|attraction)' : '^(do|activity|aktivität)', 'i').test(x.args.type || x.args.typ || '');
    const see = tp.filter((x) => isT(x, 'see')), doo = tp.filter((x) => isT(x, 'do'));
    for (const [label, L] of [['Sehenswürdigkeiten', see], ['Aktivitäten', doo]]) {
      const withCoord = L.filter((x) => first(x.args, ['lat', 'latitude']) && first(x.args, ['long', 'lon', 'longitude'])).length;
      const withWd = L.filter((x) => x.args.wikidata).length;
      const withDesc = L.filter((x) => clean(first(x.args, ['description', 'content', 'beschreibung', 'inhalt'])).length > 20).length;
      const words = L.map((x) => clean(first(x.args, ['description', 'content', 'beschreibung', 'inhalt'])).split(/\s+/).filter(Boolean).length);
      console.log('  ' + label + ': ' + L.length + ' Einträge, davon ' + withCoord + ' mit Koordinaten, ' + withWd + ' mit Wikidata-Nummer, ' + withDesc + ' mit Text > 20 Zeichen; Wörter je Text im Mittel ' + (words.length ? Math.round(words.reduce((a, b) => a + b, 0) / words.length) : 0));
    }
    console.log('  --- Einträge Sehenswürdigkeiten (Name | Koordinaten | Wikidata | Text ohne Zeiten/Preise)');
    see.slice(0, 40).forEach((x) => {
      const a = x.args, desc = clean(first(a, ['description', 'content', 'beschreibung', 'inhalt']));
      console.log('   • ' + clean(first(a, ['name', 'nom'])) + ' | ' + (first(a, ['lat', 'latitude']) + ',' + first(a, ['long', 'lon', 'longitude'])).replace(/^,$/, '–') + ' | ' + (a.wikidata || '–') + ' | ' + (desc.length > 300 ? desc.slice(0, 300) + ' …' : desc || '(kein Text)'));
    });
  } catch (e) { console.log('  Fehler: ' + e.message); }
  // Unterartikel (Stadtteile) und Artikel in der Nähe
  try {
    const p = await api(lang, { action: 'query', list: 'allpages', apprefix: STADT + '/', aplimit: 50 });
    console.log('  Unterartikel "' + STADT + '/…": ' + ((p.query.allpages || []).map((x) => x.title).join(', ') || 'keine'));
  } catch (e) { console.log('  Unterartikel: Fehler ' + e.message); }
}
// Artikel um den Mittelpunkt (zeigt, wie fein die Gliederung ist)
try {
  const g = await api(SPR[0] || 'de', { action: 'query', list: 'geosearch', gscoord: '46.5197|6.6323', gsradius: 10000, gslimit: 30 });
  console.log('\n================ Artikel im Umkreis 10 km (' + (SPR[0] || 'de') + '): ' + (g.query.geosearch || []).map((x) => x.title + ' (' + Math.round(x.dist) + ' m)').join(', '));
} catch (e) { console.log('Umkreis: Fehler ' + e.message); }
