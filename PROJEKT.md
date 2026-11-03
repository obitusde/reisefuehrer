# Reiseführer-App – Projektdokument für Claude Code

Dokumentversion: 1.2 (02.11.2026)
Repo-Vorschlag: `obitusde/reisefuehrer`

Dieses Dokument enthält alles, was du (Claude Code) brauchst, um die App in Etappen zu bauen. Lies es vollständig, bevor du etwas tust. Baue immer nur die Etappe, die der Nutzer im Prompt nennt.

---

## 0. Arbeitsregeln (verbindlich)

1. **Der Nutzer arbeitet nur am Handy** (Claude-App, Code-Tab, Cloud-Sessions; GitHub im Handy-Browser). Es gibt keinen PC. Er kann keine Diffs lesen und nicht am PC eingreifen. Du musst selbst prüfen, dass dein Ergebnis läuft. Alles, was einen PC bräuchte, ist tabu oder wird ausdrücklich als „einmalig am PC“ markiert und vermieden.
2. **Jede Änderung = komplette Datei**, keine Patches zum Selbstanwenden. Änderungen dürfen direkt nach `main` (Hobbyprojekt, wichtig ist nur Versionierung zum Zurückgehen).
3. **Versionsnummer überall:** Im UI-Footer der App (`v0.x.y`), in `docs/version.json`, in `CHANGELOG.md` (neuester Eintrag oben, mit Datum und Stichpunkten). Erhöhe sie bei jeder Änderung.
4. **Diagnose zuerst:** Erst eine kleine Testfunktion in `docs/diag.html`, dann Produktivcode. Jede Etappe hat Abnahmetests (Abschnitt 4), die der Nutzer am Handy anstoßen kann.
5. **Nichts erfinden.** Wenn eine Schnittstelle sich anders verhält als hier beschrieben, trage das in `CHANGELOG.md` unter „Annahmen/Abweichungen“ ein und nimm die einfachste funktionierende Lösung. Frage den Nutzer am Ende der Session nach Entscheidungen, nicht mittendrin.
6. **Sprache:** UI und Texte auf Deutsch. Code und Kommentare dürfen Englisch sein.
7. **Keine Secrets im Repo und keine Schlüssel im Browsercode.**
8. **Einfach halten:** Statische Dateien (HTML, CSS, JS), keine Frameworks außer Leaflet, kein Build-Schritt für die App. Neue Abhängigkeiten nur, wenn unvermeidlich.
9. **Keine Routenplanung.** Die App berechnet keine Routen und wählt keine Zwischenstopps aus. Sie zeigt Orte auf einer Karte (Stadt oder Korridor) und gibt einzelne Orte an Google Maps weiter. Der Nutzer plant Tag oder Route selbst anhand der Karte.
10. **Öffnungszeiten, Eintritt und Bewertungsportale sind nicht das Ziel.** Das Ziel ist: auf der Karte sehen, wo es was Sehenswertes gibt und wie sehenswert es ist.

---

## 1. Ziel und Nutzungsfälle

Der Nutzer versteht auf Reisen oft nicht, was er sieht (Beispiel: Manchester). Die App soll:

1. **Stadtmodus:** Für einen Tag oder ein Wochenende in einer Stadt auf einer **Karte** zeigen, was es gibt und **wie sehenswert** es ist (Sterne, Abschnitt 6), einschließlich **Geheimtipps**.
2. **Korridormodus:** Unterwegs von A nach B (Morges → Lyon mit dem Auto, Morges → Genf mit dem Fahrrad) die Sehenswürdigkeiten in einem **Streifen entlang der Strecke** zeigen, **bevor** der Nutzer seine Route festlegt.
3. **Planen auf der Karte:** Orte merken und einem Tag zuordnen (Tagesfarben), ohne Routenberechnung.
4. **Weitergabe:** Namen von Orten **kopieren** oder an **Google Maps** übergeben.
5. **Erzählen:** Auf Tippen einen **Prompt** bauen, der in der **Claude-App** des Nutzers einen gesprochenen deutschen Erklärtext erzeugt, den er sich vorlesen lässt. Schalter für die Ausführlichkeit.
6. **Foto-Modus:** Foto in Claude hochladen, die App liefert Standort und Kandidaten als Kontext.
7. **Zoom-Logik:** Beim Herauszoomen bekommen **Städte** Sterne, beim Hineinzoomen lösen sie sich in Orte auf.

Kosten: keine laufenden Schnittstellenkosten in v0.x. Texte und Listen erzeugt Claude im Abo des Nutzers.

---

## 2. Getroffene Entscheidungen

| Thema | Entscheidung |
|---|---|
| Architektur | Statische **PWA auf GitHub Pages**, kein eigener Server. Alles Ändern über Claude Code und GitHub im Handy |
| Datenbasis (Reihenfolge der Etappen) | **Wikipedia/Wikidata**, dann **OpenStreetMap (Overpass)**, dann **Wikivoyage**. Alle drei werden zu **einem** Ortsbestand zusammengeführt (Abschnitt 5b) |
| Zusatzquelle für Geheimtipps und Kuratierung | **Claude-Liste per Import** (kostenlos, im Abo, Abschnitt 5c). Ein LLM-Aufruf über GAS/OpenRouter ist **optional und spät** (Abschnitt 12), weil er einmalig einen PC braucht |
| Prüfung | Alles aus der Basis ist „geprüft“ (echte Koordinaten). Was nur vom LLM kommt, ist „ungeprüft“, bis die App Koordinaten gefunden hat |
| Wer holt den Wikipedia-Text? | **Die App selbst**, nicht Claude und nicht GAS |
| Quellsprache | Automatisch: deutscher **und** englischer Artikel, den **längeren** nehmen. Landessprache ergänzbar |
| Ausgabesprache | **Immer Deutsch** |
| Chats | **Ein neuer Chat pro Ort** ist erlaubt |
| Bewertung | Dreier-Sterne-Skala nach dem Prinzip eines Reiseführers, **eigene Berechnung**. Keine Michelin-Daten, kein Michelin-Name |
| Routenplanung | Nicht Teil der App (Regel 9) |
| Tripadvisor | Nur ein **Suchlink** pro Ort („Bei Tripadvisor suchen“). Keine API (Zwischenspeichern verboten, Anzeigepflichten, Schlüssel nötig) |
| Atlas Obscura, Reiseblogs | Nicht als Datenquelle (Nutzungsbedingungen, keine Schnittstelle). Höchstens ein Suchlink |
| Google Lens | Es gibt keine offizielle Lens-API. Foto-Erkennung macht Claude (Foto + Standort + Kandidatenliste) |

