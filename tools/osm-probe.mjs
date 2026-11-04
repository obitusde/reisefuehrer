// v0.9.3 test: how is a place entered in OpenStreetMap, and does the app's OSM filter find it?
// node tools/osm-probe.mjs "süd,west,nord,ost"   (env NAMEN = name pattern, e.g. "Wildpark|Weltkrieg")
// Runs on GitHub (the cloud session cannot reach Overpass).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/config.json'), 'utf8'));
const [s, w, n, e] = (process.argv[2] || '').split(',').map(Number);
const pat = process.env.NAMEN || '.';
if (![s, w, n, e].every(Number.isFinite)) { console.log('Bereich fehlt: "süd,west,nord,ost"'); process.exit(1); }
const bbox = [s, w, n, e].join(',');

async function overpass(q) {
  for (const url of cfg.osm.server) {
    try {
      const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'User-Agent': 'Reisefuehrer-Test (GitHub Actions)' } });
      if (r.ok) return { url, els: (await r.json()).elements || [] };
      console.log('  ' + url + ': HTTP ' + r.status);
    } catch (err) { console.log('  ' + url + ': ' + err.message); }
  }
  throw new Error('kein Overpass-Server erreichbar');
}

const all = await overpass('[out:json][timeout:60];nwr["name"~"' + pat.replace(/"/g, '') + '",i](' + bbox + ');out tags center;');
console.log('Alle Objekte mit Namen /' + pat + '/ in ' + bbox + ' (' + all.url + '): ' + all.els.length);
const app = await overpass('[out:json][timeout:60];(' + cfg.osm.filter.map((f) => 'nwr["name"]' + f + '(' + bbox + ');').join('') + ');out ids;');
const inApp = new Set(app.els.map((x) => x.type + '/' + x.id));
console.log('Der App-Filter (config.json osm.filter) findet im Bereich ' + app.els.length + ' Objekte.\n');
const KEYS = ['tourism', 'leisure', 'zoo', 'historic', 'amenity', 'natural', 'boundary', 'landuse', 'wikidata', 'wikipedia'];
for (const x of all.els) {
  const t = x.tags || {};
  const tags = KEYS.filter((k) => t[k]).map((k) => k + '=' + t[k]).join(', ');
  console.log((inApp.has(x.type + '/' + x.id) ? '  ✓ App findet es: ' : '  ✗ App findet es nicht: ') + t.name + ' (' + x.type + ' ' + x.id + ') – ' + (tags || 'keine passenden Tags'));
}
