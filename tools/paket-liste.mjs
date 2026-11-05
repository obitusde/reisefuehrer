// v0.14.0: docs/paket/laender.json – the list of the countries that are built (what the app shows as "gebaut"),
// derived from docs/paket/<code>/index.json. Written by the workflow paket.yml after every build.
//   node tools/paket-liste.mjs [docs/paket]
import fs from 'node:fs';
import path from 'node:path';
const dir = process.argv[2] || 'docs/paket';
const out = {};
for (const d of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
  const p = path.join(dir, d, 'index.json');
  if (!fs.existsSync(p)) continue;
  let i;
  try { i = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { continue; }
  if (!i.land) continue;
  out[i.land] = { name: i.name, stand: i.stand, osm_stand: i.osm_stand || '', format: i.format || 1, bytes: i.bytes || 0, gzip: i.gzip || 0,
    teile: (i.teile || []).length || 1, ziele: (i.verzeichnis || {}).ziele || 0, orte: (i.verzeichnis || {}).orte || 0, osm_orte: (i.osm || {}).orte || 0,
    info: i.info || 0, bbox: i.bbox || null };
}
const sorted = Object.fromEntries(Object.entries(out).sort((a, b) => a[0].localeCompare(b[0])));
// no date inside: the file only changes when a package changes (no empty commits)
fs.writeFileSync(path.join(dir, 'laender.json'), JSON.stringify({ format: 1, laender: sorted }));
console.log('laender.json: ' + Object.keys(sorted).join(', ') + ' (' + Object.keys(sorted).length + ')');