---

## 3. Repo-Struktur

```
reisefuehrer/
  PROJEKT.md              dieses Dokument
  CHANGELOG.md
  README.md
  docs/                   GitHub Pages (Quelle: Branch main, Ordner /docs)
    index.html            App
    diag.html             Testseite
    app.js, style.css
    config.json           ALLE Stellschrauben (Gewichte, Schwellen, Korridorbreiten, Prompt-Texte)
    version.json          {"version":"0.x.y"} für die Update-Prüfung
    manifest.webmanifest  PWA
    sw.js                 Service Worker (ab v0.2, Abschnitt 11)
    staedte.json          vorab berechnete Stadt-Sterne (ab Etappe „Stadt-Sterne“)
  tools/
    build-cities.mjs      erzeugt staedte.json (läuft in GitHub Actions)
  gas/                    nur falls Abschnitt 12 aktiviert wird
  .github/workflows/
    build-cities.yml      manuell startbar (workflow_dispatch)
    deploy-gas.yml        nur falls Abschnitt 12 aktiviert wird
```

Das Setup-Muster für Workflows und Secrets ist im Repo `obitusde/ladeplanung` vorhanden. Übernimm dessen Struktur, soweit anwendbar.

---

## 4. Etappen und Abnahmetests

Der Nutzer nennt die Etappe. Baue nur diese. Reihenfolge:

| Etappe | Inhalt |
|---|---|
| v0.1 | Link-Test (Diagnose) |
| v0.2 | Karte, Wikipedia-Orte, Sterne, Aktionen, Merkliste, PWA mit Update-Anzeige |
| v0.3 | „Erzähl mir davon“ |
| v0.4 | OpenStreetMap dazu + Duplikate zusammenführen |
| v0.5 | Wikivoyage dazu |
| v0.6 | Import (Claude-Liste, KML/GPX/CSV/Text) + Prüfung der Koordinaten |
| v0.7 | Tagesfarben, Reisepaket (Speichern/Teilen als Datei) |
| v0.8 | Korridormodus |
| v0.9 | Stadt-Sterne und Zoom-Logik |
| v0.10 | Foto-Modus, Offline-Karte |
| später, optional | LLM-Zusatz per GAS/OpenRouter (Abschnitt 12), APK-Hülle |

### v0.1 – Link-Test (Diagnose)

**Zweck:** Klären, was auf dem Handy des Nutzers (Android, Claude-App installiert) funktioniert, bevor etwas gebaut wird.

Baue `docs/diag.html` (mobiloptimiert) mit Knöpfen:

1. `claude://claude.ai/new?q=<Testprompt>` (URL-kodiert)
2. `https://claude.ai/new?q=<Testprompt>`
3. Prompt in die **Zwischenablage** kopieren und danach `claude://claude.ai/chat/<ID>` öffnen (Chat-ID in Feld, `localStorage`).
4. Prompt kopieren und `claude://claude.ai/project/<ID>` öffnen (Projekt-ID in Feld, `localStorage`).
5. Anzeige der Prompt-Länge. Der Testprompt ist per Regler zwischen 500 und 12.000 Zeichen einstellbar (Claude kürzt bei ca. 14.000 Zeichen).
6. Zwei Google-Maps-Tests: `https://www.google.com/maps/search/?api=1&query=Manchester%20Town%20Hall` und `geo:53.4792,-2.2442?q=53.4792,-2.2442(Manchester Town Hall)`.
7. Ergebnisfelder je Knopf („funktioniert / funktioniert nicht / öffnet Browser statt App“) und eine Zusammenfassung zum Kopieren.

**Abnahme:** Der Nutzer hat mindestens Knopf 1, 3 und einen Maps-Test getestet und die Zusammenfassung zurückgemeldet.
**Hinweis:** Laut Doku ist `claude://claude.ai/new?q=` für die Desktop-App dokumentiert, mobil ist es **unbekannt** und genau das, was getestet wird. Behaupte nichts.

### v0.2 – Karte, Wikipedia-Orte, Sterne, Aktionen

- Standort per Geolocation (Knopf „Mein Standort“), Leaflet-Karte mit OpenStreetMap-Kacheln (Attribution).
- Orte im Umkreis über Wikipedia-GeoSearch (Abschnitt 5a), Radius einstellbar (300 m, 1 km, 3 km, 10 km).
- Der Ortsbestand nutzt schon das einheitliche Format aus Abschnitt 5b (Feld `quellen`), damit weitere Quellen später nur hinzukommen.
- Sterne-Score und Marker nach Abschnitt 6; Liste unter der Karte sortiert nach Sternen; Filter (Abschnitt 7).
- Aktionen pro Ort (Abschnitt 7): Name kopieren, Google Maps (Name und Pin), Teilen, Merken, Merkliste kopieren/teilen.
- PWA mit **Update-Anzeige** (Abschnitt 11): Versionsfooter, `version.json`, Banner „Neue Version – Neu laden“.

**Abnahme (Goldliste in `config.json`, läuft in `diag.html`):** Mit Manchester (Rathaus 53.4792, -2.2442) erscheinen Rathaus, Kathedrale, John Rylands Library, Science and Industry Museum mit ★★★. Ein kleiner Bach erscheint nicht. „Name kopieren“ legt den Namen in die Zwischenablage, „In Google Maps“ öffnet den Ort. Der Update-Banner erscheint, wenn `version.json` eine neuere Version meldet.

