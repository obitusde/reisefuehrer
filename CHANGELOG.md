# Changelog

## v0.2.3 – 03.11.2026 – Beschriftungen, „Was ist das?“, bessere Suche

- **Kurze Beschriftung an allen Punkten** (Wunsch Nutzer): höchstens 18 Zeichen, ohne Stadtnamen („Manchester Central Library“ → „Central Library“, „Hôtel de ville de Morges“ → „Hôtel de ville“). Überlappende Beschriftungen weniger wichtiger Orte werden ausgeblendet; beim Hineinzoomen erscheinen mehr.
- **Museen immer orange** (mindestens ★★, Wunsch Nutzer).
- **„Was ist das?“ in der Liste:** erster Satz des Wikipedia-Artikels, auf Deutsch. Gibt es keinen deutschen Artikel, wird der englische (sonst der landessprachliche) Satz **maschinell übersetzt**. Geladen wird nur für sichtbare Zeilen; Texte werden gespeichert. Bis dahin steht die Wikidata-Beschreibung ohne Ortsangabe da („Museum“ statt „Museum in Manchester“).
- **Übersetzung:** zuerst der Übersetzer im Browser (Chrome Translator, auf dem Gerät), sonst der kostenlose Dienst MyMemory (ohne Schlüssel, mit Tageslimit). Ist beides nicht verfügbar, steht der Originalsatz mit Hinweis da und wird nach einem Tag erneut versucht.
- **Suche nach Sehenswürdigkeiten:** Die Lupe findet auch z. B. „Imperial War Museum“: zuerst unter den geladenen Orten („In der Liste“), dann bei Nominatim. Tippen auf eine Sehenswürdigkeit springt hin und öffnet ihr Fenster.
- **Bessere Trefferliste:** Treffer nahe dem Kartenausschnitt zuerst, doppelte (gleicher Name, < 25 km) zusammengefasst, Art des Treffers angezeigt („Stadt“, „Museum“ …), Postleitzahlen ausgeblendet.

### Annahmen/Abweichungen

- MyMemory ist ein externer Dienst (Translated srl). Es wird nur der erste Satz des Wikipedia-Artikels gesendet, kein Standort. Anonymes Tageslimit laut Anbieter ca. 5000 Zeichen (≈ 30–40 Sätze); danach gilt der Originaltext bis zum nächsten Tag. Ob der Chrome-Übersetzer auf dem Handy verfügbar ist, prüft `diag.html`.
- Der erste Satz enthält manchmal doch den Ort („… in Manchester …“); er wird nicht gekürzt, damit der Sinn erhalten bleibt (nur Klammern und Fußnoten fallen weg).

## v0.2.2 – 03.11.2026 – Ortssuche, lokale Namen, Museen und Aussichtspunkte immer

- **Ort suchen** (🔍 oben rechts): Ortsname eingeben, aus bis zu 5 Treffern wählen. Die Karte springt hin und sucht sofort Sehenswertes im eingestellten Umkreis. Die letzten 5 Suchen werden gemerkt. Suche über Nominatim, nur auf „Suchen“ (keine Vorschläge beim Tippen, so verlangen es die Nutzungsregeln).
- **Namen** (Entscheidung Nutzer): In Liste und Ortsfenster steht zuerst der **lokale Name**, darunter der **deutsche**, wenn er anders lautet. Ist der lokale Name nicht in lateinischer Schrift (z. B. Griechisch, Japanisch), steht zuerst der **englische** Name. Ist die Landessprache unbekannt, der deutsche. „Name kopieren“, Google Maps und Teilen benutzen die erste Zeile. Lokale Namen kommen aus der Wikipedia der Landessprache oder aus Wikidata.
- **Museen immer mit mindestens ★** (`min_sterne` je Typ in `config.json`).
- **Aussichtspunkte:** neuer Typ „Aussichtspunkt“ (auch Aussichtsturm, Belvédère), immer mindestens ★. In Wikipedia selten, mehr kommen mit OpenStreetMap (v0.4).
- **Parks** unverändert: Sterne nur, wenn die Punkte es hergeben (Entscheidung Nutzer).
- Wikidata-Beschreibungen jetzt auch in der Landessprache (z. B. „musée à Morges“), dadurch bessere Typ-Erkennung.
- Landessprachen ergänzt (u. a. Deutschland/Österreich, Russland, Japan, China, Korea).

