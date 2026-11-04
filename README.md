# reisefuehrer

Reiseführer-App: statische PWA auf GitHub Pages. Zeigt Sehenswertes auf der Karte, mit Sternen.
Plan und Etappen: `PROJEKT.md`, Änderungen: `CHANGELOG.md`.

- App: https://obitusde.github.io/reisefuehrer/
- Diagnose und Abnahmetests: https://obitusde.github.io/reisefuehrer/diag.html
- Stellschrauben (Gewichte, Schwellen, Typen): `docs/config.json`, direkt auf github.com bearbeitbar

## Dateien

- `docs/index.html`, `app.js`, `style.css` – App
- `docs/core.js` – Logik (Wikipedia/Wikidata/OpenStreetMap laden und zusammenführen, Kartenausschnitt und Teilbereiche, Typ, Score, Sterne, Prompts, Links), auch von `diag.html` und Tests genutzt
- Vorbereitete Gebiete (v0.6) liegen nur im Browser des Geräts (IndexedDB), nicht im Repo
- Verzeichnis (v0.8): lädt das Handy selbst je Kartenstück (0,25°) von Wikidata und Wikipedia und speichert es in IndexedDB (`vz:<Kachel>`); Rechnung in `docs/core.js` (`prepareDirectoryTile`, `computeDirectory`), Einstellungen in `config.json` → `verzeichnis`. Testlauf auf GitHub: Action „Stadt-Sterne berechnen“ mit Eingabe `verzeichnis`.
- `docs/staedte/<LAND>.json` – vorab berechnete Stadt-Sterne (v0.7), erzeugt von `tools/build-cities.mjs` über die GitHub Action „Stadt-Sterne berechnen“ (`.github/workflows/staedte.yml`, manuell starten). In der App unter ⚙ auch im Handy neu berechenbar (liegt dann in IndexedDB)
- `docs/sw.js`, `manifest.webmanifest`, `icons/` – PWA
- `docs/lib/leaflet/` – Leaflet 1.9.4 (BSD-2)
- `docs/testdata/` – synthetische Testdaten
- `tools/test.mjs` – Logik-Tests: `node tools/test.mjs`
- `tools/ui-test.mjs` – Oberflächentest mit Playwright: `node tools/ui-test.mjs`
- `tools/make-fixture.mjs` – erzeugt die synthetischen Testdaten