### v0.3 – Erzähl-Knopf

- Detailansicht: Name, Bild, Kurzinfo, Link zu Wikipedia, Quellenhinweise.
- Schalter **Ausführlichkeit** (kurz, normal, ausführlich), optional **Schwerpunkt**.
- Knopf „Erzähl mir davon“ baut den Prompt (Abschnitt 8) und übergibt ihn (Abschnitt 9).
- „Schon gehört“-Liste (`localStorage`), grau dargestellt.

**Abnahme:** Prompt ≤ 12.000 Zeichen; aus der App heraus entsteht in Claude ein Text für einen Ort.

### v0.4 – OpenStreetMap dazu, Duplikate zusammenführen

- Overpass-Abfrage (Abschnitt 5d) für den sichtbaren Umkreis, Ergebnisse pro Kachel zwischenspeichern.
- Zusammenführen mit den Wikipedia-Orten nach Abschnitt 5b. Ergebnis: ein Ort pro Sehenswürdigkeit, mit Liste der Quellen.
- OSM-Orte ohne Wikidata-Verweis: höchstens ★, außer eine zweite Quelle bestätigt sie.
- Quellen-Kürzel in der Detailansicht (W = Wikipedia, O = OSM, V = Wikivoyage, C = Claude-Liste).

**Abnahme:** Rathaus und Kathedrale erscheinen **einmal**, nicht doppelt. Mindestens ein OSM-only-Ort (z. B. Aussichtspunkt oder Kunstwerk) erscheint mit ★ oder ohne Stern-Filter. Die Duplikat-Quote wird in `diag.html` angezeigt (Orte vorher/nachher).

### v0.5 – Wikivoyage dazu

- Einträge der Abschnitte „See“ (und optional „Do“) der Wikivoyage-Artikel der Stadt und Umgebung lesen (Abschnitt 5e), mit Koordinaten, Name, Kurzbeschreibung.
- Zusammenführen wie in v0.4. Ein Wikivoyage-See-Eintrag gibt einen Bonus im Score; die Kurzbeschreibung kommt als zusätzlicher Text in den Prompt.
- **Zuerst in `diag.html` prüfen**, wie sich die Einträge am einfachsten auslesen lassen (siehe 5e). Gehe nicht von einer fertigen Schnittstelle aus.

**Abnahme:** Für Manchester liefert die Diagnose mindestens 10 See-Einträge mit Koordinaten; Duplikate zu Wikipedia/OSM werden zusammengeführt.

### v0.6 – Import und Prüfung (Claude-Liste, Dateien)

- Knopf **„Liste von Claude holen“**: baut den Prompt aus Abschnitt 10 (Stadt/Region, Tage, Verkehrsmittel, Interessen) und übergibt ihn an Claude. Der Nutzer kopiert Claudes Antwort (JSON) und fügt sie in ein Importfeld ein.
- **Importformate:** JSON (Schema Abschnitt 10), GeoJSON, KML, GPX, CSV (Spalten `name,lat,lon,notiz`), reine Textliste (ein Name pro Zeile, Stadt wird gefragt).
- **Prüfung der Koordinaten** (Abschnitt 5c): Wikipedia/Wikidata-Treffer, sonst Nominatim (höchstens eine Anfrage pro Sekunde). Gefunden = ✓ geprüft, nicht gefunden = ? ungeprüft, nur in der Liste, nicht als Pin.
- Zusammenführen mit dem Bestand nach 5b; Quelle „C“; Sterne und Geheimtipp-Kennzeichen von Claude werden übernommen, aber mit dem Basis-Score abgeglichen (Warnung bei großem Widerspruch).

**Abnahme:** Mit einer Testantwort im JSON-Format (liegt in `docs/testdata/liste-manchester.json`, enthält bewusst einen erfundenen Ort) werden bekannte Orte ✓ und der erfundene Ort ? gekennzeichnet; keine Duplikate zu v0.4/v0.5.

### v0.7 – Tagesfarben, Reisepaket

- Orte antippen und einem Tag zuordnen (Tag 1, 2, 3, Farbe wählbar). Filter „nur Tag X“. Keine Reihenfolge, keine Route.
- **Reisepaket:** Ortsbestand, Zuordnungen und Merkliste als Datei exportieren/importieren und lokal pro Stadt speichern (offline verfügbar).

### v0.8 – Korridormodus (Abschnitt 6b)

### v0.9 – Stadt-Sterne und Zoom-Logik (Abschnitt 6c)

### v0.10 – Foto-Modus und Offline

- Knopf „Foto-Frage“: baut den Prompt aus Abschnitt 10b, der Nutzer hängt das Foto in Claude selbst an.
- Offline: zuletzt geladene Karte/Orte verfügbar, Wikipedia-Texte lokal zwischengespeichert.

---

## 5. Datenquellen und Ortsbestand

**Hinweis:** Die Details der Schnittstellen sind Wissensstand zum Verfassungszeitpunkt und **müssen in `diag.html` geprüft werden** (CORS, Format, Grenzen). Melde Abweichungen im CHANGELOG.

### 5a. Wikipedia und Wikidata (v0.2)

- **GeoSearch:** `https://{lang}.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord={lat}|{lon}&gsradius={m}&gslimit=50&format=json&origin=*`. Radius nach meinem Wissen höchstens 10.000 m, bis zu 500 Treffer. `{lang}` abwechselnd `de` und `en`, Treffer über die Wikidata-ID zusammenführen.
- **Text und Bild:** `action=query&prop=extracts|pageimages|pageprops&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=600&titles=...`. Für „ausführlich“ den ganzen Artikel, Länge begrenzen (Abschnitt 8).
- **Sprachversionen und Klasse (P31):** Wikidata `wbgetentities` (`props=sitelinks|claims`). Anzahl der Sprachversionen = `sitelinks`-Einträge, die auf `wiki` enden (ohne `commonswiki`, `specieswiki` u. ä.).
- **Seitenaufrufe (optional):** Wikimedia Pageviews API, 90 Tage. Bei CORS-Problemen weglassen und notieren.

