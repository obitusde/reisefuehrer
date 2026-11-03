// Generates a SYNTHETIC fixture shaped like the real API responses (values are invented, plausible).
import fs from 'fs';
const P = [
 // id, en, de, lat, lon, lenEn, lenDe, viewsEn60, viewsDe60, sitelinks, p31, p1435, descEn, descDe
 ['Q900001','Manchester Town Hall','Rathaus Manchester',53.4794,-2.2446,52000,9000,14000,600,18,['Q25550691'],['Q15700818'],'Victorian Neo-Gothic municipal building in Manchester, England','Rathaus in Manchester'],
 ['Q900002','Manchester Cathedral','Kathedrale von Manchester',53.4851,-2.2446,38000,6000,9000,500,24,['Q900102'],['Q15700818'],'cathedral in Manchester, England','Kirchengebäude in Manchester'],
 ['Q900003','John Rylands Research Institute and Library','John Rylands Library',53.4802,-2.2487,30000,5000,8000,400,14,['Q900101'],['Q15700818'],'late-Victorian neo-Gothic building in Manchester','Bibliothek in Manchester'],
 ['Q900004','Science and Industry Museum','Museum of Science and Industry (Manchester)',53.4771,-2.2546,25000,4000,9000,300,15,['Q33506'],['Q15700818'],'museum in Manchester, England','Museum in Manchester'],
 ['Q900005',"Chetham's Library",null,53.4857,-2.2432,15000,0,4000,0,9,['Q7075'],['Q15700818'],'library in Manchester, England',''],
 ['Q900006','Albert Square, Manchester',null,53.4796,-2.2448,8000,0,2500,0,3,['Q174782'],[],'public square in Manchester',''],
 ['Q900007','River Tib',null,53.4780,-2.2390,4000,0,600,0,2,[],[],'culverted river in Manchester, England',''],
 ['Q900008','River Irwell','Irwell',53.4840,-2.2510,20000,3000,3000,150,12,['Q4022'],[],'river in North West England','Fluss in England'],
 ['Q900009','Deansgate',null,53.4808,-2.2486,12000,0,5000,0,4,['Q79007'],[],'street in Manchester',''],
 ['Q900010','Beetham Tower, Manchester','Beetham Tower (Manchester)',53.4757,-2.2525,18000,4000,7000,400,20,['Q11303'],[],'skyscraper in Manchester','Hochhaus in Manchester'],
 ['Q900011',"Sinclair's Oyster Bar",null,53.4848,-2.2443,4000,0,900,0,1,['Q212198'],['Q15700834'],'pub in Manchester',''],
 ['Q900012',"St Peter's Square tram stop",null,53.4783,-2.2432,6000,0,1500,0,2,['Q2175765'],[],'Manchester Metrolink tram stop',''],
 ['Q900013','Manchester','Manchester',53.4794,-2.2453,150000,80000,300000,30000,200,['Q1549591'],[],'city in Greater Manchester, England','Stadt im Nordwesten Englands'],
 ['Q900014','Peterloo Massacre','Peterloo-Massaker',53.4776,-2.2475,45000,8000,20000,1500,25,['Q1190554'],[],'1819 massacre in Manchester, England','Ereignis 1819 in Manchester'],
 ['Q900015','Manchester Art Gallery',null,53.4787,-2.2414,14000,3000,5000,250,12,['Q207694'],['Q15700818'],'art museum in Manchester, England','Kunstmuseum in Manchester'],
 ['Q900016','Manchester Central Library',null,53.4778,-2.2445,12000,0,3500,0,6,['Q7075'],['Q15700831'],'public library in Manchester',''],
 ['Q900017','List of tallest buildings and structures in Greater Manchester',null,53.4800,-2.2400,40000,0,6000,0,1,['Q13406463'],[],'Wikimedia list article',''],
 ['Q900018','Bridgewater House, Manchester',null,53.4769,-2.2401,3000,0,300,0,1,[],[],'office building in Manchester',''],
 ['Q900019','Cathedral Gardens',null,53.4855,-2.2425,3500,0,800,0,1,[],[],'public park in Manchester',''],
];
P.push(['Q900020','Manchester Victoria station',null,53.4874,-2.2425,52000,0,0,0,15,['Q55488'],['Q15700834'],'railway station in Manchester, England','']);
P.push(['Q900021','Manchester Arena bombing','Anschlag in Manchester 2017',53.4878,-2.2440,107000,20000,0,0,56,['Q900104'],[],'2017 terrorist attack in Manchester, England','Terroranschlag']);
// Wikidata classes (P31 values) with labels, resolved by the app via a second wbgetentities call
const CLASSES = { Q900101: ['research library', 'Forschungsbibliothek'], Q900102: ['Anglican cathedral', 'anglikanische Kathedrale'],
  Q900103: ['museum', 'Museum'], Q900104: ['terrorist attack', 'Terroranschlag'], Q55488: ['railway station', 'Bahnhof'] };
const deOnly = { pageid: 7700001, title: 'Gedenktafel am Rathaus (Manchester)', lat: 53.4793, lon: -2.2440, length: 2500, views: 40 };

