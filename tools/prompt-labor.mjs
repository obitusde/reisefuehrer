// Prompt-Labor (nur Messung, ändert die App nicht): baut den fertigen Audioguide-Prompt für ein Thema der „Gegend“ so, wie die App ihn bauen würde,
// aber mit einer Vorlage aus tools/prompt-labor/<VARIANTE>.json. Der echte Wikipedia-Artikel des Themas ist der Quelltext; dazu kommt, was der Artikel
// des Ortes über das Thema sagt (Sätze, in denen der Ortsartikel auf das Thema verlinkt). Der Prompt steht im Protokoll zwischen den Marken.
// Läuft nur auf GitHub (Workflow prompt-labor.yml). Env: ORT, THEMA (Artikeltitel), SPRACHE, VARIANTE, STUFE (kurz|normal|ausfuehrlich), ABSCHNITT, TYP.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = createRequire(import.meta.url)(path.join(ROOT, 'docs/core.js'));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/config.json'), 'utf8'));
const UA = 'ReisefuehrerBot/prompt-labor (https://github.com/obitusde/reisefuehrer; einmaliger Test)';
const f = (url, o = {}) => fetch(url, { ...o, headers: { ...(o.headers || {}), 'User-Agent': UA } });
const E = process.env, ORT = E.ORT || 'Neuenrade', THEMA = E.THEMA || 'Bahnstrecke Menden–Neuenrade', L = E.SPRACHE || 'de', STUFE = E.STUFE || 'normal', ABS = E.ABSCHNITT || '', TYP = E.TYP || 'Thema';
const VAR = (E.VARIANTE || 'gegend-v2').replace(/[^a-z0-9_-]/gi, '');
let tpl = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/prompt-labor', VAR + '.json'), 'utf8'));
if (!Array.isArray(tpl)) tpl = tpl.vorlage;

// Wikitext des Ortsartikels: Sätze, die auf das Thema verlinken ([[Titel|Anzeige]] oder [[Titel]]), auch unter den Namen, unter denen es Weiterleitungen gibt (z. B. „Hönnetalbahn“)
async function ortbezug() {
  const api = (o) => f('https://' + L + '.wikipedia.org/w/api.php?' + new URLSearchParams({ format: 'json', formatversion: '2', ...o })).then((r) => r.json());
  const rd = await api({ action: 'query', prop: 'redirects', rdlimit: '50', rdnamespace: '0', titles: THEMA });
  const names = [THEMA, ...((((rd.query || {}).pages || [])[0] || {}).redirects || []).map((x) => x.title)];
  console.log('Namen des Themas: ' + names.join(' | '));
  const d = await api({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', redirects: '1', titles: ORT });
  const wt = (((d.query.pages[0] || {}).revisions || [])[0] || {}).slots.main.content || '';
  const rx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[ _]/g, '[ _]');
  const re = new RegExp('\\[\\[\\s*(' + names.map(rx).join('|') + ')\\s*(#[^\\]|]*)?(\\|[^\\]]*)?\\]\\]', 'i');
  const clean = (s) => s.replace(/<ref[\s\S]*?(<\/ref>|\/>)/gi, '').replace(/\{\{[^{}]*\}\}/g, '').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/'{2,}/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const out = [];
  let section = '';
  for (const line of wt.split('\n')) {
    const h = /^=+\s*(.*?)\s*=+\s*$/.exec(line);
    if (h) { section = clean(h[1]); continue; }
    const m = re.exec(line);
    if (!m) continue;
    const label = m[3] ? clean('[[x' + m[3] + ']]') : m[1];
    const sents = clean(line).split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ„"])/);
    const i = sents.findIndex((s) => s.includes(label) || names.some((n) => s.includes(n)));
    const pick = (i >= 0 ? sents.slice(i, i + 2) : sents.slice(0, 2)).join(' ');
    if (pick && out.length < 3) out.push((section ? '[' + section + '] ' : '') + pick.slice(0, 500));
  }
  if (!out.length) console.log('Zeilen mit dem ersten Namen im Wikitext: ' + wt.split('\n').filter((l) => l.includes(names[names.length - 1]) || l.includes(THEMA.split(' ')[0])).slice(0, 4).map((l) => l.slice(0, 220)).join(' || '));
  return out.join(' / ');
}
const bezug = await ortbezug();
console.log('Bezug im Ortsartikel: ' + (bezug || '(keine Stelle gefunden)'));
const art = await core.loadArticle({ wikipedia: L + ':' + THEMA, abschnitt: ABS }, STUFE === 'kurz' ? 'kurz' : 'full', f);
const lines = tpl.filter((l) => bezug || !/\{ortbezug\}/.test(l)).map((l) => l.replace(/\{ortbezug\}/g, bezug));
const c2 = JSON.parse(JSON.stringify(cfg)); c2.gegend.vorlage = lines;
const pr = core.buildPrompt({ id: 'x', name: art.title, abschnitt: ABS, ort: ORT, typ_label: TYP, thema: true, lat: null, lon: null }, { level: STUFE, article: art, schwerpunkt: '' }, c2);
console.log('Quelltext: ' + art.title + ' (' + art.lang + '), ' + art.text.length + ' Zeichen; Prompt ' + pr.length + ' Zeichen' + (pr.truncated ? ', Quelltext gekürzt' : ''));
console.log('=====PROMPT=====');
console.log(pr.text);
console.log('=====ENDE=====');