### 5b. Einheitlicher Ortsbestand und Duplikate

Jeder Ort hat dieses Format (intern, im Reisepaket gespeichert):

```json
{
  "id": "wd:Q123 | osm:way/456 | wv:... | c:<hash>",
  "name": "Manchester Town Hall",
  "lat": 53.4792, "lon": -2.2442,
  "wikidata": "Q123", "wikipedia": "en:Manchester Town Hall",
  "typ": "rathaus",
  "quellen": ["W", "O", "V", "C"],
  "sterne": 3,
  "geheimtipp": false,
  "geprueft": true,
  "warum": "ein Satz von Claude oder Wikivoyage",
  "dauer_min": 45
}
```

**Zusammenführen (in dieser Reihenfolge):**
1. Gleiche **Wikidata-ID** = derselbe Ort (Wikipedia, viele OSM-Objekte mit `wikidata`-Tag, manche Wikivoyage-Einträge).
2. Sonst: **ähnlicher Name** (Kleinschreibung, ohne Artikel/Satzzeichen, Ähnlichkeit ≥ 0,85) **und Abstand ≤ 150 m**.
3. Bei Treffer: ein Datensatz, `quellen` vereinigen, Koordinaten der **besten Quelle** (Reihenfolge Wikipedia > OSM > Wikivoyage > Claude).
4. Im Zweifel **nicht** zusammenführen (lieber ein Duplikat als einen verlorenen Ort).

**Vertrauen:** Mehr Quellen = verlässlicher. Ein Ort, den nur „C“ nennt, bleibt `geprueft:false`, bis die Prüfung Koordinaten findet.

### 5c. Prüfung der Koordinaten von Claude-Listen (v0.6)

1. Hat der Eintrag `wikipedia` oder `wikidata`: Koordinaten daraus holen (geprüft).
2. Sonst Nominatim `search?q={name}, {ort}&format=json&limit=1` (Nutzungsbedingungen: höchstens eine Anfrage pro Sekunde, nur auf Nutzeraktion, aussagekräftiger `Referer`).
3. Treffer weiter als 2 km von der Stadtmitte: als ungeprüft behandeln.
4. Koordinaten, die Claude selbst nennt, **nie ungeprüft als Pin zeigen**.

### 5d. OpenStreetMap über Overpass (v0.4)

- Öffentlicher Overpass-Server (Standard `https://overpass-api.de/api/interpreter`, mit Fallback-Servern). Fair-Use beachten: pro Kachel (0,1°) höchstens eine Anfrage, 30 Tage lokal zwischenspeichern, höchstens 2 gleichzeitige Anfragen.
- Abgefragte Tags (Startwerte, in `config.json`): `tourism=attraction|museum|gallery|viewpoint|artwork`, `historic=*` (Burg, Schloss, Denkmal, Ruine, Archäologie …), `amenity=theatre|library|arts_centre`, `leisure=park|garden` (nur benannte), `natural=peak|waterfall`.
- Wichtig ist der Tag `wikidata` (Verbindung zu Wikipedia und Wikidata). Fehlt er, wird der Ort schwächer bewertet (Abschnitt 6).
- Attribution: „© OpenStreetMap-Mitwirkende“.
- Öffnungszeiten und Eintritt (`opening_hours`, `fee`) werden **nicht** gebraucht (Regel 10).

### 5e. Wikivoyage (v0.5)

- Wikivoyage ist ein MediaWiki (`{lang}.wikivoyage.org/w/api.php`). Artikel haben feste Abschnitte (See, Do …) mit `{{listing}}`/`{{see}}`-Vorlagen, die Name, Koordinaten und Kurzbeschreibung enthalten.
- Es ist **nicht gesichert**, dass es eine fertige Abfrage für Einträge im Umkreis gibt. Prüfe in `diag.html`: (a) Artikel zur Stadt finden (Titelsuche oder GeoSearch auf Wikivoyage), (b) den Wikitext des Abschnitts „See“ laden (`action=parse&prop=wikitext&section=...`), (c) die Vorlagen mit einem einfachen Parser auslesen. Wenn das zu fragil ist, melde es im CHANGELOG und lasse Wikivoyage zunächst weg.
- Lizenz CC BY-SA, **nicht mit OSM-Daten vermischen**, wenn Daten veröffentlicht würden. Für die private Nutzung genügt es, die Quelle je Ort getrennt anzuzeigen und anzugeben.

---

## 6. Sterne-Skala und Score (Faustregel, in `config.json` konfigurierbar)

| Sterne | Bedeutung (UI-Text) | Besuchsdauer (nur Anzeige) |
|---|---|---|
| ★★★ | Lohnt die Reise | ab 1,5 Std. |
| ★★ | Lohnt einen Umweg | ca. 1 Std. |
| ★ | Interessant, wenn du in der Nähe bist | ca. 30 Min. |
| (keiner) | ausgeblendet | – |

**Score pro Ort:**

```
score = 3.0 * log10(1 + sprachversionen)
      + 1.5 * log10(1 + aufrufe90)          # wenn verfügbar
      + 0.5 * log10(1 + artikellaenge)
      + denkmal_bonus                        # UNESCO +3, höchste Denkmalstufe +2, Denkmal +1
      + typ_gewicht                          # nach Wikidata-Klasse (P31) bzw. OSM-Tag
      + quellen_bonus                        # +0,5 je weitere bestätigende Quelle (O, V, C)
      + wikivoyage_bonus                     # +1,0 bei Eintrag in „See“
      + interessen_bonus                     # +1 je Treffer in der Interessenliste
```

**Typ-Gewichte (Startwerte):** Kathedrale, Kirche, Schloss, Burg, Palast, Rathaus, Museum, Bibliothek, UNESCO-Welterbe +2 bis +3; Brücke, Denkmal, Theater, Bahnhof, Industriegebäude/Mühle +1; Platz, Park 0; Straße, Fluss, Bach, Kanal −2; Wohnhaus, Firma, Person ohne Ortsbezug −3.

