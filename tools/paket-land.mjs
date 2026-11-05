// v0.14.0: resolves the country chosen in the workflow (e.g. "Schweiz (CH)", "CH" or "ch") from config.json (paket.laender)
// and prints GitHub environment lines: CODE, ISO, NAME, GEOFABRIK. node tools/paket-land.mjs "Schweiz (CH)" >> "$GITHUB_ENV"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/config.json'), 'utf8'));
const list = (cfg.paket && cfg.paket.laender) || [];
const arg = String(process.argv[2] || '').trim();
const m = /\(([A-Za-z]{2})\)\s*$/.exec(arg), code = (m ? m[1] : arg).toUpperCase();
const d = list.find((x) => x.land === code) || list.find((x) => x.name.toLowerCase() === arg.toLowerCase());
if (!d) { console.error('Land nicht in config.json (paket.laender): ' + arg); process.exit(1); }
if (!/^europe\/[a-z-]+$/.test(d.geofabrik)) { console.error('Ungültiger Geofabrik-Pfad: ' + d.geofabrik); process.exit(1); }
console.log('CODE=' + d.land.toLowerCase());
console.log('ISO=' + (d.iso || d.land));
console.log('NAME=' + d.name);
console.log('GEOFABRIK=' + d.geofabrik);
