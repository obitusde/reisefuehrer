# reisefuehrer

Reiseführer-App: statische PWA auf GitHub Pages. Zeigt Sehenswertes auf der Karte, mit Sternen.
Plan und Etappen: `PROJEKT.md`, Änderungen: `CHANGELOG.md`.

- App: https://obitusde.github.io/reisefuehrer/
- Diagnose und Abnahmetests: https://obitusde.github.io/reisefuehrer/diag.html
- Stellschrauben (Gewichte, Schwellen, Typen): `docs/config.json`, direkt auf github.com bearbeitbar

## Dateien

- `docs/index.html`, `app.js`, `style.css` – App
- `docs/core.js` – Logik (Wikipedia/Wikidata/OpenStreetMap laden und zusammenführen, Typ, Score, Sterne, Prompts, Links), auch von `diag.html` und Tests genutzt
- `docs/sw.js`, `manifest.webmanifest`, `icons/` – PWA
- `docs/lib/leaflet/` – Leaflet 1.9.4 (BSD-2)
- `docs/testdata/` – synthetische Testdaten
- `tools/test.mjs` – Logik-Tests: `node tools/test.mjs`
- `tools/ui-test.mjs` – Oberflächentest mit Playwright: `node tools/ui-test.mjs`
- `tools/make-fixture.mjs` – erzeugt die synthetischen Testdaten