**Stufen (Startwerte):** ★★★ ≥ 8, ★★ ≥ 6, ★ ≥ 4, darunter ausgeblendet (nur über „alles zeigen“ sichtbar).

**Regeln für Orte ohne Wikipedia-Artikel:**
- Nur OSM ohne `wikidata`: höchstens ★ (außer zweite Quelle bestätigt).
- Nur Claude-Liste (`C`), geprüft: Sterne von Claude, aber höchstens ★★, solange keine zweite Quelle vorliegt.
- Claude vergibt ★★★ und der Basis-Score liegt unter ★: Warnzeichen „Einschätzung weicht ab“ in der Detailansicht (kein stilles Überschreiben).

**Geheimtipps:** Eigenes Symbol (Lupe) neben den Sternen, Hinweis „Einschätzung, ungeprüft“, wenn nur von Claude oder nur von OSM.

**Hinweis:** Das ist eine Faustregel, keine Expertenbewertung. Wenn die Goldliste nicht besteht, passe Gewichte in `config.json` an, nicht den Code. Ein Knopf „manuell hochstufen/herabstufen“ speichert Ausnahmen lokal.

---

## 6b. Korridormodus (v0.8)

**Ziel:** Der Nutzer sieht, was zwischen Start und Ziel sehenswert ist, bevor er seine Route in Google Maps festlegt.

**Eingabe:** Start (Standard „Mein Standort“), Ziel, Verkehrsmittel (Auto, Fahrrad, zu Fuß). Optional Via-Punkte durch Tippen auf die Karte.

**Breite des Streifens hängt von den Sternen ab** (Kilometer Abstand zur Linie, Startwerte in `config.json`):

| Verkehrsmittel | ★★★ | ★★ | ★ |
|---|---|---|---|
| Auto | 40 | 15 | 5 |
| Fahrrad | 8 | 3 | 1 |
| zu Fuß | 2 | 1 | 0,3 |

**Geometrie:** Die Linie ist zunächst die **Luftlinie** (Großkreis). Der Abstand eines Ortes ist der senkrechte Abstand (Haversine). Ein Ort wird gezeigt, wenn sein Abstand ≤ Breite seiner Stufe ist. Zeige „Umweg ca. X km (Luftlinie)“ und „km ab Start“. Hinweis: „Echte Straße kann abweichen.“

**Abfrage:**
1. Stützpunkte alle ca. 15 km (Auto) bzw. 6 km (Fahrrad, zu Fuß), Radius je Punkt ≤ 10 km.
2. Pro Stützpunkt die Quellen aus Abschnitt 5 (zuerst Wikipedia, ab v0.4 auch OSM), höchstens 4 gleichzeitige Anfragen, Fortschrittsanzeige.
3. Zusammenführen (5b), Score (6), nach Streifenbreite filtern, pro Kachel zwischenspeichern.
4. Optional: Der Nutzer kann Claude nach „Highlights zwischen A und B“ fragen (Import wie in v0.6); die **App** filtert die Ergebnisse nach Abstand zur Linie. Claude beurteilt, die App rechnet.

**Anzeige:** Linie und Streifen auf der Karte, Marker wie im Stadtmodus, Liste **in Reihenfolge entlang der Strecke**, mit Umweg. Gleiche Aktionen wie im Stadtmodus.

**Nicht Teil der App:** Routenberechnung, automatische Auswahl von Zwischenstopps, Wegpunktlisten, Zeitplanung.

**Abnahme (in `diag.html`):**
1. Fahrrad, Morges (46.511, 6.498) → Genf (46.204, 6.143): mindestens 1 Ort, alle Orte erfüllen die Breite ihrer Stufe, Liste nach „km ab Start“ sortiert, Dauer < 20 Sekunden.
2. Auto, Morges → Lyon (45.764, 4.836): läuft mit begrenzten Anfragen, Fortschritt sichtbar, zweiter Lauf deutlich schneller (Zwischenspeicher).
3. Breiten sind monoton: Ein Ort mit weniger Sternen erscheint nie weiter weg als einer mit mehr Sternen.

---

## 6c. Stadt-Sterne und Zoom-Logik (v0.9)

**Ziel:** Beim Herauszoomen sieht man Städte mit Sternen, beim Hineinzoomen die einzelnen Orte.

**Zoomstufen (Startwerte):**
- Zoom ≤ 8: nur Städte mit ★★ und ★★★.
- Zoom 9–12: Städte (alle mit Sternen) plus ★★★-Orte außerhalb.
- Zoom ≥ 13: einzelne Orte, Stadtmarker verschwinden.

**Stadt-Sterne werden vorab berechnet:**
- `tools/build-cities.mjs` (Node) läuft als **GitHub Action, manuell startbar** (`workflow_dispatch`, vom Handy über github.com). Es nimmt eine Städteliste (Wikidata: Städte mit mindestens 20 Sprachversionen), holt je Stadt die Orte im Umkreis (3 km, bei großen Städten mehrere Abfragen), berechnet die Scores nach Abschnitt 6 und schreibt `docs/staedte.json`: `{name, wikidata, lat, lon, score, sterne, top: [3 beste Orte]}`.
- **Stadt-Score:** Summe der Scores der besten 10 Orte, plus UNESCO-Altstadt +3 und Hauptstadt +1. Schwellen in `config.json`.
- Die App lädt `staedte.json` beim Start (klein halten).

**Hinweis:** Städte ohne klassische Altstadt (Beispiel Manchester) werden unterschätzt. Das ist ein bekanntes Risiko, kein Fehler.

**Stand:** Umgesetzt in v0.7.0, vorgezogen auf Wunsch des Nutzers. Abweichungen: Berechnung je Land als `docs/staedte/<LAND>.json`, zusätzlich im Handy unter ⚙ neu berechenbar; Stadt-Marker bis Zoom 11. Details im CHANGELOG.

---

## 7. UI-Spezifikation (mobil zuerst)

