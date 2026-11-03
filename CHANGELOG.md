# Changelog

## v0.2.0 – 03.11.2026 – Karte, Wikipedia-Orte, Sterne, Aktionen, Merkliste, PWA

- **App** (`docs/index.html`, `app.js`, `style.css`): Leaflet-Karte mit OpenStreetMap-Kacheln, „Mein Standort“ und „Hier suchen“ (sucht um die Kartenmitte). Radius 300 m / 1 km / 3 km / 10 km.
- **Orte** aus Wikipedia (de + en, GeoSearch), über die Wikidata-ID zusammengeführt, im einheitlichen Format aus Abschnitt 5b (`quellen: ["W"]`).
- **Sterne** nach Abschnitt 6: Sprachversionen, Seitenaufrufe, Artikellänge, Denkmal/UNESCO, Typ-Gewicht. Marker nach Sternen (★★★ groß/rot mit Namen, ★★ orange, ★ grau erst ab Zoom 16). Liste nach Sternen sortiert. „Warum ★★★?“ zeigt die Punkte je Ort.
- **Filter:** Mindeststerne (inkl. „Alle Orte“), Radius, Kategorie.
- **Aktionen pro Ort:** Name kopieren („Name, Ort“), In Google Maps (Name), Pin (Koordinaten), Teilen, Wikipedia, Bei Tripadvisor suchen, Merken.
- **Merkliste** mit „Liste kopieren“, „Liste teilen“, Entfernen. Zeilenformat `Name – ★★★ – Ort – Maps-Link`.
- **Einstellungen:** Karten-App (Google-Maps-Link oder `geo:`), Zwischenspeicher leeren, Quellen/Lizenzen.
- **PWA:** `manifest.webmanifest`, Icons, Service Worker `sw.js` (App-Dateien network-first, Kacheln cache-first, Cache-Name mit Version), Update-Banner „Neue Version – Neu laden“ über `version.json`.
- **Bedienung am Handy:** Trennleiste zwischen Karte und Liste ist verschiebbar (Doppeltipp = Standard 55 %). Android-Zurück schließt das Ortsfenster. Hell/dunkel automatisch.
- **Stellschrauben** in `docs/config.json` (Gewichte, Schwellen, Typen mit Wikidata-Klassen und Stichwörtern, Kategorien, Goldliste).
- **Diagnose v0.2** in `diag.html`: Schnittstellen-Check, Goldliste Manchester mit Punkten je Ort, Abhakliste für die App, Zusammenfassung zum Kopieren. Der v0.1-Link-Test ist eingeklappt weiter verfügbar.
- **Tests:** `node tools/test.mjs` (Logik mit synthetischen Testdaten, Versionsnummern, Dateiverweise), `tools/ui-test.mjs` (Playwright, Oberfläche mit nachgebildeten Schnittstellen).

### Annahmen/Abweichungen

- **Nicht live geprüft:** Diese Cloud-Session erreicht Wikipedia, Wikidata und Nominatim nicht. Logik und Oberfläche sind nur mit **synthetischen** Testdaten (`docs/testdata/manchester-synthetisch.json`, erfundene Werte) geprüft. Ob die Goldliste mit echten Daten besteht, zeigt erst `diag.html` am Handy.
- **Seitenaufrufe** über `prop=pageviews` der Wikipedia-API (60 Tage, in derselben Abfrage wie die Orte) statt der Pageviews-REST-API (eine Anfrage pro Artikel). Der Wert wird auf 90 Tage hochgerechnet.
- **Schwellen angehoben:** Mit Seitenaufrufen liegen die Punkte deutlich höher als in PROJEKT.md angenommen. Startwerte deshalb ★★★ ≥ 14, ★★ ≥ 11, ★ ≥ 8. Die Werte aus PROJEKT.md (8/6/4) gelten, wenn keine Aufrufe verfügbar sind (`schwellen_ohne_aufrufe`).
- **Typ-Erkennung:** erst Wikidata-Klasse (P31), sonst das Hauptwort der Wikidata-Beschreibung, sonst des Titels. Die Wikidata-Klassen-IDs in `config.json` sind aus dem Gedächtnis und nicht geprüft; falsche IDs wirken nur nicht, die Stichwörter fangen das meist auf.
- **Zusätzliche Typen** (Haltestelle, Stadt/Ort, Liste, Ereignis, Gastronomie u. a.), damit z. B. Straßenbahnhaltestellen oder der Artikel „Manchester“ selbst keine Sterne bekommen. `max_sterne: 0` für Stadt/Ort, Liste, Person.
- **Ortsname** für „Name, Ort“ kommt per Nominatim (Rückwärtssuche, eine Anfrage pro Suche, zwischengespeichert). Fehlt er, wird nur der Name verwendet.
- **Anzeigename:** deutscher Artikeltitel, sonst englischer. Ohne Klammerzusatz.
- **Detailansicht** ist in v0.2 ein einfaches Ortsfenster mit Aktionen. Bild, Kurzinfo und „Erzähl mir davon“ kommen mit v0.3.
- **Nicht in v0.2:** Filter Quelle, Geheimtipps, „schon gehört“ und Tag (folgen mit den passenden Etappen). Modus-Schalter Stadt | Unterwegs folgt mit v0.8. Manuelles Hoch-/Herabstufen ist noch offen.
- Leaflet 1.9.4 liegt im Repo (`docs/lib/leaflet/`), keine externe Einbindung.
- Kartenkacheln werden nur zwischengespeichert, wenn der Kachelserver CORS erlaubt (sonst normal geladen). `diag.html` prüft das.