### Annahmen/Abweichungen

- Die Ortssuche ist in PROJEKT.md nicht vorgesehen; auf Wunsch des Nutzers ergänzt.
- „Lesbar“ = lateinische Schrift (inkl. Umlaute/Akzente, z. B. Polnisch, Tschechisch). Griechisch, Kyrillisch, Arabisch, Hebräisch und ostasiatische Schriften gelten als nicht lesbar.
- Wikidata-Zwischenspeicher aus v0.2.1 wird beim ersten Suchen einmal neu geladen (jetzt mit Namen).

## v0.2.1 – 03.11.2026 – Sterne nach erstem Handy-Test korrigiert

Anlass: Goldliste am Handy (v0.2.0) nicht bestanden (Science and Industry Museum ★★), Reihenfolge wirr, Wikipedia de „too busy“, Museen in Morges fehlten.

- **Seitenaufrufe entfernt** (Entscheidung Nutzer): Wikipedia lieferte sie nur für wenige Artikel pro Antwort (7 von 110), dadurch wurden Orte mit unterschiedlichen Schwellen bewertet. Score jetzt nur aus Sprachversionen, Artikellänge, Denkmal/UNESCO und Typ. Schwellen wieder wie in PROJEKT.md: ★★★ ≥ 8, ★★ ≥ 6, ★ ≥ 4. Suche schneller (keine Fortsetzungsabfragen mehr).
- **Typ-Erkennung über Wikidata-Klassennamen:** Die App lädt die Namen der Wikidata-Klassen (z. B. „research library“, „railway station“) und sucht darin die Stichwörter aus `config.json` (1–2 Abfragen mehr, zwischengespeichert). Allgemeine Typen wie „Gebäude“ gelten nur, wenn kein genauerer Hinweis da ist (Titel „… Library“ schlägt Beschreibung „building“).
- **Landessprache:** Zusätzlich zu de/en wird die Wikipedia der Landessprache abgefragt (Tabelle `landessprachen` in `config.json`, Land/Region von Nominatim; Schweiz nach Kanton, z. B. Waadt → fr). Damit erscheinen Orte, die nur einen französischen Artikel haben.
- **Wiederholen bei Überlastung:** „Search is currently too busy“, HTTP 429 und 5xx werden zweimal mit Pause wiederholt.
- **Ereignisse** (Anschläge, Massaker u. ä.) bekommen keine Sterne (Entscheidung Nutzer: nur wenn vor Ort etwas zu sehen ist; das hat dann meist einen eigenen Artikel, z. B. ein Denkmal). Unter „Alle Orte“ weiter sichtbar.
- **Bahnhöfe** Gewicht −1,5 (vorher +1, Entscheidung Nutzer): nur mit Denkmalstatus und vielen Sprachversionen kommen sie nach oben.
- Museum-Gewicht +3 (vorher +2,5). Neue Stichwörter (u. a. französisch/italienisch/spanisch, Diözese → Organisation).
- „Warum ★★★?“ zeigt jetzt auch die Wikidata-Klasse.
- **Diagnose:** zwei Goldlisten (Manchester; Morges mit Musée Alexis Forel und Maison du Dessin de Presse ≥ ★), Prüfung der französischen Wikipedia und der Sprachwahl, Orte ohne erkannten Typ werden zur Nachkalibrierung aufgelistet.
- Oberflächentest zusätzlich mit 329 × 626 px (Anzeigegröße auf dem Handy des Nutzers).

### Annahmen/Abweichungen

- Abweichung von PROJEKT.md 6: Term `aufrufe90` entfällt (dort als „wenn verfügbar“ beschrieben).
- Gespeicherte Ergebnisse aus v0.2.0 werden beim Start verworfen (anders berechnete Sterne); einfach neu suchen. Merkliste und Einstellungen bleiben.
- Weiterhin nur mit synthetischen Testdaten geprüft; die echte Goldliste läuft am Handy.

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