- Vollbild-Karte oben (ca. 55 % Höhe), darunter Liste, unten Leiste. Modus-Schalter oben: **Stadt** | **Unterwegs**.
- **Marker:** Größe und Farbe nach Sternen: ★★★ groß, rot, mit Namen; ★★ mittel, orange; ★ klein, grau, nur ab Zoom 16. Geheimtipps mit Lupen-Symbol. Ungeprüfte Orte nie als Pin.
- **Filter:** Mindeststerne (★★★, ★★+, alle), Kategorien (Gebäude/Kirchen, Denkmäler, Museen, Industrie, Parks/Natur, Brücken, Kunst), Radius, Quelle, nur Geheimtipps, „schon gehört“ ausblenden, nach Tag filtern.
- **Namen sind markier- und kopierbar** (`user-select: text`).
- **Aktionen pro Ort:**
  - **Name kopieren** (Format `Name, Stadt/Ort`; Fallback: Text markieren).
  - **In Google Maps öffnen:** `https://www.google.com/maps/search/?api=1&query={URL-kodierter Name, Ort}`; zweiter Knopf **„Pin“** mit `query={lat},{lon}`. Einstellung „Karten-App“: Google-Maps-Link oder Android-`geo:`-Link, je nach Ergebnis aus v0.1.
  - **Teilen** (Web Share API): Name plus Maps-Link.
  - **Wikipedia** öffnen; **Bei Tripadvisor suchen** (Suchlink, kein API).
  - **Erzähl mir davon** (ab v0.3), **Foto-Frage** (ab v0.10).
  - **Merken**, **Tag zuordnen** (ab v0.7).
- **Merkliste:** Eigene Ansicht, Knöpfe „Liste kopieren“ und „Liste teilen“. Format pro Zeile: `Name – ★★★ – Ort – https://www.google.com/maps/search/?api=1&query=...`.
- **Detailansicht:** Bild, Name, Sterne mit UI-Text, Quellen-Kürzel, Dauer-Schätzung, Entfernung bzw. Umweg, Kurzinfo, „warum“ (falls vorhanden), Aktionen, Quellenangabe und Lizenz.
- **Einstellungen:** Ausführlichkeit, Schwerpunkt, Interessenliste, Karten-App, Korridorbreiten, Quellen an/aus (W/O/V/C), Übergabe-Methode.
- Große Tippflächen (≥ 44 px), hell/dunkel automatisch, Versionsnummer im Footer.

---

## 8. Prompt-Vorlage für die Erzählung (an Claude)

Baue den Prompt in dieser Reihenfolge, unter **12.000 Zeichen** (Quelltext notfalls an einer Satzgrenze kürzen und das im Prompt vermerken).

```
Du bist mein Reiseführer. Erzähle mir gleich etwas über diesen Ort.

Ort: {name}
Wo: {lat}, {lon}, etwa {entfernung} m von mir entfernt
Art: {typ}
Länge: {laenge_text}
Schwerpunkt: {schwerpunkt oder "keiner, ein guter Überblick"}

Regeln:
- Schreibe einen gesprochenen deutschen Text, ohne Listen, Überschriften und Formatierung, so, dass man ihn gut vorlesen kann.
- Verwende nur Informationen aus dem Quelltext unten. Wenn etwas fehlt, sage es kurz. Erfinde nichts.
- Schreibe Jahreszahlen so, wie man sie spricht, zum Beispiel neunzehnhundertzwölf statt 1912.
- Beginne mit einem Satz, der mir hilft zu erkennen, was ich vor mir sehe.
- Nenne am Ende keine Quellen.

Quelltext ({quellsprache}, Wikipedia):
{extrakt}

Reisetipp (Wikivoyage, falls vorhanden):
{wikivoyage_text}

Weitere Infos: {wikipedia_url}
```

**Länge ({laenge_text}):**
- kurz: „etwa dreißig Sekunden, ca. 80 Wörter, nur das Wichtigste“
- normal: „etwa zwei Minuten, ca. 300 Wörter“
- ausführlich: „fünf Minuten oder länger, ca. 750 Wörter, mit Hintergründen und Geschichten“

**Quelltext je Stufe:** kurz = Einleitung des Artikels; normal = Einleitung plus erste Abschnitte bis 3.000 Zeichen; ausführlich = ganzer Artikel bis 10.000 Zeichen. Hat ein Ort keinen Wikipedia-Artikel, sagt der Prompt das offen und nutzt `warum`/Wikivoyage-Text; Claude darf dann nichts dazuerfinden.

---

## 9. Übergabe an Claude

Reihenfolge, nach Ergebnis von v0.1 (nimm die erste funktionierende):

1. `claude://claude.ai/new?q={URL-kodierter Prompt}` – neuer Chat mit vorausgefülltem Text (mobil zu testen).
2. Prompt **in die Zwischenablage kopieren** und `claude://claude.ai/project/{ID}` öffnen (Projekt „Reiseführer“).
3. Prompt in die Zwischenablage und die Claude-App öffnen.

Immer sichtbar anzeigen: „Prompt kopiert“ plus Knopf „Nochmal kopieren“. Die Methode ist in `config.json` einstellbar.

Projektanweisung für das Claude-Projekt „Reiseführer“:
> Du bist mein Reiseführer. Ich schicke dir einen Ort mit Quelltext oder eine Aufgabe, eine Ortsliste zu erstellen. Bei Erzähltexten: gesprochener deutscher Text ohne Listen und Formatierung, nur Informationen aus dem Quelltext, wenn etwas fehlt, sage es, Jahreszahlen so schreiben, wie man sie spricht, am Ende keine Quellen. Bei Ortslisten: nur das verlangte JSON, nur Orte, bei denen du dir sicher bist, dass es sie gibt. Bei Fotos: sage deutlich, wenn du dir bei der Erkennung unsicher bist.

---

## 10. Claude-Liste (Import) und Foto-Prompt

### 10a. Prompt „Liste von Claude holen“ (v0.6)