## v0.1.1 – 03.11.2026 – Ergebnisse Link-Test

Getestet vom Nutzer auf Android 10, Chrome 156, Claude-App installiert.

- 1 `claude://claude.ai/new?q=`: funktioniert, öffnet die Claude-App mit eingefügtem Prompt. Bei 1.000 und 12.000 Zeichen (ca. 16.600 Zeichen im Link) kam der Prompt vollständig an (Ende-Marke vorhanden).
- 2 `https://claude.ai/new?q=`: funktioniert, öffnet ebenfalls die App mit Prompt (1.000 Zeichen).
- 3 / 4 Kopieren + Chat/Projekt per ID: nicht getestet. Links öffnen immer die App, daher keine ID greifbar. Wird nicht gebraucht.
- Z Kopieren + `claude://claude.ai/new`: funktioniert, Kopieren per Clipboard-API.
- 6a Google Maps `https://www.google.com/maps/search/?api=1&query=…`: funktioniert.
- 6b `geo:`-Link: funktioniert.

### Entscheidungen für v0.2 ff.

- Übergabe an Claude (Abschnitt 9): Methode 1 `claude://claude.ai/new?q=` als Standard, Notlösung „Prompt kopieren + Claude-App öffnen“.
- Karten-App (Abschnitt 7): Google-Maps-Web-Link als Standard, `geo:` als Einstellung.
- Chat-/Projekt-ID wird nicht benötigt.
- Versionsnummer in `docs/diag.html`, `docs/index.html` und `docs/version.json` auf 0.1.1 erhöht (keine Funktionsänderung).

## v0.1.0 – 03.11.2026 – Link-Test (Diagnose)

- Neu: `docs/diag.html` (mobil optimiert) mit den Link-Tests aus PROJEKT.md, Etappe v0.1:
  - 1: `claude://claude.ai/new?q=<Prompt>`
  - 2: `https://claude.ai/new?q=<Prompt>`
  - 3: Prompt kopieren + `claude://claude.ai/chat/<ID>` (Chat-ID im Feld, gespeichert in `localStorage`)
  - 4: Prompt kopieren + `claude://claude.ai/project/<ID>` (Projekt-ID im Feld, gespeichert in `localStorage`)
  - 5: Regler für die Prompt-Länge (500–12.000 Zeichen) mit Anzeige der Länge und der URL-kodierten Länge
  - 6: Google Maps per `https://www.google.com/maps/search/?api=1&query=…` und per `geo:`-Link
  - 7: Ergebnisfelder je Test, Notizfeld, Zusammenfassung zum Kopieren/Teilen
- Neu: `docs/index.html` (Platzhalter mit Link zur Diagnose und Versionsfooter), `docs/version.json`, `docs/.nojekyll`.

### Annahmen/Abweichungen

- Zusätzlicher Test „Z“ (Prompt kopieren + `claude://claude.ai/new` ohne Text öffnen), weil Abschnitt 9, Methode 3 sonst ungetestet bliebe.
- Zusätzliche Ergebnis-Option „App öffnet, Text fehlt/gekürzt“ für die Claude-Tests, um Kürzungen bei langen Prompts zu erkennen.
- Der Testprompt endet mit einer Ende-Marke (`ENDE-MARKE-<Länge>`) und nummerierten Sätzen; Claude soll die letzte Marke nennen. So sieht man, ob der Prompt vollständig ankam.
- In Test 3/4 darf statt der ID auch der ganze Link (`https://claude.ai/chat/<ID>`) eingefügt werden; die ID wird herausgelesen.
- Im `geo:`-Link ist das Leerzeichen im Namen als `%20` kodiert (gleichwertig zum Wortlaut in PROJEKT.md).
- Ob die Links auf Android funktionieren, ist **nicht geprüft** – genau das klärt dieser Test. Geprüft wurde nur in einem Headless-Browser, dass die Seite fehlerfrei lädt und die Links korrekt gebaut werden.