function pagesFor(lang) {
  const out = [];
  let pid = lang === 'en' ? 1000 : 5000;
  for (const r of P) {
    const title = lang === 'en' ? r[1] : r[2];
    if (!title) continue;
    out.push({ pageid: pid++, ns: 0, title, length: lang === 'en' ? r[5] : r[6],
      coordinates: [{ lat: r[3], lon: r[4], primary: true, globe: 'earth' }],
      pageprops: { wikibase_item: r[0] } });
  }
  if (lang === 'de') out.push({ pageid: deOnly.pageid, ns: 0, title: deOnly.title, length: deOnly.length,
    coordinates: [{ lat: deOnly.lat, lon: deOnly.lon, primary: true, globe: 'earth' }] });
  return out;
}
// en split into two responses to exercise "continue" (article length only in the second part)
const en = pagesFor('en');
const en1 = { batchcomplete: false, continue: { incontinue: '1999', continue: 'ggscoord||' },
  query: { pages: en.map(p => { const c = { ...p }; delete c.length; return c; }) } };
const en2 = { batchcomplete: true, query: { pages: en.map(p => ({ pageid: p.pageid, ns: 0, title: p.title, length: p.length })) } };
const de = { batchcomplete: true, query: { pages: pagesFor('de') } };
// fr: one page that exists only in the local language (like a small museum in Morges)
const fr = { batchcomplete: true, query: { pages: [{ pageid: 9000, ns: 0, title: 'Musée Exemple', length: 6000,
  coordinates: [{ lat: 53.4799, lon: -2.2460, primary: true, globe: 'earth' }], pageprops: { wikibase_item: 'Q900030' } }] } };

const entities = {};
for (const r of P) {
  const sitelinks = { commonswiki: { site: 'commonswiki' }, enwikivoyage: { site: 'enwikivoyage' } };
  const langs = ['en','de','fr','es','it','nl','pl','ru','ja','zh','pt','sv','fi','da','no','cs','hu','ro','tr','ar','he','ko','uk','ca','eu','gl','cy','ga','is','et'];
  for (let i = 0; i < r[9]; i++) sitelinks[(langs[i] || 'x' + i) + 'wiki'] = { site: (langs[i] || 'x' + i) + 'wiki' };
  const claim = (q) => ({ mainsnak: { snaktype: 'value', datavalue: { type: 'wikibase-entityid', value: { 'entity-type': 'item', id: q } } } });
  entities[r[0]] = { type: 'item', id: r[0], sitelinks,
    descriptions: { ...(r[12] ? { en: { language: 'en', value: r[12] } } : {}), ...(r[13] ? { de: { language: 'de', value: r[13] } } : {}) },
    claims: { P31: r[10].map(claim), ...(r[11].length ? { P1435: r[11].map(claim) } : {}) } };
}
entities.Q900030 = { type: 'item', id: 'Q900030', sitelinks: { frwiki: { site: 'frwiki' } },
  descriptions: { fr: { language: 'fr', value: 'musée' } },
  claims: { P31: [{ mainsnak: { snaktype: 'value', datavalue: { type: 'wikibase-entityid', value: { 'entity-type': 'item', id: 'Q900103' } } } }] } };
for (const [q, [en, de]] of Object.entries(CLASSES)) {
  entities[q] = { type: 'item', id: q, labels: { en: { language: 'en', value: en }, de: { language: 'de', value: de } } };
}
const fixture = {
  _hinweis: 'SYNTHETISCHE Testdaten im Format der echten Schnittstellen (Wikipedia generator=geosearch, Wikidata wbgetentities, Nominatim reverse). IDs (Q9000xx) und Zahlen sind erfunden, nur für Logik-Tests in Node/Playwright. Echte Daten prüft diag.html am Handy.',
  center: { lat: 53.4792, lon: -2.2442 },
  wikipedia: { en: [en1, en2], de: [de], fr: [fr] },
  wikidata: { entities },
  nominatimSearch: {
    default: [
      { place_id: 2, name: 'Manchester', addresstype: 'city', category: 'place', type: 'city', display_name: 'Manchester, Greater Manchester, England, Vereinigtes Königreich', lat: '53.4794892', lon: '-2.2451148' },
      { place_id: 4, name: 'Manchester', addresstype: 'city', category: 'boundary', type: 'administrative', display_name: 'Manchester, Lancashire, Greater Manchester, England, Vereinigtes Königreich', lat: '53.4723', lon: '-2.2935' },
      { place_id: 3, name: 'Manchester', addresstype: 'city', category: 'place', type: 'city', display_name: 'Manchester, Hillsborough County, New Hampshire, 03101, Vereinigte Staaten', lat: '42.9956', lon: '-71.4548' }
    ],
    imperial: [
      { place_id: 5, name: 'Imperial War Museum North', addresstype: 'tourism', category: 'tourism', type: 'museum', display_name: 'Imperial War Museum North, Trafford Wharf Road, Trafford, Greater Manchester, England, Vereinigtes Königreich', lat: '53.4794', lon: '-2.2448' },
      { place_id: 6, name: 'Imperial War Museum', addresstype: 'tourism', category: 'tourism', type: 'museum', display_name: 'Imperial War Museum, Lambeth Road, London, England, Vereinigtes Königreich', lat: '51.4958', lon: '-0.1086' }
    ]
  },
  nominatim: { place_id: 1, name: 'Manchester', address: { city: 'Manchester', county: 'Greater Manchester', 'ISO3166-2-lvl4': 'GB-ENG', country: 'Vereinigtes Königreich', country_code: 'gb' } }
};
fs.writeFileSync(process.argv[2], JSON.stringify(fixture) + '\n');
console.log('ok', Object.keys(entities).length, 'entities');