```
Du bist ein kenntnisreicher Reiseführer. Nenne mir die sehenswertesten Orte in {stadt_oder_region} für {dauer, z. B. "ein Wochenende"}, unterwegs {verkehrsmittel}, meine Interessen: {interessen}.
Nimm bekannte Highlights UND echte Geheimtipps auf. Nenne nur Orte, bei denen du dir sicher bist, dass es sie gibt. Bei Unsicherheit setze "sicher": "niedrig".
Antworte NUR mit einem JSON-Array (kein Text davor oder danach), höchstens {n, Standard 40} Einträge, jeder so:
{"name": "...", "ort": "...", "kategorie": "kirche|museum|bauwerk|denkmal|industrie|park|brücke|kunst|aussicht|sonstiges",
 "sterne": 1-3, "geheimtipp": true|false, "warum": "ein Satz", "dauer_min": 30,
 "wikipedia": "de:Titel oder en:Titel, falls es einen Artikel gibt, sonst leer",
 "lat": Zahl oder null, "lon": Zahl oder null, "sicher": "hoch|mittel|niedrig"}
Koordinaten nur angeben, wenn du dir sehr sicher bist, sonst null.
Sterne: 3 = lohnt die Reise, 2 = lohnt einen Umweg, 1 = interessant, wenn man in der Nähe ist.
```

Bei großen Städten pro Stadtteil/Gebiet fragen (die Antwort wird sonst abgeschnitten). Das Importfeld akzeptiert auch mehrere nacheinander eingefügte Arrays.

### 10b. Foto-Modus (v0.10)

Das Foto hängt der Nutzer in Claude selbst an. Die App liefert den Text:

```
Ich stehe hier: {lat}, {lon} ({adresse falls bekannt}).
Auf dem Foto, das ich gleich anhänge, ist etwas, das ich nicht verstehe.
Orte in meiner Nähe (Kandidaten):
1. {name1} – {200 Zeichen Auszug}
2. {name2} – ...
Aufgabe:
- Sage zuerst, welcher Kandidat es am wahrscheinlichsten ist, oder ob es keiner davon ist. Nenne deine Sicherheit (hoch/mittel/niedrig).
- Wenn Text oder Schilder zu sehen sind, lies und übersetze sie.
- Erkläre dann in einem gesprochenen deutschen Text ohne Listen, was ich sehe und warum es wichtig ist. Bei Fakten nur, was du sicher weißt oder aus den Auszügen oben hast. Jahreszahlen so, wie man sie spricht.
```

Maximal 8 Kandidaten, die nächsten und wichtigsten zuerst.

---

## 11. Deployment und Updates nur mit dem Handy

**Grundsatz:** Der Nutzer hat keinen PC. Jede Änderung, jeder Test und jedes Zurücksetzen muss vom Handy aus gehen.

**Wege, die App zu ändern (einfach → aufwendig):**
1. **Stellschrauben ändern** (Gewichte, Schwellen, Korridorbreiten, Prompt-Texte, Quellen an/aus): Datei `docs/config.json` direkt auf github.com im Handy-Browser bearbeiten und speichern. Kein Claude Code nötig.
2. **Funktion ändern oder neue Etappe:** In der Claude-App im Code-Tab das Repo wählen, z. B. „Lies PROJEKT.md und baue v0.4“. Claude Code pusht nach `main`.
3. **Zurücksetzen:** Auf github.com einen Commit zurücknehmen („Revert“) oder Claude Code sagen: „Setze auf Version v0.x zurück.“

**Veröffentlichen:** GitHub Pages (Quelle `main`, Ordner `/docs`). Jeder Push veröffentlicht automatisch (ca. 1–2 Minuten). App-URL: `https://obitusde.github.io/reisefuehrer/`. Pages einmalig auf github.com aktivieren (Einstellungen → Pages), das geht am Handy.

**Update-Anzeige in der App (ab v0.2, Pflicht):**
- `docs/version.json` enthält die aktuelle Version. Die App lädt sie beim Start mit `cache: 'no-store'` und vergleicht sie mit der eigenen Version (im Code und im Footer).
- Ist sie neuer: Banner „Neue Version vX verfügbar – Neu laden“. Der Knopf löscht die Caches der App (nicht die Nutzerdaten wie Merkliste und Reisepaket), meldet den Service Worker ab und lädt neu.
- **Service Worker:** Für `index.html`, `app.js`, `style.css`, `config.json` zuerst das Netz versuchen (network-first), nur bei Fehler den Cache nehmen. Für Kartenkacheln und Orte-Zwischenspeicher cache-first. Der Cache-Name enthält die Version.
- Nutzerdaten (Merkliste, Tage, Einstellungen) liegen in `localStorage`/IndexedDB und überleben Updates. Bei Änderungen am Datenformat: Migration im Code und Eintrag im CHANGELOG.

**Arbeitsablauf pro Session:** (1) Etappe lesen, (2) bauen, (3) mit Node und Beispieldaten prüfen, was geht, (4) Version in Code, `version.json` und CHANGELOG erhöhen, (5) nach `main` pushen, (6) dem Nutzer in fünf Sätzen sagen: was neu ist, wie er es am Handy testet (genaue Schritte), was unsicher ist.

**Wichtig zur Umgebung:** Die Cloud-Session hat eingeschränkten Netzzugang und kann die Schnittstellen (Wikipedia, Overpass, Nominatim) womöglich nicht erreichen. Teste Logik (Duplikate, Score, Korridor, Import-Parser) mit gespeicherten Beispieldaten (`docs/testdata/`) in Node, und baue die Live-Tests als Knöpfe in `diag.html`, die der Nutzer auf dem Handy drückt. Melde, was nur live geprüft werden konnte.

**Workflows vom Handy starten:** `build-cities.yml` hat `workflow_dispatch`. Auf github.com im Handy-Browser: Actions → Workflow wählen → „Run workflow“. Ob das in der GitHub-App selbst geht, ist ungeprüft; der Handy-Browser sollte reichen.

---

## 12. Optional und spät: LLM-Aufruf per GAS/OpenRouter

