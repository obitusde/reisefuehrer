// Einmaliger Live-Test (nur Messung): die echte Funktion core.loadGegend der App gegen Wikipedia und Wikidata (Läuft nur auf GitHub, Workflow gegend-live-test.yml).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = createRequire(import.meta.url)(path.join(ROOT, 'docs/core.js'));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/config.json'), 'utf8'));
const UA = 'ReisefuehrerBot/gegend-live (https://github.com/obitusde/reisefuehrer; einmaliger Test)';
const f = (url, o = {}) => fetch(url, { ...o, headers: { ...(o.headers || {}), 'User-Agent': UA } });
const ORT = process.env.ORT || 'Werdohl', L = process.env.SPRACHE || 'de', Q = process.env.QID || '';
const t0 = Date.now();
if (Q) { const t = await core.wikiTitleFor(Q, [L, 'de', 'en'], f); console.log('Artikel zu ' + Q + ': ' + JSON.stringify(t)); }
const r = await core.loadGegend(ORT, L, f, cfg, (s) => console.log('  … ' + s));
console.log('Dauer ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s; Artikel ' + r.title + ' (' + r.lang + '), ' + r.extractLen + ' Zeichen');
console.log('Abschnitte: ' + r.sections.map((s) => s.name + ' (' + s.size + ')').join(' | '));
r.groups.forEach((g) => console.log(g.label + ': ' + g.items.map((i) => i.title + ' [' + String(i.lab).split(' / ')[0] + '; ' + i.views + '/Tag; ' + Math.round(i.len / 1000) + ' kB]').join(' | ')));
console.log('Weiteres: ' + r.more.map((i) => i.title + ' [' + String(i.lab).split(' / ')[0] + ']').join(' | '));
console.log('Erwähnt in: ' + r.mentioned.map((i) => i.title + ' (' + i.wordcount + ')').join(' | '));
console.log('Persönlichkeiten: ' + r.people.map((i) => i.title + ' [' + i.views + '/Tag]').join(' | '));
const s = await core.searchTopics(ORT + ' ' + (process.env.THEMA || 'Geschichte'), L, f, cfg);
console.log('Suche: ' + s.map((h) => h.title + (h.section ? ' § ' + h.section : '') + ' (' + h.wordcount + ' W.)').join(' | '));