Nur auf ausdrückliche Anweisung. Zweck: die Claude-Liste (Abschnitt 10a) direkt aus der App holen statt per Kopieren.

- **Einmalig am PC nötig (ehrlicher Hinweis):** `clasp login` für das Deployment. Ohne PC gibt es dieses Modul nicht. Solange der Nutzer keinen PC hat, bleibt der **Import per Kopieren** die Lösung.
- Architektur: GAS-Web-App mit `doGet`/`doPost`, Schlüssel nur in den Skripteigenschaften, ein Aufruf pro Stadt/Gebiet, Ergebnis in einem Google Sheet bzw. im Browser zwischenspeichern. Diagnose: `doGet?action=diag`.
- Deployment per GitHub Actions (clasp), Secrets `CLASPRC_JSON` und `CLASP_JSON`. Dienstkonten funktionieren mit der Apps-Script-API nicht; bei „401“ muss `clasp login` am PC wiederholt werden.
- Kosten hängen vom Modell ab; vor dem Einbau prüfen und den Nutzer entscheiden lassen.
- Bilderkennung: Es gibt keine offizielle Google-Lens-API. Optionen wären Google Cloud Vision oder Gemini (Kosten und Gratiskontingent vorher prüfen).

---

## 13. Rechtliches

- **Wikipedia/Wikivoyage-Texte** stehen unter CC BY-SA: in der Detailansicht immer Quelle, Link und Lizenz anzeigen. Claude-Texte sind Bearbeitungen für die private Nutzung.
- **OSM:** „© OpenStreetMap-Mitwirkende“ sichtbar (Karte und Orte). Daten stehen unter ODbL. Wikivoyage (CC BY-SA) und OSM (ODbL) sind nicht kompatibel: Daten **nicht mischen und nicht veröffentlichen**, Quellen je Ort getrennt anzeigen. Nichts aus Wikivoyage nach OSM kopieren.
- **Nominatim/Overpass:** Nutzungsbedingungen einhalten (Anfragerate, Zwischenspeicher, Referer).
- **Sterne:** Das Prinzip „lohnt die Reise / lohnt einen Umweg / interessant“ ist von Reiseführern bekannt. Keine Michelin-Daten, -Namen oder -Symbole.
- **Tripadvisor, Atlas Obscura, Blogs:** nur Suchlinks, keine Inhalte kopieren.
- Der Standort bleibt im Browser; es wird nichts gesendet außer dem, was der Prompt enthält und was die Schnittstellen für die Abfragen brauchen (Koordinaten von Kacheln).

---

## 14. Risiken und offene Punkte

1. **Claude-Link mobil:** `claude://claude.ai/new?q=` ist für Desktop dokumentiert, mobil unbekannt (v0.1 klärt es).
2. **Vorlesen bei gesperrtem Bildschirm:** unklar, ob Claudes Vorlesefunktion dann weiterläuft. Notlösung: Android-Lesemodus.
3. **Sterne-Faustregel:** kann kleine, aber wichtige Orte und Städte ohne Altstadt unterschätzen; manuelles Hoch-/Herabstufen vorsehen.
4. **Erfundene Orte und falsche Koordinaten in Claude-Listen:** deshalb Prüfung (5c), „ungeprüft“-Status, kein Pin ohne verlässliche Koordinaten.
5. **Duplikate:** Namen in mehreren Sprachen, Gebäudekomplexe mit mehreren Teilen; im Zweifel nicht zusammenführen. Quote in `diag.html` beobachten.
6. **OSM-Rauschen:** viele Kleinstobjekte; Filter und Stufenregeln (Abschnitt 6) sind nötig.
7. **Wikivoyage-Auslesen:** unsicher, ob einfach genug (5e); sonst weglassen.
8. **Overpass-Server:** öffentliche Instanz, kann langsam oder gedrosselt sein; Fallback-Server und Zwischenspeicher.
9. **Wikipedia-GeoSearch:** Radius höchstens ca. 10 km, daher Stützpunkte im Korridormodus; Korridor nutzt Luftlinie statt Straße.
10. **Nachrichtenlimit im Abo:** viele Erzähltexte verbrauchen Limit; Kurzmodus als Standard erwägen.
11. **CORS/Formate/Grenzen** der Schnittstellen: in `diag.html` prüfen.
12. **Qualität der Texte** hängt vom vollständigen Quelltext im Prompt ab. Nie nur den Namen schicken.
13. **Kein PC:** Alles, was einen PC bräuchte (GAS-Deployment), ist optional und spät.

---

## 15. Definition of Done pro Version

- Versionsnummer im UI, in `version.json` und in `CHANGELOG.md`
- Abnahmetests der Etappe laufen in `diag.html` und sind für den Nutzer am Handy bedienbar
- Update-Banner funktioniert (ab v0.2)
- Nichts im Repo, das Schlüssel enthält
- Kurzbericht an den Nutzer: was neu, wie testen, was unsicher

---

## 16. Änderungsprotokoll dieses Dokuments

- **1.2 (02.11.2026):** Neue Datenstrategie: Basis Wikipedia + OSM + Wikivoyage in einem Ortsbestand mit Duplikat-Zusammenführung (5b), Claude-Liste per Import mit Koordinaten-Prüfung (5c, 10a) als Zusatz für Geheimtipps, LLM-Aufruf über GAS nur optional und spät (Abschnitt 12, braucht einmalig PC). Etappen neu geordnet (v0.2 Wikipedia, v0.4 OSM, v0.5 Wikivoyage, v0.6 Import, v0.7 Tagesfarben/Reisepaket). Tripadvisor nur als Suchlink. Regel „kein PC“ und Update-Mechanismus nur mit Handy (Abschnitt 11). Öffnungszeiten ausdrücklich kein Ziel.
- **1.1 (02.11.2026):** Sterne-Skala, Stadt-Sterne, Korridormodus (nur Anzeige), keine Routenplanung, Aktionen pro Ort, Merkliste.
- **1.0 (02.11.2026):** Erste Fassung.
