# Changelog

## v0.19.0 – 05.11.2026 – „Praktisches und Bewertung“ öffnet direkt die Google-KI-Suche

Wunsch Nutzer: Der Knopf soll direkt mit der Google-KI-Suche arbeiten.

- Der Knopf „Praktisches und Bewertung“ ist jetzt ein Link: `https://www.google.com/search?hl=de&udm=50&q=<kurzer Prompt>` (wie „✨ Google fragen“, öffnet sich in einem Fenster, das du wieder schließt; die App liest die Antwort nicht). Kein Kopieren und kein Teilen-Menü mehr für diesen Knopf. Der Prompt ist der aus v0.17.0 (etwa 330 Zeichen, Link unter 700 Zeichen). Die Region (z. B. Waadt) wird im Link nachgetragen, sobald die Ortsabfrage da ist.
- „🎧 Audioguide“ bleibt wie bisher (Teilen-Menü, dort die KI-App wählen).

### Annahmen/Abweichungen

- Der Google-KI-Modus (`udm=50`) ist nicht dokumentiert und kann sich ändern; ohne `ki_param` (config.json → google) wäre es eine normale Suche.
- Google zeigt bei der Frage evtl. den Hinweis „Mit dieser Suche fortfahren?“ (gesehen am 5.11.): einmal bestätigen.
- Offline gibt der Knopf nichts her (Link braucht Internet).

## v0.18.0 – 05.11.2026 – Karte zeigt, was Platz hat (statt fester Zoomstufen)

Wunsch Nutzer: Bei Zoom 14 war die Karte leer, obwohl Platz da war. Sachen sollen nur weggelassen werden, wenn kein Platz ist oder es zu voll wird. In jeder Zoomstufe sinnvoll viele Punkte.

- **Zoom-Sperre für kleine Ziele weg**: Ziele mit wenig Punkten (unter 4) und beschreibende Namen erschienen erst ab Zoom 15. Jetzt stehen sie in der Rangfolge hinten, erscheinen aber auf jeder Zoomstufe (ab 12, darunter zeigt die Karte die Städte), wenn Platz ist. Gilt für Karte und Liste.
- **Graue OSM-Ringe früher**: je Art (`paket.osm_ab_zoom_je_typ`): Museum, Burg, Herrenhaus, Ausgrabung, Kirche, Kloster, Aussichtspunkt, Attraktion und Freizeit ab Zoom 12, Denkmal und Turm ab 14, alles übrige (Park, Kunstwerk, Theater, Bibliothek …) wie bisher ab 15. Die Ringe sind untereinander geordnet (`paket.osm_gewicht`: Museum und Burg zuerst, Denkmal und Turm zuletzt).
- **Mehr Punkte, wo Platz ist**: Höchstzahl im Ausschnitt (`marker.max_nach_zoom`): 30 bis Zoom 11, 45 ab 12, 70 ab 14. Kleine Punkte halten 5 Pixel Abstand zu anderen (`marker.abstand_px`); weniger wichtige Punkte, die auf einem wichtigeren liegen, bleiben wie bisher weg.
- **Nicht zu viele Punkte ohne Namen** (Wunsch Nutzer, Zoom 13: man müsste jeden antippen): Punkte ohne Namen (weiße Punkte und kleine Symbole ohne Beschriftung) sind je Ausschnitt begrenzt, `marker.ohne_name_nach_zoom`: Zoom 12: 4, 13: 8, 14: 16, 15: 30, ab 16: 60. Ziele mit ★★ und mehr zählen nicht dazu. Mit Namen werden so viele Ziele gezeigt, wie Platz für die Beschriftung ist.
- **Symbole hervorgehoben**: Punkte mit Namen etwas größer (Symbol 1,1fach), namenlose kleiner und leicht durchsichtig. Innerhalb gleicher Sterne zuerst Museen, Burgen, Schlösser, Klöster, Kirchen, Aussichtspunkte, Ausgrabungen, Herrenhäuser, danach Berge, Parks, Kunstwerke, Theater, Brücken (`marker.typ_vorrang`, `typ_nachrang`).
- Sterne, Rangfolge, die fünf besten groß mit Namen: unverändert.

### Annahmen/Abweichungen

- Mit dem Länderpaket der Schweiz oder von Deutschland sind die Ringe sofort da; ohne Paket kommen sie wie bisher erst nach „Hier suchen“.
- Die Zahlen (45, 70, Abstand 5 px, Zoomstufen 12/14/15 je Art) sind Startwerte aus Überlegung, nicht gemessen. Zu voll oder zu leer: in `config.json` anpassen oder mir sagen.
- Zoomstufe 12 und höher: Bei Zoom 11 und darunter zeigt die Karte weiter die Städte mit Sternen (v0.7.0), nicht einzelne Ziele.
- Der Test „kleines Museum erst ab Zoom 15“ (v0.9.3) ist durch den neuen ersetzt.

## v0.17.0 – 05.11.2026 – Kürzerer Prompt „Praktisches und Bewertung“, „Audioguide“, Einstellungen aufgeräumt

Wunsch Nutzer: Prompt für „Lohnt sich der Besuch?“ nach dem Muster der kurzen Google-Frage; Knopf soll „Praktisches und Bewertung“ heißen; „Erzähl mir davon“ soll „Audioguide“ heißen; Karten-App fest auf die Android-Karten-App; „Schon gehört“ komplett weg; „Hier suchen“ kann das weg?

- **Prompt** (Knopf „Praktisches und Bewertung“, `config.json` → `besucher.vorlage`): eine Zeile, etwa 330 Zeichen statt 1 300. Wortlaut: „Reiseführer: Lohnt sich {Name} ({Region}, {Breite}, {Länge})? Suche aktuelle Besucherbewertungen, nenne Quelle und Stand, nichts raten. Antworte in zwei Abschnitten: 1. Lohnt sich der Besuch? 2. Praktische Tipps (Eintritt, Öffnungszeiten, Zeitbedarf, beste Zeit, Tipps). Sachlich, ohne Rückfrage am Ende“. Die Region (z. B. „Waadt“) kommt aus derselben Abfrage wie bei den Google-Knöpfen (Nominatim, beim Öffnen des Ortsfensters), sonst steht der Ort da, sonst nur die Koordinaten (vier Stellen).
- **Knöpfe**: „🎧 Audioguide“ (vorher „🎧 Erzähl mir davon“), „Praktisches und Bewertung“ (vorher „👍 Lohnt sich der Besuch?“). Der Text des Audioguide-Prompts bleibt wie in v0.13.5. Namen in `config.json` (`erzaehlen.knopf`, `besucher.knopf`).
- **Karten-App fest**: Der Knopf im Ortsfenster heißt „In Karten-App“ und öffnet die Android-Karten-App (geo:-Link, die Auswahl macht Android). Die Wahl in den Einstellungen und `karten_app_standard` sind entfernt (Google Maps und OsmAnd als Auswahl gibt es nicht mehr; die Hilfsfunktionen in `core.js` bleiben liegen).
- **„Schon gehört“ komplett entfernt**: Einstellung „Schon gehörte Orte ausblenden“, „Liste leeren“, graue Zeilen und das automatische Merken beim Erzählen; die gespeicherte Liste (`rf.gehoert`) wird beim Start gelöscht.

### Annahmen/Abweichungen

- Im Wortlaut stand „Antworte  zwei Abschnitte“ (doppeltes Leerzeichen, „in“ fehlte): ich habe „Antworte in zwei Abschnitten“ geschrieben, sonst unverändert.
- Nur der Audioguide behält sein Symbol (🎧); „Praktisches und Bewertung“ steht ohne Symbol, wie du es geschrieben hast.
- **„Hier suchen“ bleibt** (siehe Antwort): Die Liste unter der Karte füllt sich nur damit, und außerhalb gebauter Länderpakete lädt es die Karten- und Verzeichnisdaten. Ändern wir später, wenn die Liste dem Kartenausschnitt automatisch folgen soll.
- Die Abschnitte, die ich in der Einstellungsseite gestrichen habe (Karten-App, Schon gehört), bleiben in `PROJEKT.md` als Geschichte stehen.
- Die Beschränkung auf zwei Abschnitte hängt nur an der KI-App: Der Prompt ist kürzer und strenger Format-Vorgaben („genau diese Überschriften“) fehlen, das Ergebnis kann daher etwas freier ausfallen.

## v0.16.0 – 05.11.2026 – Interessenprofil: Kunst, Geschichte, Aussicht; keine Doppelten

Wunsch Nutzer: Ich mag Museen, Aussichtspunkte, Geschichtliches, Kunstmuseen und UNESCO-Stätten. Die Sterne sollen das widerspiegeln. Festes Profil im Code (keine Regler), erst gemessen (Lausanne, Basel), dann eingebaut.

- **Profil** (`config.json` → `verzeichnis.profil`, wird zu den Punkten eines Ziels addiert; die Klassen sind die englischen Wikidata-Bezeichnungen):
  - Kunstmuseum +1,5 (Klasse „art museum“, Fotografie-, Design-, Kunstsammlung; **private Galerien („art gallery“) bekommen nichts**).
  - Geschichtsmuseum +1,5 (Geschichte, Archäologie, Völkerkunde, Jüdisches Museum, Heimatmuseum, Militär, Freilicht …). „Natural history museum“ zählt **nicht** als Geschichte.
  - Spezialmuseum −1,5 (Naturkunde, Zoologie, Geologie, Botanik, Technik, Comics, Spielzeug, Auto, Feuerwehr …), **nur bei weniger als 15 Sprachversionen**; bekannte wie das Olympische Museum (36) behalten ihre Punkte. Ein einfaches „Museum“ ohne weitere Klasse bleibt unverändert.
  - Burg, Schloss, Kloster, Herrenhaus, Ausgrabung und Stadttor (Turm mit Klasse „city gate“) +1.
  - Aussichtspunkt +2 (Klasse viewpoint/observation tower/…). Aus OSM kommt es beim Länderbau dazu: Ein OSM-Aussichtspunkt mit Wikidata-Nummer hebt den Verzeichniseintrag mit dieser Nummer um +2 (nur einmal; `core.applyViewpoints`, aufgerufen von `tools/paket.mjs`).
  - UNESCO und die Seitenaufrufe bleiben wie bisher.
- **Doppelte**: Zwei Einträge im Abstand von höchstens 60 m (`doppelt_nah_m`) mit einem gemeinsamen langen Wort (7+ Buchstaben, ohne Allerweltswörter wie „Museum“, `doppelt_ignorieren`) gelten als ein Ort, der niedrigere fällt weg. Beispiel: „Fondation de l’Hermitage“ und „Hermitage Foundation collection“ (6 m).
- **Kirchen**: keine Sonderregel (in der Messung hat sie nichts bewirkt; Denkmalstatus trennt in der Schweiz fast nichts).

### Gemessen (GitHub Actions, Wikidata live, 3 km um die Stadtmitte; Messprogramme `tools/rang-probe.mjs`, `tools/profil-probe.mjs`)

- **Lausanne**: Sterne 0/1/2/3 von 135/5/5/1 auf 129/5/9/3. Art Brut ★★★ (11,1), Photo Elysée, Beaux-Arts, mudac, Hermitage ★★; Archäologisches Museum, Schloss Ouchy, Beaulieu ★★; Historisches Museum, Römermuseum ★. Zoologiemuseum ★ → 0. Olympisches Museum bleibt ★★ (10,2).
- **Basel**: Sterne 0/1/2/3 von 558/8/9/3 auf 557/7/8/6 (der Test rechnete den Zoo mit falscher Schwelle; im Bau bleibt er ★★★). Kunstmuseum, Tinguely, Kunsthalle, Antikenmuseum ★★★.
- **Seitenaufrufe** sind bereits im Rang (Gewicht 1,5 × log₁₀(Aufrufe/Tag + 1), 30 Tage, für die besten Kandidaten je Kachel). Fehlende Messungen würden in Lausanne keinem Ziel einen Stern bringen (Gewinn höchstens +2,7 Punkte, ein Stern braucht 7,5).
- **Wikivoyage** (Lausanne, de/en/fr): nur etwa 15 bis 35 Einträge, die meisten schon im Verzeichnis, kaum Text. Nicht eingebaut.

### Annahmen/Abweichungen

- **Ältere Kacheln**: Das Verzeichnis im Handy und die Länderpakete tragen die Punkte, mit denen sie gebaut wurden. Das Profil wirkt erst für neu geladene Kacheln und neu gebaute Pakete. **Die Schweiz muss neu gebaut werden** (Menü → Daten → Schweiz → „Neu bauen“, dann „Aktualisieren“).
- Aussichtspunkte **ohne** Wikidata-Nummer (Esplanade de Montbenon, Pfalz in Basel) bekommen keinen Rang; es fehlt jedes Signal. Sie bleiben graue OSM-Ringe. Auch der Sauvabelin-Turm (6,1 Punkte) bekommt dadurch keinen Stern (Schwelle 7,5).
- „Art Brut“ und „Château de Beaulieu“ (40 m) sind vermutlich dasselbe Gebäude, werden aber nicht zusammengelegt (kein gemeinsames Wort). Kunstmuseum Basel mit Hauptbau und Neubau werden zusammengelegt, wenn sie innerhalb von 60 m liegen.
- Das Profil ist ein Startwert aus drei Messungen (Lausanne, Basel); die Klassenlisten sind aus den Wikidata-Bezeichnungen dieser beiden Städte abgeleitet und können in anderen Ländern Lücken haben (z. B. nicht-englische Bezeichnungen). Anpassen in `config.json`.
- Der Test mit den Schweizer Daten der echten App steht noch aus: erst nach dem Neubau der Schweiz zu prüfen (diag.html f1–f3).
- Ein GitHub-Pages-Deployment hing am 5.11. (Zeitüberschreitung bei GitHub), betraf nur Tests/Workflows, nicht die App.

## v0.15.0 – 05.11.2026 – Bauen per Knopf in der App

Wunsch Nutzer: Länder nicht mehr über die GitHub-Seite bauen lassen, sondern „alles per Knopfdruck“; den GitHub-Schlüssel irgendwo sicher ablegen (Skripteigenschaften bei Google Apps Script).

- **Ablauf**: App → Menü → Daten → Länderpakete → „Bauen“ beim Land → Bestätigen. Das Google-Skript des Nutzers startet den GitHub-Workflow `paket.yml` mit dem gewählten Land. Die App fragt über dasselbe Skript alle 30 Sekunden nach dem Lauf und zeigt: „Wird gestartet“, „Wartet auf GitHub“, „Wird gebaut seit N Min.“, „Gebaut, wird veröffentlicht“ und dann „<Land> ist fertig gebaut“ mit dem Knopf „Herunterladen“. Bei einem Fehler steht „Bau fehlgeschlagen“ mit Link zum Protokoll.
- **Sicherheit**: Der GitHub-Schlüssel (fein abgestufter Token, nur dieses Repository, nur „Actions: Lesen und Schreiben“) steht nur in den Skripteigenschaften des Google-Skripts. In der App und im Repository steht er nicht. Die App kennt nur die Adresse des Skripts und die PIN, beides nur im Handy (`localStorage`, Schlüssel `rf.bau`). Das Skript prüft die PIN und lässt nur den Start von `paket.yml` (mit einer Länderwahl, die GitHub gegen die Liste prüft) und das Lesen der letzten Läufe zu.
- **Einrichten in der App**: Menü → Daten → ganz unten „⚡ Bauen per Knopf“: Adresse (Web-App-URL, endet auf /exec) und PIN eintragen, „Speichern und testen“. Gespeichert wird erst, wenn der Test klappt (falsche PIN oder fremde Adresse werden abgelehnt). „Entfernen“ löscht beides. Ohne Einrichtung bleibt alles wie in v0.14.0 (Link „Bauen ↗“ zur GitHub-Seite).
- **Neu bauen**: Bei Ländern, die schon gebaut oder geladen sind, steht ein Knopf „Neu bauen“. Die App verfolgt immer nur einen Bau gleichzeitig (der Workflow selbst könnte mehrere).
- **Weiterverfolgen**: Der laufende Bau steht im Handy; schließt du die App und öffnest sie später, wird er weiter verfolgt. „Nicht mehr verfolgen“ bricht den Bau nicht ab, die App hört nur auf zu fragen.
- **Workflow**: `run-name: Länderpaket <Name> (<CC>)`, damit die App ihren Lauf in der Liste findet.
- **Google-Skript** (Code in der Antwort an den Nutzer, nicht im Repository, weil es ein Konto-Skript ist): Aktionen `bauen` (Land als „Name (CC)“) und `status` (letzte zehn Läufe), PIN-Prüfung mit 2 Sekunden Wartezeit bei Fehlern.

### Geprüft

- `tools/test.mjs` (Workflow hat den Laufnamen) und `tools/ui-test.mjs` mit einem **nachgebauten Skript** (Einrichten mit falscher/richtiger PIN, fremde Adresse, Start mit „Name (CC)“, Fortschritt, Weiterverfolgen nach Neuladen, „noch nicht veröffentlicht“, „fertig“, Fehlerfall, geänderte PIN, Entfernen).
- Echtes Google-Skript und GitHub: Nutzer hat das Skript eingerichtet, `?aktion=status` im Browser getestet („klappt alles“).

### Annahmen/Abweichungen

- **Nicht geprüft**: Ob Chrome auf dem Handy die Antwort des Google-Skripts aus der App heraus lesen darf (Weiterleitung auf script.googleusercontent.com). Das Skript antwortet mit `ContentService`, das ist der übliche Weg und in Chrome erlaubt; getestet habe ich es nur mit einem nachgebauten Skript. Geht es nicht, zeigt der Test beim Speichern „keine Verbindung zum Skript“, dann baue ich einen Umweg.
- Die PIN steht in der Adresszeile der Anfrage (GET), weil eine POST-Anfrage mit JSON in Chrome eine Vorabfrage braucht, die Google-Skripte nicht beantworten. Sie ist mit HTTPS verschlüsselt; wer die Adresse kennt, braucht trotzdem die PIN. Schlimmster Fall bei Missbrauch: jemand startet einen Länderbau.
- Zeitangaben „seit N Min.“ kommen vom GitHub-Zeitstempel; der Lauf wird zugeordnet, wenn er höchstens 3 Minuten vor dem Tippen gestartet wurde (Uhr des Handys gegen GitHub).
- Nach dem Ende des Laufs braucht GitHub Pages ein bis zwei Minuten, bis die neuen Dateien im Netz sind. Die App wartet darauf bis zu 10 Minuten und meldet dann erst „fertig“.
- Der GitHub-Token läuft nach der gewählten Frist ab (1 Jahr). Dann meldet das Skript „GitHub 401“; neuen Token in den Skripteigenschaften eintragen.

## v0.14.0 – 05.11.2026 – Länderpakete für ganz Europa: bauen lassen, herunterladen, aktualisieren, Grenzstädte

Wunsch Nutzer: Andere Länder Europas herunterladen können, so einfach wie möglich: bauen lassen, dann runterladen und aktualisieren. Städte wie Genf oder Basel sollen an der Grenze funktionieren.

- **Länderliste** in `config.json` (`paket.laender`): 41 Länder Europas (Albanien bis Zypern, ohne Russland, Türkei, Ukraine, Belarus: deren Auszüge sind sehr groß). Jedes Land mit ISO-Kürzel, deutschem Namen und dem Pfad des Auszugs bei Geofabrik. Alle 41 Pfade und `.poly`-Dateien existieren (geprüft mit dem Workflow „Geofabrik-Adressen prüfen“).
- **Bauen lassen** (Workflow „Länderpaket aufbereiten“, nur von Hand): auf GitHub „Run workflow“, **Land aus der Liste wählen**, „Run workflow“. Pro Land eine eigene Warteschlange, mehrere Länder gleichzeitig sind möglich. Am Ende speichert die Action das Paket auf main und schreibt die Liste der gebauten Länder (`docs/paket/laender.json`). Dauer: kleine Länder wenige Minuten, die Schweiz etwa 17 Minuten, Deutschland und Frankreich hochgerechnet 2 bis 4 Stunden.
- **App → Menü → Daten → Länderpakete**:
  - „Im Handy“: Stand, Größe, „Aktualisieren“ (meldet „aktuell“ oder lädt den neuen Stand), „Löschen“. Ist ein neuerer Stand gebaut, steht „Neuer Stand vom …“ dabei.
  - „Fertig gebaut – zum Herunterladen“: Datum, Anzahl Ziele, Download-Größe, „Herunterladen“ mit Fortschritt.
  - „Weiteres Land bauen lassen“: alle übrigen Länder mit „Bauen ↗“ (öffnet den Workflow auf GitHub) und eine kurze Anleitung; „Liste prüfen“ holt die Liste der gebauten Länder neu.
  - Die Zeile über der Karte fragt in einem gebauten, aber nicht geladenen Land „Paket … ins Handy laden?“ (das kleinste passende Land zuerst: Luxemburg vor Deutschland).
- **Paket in Teilen** (Format 2): `index.json` listet die Teile (`teil-001.json` …, je etwa 6 MB). So gibt es keine Datei über 100 MB (GitHub-Grenze) und das Handy muss nie ein ganzes großes Land auf einmal verarbeiten: jeder Teil wird gleich gespeichert. Format 1 (Schweiz vom 5.11.) bleibt lesbar.
- **Grenzstädte (Genf, Basel)**:
  - Das **Verzeichnis** (Wikidata) war schon bisher an der Grenze vollständig, auch der ausländische Teil.
  - Die **OSM-Kacheln** am Rand sind jetzt dabei (bisher fehlten sie, dort fragte die App Overpass): alle Kacheln, die das Land berühren, und jede Kachel mit Orten. Sie enthalten die Orte der eigenen Seite. Lädst du auch das Nachbarland, **ergänzen sich beide Pakete** in der Randkachel (die App führt die Orte zusammen, jeder Ort kennt sein Land). Löschen entfernt nur die Orte des gelöschten Landes.
  - Die Landesgrenze kommt aus OSM (`admin_level=2`), bei Ländern ohne passende Relation (z. B. Kosovo) aus der `.poly`-Datei.
  - Schneller Grenztest (Breitenstreifen), damit auch Deutschland rechenbar bleibt.
- **Nur die Schweiz** behält ihre OSM-Dateien im Repository (`docs/osm/ch`, die App nutzt sie auch ohne Paket); bei allen anderen Ländern steckt das OSM nur im Paket.
- **Speicher**: vor dem Laden fragt die App einmal, wenn nach ihrer Schätzung nicht genug Platz ist. Das Verzeichnis eines Landes wird nicht mehr komplett in den Arbeitsspeicher geladen, sondern erst, wenn es im Kartenausschnitt gebraucht wird.
- Neue Hilfsskripte: `tools/grenze.mjs`, `tools/paket-land.mjs`, `tools/paket-liste.mjs`; Workflow `geofabrik-test.yml`.

### Gemessen (GitHub und Chromium am PC, 5.11.2026)

- **Schweiz (Format 2)**: 2 Teile, 11,0 MB (gezippt beim Herunterladen 2,0 MB), 30 045 Ziele, 1 695 Orte. OSM: 25 528 Orte in 2 178 Kacheln, davon 459 Randkacheln (bisher 20 979 Orte in 1 708 Kacheln: die Randkacheln fehlten). Bau etwa 17 Minuten.
- **Liechtenstein**: 1 Teil, 0,3 MB, 1 148 Ziele, 173 OSM-Orte, Bau 66 Sekunden. **Luxemburg**: 1 Teil, 0,9 MB, 2 236 Ziele, 1 955 OSM-Orte. Drei Länder liefen gleichzeitig und schrieben ohne Fehler nach main (Länderliste `laender.json` jedes Mal neu erzeugt).
- **Messlauf Deutschland** (ohne Speichern, nur 20 von 1 216 Verzeichnis-Kacheln): Auszug 4,6 GB, Download 13 Minuten, OSM-Stufe 3 Minuten, Platz auf dem Rechner kein Problem (83 GB frei). 281 066 OSM-Orte in 20 288 Kacheln (1 157 am Rand), zusammen 49,7 MB (gezippt 12,5 MB); 20 Verzeichnis-Kacheln dauerten 3 Minuten, 60 241 Beschreibungen und Höhen in 5 Minuten. **Hochrechnung** für das ganze Land: etwa 100 bis 120 MB in 20 bis 25 Teilen (gezippt etwa 20 MB), Bau etwa 2 bis 4 Stunden.
- **Messlauf Frankreich** (ebenso): Auszug 4,8 GB, Download 8 Minuten. Die Landesgrenze fehlt als fertige OSM-Fläche im Auszug, das Skript nahm die `.poly`-Datei (der Ausweg hat funktioniert). 185 197 OSM-Orte in 37 742 Kacheln (1 388 am Rand), 29,4 MB; der Bau dauert hochgerechnet ähnlich lang wie Deutschland.
- **Geofabrik-Auszüge** (Größe der Quelldatei): Deutschland 4,6 GB, Frankreich 4,9 GB, Vereinigtes Königreich 2,2 GB, Italien 2,1 GB, Polen 2,0 GB, Spanien 1,4 GB; Liechtenstein 3 MB.
- **Mit den echten Paketen im Browser** (Schweiz, dann Liechtenstein; Wikipedia, Wikidata, Overpass gesperrt): Laden und Speichern der Schweiz in 1,0 s am PC (Arbeitsspeicher der Seite danach 38 MB). Genf, Basel, Lausanne, Chiasso und Schaan/Vaduz bei Zoom 12 und 15: Ziele sofort da, keine Frage „Details laden?“ oder „Gegend laden?“, **0 Anfragen ins Internet**, keine Fehler. Die Randkacheln von Genf-Zentrum (505 Orte) und Basel-Zentrum (304 Orte) sind im Paket. Jenseits der Grenze (Frankreich, Deutschland) kommen die grauen OSM-Ringe erst mit dem Paket des Nachbarlandes.
- **Nachbarländer an der Grenze** werden mit synthetischen Daten geprüft (zwei Länder teilen eine OSM-Kachel und eine Verzeichnis-Kachel: beide Seiten da, Löschen entfernt nur die eigene Seite).

### Annahmen/Abweichungen

- Die App löst den Bau nicht selbst aus: dafür wäre ein GitHub-Schlüssel im Browser nötig (nach der Regel „keine Schlüssel im Browsercode“ ausgeschlossen). „Bauen ↗“ öffnet deshalb GitHub; dort sind zwei Tipps nötig (Land wählen, „Run workflow“). Das lässt sich nicht weiter vereinfachen.
- GitHub Pages ist auf etwa 1 GB begrenzt. Ein Land belegt mit Teilen grob 10 MB (Schweiz) bis geschätzt 100 MB (Deutschland, Frankreich). Alle 41 Länder zusammen würden das Limit sprengen; bau nur, was du brauchst.
- Große Länder (Deutschland, Frankreich, Italien, Spanien, Polen, Vereinigtes Königreich) habe ich nicht ganz gebaut, nur Deutschland und Frankreich als Messlauf mit 20 Verzeichnis-Kacheln (siehe oben). Die Zeitgrenze des Laufs ist 350 Minuten; bei Deutschland und Frankreich rechne ich mit 2 bis 4 Stunden. Ob Wikidata dabei durchgehend antwortet, zeigt erst ein ganzer Lauf.
- Randkacheln: Fehlt das Nachbarland im Handy, fehlen in der Randkachel die grauen OSM-Ringe jenseits der Grenze (die Wikidata-Ziele dort sind da).
- Gehört ein Ort in beiden Auszügen vor, gilt der Treffer des zuerst geladenen Landes; wird dieses Land gelöscht, fehlt dieser eine Ort bis zur nächsten Aktualisierung des anderen.
- Auf dem Handy noch nicht geprüft: Herunterladen und Speichern der Teile, Dauer, Genf und Basel mit echten Daten (am PC im Browser geprüft, siehe unten).

## v0.13.5 – 05.11.2026 – Neue Prompts nach bewährten Regeln: „Erzähl mir davon“ und „Lohnt sich der Besuch?“

Wunsch Nutzer: Die Prompts sollen allgemein gelten, möglichst kurz sein und gut funktionieren. Anlass: Test mit der Maison de l'Estérel (Lausanne). Der Prompt aus v0.13.4 erzeugte schon einen guten Hörtext; die Prüfung der Antworten (Wikipedia, Wikidata, Fotos, Suchtreffer) zeigte Verbesserungen bei Reihenfolge, Quellenvermerk und Ausschmückung.

- **Erzähl mir davon** (`erzaehlen.vorlage`; ohne Quelltext etwa so lang wie in v0.13.4, trotz der neuen Regeln für Quellen und Reihenfolge):
  - Rolle und Aufgabe zuerst, „du“, der Text wird vorgelesen.
  - Daten (Ort, Wo, Art, Länge, Schwerpunkt) getrennt von den Regeln. Länge ist ein Höchstwert („lieber kürzer als aufgefüllt“).
  - Quellen: Quelltext nur Grundlage, Websuche erlaubt; nur sagen, was in einer Quelle steht (auch zum Aussehen); Namen, Schreibweisen und Schutzstatus genau übernehmen, nichts steigern; „laut …“, wenn nur eine Quelle etwas behauptet oder etwas als einmalig bezeichnet; Unsicheres weglassen.
  - Feste Reihenfolge: 1. ein Satz, was es ist; 2. alles von außen, jeweils mit Seh-Anweisung; 3. Geschichte (wer, wann, warum) mit einem überraschenden Detail, das in einer Quelle steht; 4. Inneres und ob man hinein darf.
  - Stil positiv formuliert: kurze Sätze (höchstens 20 Wörter), jeder Satz bringt eine Tatsache, Zahl, einen Namen, eine Geschichte oder eine Seh-Anweisung; sachlich, ohne Prospektsprache (Verbotsliste nur beispielhaft); Fachbegriffe in eigenen Worten erklären; Zahlen ausgesprochen; kein Schlussappell, keine Rückfrage, keine Quellenliste.
  - Quelltext am Ende, danach die Startanweisung „Beginne jetzt direkt mit dem gesprochenen Text.“ Kein Beispielsatz mehr (die KI schrieb ihn sonst ab).
  - Längenangaben: kurz etwa 1 Minute (ca. 150 Wörter), normal etwa 3 Minuten (ca. 450), ausführlich etwa 7 Minuten (ca. 1000).
- **Lohnt sich der Besuch?** (`besucher.vorlage`): gleiche Regeln für Quellen und Stil, feste Gliederung mit genau zwei Abschnitten (Urteil Ja/Bedingt/Eher nicht mit kurzer Begründung; praktische Tipps in 5–8 Stichpunkten), „nicht gefunden“ statt Erfindungen, Quelle bei Zahlen und Urteilen, Stand bei Öffnungszeiten und Preisen, keine Rückfrage, Startanweisung mit der ersten Überschrift.

### Geprüft: Maison de l'Estérel (Lausanne)

- Die französische Wikipedia hat nur einen Stummel (zwei Sätze), deutsch und englisch gibt es nicht. Die Details kamen aus anderen Quellen (Inventar der Kulturgüter, notreHistoire mit Zitat aus einem Fachbuch über Treppenhäuser, 24heures, Fotograf, AGORHA). Deshalb ist die Websuche im Prompt der entscheidende Teil.
- Zwei Fotos (Wikimedia Commons) bestätigen: Schmiedeeisengitter an den Balkonen, Fensterrahmungen und Bauschmuck, Eckerker, Läden im Erdgeschoss.
- Neues Hilfsmittel: GitHub-Workflow „Faktencheck (Ort)“ (`tools/fakten-probe.mjs`, nur von Hand): holt Wikipedia-Volltext, Wikidata, Webseiten/PDFs und Commons-Fotos in das Protokoll.

### Annahmen/Abweichungen

- Die Wirkung der neuen Prompts auf die Antwort der KI-App ist nicht von hier prüfbar; hier geprüft ist nur der erzeugte Prompt-Text (Tests). Die Abnahme steht in `diag.html` (q13, q14).
- Die KI-App kann bei einzelnen Punkten trotzdem abweichen; „laut …“ und „weglassen“ sind Regeln, keine Garantie.
- Der Prompt für die Google-Frage (v0.13.2) bleibt, wie er ist.

## v0.13.4 – 05.11.2026 – „Erzähl mir davon“: mehr Details, mit Websuche, anschaulich zum Vorlesen

Beobachtung Nutzer (Maison de l'Estérel, Lausanne): „Erzähl mir davon“ lieferte wenig, weil der Wikipedia-Text kurz war und der Prompt nur den Quelltext erlaubte; Google (KI-Modus) fand mit Websuche viel mehr. Die KI-Apps des Nutzers dürfen ins Internet.

- **Neuer Prompt** (`config.json` → `erzaehlen.vorlage`, gilt für alle drei Stufen):
  - Der Quelltext ist nur die Grundlage. Die KI soll zusätzlich im Internet nach verlässlichen Informationen suchen (Wikipedia in anderen Sprachen, Denkmal- und Kulturgüterverzeichnisse, offizielle Website, lokale Geschichtsseiten) und die interessantesten Details bringen: Baujahr, die Menschen dahinter, Hintergründe, Geschichten, was man anschauen kann.
  - Bei Widersprüchen oder Unsicherheit: weglassen oder „angeblich“; nichts erfinden.
  - Zum Vorlesen: gesprochener Text in ganzen Sätzen, keine Listen, Überschriften, Klammern. Anschaulich und lebendig wie ein guter Stadtführer, mit Vergleichen und Bildern, nicht wie ein Lexikon. Beginn mit einem Satz, der hilft zu erkennen, was man vor sich hat.
  - Schwer verständliche Fachbegriffe, Stilbezeichnungen und fremde Wörter werden beim ersten Vorkommen kurz in einfachen Worten erklärt. Zahlen und Jahreszahlen so, wie man sie spricht.
  - Am Ende keine Quellen und keine Rückfrage.
- **Längen** (mehr Details): kurz etwa 1 Minute (ca. 150 Wörter, vorher 30 Sekunden/80), normal etwa 3 Minuten (ca. 450, vorher 300), ausführlich etwa 7 Minuten (ca. 1000, vorher 750).
- **Ohne Wikipedia-Artikel**: der Prompt sagt jetzt „Suche selbst im Internet; findest du nichts Verlässliches, sage das offen und erfinde nichts“ (vorher nur „sage das offen“).

### Annahmen/Abweichungen

- Ob die KI-App wirklich sucht, hängt von der App und ihrer Einstellung ab (der Nutzer sagt: sie darf). Bei Orten ohne Netzfund bleibt es bei dem, was im Quelltext steht.
- Nicht gebaut: den Quelltext verbessern. Bei Orten aus dem Paket oder aus OSM nimmt die App die erste vorhandene Sprache (de, en, fr, it, es, nl), nicht die längste; bei „Hier suchen“-Treffern wählt sie die längste. Das lässt sich noch angleichen.
- Prüfung hier nur am Prompt-Text (Tests); wie gut die Antwort auf dem Handy klingt, zeigt erst der Test dort.

## v0.13.3 – 05.11.2026 – Schlankes Ortsfenster, „Lohnt sich der Besuch?“

Wunsch Nutzer (nach Test auf dem Pixel): Name per langem Tippen kopieren, Knöpfe niedriger, weniger Knöpfe und Blöcke, der Besuchs-Prompt nur noch für „lohnt es sich?“ und praktische Tipps.

- **Name kopieren**: langes Tippen auf den Namen oben im Ortsfenster kopiert ihn (kurze Vibration, Meldung „Kopiert: …“). Der Knopf „Name kopieren“ ist weg.
- **Weg aus dem Ortsfenster**: „Als gehört markieren“ (Erzähl mir davon markiert den Ort weiter selbst als gehört, die Liste zeigt „✓ gehört“ wie bisher), „Pin“, „🖼 Bilder“, „Warum … Stern?“ und „Wikipedia-Einleitung“. Der Wikipedia-Knopf erscheint wie bisher nur, wenn es einen Artikel gibt.
- **Niedrigere Knöpfe**: normale Knöpfe 40 statt 48 px, die großen 42 statt 54, Umschalter und Auswahl 38 statt 44, kleinere Abstände.
- **„👍 Lohnt sich der Besuch?“** (vorher „📋 Übersicht und Bewertung“): der Prompt fragt nur noch nach dem Urteil (Ja / Bedingt / Eher nicht, mit kurzer Begründung aus den Bewertungen) und nach praktischen Tipps für den Besuch (Anfahrt, Eintritt und Öffnungszeiten mit Stand, Zeitbedarf, beste Zeit, worauf achten). Keine Tabelle, keine weiteren Abschnitte, keine Rückfrage am Ende. Text und Knopfname in `config.json` unter `besucher`.

### Annahmen/Abweichungen

- Kopiert wird der angezeigte Name (bei langen Namen die gekürzte Form). Vorher kopierte der Knopf „Name, Ort“.
- Die Sterne-Begründung („Warum …?“) ist nirgends mehr zu sehen; die Sterne-Zeile („Ohne Stern“ usw.) bleibt.
- Die „Bilder“-Suche ist komplett weg; `googleLinks` liefert sie noch, die App zeigt sie nicht.
- Auf dem Handy noch nicht geprüft: das lange Tippen auf den Namen (Chrome kann dabei die Textauswahl anbieten; ich habe die Auswahl am Namen abgeschaltet).

## v0.13.2 – 05.11.2026 – Google-Frage: kurz, nur „Keine Rückfrage am Ende“

Wunsch Nutzer: Der lange Auftrag war zu lang (man musste scrollen). Endgültiges Format: „Was ist „Parc Pidoux“ in Chavannes-près-Renens (Waadt)? Keine Rückfrage am Ende“. Aufbau und Länge der Antwort entscheidet Google.

- `config.json` → `google.auftrag` ist jetzt nur noch „Keine Rückfrage am Ende“.

### Annahmen/Abweichungen

- Ob Google bei dieser kurzen Frage die Meldung „Mit dieser Suche fortfahren?“ zeigt, ist nicht geklärt (nicht getestet).
- Das Ergebnis der „Bilder“-Suche ändert sich nicht.

## v0.13.1 – 05.11.2026 – Google-Frage: gegliederte Übersicht statt Fließtext

Wunsch Nutzer: Die Frage bleibt „Was ist „Name“ in Ort (Kanton)?“, die Antwort soll eine gute Übersicht sein, kein Fließtext, ohne Rückfrage am Ende.

- Der Auftrag hinter der Frage (`config.json` → `google.auftrag`) lautet jetzt: gut gegliederte Übersicht mit kurzen Zwischenüberschriften (z. B. Art, Lage, Besonderheiten, Besuch) und knappen Stichpunkten, kein Fließtext, nicht länger als ein Bildschirm, keine Rückfrage, keine Vorschläge. „Höchstens 6 Sätze“ entfällt.

### Annahmen/Abweichungen

- Google zeigte bei der Frage mit dem langen Auftrag die Meldung „Mit dieser Suche fortfahren?“ (Tipp auf „Ja, weiter“). Ob sie auch ohne Auftrag kommt, ist nicht geklärt; der Auftrag ist wieder dabei, weil du Struktur und keine Rückfrage willst. Kommt die Meldung nur wegen des Auftrags, lässt sich `auftrag` in der `config.json` leeren.
- Wie Google den Auftrag umsetzt (Überschriften, Länge), sieht man erst beim Ausprobieren.

## v0.13.0 – 05.11.2026 – Beschreibung für jeden Punkt, Google-Knöpfe im Fenster

Wunsch Nutzer: Wer einen Punkt wie „Crêt des Alouettes“ antippt, soll erfahren, was das ist. Steht nichts in den Daten, soll Google helfen (Fenster, das man wieder schließt). Die Informationen kommen schon in die Download-Datei.

- **Paket mit Beschreibungen** (`info` in `paket.json`, gebaut von `tools/paket.mjs`): zu jeder Wikidata-Nummer im Paket (Verzeichnis und OSM-Punkte) eine Zeile aus Wikidata, auf Deutsch, sonst Englisch, plus die Höhe (P2044), z. B. „Berg in der Schweiz · 1 054 m“. Das Paket muss dafür neu gebaut werden (Action „Länderpaket aufbereiten“), danach in der App „Aktualisieren“.
- **Anzeige**:
  - Liste im Kartenausschnitt: unter dem Namen eine graue Zeile mit dieser Beschreibung (nur wo es eine gibt, auch ohne Internet).
  - Ortsfenster: ist kein Wikipedia-Text da, steht dort dieselbe Zeile; bei OSM-Punkten die Beschreibung aus OSM und die Höhe aus dem OSM-Tag `ele` (6826 OSM-Punkte haben eine).
  - Weiß weder das Paket noch Wikipedia etwas, steht dort „Keine Beschreibung gefunden.“, statt einer leeren Fläche.
- **Google-Knöpfe im Ortsfenster** (immer): „✨ Google fragen“ öffnet Googles KI-Modus mit der Frage „Was ist „Name“ in Ort (Kanton)? Antworte kurz in höchstens 6 Sätzen auf Deutsch. Stelle am Ende keine Rückfrage und mache keine Vorschläge.“ und „🖼 Bilder“ die Google-Bildersuche mit Name, Ort und Kanton. Ort und Kanton holt das Fenster beim Öffnen mit einer Anfrage an Nominatim (wie bei „Hier suchen“); ohne Internet stehen die Koordinaten in der Frage. Frage und Auftrag stehen in `config.json` unter `google`. Hat der Ort keinen Wikipedia-Artikel, stehen die Knöpfe direkt unter dem Text, sonst weiter unten bei den anderen Knöpfen.
- **Fenster zum Schließen**: Google- und Wikipedia-Knöpfe sind normale Links mit `target="_blank"`. Auf Android öffnet das ein Chrome-Fenster über der App (✕ oder Zurück schließt es, die App ist wieder da); als normaler Chrome-Tab bleibt der neue Tab offen. Auf dem Handy noch nicht geprüft.
- Hinweis `diag.html`: neue Abnahme-Punkte q1–q6.

### Annahmen/Abweichungen

- Der Google-Parameter `udm=50` (KI-Modus) ist von Google nicht dokumentiert und kann sich ändern; dann zeigt Google die normale Suche mit der ganzen Frage. In `config.json` lässt sich `ki_param` leeren.
- Google hält sich an die Anweisung „keine Rückfrage“ nicht garantiert; die Antwort kann die App nicht lesen (technisch und nach Googles Bedingungen nicht möglich), sie reicht nur die Frage weiter.
- Die Wikipedia-Suche nach dem Namen habe ich nicht eingebaut (gemessen: falsche Treffer, z. B. ein anderes „Crêt des Alouettes“ in Frankreich). Commons-Fotos aus der Umgebung auch nicht (sie zeigten die Orbe-Quelle, nicht den Berg).
- „Lage zur nächsten Stadt“ gibt es nicht (dein Wunsch).
- Die Zeile kommt nur zu Punkten mit Wikidata-Nummer (oder OSM-Beschreibung); reine OSM-Punkte ohne beides bekommen „Keine Beschreibung gefunden.“.
- Das Paket ist größer geworden: 10,7 MB (vorher 8,7 MB), beim Herunterladen gezippt 1,9 MB (vorher 1,5 MB). Davon sind 1,8 MB die Beschreibungen.

### Gemessen (GitHub, 5.11.2026)

- Bau: 12 Minuten. 114 Verzeichnis-Stücke ohne Fehler, 30 048 Ziele und 1695 Orte, 20 979 OSM-Punkte.
- Beschreibungen: 32 278 von 33 496 Wikidata-Nummern haben eine Beschreibung oder Höhe (32 059 Beschreibungen, 15 272 Höhen), 0 Abfragen ohne Antwort. Im Verzeichnis haben 31 726 von 32 820 Einträgen eine Zeile, bei den OSM-Punkten mit Wikidata-Nummer 8128 von 8316.
- Mit dem echten Paket in Chromium (ohne Wikipedia, Wikidata und Nominatim): Crêt des Alouettes zeigt in der Liste und im Fenster „Berg in der Schweiz · 1 068 m“, dazu beide Google-Knöpfe; ohne Ortsnamen enthält die Frage die Koordinaten. Die Höhe 1068 m stammt aus dem normierten Wert in Wikidata; Google nennt in deinem Screenshot dieselbe Zahl.

## v0.12.0 – 05.11.2026 – Länderpaket Schweiz: Sehenswürdigkeiten sofort, ohne Nachladen

Wunsch Nutzer: Die Karte kommt online, aber alles, was darüber liegt (Sehenswürdigkeiten), liegt im Handy und ist sofort da. Fotos und Wikipedia-Texte dürfen beim Antippen geladen werden. Paket mit einem Klick herunterladen und aktualisieren. Zoom anzeigen. Keine Offline-Vektorkarte.

- **Länderpaket** (`docs/paket/ch/paket.json`, gebaut von der GitHub Action „Länderpaket aufbereiten“, `.github/workflows/paket.yml`, nur von Hand):
  - Verzeichnis: alle 0,25°-Stücke, die die Schweiz berühren. Darin steht dasselbe, was das Handy sonst bei „Gegend laden“ holt: Wikidata, Seitenaufrufe, Wikivoyage, Sterne-Punkte. Bei Grenzstücken auch der ausländische Teil, Genf sieht also auch Frankreich.
  - OSM-Punkte aus dem Geofabrik-Auszug, wie in v0.11.
  - **Gemessen** (GitHub, 5.11.2026): 114 Verzeichnis-Stücke ohne einen Fehler, 30 044 Ziele (★★★ 34, ★★ 157, ★ 376) und 1694 Orte, dazu 20 979 OSM-Punkte. Das Paket ist 8,3 MB groß, gezippt beim Herunterladen 1,5 MB. Der Bau dauert 8–16 Minuten.
  - Die besten Ziele: Reichenau, Pfahlbauten, Fürstabtei St. Gallen, Le Corbusier, Lavaux, Schloss Habsburg, Schloss Chillon, Palais des Nations, Bundeshaus, Fondation Beyeler.
- **App**:
  - In der Schweiz fragt die Zeile über der Karte einmal: „Paket Schweiz ins Handy laden?“ (Laden / ✕).
  - Menü → Daten zeigt Stand, Größe und die Knöpfe „Herunterladen“, „Aktualisieren“ und „Löschen“. „Aktualisieren“ ist ein Tipp: Ist das Paket auf der Webseite gleich, steht „aktuell“, sonst lädt es mit Fortschritt.
  - Im Paketgebiet gibt es keine Frage „Details laden?“ oder „Gegend laden?“ mehr. Die Karte zeigt bei jedem Zoom sofort, was lohnt; ab Zoom 15 auch die grauen OSM-Ringe aus dem Paket.
  - Antippen lädt Wikipedia-Text und Bild (online). Ein OSM-Ring öffnet seinen Ort.
  - Die Liste folgt dem Kartenausschnitt („Lohnt am meisten“, „Weitere“), solange keine Suche die Kartenmitte abdeckt.
  - Die Stücke des Pakets veralten nicht (keine 30-Tage-Grenze). Das Handy bittet Chrome, den Speicher dauerhaft zu behalten.
  - „Hier suchen“ (im Menü) gibt es weiter, für Kurzinfos in der Liste und für Orte außerhalb des Pakets.
- **Zoom und Maßstab** unten rechts auf der Karte („Zoom 13“).

- **Geprüft mit dem echten Paket** (Chromium, ohne Wikipedia/Wikidata/OSM): Laden und Speichern 0,5 s am PC. Bei Zoom 9, 12 und 15 in Lausanne, Morges, Genf, Le Brassus, Bern und Zürich sofort die Ziele, null Anfragen ins Internet, keine Fehler.
  - Beispiele: Lausanne Zoom 12 Kathedrale, Olympisches Museum, Art Brut; Morges Zoom 12 Schloss Vufflens, Schloss Morges; Le Brassus Espace Horloger, Audemars Piguet Museum; Bern Bundeshaus, Münster.
  - Gefunden und behoben: Bei Zoom 9 fragte die Zeile noch „Gegend laden?“ wegen des ausländischen Rands; im Paketgebiet kommt jetzt keine Frage.

### Annahmen/Abweichungen

- In Städten sind bei Zoom 15 die 30 Plätze meist mit Wikipedia-Zielen belegt, die grauen OSM-Ringe erscheinen dann kaum (in Morges 6, in Lausanne 0). So ist es gewollt (Wikipedia vor OSM, nicht zu viel). Auf dem Dorf füllen die Ringe auf.
- Genf und Basel: Das Verzeichnis enthält auch den ausländischen Teil; nur die OSM-Ringe fehlen dort in Grenzstücken (wie besprochen „erstmal lassen“).
- Auf dem Handy noch nicht gemessen: Herunterladen (1,5 MB) und Speichern dürften einige Sekunden dauern.
- Punkt 2 deiner Nachricht („Liebe offl8ne Vektor Karte“) habe ich als „lieber keine Offline-Vektorkarte“ gelesen, weil du die Karte online willst. Die Karte bleibt online.
- Kurzinfos stehen nicht im Paket, sie kommen wie Wikipedia-Texte beim Antippen (du hattest „on demand“ erlaubt). Die Liste zeigt im Paketgebiet darum Name, Art und Ort ohne Kurzinfo.
- Außerhalb der Schweiz bleibt alles wie in v0.11.1.

## v0.11.1 – 04.11.2026 – OSM-Daten nur von Hand erneuern

Wunsch Nutzer: kein automatisches Update, nur wenn er es anstößt.

- Die GitHub Action „OSM-Daten aufbereiten“ läuft nicht mehr jeden Monat, nur noch von Hand (github.com → Actions → „OSM-Daten aufbereiten“ → „Run workflow“, oder Menü → Daten → „Neu aufbereiten ↗“).
- Die App schaut nicht mehr von selbst nach neuen Daten (`osm.dateien_pruefen_h: 0`). Nur beim allerersten Start holt sie den Stand einmal, danach nur mit Menü → Daten → „Jetzt prüfen“.
- Die Schweiz wurde einmal aufbereitet (siehe unten).

## v0.11.0 – 04.11.2026 – OSM für die Schweiz als Dateien (ohne Overpass), Menü „Daten“

Wunsch Nutzer: Die OSM-Server sind ständig überlastet; erst nur die Schweiz; im Menü sehen, von wann die Daten sind, und aktualisieren können.

- **OSM für die Schweiz aus Dateien**: Die GitHub Action „OSM-Daten aufbereiten“ (`.github/workflows/osm-daten.yml`) holt den Schweiz-Auszug von Geofabrik und filtert die Sehenswürdigkeiten mit denselben Filtern wie die App (`config.json` → `osm.filter`). Sie legt Kacheln wie im App-Speicher ab: `docs/osm/ch/<kachel>.json` plus `index.json` mit dem Stand der Daten.
  - Im Messlauf dauerte das für die ganze Schweiz etwa 1 Minute: 25 528 Orte, 3,9 MB, gezippt 1,1 MB; Waadt 4176 Orte, 0,7 MB.
  - Läuft von Hand: github.com → Actions → „OSM-Daten aufbereiten“ → „Run workflow“ (in v0.11.0 zuerst auch monatlich, seit v0.11.1 nicht mehr).
  - Nur Kacheln, die ganz in der Schweiz liegen (Grenze von Geofabrik), kommen aus Dateien. Kacheln über die Grenze (Genf–Frankreich, Basel) lädt die App wie bisher über Overpass.
- **App**:
  - Für die Schweiz fragt sie kein Overpass mehr. OSM ist nach Sekunden da, auch bei Zoom 12 (die Grenze `osm.max_kacheln` gilt nur noch für Kacheln ohne Datei).
  - Gespeicherte Kacheln gelten, solange der Stand gleich ist. Kommen neue Daten, lädt sie die App beim nächsten Mal nach.
  - Ob es neue Daten gibt, schaute die App in v0.11.0 einmal am Tag nach (seit v0.11.1 nur mit „Jetzt prüfen“).
- **Menü → „Daten“**:
  - zeigt „Schweiz: Daten vom … · N Orte“ und wann das Handy zuletzt geprüft hat;
  - „Jetzt prüfen“ holt den neuesten Stand;
  - „Neu aufbereiten ↗“ öffnet die Action auf GitHub (dort „Run workflow“);
  - darunter das Verzeichnis (Wikidata) mit Stand und „Verzeichnis löschen“.
- Der Service Worker legt die OSM-Dateien nicht in seinen App-Speicher; die App speichert sie selbst (wie bisher die Overpass-Antworten).

### Annahmen/Abweichungen

- „Daten aktualisieren“ im Handy heißt: neuesten Stand von GitHub holen. Die Aufbereitung selbst läuft auf GitHub. Vom Handy aus geht das nur über den Link, weil die App keinen GitHub-Schlüssel haben darf.
- Bis die Action zum ersten Mal gelaufen ist, gibt es noch keine Dateien; dann bleibt alles wie in v0.10.0 (Overpass).
- Der Stand ist der Zeitstempel des Geofabrik-Auszugs (meist vom Vortag).
- Außerhalb der Schweiz, auch in Grenzkacheln, bleibt Overpass mit seinen Wartezeiten.

## v0.10.0 – 04.11.2026 – Auf einen Blick: was lohnt; ein Knopf auf der Karte

Wünsche Nutzer (Ingolstadt): Nach OSM ist alles ★ und das Wichtige geht unter; erkennen, was einen Wikipedia-Artikel hat; zu viele Knöpfe; „auf einen Blick will ich wissen, was lohnt und was nicht – nicht zu viel und nicht zu wenig“; Kurzinfo „Es wurde am 23.“.

- **Fehler aus v0.9.3 behoben**: Wikipedia-Ziele bekamen die strengen Verzeichnis-Sterne (meist keinen), reine OSM-Einträge aber weiter bis ★. Jetzt bekommen **OSM-Einträge ohne Wikipedia-Artikel nie Sterne** und stehen **immer hinter** den Wikipedia-Zielen (Karte und Liste).
- **Hervorhebung nach Ausschnitt** (die Sterne bleiben ein Maßstab für ganz Europa):
  - die besten 5 im Ausschnitt: größerer Punkt, fetter Name;
  - die nächsten bis 15: normaler Punkt mit Name;
  - der Rest bis 30: kleiner Punkt ohne Namen (antippen geht);
  - OSM ohne Wikipedia: kleiner grauer Ring ohne Namen.
  - Gilt auch weiter draußen (Orte und Ausflugsziele). Einstellbar: `marker.top`, `marker.mit_name`, `marker.max_sichtbar`.
- **Wikipedia ja/nein erkennen**: gefüllter Punkt mit Symbol = Wikipedia-Artikel; grauer Ring = nur OpenStreetMap. In der Liste sind OSM-Einträge grau, das Kästchen W / OSM / W+OSM bleibt.
- **Liste in Abschnitten**: „Lohnt am meisten“ (die ersten 5), „Weitere“, am Ende „Weitere (nur OpenStreetMap, ohne Wikipedia)“.
- **Filter am Anfang „Alle Orte“** (vorher „ab ★“), weil die Hervorhebung zeigt, was lohnt. Wer schon einen Filter gewählt hat, behält ihn.
- **Ein Knopf auf der Karte** (☰ oben rechts). Das Menü enthält: Hier suchen, Ort suchen, Mein Standort, Merkliste, Strecke, Liste aus-/einblenden, Einstellungen. Die Zahl der gemerkten Orte steht am Menüknopf.
- **Die Zeile über der Karte fragt**: weit draußen „Gegend laden?“, nah dran „Details laden?“, jeweils mit „Laden“ und ✕. ✕ bei „Gegend laden?“ gilt, bis ein anderer Teil fehlt.
- **Kurzinfo**: Wikipedia schnitt die Einleitung selbst nach „3 Sätzen“ ab und hielt „23.“ für ein Satzende. Jetzt holt die App die ganze Einleitung und schneidet selbst. Beide Satz-Zerleger kennen die Regel „nach 1–2-stelliger Zahl mit Punkt kein Satzende“. Gespeicherte Kurzinfos werden einmal neu geladen.

### Annahmen/Abweichungen

- „Mein Standort“ ist jetzt im Menü (dein Wunsch: nur ein Knopf). Das kostet unterwegs einen Tipp mehr.
- Die Zahlen 5 / 15 / 30 sind Startwerte, auf dem Handy noch nicht gesehen.
- Vorbereitete Offline-Gebiete behalten ihre alten Kurzinfos, bis sie neu vorbereitet werden.
- Die Reihenfolge innerhalb gleicher Sterne: erst was im Verzeichnis steht (nach Verzeichnis-Punkten), dann der Rest nach den Punkten der Suche.

## v0.9.4 – 04.11.2026 – Keine Denkmal-Nummern, kurze Namen, „Details laden?“

Wünsche Nutzer (Ingolstadt/Kelheim, Zoom 11): „Bodendenkmal in Geisenfeld, #D-1-7336-0006“ und „Pfarrhof, um einen geschlossenen Hof geordnete Anlage“ auf der Karte, zu langer Titel „Ehemalige Klosterkirche, jetzt katholische Filialkirche St. Antonius“, Frage nach Details beim Hineinzoomen.

- **Ursache**: Diese Einträge kommen aus der bayerischen Denkmalliste in Wikidata, ihr „Name“ ist eine Beschreibung. Die kursiven Namen der Ausflugsziele bei weiter Sicht nutzten die Zwei-Zeilen-Namen aus v0.9.3 noch nicht.
- **Denkmal-Nummern nie anzeigen** (`#D-…`, auch „D-1-7336-0006“): Karte, Liste, Strecke, Merkliste, Fensterüberschrift.
- **Lange Namen kürzen** (`core.displayName`, überall gleich):
  - „Bodendenkmal in Geisenfeld, #D-…“ → „Bodendenkmal Geisenfeld“.
  - Beginnt der Teil nach dem ersten Komma mit einem Kleinbuchstaben (eine Beschreibung, kein Namensteil), fällt er weg: „Pfarrhof, um einen …“ → „Pfarrhof“; „Ehemalige Klosterkirche, jetzt katholische …“ → „Ehemalige Klosterkirche“.
  - Sehr lange Namen (über 45 Zeichen) werden auch bei großem Anfangsbuchstaben am Komma gekürzt, wenn davor mindestens 10 Zeichen stehen.
  - „Kloster Ettal, Benediktinerabtei“ und „Köln, Dom“ bleiben.
  - Im Fenster steht der gekürzte Name groß, der volle klein darunter („Voller Name: …“).
- **Kursive Namen bei weiter Sicht** auch in bis zu 2 Zeilen (16 Zeichen), mit denselben Regeln wie bei den Punkten.
- **Beschreibungen als Namen erst ab Zoom 15**: Wer einen solchen Namen trägt und unter ★★ liegt, erscheint wie die Ziele unter 4 Punkten erst ab Zoom 15 (und nur mit „Alle Orte“), nicht mehr schon bei Zoom 11–12. Sie sind keine Halte auf Strecken.
- **„Details laden?“**: Ab dem Zoom, bei dem „Hier suchen“ möglich ist (Halbdiagonale höchstens 10 km, auf dem Pixel 8 etwa Zoom 12), steht über der Karte eine Zeile mit „Laden“ und ✕.
  - „Laden“ macht dasselbe wie „Hier suchen“. ✕ schließt die Zeile, bis du wieder weiter heraus- und neu hineinzoomst.
  - Sie kommt nur, wenn die Mitte des Ausschnitts noch nicht gesucht wurde; nicht bei Strecken und nicht während einer Suche. Abschaltbar mit `suche.frage_details: false`.

### Annahmen/Abweichungen

- Die Kürzung nach dem Komma ist eine Faustregel; sie kennt keine Ausnahmen für Namen, die nach dem Komma klein weitergehen und trotzdem dazugehören. Ein solcher Name würde gekürzt (voller Name im Fenster).
- Die Denkmal-Nummer wird nur erkannt, wenn sie mit `#` beginnt oder die Form `D-1-7336-0006` hat.
- Auf dem Handy noch nicht gesehen: wie die Frage „Details laden?“ neben der OSM-Zeile und der Ladeanzeige wirkt (es steht immer nur eine Zeile da; Laden und Suchen gehen vor, dann OSM, dann „Details laden?“).

## v0.9.3 – 04.11.2026 – Namen in 2 Zeilen, einheitliche Sterne, OSM nur bei kleinem Ausschnitt

Wünsche Nutzer (Ingolstadt): „Deutsches…“ abgeschnitten, Museum des Ersten Weltkriegs fehlt, Text der Kocatepe-Moschee bricht ab, „OSM 735 s??“, Hinweis über „Hier suchen“ weg, Ziele außerhalb des Rechtecks.

- **Namen auf der Karte in bis zu 2 Zeilen** (je etwa 16 Zeichen, vorher 1 Zeile mit 18). Lange Wörter bleiben ganz.
  - Vorangestelltes Deutsches/Deutsche/Bayerisches/Bayerische fällt auf der Karte weg, wenn danach noch ein Name bleibt: „Medizinhistorisches Museum“, „Armeemuseum“. „Deutsches Museum“ und „Deutsches Eck“ bleiben.
  - Eine Klammer am Ende fällt auf der Karte weg („St. Matthäus (Ingolstadt)“ → „St. Matthäus“). In der Liste und im Fenster steht immer der volle Name.
- **Ab Zoom 15 alles mit Wikipedia-Artikel** aus dem Verzeichnis, auch unter 4 Punkten (`verzeichnis.zoom.alle`). Ziele ohne Stern erscheinen nur mit dem Filter „Alle Orte“. Sie sind keine Halte auf Strecken.
- **Kurzinfo**: Nach einer ein- oder zweistelligen Zahl mit Punkt endet kein Satz mehr („am 18. Oktober“, „im 19. Jahrhundert“).
- **OSM**:
  - Nur noch, wenn der Ausschnitt höchstens 12 OSM-Kacheln berührt (`osm.max_kacheln`). Auf dem Pixel 8 ist das etwa ab Zoom 13. Weiter draußen sucht „Hier suchen“ nur Wikipedia; die Statuszeile sagt „OSM erst näher dran“.
  - Geladen werden nur noch die Kacheln, die den Ausschnitt berühren. Vorher waren es alle im Quadrat um den Kreis um den Ausschnitt, bei Zoom 12 etwa 24–48 statt 16–24.
  - Statuszeile ohne Sekunden: „OSM ✓“, „OSM ⏳ lädt noch“, „OSM ✓ ergänzt“. Lädt OSM nach, steht über der Karte „OSM lädt noch – es kommt mehr“, bis die Orte eingefügt sind (höchstens 20 Minuten nach der Suche). Die Sekunden stehen weiter im Fenster hinter der Statuszeile.
- **Kein Hinweis** „„Hier suchen“ lädt die Gegend (ca. …)“ mehr.
- **Kein gestricheltes Rechteck** mehr um den gesuchten Ausschnitt. Das Verzeichnis zeigt mehr als den Ausschnitt (ganze Kacheln von etwa 28 × 18 km, auch früher geladene); das Rechteck hat darum verwirrt.
- **Einheitliche Sterne**: Orte aus „Hier suchen“ bekommen die Sterne des Verzeichnisses, also denselben Maßstab wie auf der Karte und auf Strecken. Ist das Verzeichnis für die Stelle geladen, hat den Ort aber nicht (zu wenig Punkte), höchstens ★. Ohne Verzeichnis bleiben die bisherigen Sterne. Im Fenster nennt „Warum ★?“ die Punkte im Verzeichnis.
- Test auf GitHub: neue Eingabe `osm` (Bereich, dazu `namen`) zeigt, wie ein Ort in OpenStreetMap eingetragen ist und ob der App-Filter ihn findet (`tools/osm-probe.mjs`).

### Annahmen/Abweichungen

- „Deutsches/Bayerisches“ fällt nur weg, wenn danach mindestens zwei Wörter bleiben oder ein zusammengesetztes Wort mit Museum, Kirche, Theater, Oper, Bibliothek, Archiv, Schloss, Burg, Garten, Park, Haus, Halle, Zentrum, Denkmal, Galerie oder Sammlung am Ende.
- Die Grenze 12 OSM-Kacheln ist berechnet (Pixel 8 mit und ohne Liste), nicht auf dem Handy gemessen.
- Einheitliche Sterne: Das Neue Schloss Ingolstadt hat jetzt ★ statt ★★★ (Verzeichnis: 7,5 Punkte), das Audi museum mobile ohne Stern statt ★★★ (6,8 Punkte). Ob dir die Verzeichnis-Sterne so passen, ist noch offen.
- Mit echten Daten geprüft (GitHub, Verzeichnis Ingolstadt): Museum des Ersten Weltkriegs steht in Wikidata mit 1 Sprachversion und 3,6 Punkten, Kocatepe-Moschee mit 3,5 Punkten. Beide erscheinen jetzt ab Zoom 15. Der Wildpark am Baggersee hat keinen Eintrag in Wikipedia/Wikidata.

## v0.9.2 – 04.11.2026 – Strecke: nur wirklich wichtige Halte, schneller

Wunsch Nutzer: Die Strecke nach Genf hat sehr lange gedauert; nur wirklich wichtige Sehenswürdigkeiten zeigen, und je länger die Strecke, desto wichtiger.

- **Auswahl nach Fahrzeit** (Luftlinie ÷ 80 km/h Auto, 18 km/h Fahrrad, 4,5 km/h zu Fuß):
  - bis 1 Stunde: ab ★; 1 bis 3 Stunden: ab ★★; über 3 Stunden: nur ★★★.
  - etwa 2 Halte je Stunde Fahrzeit, mindestens 3, höchstens 15; bei mehr Kandidaten die mit den meisten Sternen und Punkten.
  - Beispiele: Fahrrad Morges → Genf (ca. 2,5 Std.) ab ★★, 5 Halte; Auto Morges → Lyon (ca. 2 Std.) ab ★★, 4 Halte.
- **Schneller laden**: Die Strecke fragt nur bekannte Einträge ab (ab 4/7/12 Sprachversionen für ★/★★/★★★), in großen Stücken (0,5°). Gespeichert 30 Tage; was „Hier suchen“ schon geladen hat, wird mitbenutzt. Fortschritt „Lade Strecke 2/9 …“, ✕ bricht ab (dann gilt, was schon da ist).
- **Ein Halt je Ort**: Ist ein Ort ein Halt, stehen seine Sehenswürdigkeiten nicht extra in der Liste (sie stehen im Fenster des Ortes). Von einem Ort ohne eigenen Halt nur die beste Sehenswürdigkeit.
- Listenkopf: Fahrzeit, Zahl der Halte und ab wie vielen Sternen.
- Die Grenzen stehen in `config.json` → `korridor` (`kmh`, `sterne_ab`, `halte_pro_stunde`, `min_halte`, `max_halte`, `min_sprachen`, `kachel`, `kachel_grad`). Strecken ab 1 Stunde laden in Stücken von 1°.
- **Geprüft mit echten Daten** (GitHub, erstes Laden):
  - Fahrrad Morges → Genf: 11 s statt 2 Minuten (1 Stück), 5 Halte: Genfersee, Fondation Martin Bodmer, Palais des Nations, Musée Ariana, Genf.
  - Auto Morges → Lyon: 82 s statt 9 Minuten (7 Stücke), 4 Halte: Lausanne, Palais des Nations, Genf, Lyon.
  - Alle Halte innerhalb ihrer Breite und nach km sortiert. Auf dem Handy noch nicht gemessen.

## v0.9.1 – 04.11.2026 – Strecke: nichts hinter dem Start

- Hinter dem Start und nach dem Ziel gilt nur noch die Breite für einen Stern weniger (★★★ mit Auto: 15 statt 40 km). Im Test Morges → Lyon standen sonst Schloss Chillon und Lavaux (35 und 19 km hinter Morges, in der Gegenrichtung) in der Liste.
- **Geprüft mit echten Daten** (GitHub Action, Eingabe `strecke`):
  - Fahrrad Morges → Genf: 44 km Luftlinie, 7 Stücke, 61 Ziele, alle innerhalb ihrer Breite, nach km sortiert; erstes Laden 2 Minuten.
  - Auto Morges → Lyon: 153 km, 61 Stücke, erstes Laden 9 Minuten, 154 Ziele, alle innerhalb ihrer Breite, sortiert.

### Annahmen/Abweichungen

- **Erstes Laden ist langsamer als in PROJEKT.md verlangt** (Fahrrad Morges → Genf: 2 Minuten statt unter 20 Sekunden), weil das Verzeichnis alle Einträge der Stücke holt. Beim zweiten Mal kommen die Stücke aus dem Handy und es geht in Sekunden. Gemessen auf GitHub, auf dem Handy noch nicht.
- Die Luftlinie Morges → Genf führt über den Genfersee; zwischen km 5 und 35 liegt darum fast nichts. Morges → Lyon führt über den Jura statt über Genf.

## v0.9.0 – 04.11.2026 – Strecke: was liegt zwischen Start und Ziel

Nächste Funktion aus PROJEKT.md (6b, Korridormodus), gebaut auf dem Verzeichnis aus v0.8.

- **⇢ unten** öffnet „Strecke“: Start (leer = Mein Standort, sonst Ort eingeben und 🔍), Ziel, Verkehrsmittel 🚗 Auto / 🚲 Fahrrad / 🚶 zu Fuß, dann „Strecke anzeigen“. Erst dann wird geladen.
- **Rechnung**: Linie = Luftlinie Start → Ziel. Geladen wird das Verzeichnis in einem Streifen entlang der Linie (dieselben Stücke wie bei „Hier suchen“, schon gespeicherte werden nicht neu geladen; Fortschritt „Lade Gegend 3/20 …“, ✕ bricht ab). Ein Ziel erscheint, wenn es höchstens so weit von der Linie weg ist, wie seine Sterne erlauben:

  | Verkehrsmittel | ★★★ | ★★ | ★ | ohne Stern |
  |---|---|---|---|---|
  | Auto | 40 km | 15 km | 5 km | 2 km |
  | Fahrrad | 8 km | 3 km | 1 km | 0,5 km |
  | zu Fuß | 2 km | 1 km | 0,3 km | 0,15 km |

- **Anzeige**: Linie gestrichelt auf der Karte, die Ziele darauf (je Ausschnitt die wichtigsten), die Liste **in Reihenfolge entlang der Strecke** mit „km ab Start“ und „Umweg ca. X km“ (hin und zurück zur Linie). Antippen öffnet das Ziel wie gewohnt (Wikipedia, Erzählen, Karten-Links). „Strecke beenden“ oben in der Liste oder im Strecken-Fenster.
- **Diagnose**: Checkliste um die Abnahme aus PROJEKT.md 6b ergänzt.
- GitHub Action „Stadt-Sterne berechnen“: neue Eingabe `strecke` zum Prüfen mit echten Daten.

### Annahmen/Abweichungen

- **Daten aus dem Verzeichnis statt Wikipedia-Abfragen je Stützpunkt** (PROJEKT.md 6b, Abfrage 1–3): Das Verzeichnis hat schon Sterne, Seitenaufrufe und Zwischenspeicher, und die Stücke sind dieselben wie beim Herauszoomen. Kurzinfos kommen beim Antippen.
- **Zwischenpunkte durch Tippen auf die Karte** (in PROJEKT.md optional) sind noch nicht dabei.
- **Ziele ohne Stern** bekommen eine eigene, schmalere Breite (nicht in PROJEKT.md), damit wenig bekannte Ziele direkt an der Strecke auch erscheinen. Der Filter „ab ★“ blendet sie aus.
- **Luftlinie**: Über einen See (z. B. Morges → Genf über den Genfersee) liegt die Linie nicht auf der Straße. Darum steht „Echte Straße kann abweichen.“ dabei.
- **Claude nach Highlights fragen** (PROJEKT.md 6b, Punkt 4) ist nicht eingebaut.

## v0.8.4 – 04.11.2026 – Ziele aus dem Verzeichnis mit Wikipedia-Text, ZKM als Museum

Wunsch Nutzer: Beim ZKM keine Beschreibung, obwohl es einen Wikipedia-Artikel gibt. Punkte ohne Stern (Congress Center) kaum zu sehen. Stadtteile (Basel-Kleinhüningen) ohne viel Mehrwert.

- **Ziel aus dem Verzeichnis antippen** (auf der Karte oder in der Liste): öffnet das gewohnte Fenster mit Wikipedia-Einleitung, Bild, „Erzähl mir davon“, „Übersicht und Bewertung“, Merken und Karten-Links. Dafür fragt die App erst beim Antippen Wikidata nach dem Wikipedia-Artikel dieses einen Ziels (Deutsch zuerst, sonst Englisch, Französisch, Italienisch …). Vorher stand dort nur „Hier suchen“ und „Wikipedia“.
- **Art aus Wikidata**: Hat ein Ziel mehrere Arten, gewinnt die wichtigere (Museum vor Bibliothek, Kathedrale vor Kirche). Das ZKM stand als „Bibliothek“ drin. Ausnahmen wie Firma oder Person gewinnen weiter.
- **Seitenaufrufe auch für Bekanntes mit wenigen Punkten**: alles mit mindestens 10 Sprachversionen (`verzeichnis.aufrufe_ab_sprachen`). Das ZKM (13 Sprachversionen) hatte 4,8 Punkte und bekam deshalb keine Seitenaufrufe.
  - Wirkt erst nach neuem Laden: ⚙ → „Verzeichnis löschen“, dann „Hier suchen“.
- **Punkte ohne Stern besser sichtbar**: größer, dunkler, Beschriftung größer.
- **Stadtteile und Orte** (Art „Stadt/Ort“ und „Viertel“) stehen nicht mehr in Liste und Karte der Suche (`suche.ausblenden_typen`). Orte mit Sternen aus dem Verzeichnis bleiben.

## v0.8.3 – 04.11.2026 – Liste ausschaltbar, weniger Hinweise, kein automatisches Vollbild

Wunsch Nutzer: Liste unter der Karte ein- und ausschalten; „Mein Standort“ nur als Symbol; Hinweise „„Hier suchen“: alle Ziele mit Kurzinfos“ und „Zoom 11 · 1 Ziele im Ausschnitt“ weg; Vollbild-Hinweis von Chrome kommt immer; „Echichens“ oben war unklar; „Schon geladen“ war unklar.

- **☰ unten links neben ◎**: schaltet die Liste (mit Filtern und Statuszeile) aus und wieder an. Ohne Liste hat die Karte den ganzen Bildschirm. Wird gemerkt.
- **„◎“** statt „◎ Mein Standort“.
- **Zeile über „Hier suchen“ nur noch, wenn sie etwas sagt**: „Lade Gegend 3/8 …“ (✕ bricht ab), „„Hier suchen“ lädt die Gegend (ca. 40 s)“, „Zu weit draußen – näher heranzoomen“, „Suche läuft …“ (✕ bricht ab, wichtig wenn die Liste aus ist). Sonst keine Zeile.
- **Ortsname oben links entfernt**: Er zeigte den Ort der letzten Suche (z. B. „Echichens“), auch wenn die Karte längst woanders war.
- **Vollbild nicht mehr automatisch**: Der Hinweis „zum Beenden des Vollbildmodus …“ kommt von Chrome, sobald eine Seite auf Vollbild schaltet, und lässt sich nicht abstellen. Die installierte App läuft ohne Browserleiste; Vollbild lässt sich in ⚙ wieder einschalten.
- **Nach „Hier suchen“ immer „Fertig: 12 Ziele im Ausschnitt“**, auch wenn die Gegend schon gespeichert war (vorher „Schon geladen“). Gespeichertes wird 30 Tage verwendet, danach neu geladen; frisch laden: ⚙ → „Verzeichnis löschen“.
- Liste: Zweitname wird nicht mehr gezeigt, wenn er nur die Art wiederholt (z. B. zweimal „Gebäude“).

## v0.8.2 – 04.11.2026 – Bei jedem Zoom genug Ziele, klares Ende, Meldungen in einer Zeile

Wunsch Nutzer: Bei jeder Zoomstufe eine angemessene Anzahl Sehenswürdigkeiten, außer wo es nichts gibt (im Sauerland bei Zoom 10 kamen nur Burg Altena und die Dechenhöhle). Nicht klar, ob die Suche vorbei ist. Besser auf Zeilenumbrüche in Meldungen achten.

- **Bei jedem Zoom die wichtigsten bis zu 40 Ziele im Ausschnitt** (Verzeichnis): zuerst, was zur Zoomstufe gehört (wie bisher: weit draußen die ★★★, dann Orte mit Sternen und Ausflugsziele), dann der Rest nach Sternen und Punkten. Wo wenig ist (Sauerland), kommen auch Ziele ohne Stern dazu (z. B. Burg Klusenstein, Schloss Wocklum, AquaMagis); wo viel ist (Waadtland), bleibt es bei den besten. Der Filter „Alle Orte / ab ★“ gilt auch hier. Orte mit ★★/★★★ stehen vor ihren eigenen Sehenswürdigkeiten.
- **Klares Ende**: Beim Laden zeigt der Knopf „Lade 3/8 …“, danach kommt „Fertig: 37 Ziele im Ausschnitt“ (oder „hier nichts gefunden“). Die Zeile über dem Knopf zeigt dann „Zoom 10 · 37 Ziele im Ausschnitt“.
- **Die Liste zeigt das Gefundene**, solange keine Suche mit Kurzinfos da ist: die 40 wichtigsten im Ausschnitt mit Sternen, Art und Ort. Antippen öffnet das Ziel (Wikipedia, „Hier suchen“).
- **Meldungen in einer Zeile**: Meldungen und die Zeile über „Hier suchen“ nutzen jetzt die ganze Bildschirmbreite (vorher nur die halbe, darum brachen sie fast immer um) und sind kürzer, z. B. „Standort – jetzt „Hier suchen““, „Zu weit draußen – näher heranzoomen“, „OSM: 12 Orte dazu“. Während einer Suche steht „Suche läuft …“.

### Annahmen/Abweichungen

- **Höchstens 40 Punkte je Ausschnitt** (`staedte.max_sichtbar`), dazu fallen Punkte weg, die auf einem wichtigeren liegen. Die Zahl ist ein Startwert.
- Mit dem Filter „ab ★“ (Voreinstellung) bleiben Ziele ohne Stern weg; im Sauerland erscheint mehr mit „Alle Orte“.
- Mit echten Daten auf dem Handy noch nicht geprüft, nur mit den Testdaten.

## v0.8.1 – 04.11.2026 – Nichts lädt von selbst, Teilen statt Auswahl

Wunsch Nutzer: Nichts automatisch laden, immer erst Gegend und Zoom auf der Karte einstellen und erst suchen, wenn ich es sage. „Erzähl mir davon“ immer über Android „Teilen“, ohne Menü für Claude und Gemini. „Warte auf OpenStreetMap“ kürzer und ohne Zeilenumbruch. Unklar war, wann „Hier suchen“ und wann das Menü.

- **Nur „Hier suchen“ lädt**, und zwar den sichtbaren Ausschnitt:
  - Weit draußen (bis etwa Zoom 11): das Verzeichnis der Gegend, also Orte mit Sternen und Ausflugsziele (Stücke, die fehlen oder älter als 30 Tage sind).
  - Nah dran (etwa ab Zoom 12): dazu die Suche mit Kurzinfos wie bisher.
  - Zu weit draußen (mehr als 150 Stücke): „Hier suchen“ ist grau, die Zeile sagt „näher heranzoomen“.
  - Die Zeile über „Hier suchen“ sagt, was es bei diesem Zoom lädt, z. B. „Zoom 9: „Hier suchen“ lädt Orte mit Sternen und Ausflugsziele (ca. 40 s)“. Der Knopf „Gegend laden“ ist weg.
  - Schon Geladenes bleibt auf der Karte sichtbar (aus dem Handy, ohne Internet).
- **⚙ aufgeräumt**: keine Auswahl Claude/Gemini, kein „Neu berechnen“ der Stadt-Sterne je Land, kein „Ausschnitt neu laden“. Im ⚙ lädt nur noch „Kartenausschnitt vorbereiten“ (für unterwegs ohne Internet, mit allen Texten).
- **„Erzähl mir davon“ und „Übersicht“**: Text wird kopiert und das Android-Teilen-Menü geht auf; dort die App wählen (Claude, Gemini, …). Knopf „Teilen …“, falls das Menü nicht gleich aufgeht.
- **Statuszeile beim Suchen in einer Zeile**: „Warte auf OSM …“, Sekunden, „Ohne OSM“, „Abbrechen“. Lädt OSM nach Ablauf der Wartezeit im Hintergrund weiter, steht dort „OSM ⏳ lädt noch im Hintergrund“ (vorher „OSM ✗ keine Antwort“, obwohl es noch lief).
- Diagnose: Gemini-Testknöpfe entfernt, Checkliste v0.8 angepasst.

### Annahmen/Abweichungen

- **Die mitgelieferten Stadt-Sterne aus v0.7** (Dateien in der App selbst) erscheinen weiter beim Herauszoomen, dort wo noch nichts geladen ist. Das ist kein Download von Wikipedia oder Wikidata, sondern Teil der App, wie die Kartenbilder.
- **Kurzinfos und Texte eines Ortes** werden wie bisher erst geladen, wenn man den Ort antippt.
- Ein Screenshot zum Thema „läuft es noch?“ kam nicht an; die Änderungen an der Statuszeile sind deshalb nach Beschreibung gemacht.

## v0.8.0 – 04.11.2026 – Verzeichnis wie ein Reiseführer

Wunsch Nutzer: Zu wenige Ziele (im ganzen Sauerland nichts); wie ein Reiseführer oder der Michelin auf der Karte: je nach Maßstab sehen, was es gibt und was sich lohnt, auch Ausflugsziele, Freizeitparks (Fort Fun) und lokale Museen. Nicht stundenlang rechnen, sondern bei Bedarf für die Gegend laden. „Mein Standort“ soll auch nicht gleich suchen. Installieren geht nicht.

- **Das Handy lädt die Gegend selbst**: in Stücken von etwa 25 × 28 km (0,25°), etwa 5 Sekunden je Stück. Je Stück holt es von Wikidata alles mit Koordinaten und Wikipedia-Artikel, dazu für die besten Kandidaten Seitenaufrufe (Wikipedia, 30 Tage) und Wikivoyage. Gespeichert werden nur Orte ab 1000 Einwohnern und Sehenswürdigkeiten, etwa 20–30 KB je Stück, 30 Tage lang.
  - Ab Zoom 10 lädt die Karte selbst (höchstens 24 Stücke auf einmal), weiter draußen mit dem Knopf „Gegend laden“ (bis 150 Stücke, mit Zeitangabe). Abbrechen mit ✕.
  - ⚙ → „🗺 Verzeichnis“: Zahl und Größe der gespeicherten Stücke, „Ausschnitt neu laden“, „Verzeichnis löschen“, ein Schalter zum Abstellen.
- **Drei Stufen wie im Reiseführer**:
  - Zoom ≤ 8: Orte mit ★★/★★★ und Sehenswürdigkeiten mit ★★★ (z. B. Genf, Lausanne, Chillon, Lavaux).
  - Zoom 9–11: dazu Orte mit ★, Sehenswürdigkeiten mit ★★ und Ausflugsziele mit ★ (Burgen, Klöster, Berge, Seen, Freizeitparks).
  - Ab Zoom 12: alle Ziele ab 4 Punkten, auch lokale Museen, ohne „Hier suchen“. Antippen zeigt Sterne, Art, Wikipedia und „Hier suchen“ für Kurzinfos und „Erzähl mir davon“.
- **Wie gerechnet wird**:
  - Sehenswürdigkeit: Sprachversionen (doppelt gewichtet), Denkmal/UNESCO, Art und Seitenaufrufe. Sterne ab 7,5 / 8,5 / 10,5 Punkten; Natur und Freizeitparks ab 5,5 / 7 / 9.
  - Ort: wie bekannt er ist (Sprachversionen, Seitenaufrufe, Wikivoyage, Hauptstadt) plus was es zu sehen gibt (die 5 besten Ziele, nur der Teil über 5 Punkten). Sterne ab 16 / 22 / 30. **Ohne Sehenswertes kein Stern**: Thonon oder Brilon sind bekannt, haben aber kaum Ziele.
  - Ein sehr gutes Ziel (★★ und mehr) bekommt einen eigenen Punkt und zählt für seinen Ort nur zu 60 %. So bekommt ein Dorf nicht drei Sterne, nur weil ein berühmtes Schloss darin steht.
  - Doppelte (Gebäude und Sammlung, gleicher Name in 500 m) werden zusammengelegt.
- **Freizeitparks wie Ausflugsziele**: bekommen immer Seitenaufrufe (Fort Fun hat nur 4 Sprachversionen) und die Sterne-Schwellen der Natur.
- **Zeile über „Hier suchen“**: sagt, was die Karte bei diesem Zoom zeigt („Zoom 9: Orte mit Sternen und Ausflugsziele – ab Zoom 12 alle“), zeigt das Laden und den Knopf „Gegend laden“. „Hier suchen“ ist grau, wenn der Ausschnitt zu groß ist.
- **„📍 Mein Standort“** springt nur noch zum Standort; gesucht wird erst mit „Hier suchen“.
- **Installieren**: neue App-Kennung im Manifest (`id`), damit Chrome eine kaputte alte Installation nicht mehr für „bereits installiert“ hält.
- **Länderdateien aus v0.7** (`docs/staedte/*.json`) bleiben und gelten dort, wo das Verzeichnis noch nichts geladen hat.
- **Diagnose**: neuer Abschnitt v0.8 mit Checkliste und Feld für das Installieren.

### Annahmen/Abweichungen

- **Korridormodus kommt danach** (PROJEKT.md 6b). Das Verzeichnis war wichtiger (Wunsch Nutzer), und der Korridor baut darauf auf.
- **Getestet mit echten Daten auf GitHub** (Waadtland, Sauerland, Vallée de Joux), auf dem Handy noch nicht. Sauerland: 10 Stücke in 51 s; Arnsberg ★, Schmallenberg ★, Burg Bilstein, Schloss Berleburg, Kahler Asten. Audemars Piguet Museum und Espace Horloger sind ab Zoom 12 dabei. Fort Fun hatte ohne Seitenaufrufe 3,9 Punkte; mit Seitenaufrufen jetzt 6,1 Punkte, also ★ ab Zoom 9 (geprüft mit echten Daten).
- **Datenmenge**: Eine Gegend wie das Waadtland sind gut 30 Stücke, etwa 3 Minuten und einige MB Download über Mobilfunk. Gespeichert bleiben etwa 150 KB.
- **Ob die neue App-Kennung das Installieren repariert, ist nicht sicher.** Falls nicht: Text der Meldung in Diagnose → v0.8.
- **Rochers de Naye** fehlt weiterhin auf der Stufe Region (zu wenig Punkte als Natur).

## v0.7.2 – 04.11.2026 – Nicht zu viele Punkte, Freizeitparks, Gemini

Wunsch Nutzer: Auf der Karte nicht zu viele Elemente; wenn viel da ist, nur die wichtigen, wenn wenig da ist (Le Brassus), alles. Freizeitparks wie Fort Fun als Ausflugsziele. In den Einstellungen zwischen Claude und Gemini wählen.

- **Karte**: Im sichtbaren Ausschnitt stehen höchstens 30 Orte, die wichtigsten zuerst (Sterne, dann Punkte). Ist wenig da, stehen alle da, auch ohne Stern. Bisher kamen ★-Orte und Orte ohne Stern erst ab Zoom 16. Liegen zwei Punkte aufeinander, fällt der unwichtigere weg. Beim Verschieben wird neu ausgewählt. Gilt auch für die Stadt-Sterne beim Herauszoomen (höchstens 40).
- **Freizeitparks, Zoos, Tierparks, Aquarien, Spaßbäder**: eigene Art „Freizeitpark/Zoo“ (Wikipedia/Wikidata), und OpenStreetMap liefert sie jetzt mit (`tourism=theme_park|zoo|aquarium`, `leisure=water_park`). Der OSM-Zwischenspeicher wird dafür einmal geleert.
- **OpenStreetMap wartet kürzer**: höchstens 25 s je Server (vorher 40 s), die Liste wartet höchstens 60 s (vorher 120 s). In Le Brassus kam nach 214 s keine Antwort.
- **⚙ → KI-Assistent: Claude oder Gemini**. Bei Gemini: Text kopieren und Gemini öffnen (lange ins Eingabefeld tippen → Einfügen), oder über Android „Teilen“, oder nur kopieren. Der Knopf heißt dann „Gemini öffnen“.
- **Diagnose**: neuer Abschnitt v0.7.2 mit drei Testknöpfen für Gemini.

### Annahmen/Abweichungen

- **Kein Gemini-Link mit fertigem Text**: Einen offiziellen Weg, Gemini mit einem Text zu öffnen, kenne ich nicht. Der Testknopf B in der Diagnose probiert `gemini.google.com/app?q=…` aus; klappt das, wird es die Voreinstellung.
- **Stadt-Sterne im Sauerland**: Daran ändert v0.7.2 nichts. Dafür kommt v0.8 (Verzeichnis mit allen Orten).

## v0.7.1 – 03.11.2026 – Suche springt nur noch

Wunsch Nutzer: Nach dem Springen zu einem Suchtreffer nicht gleich suchen, sondern erst die Karte einstellen und dann im gewählten Ausschnitt suchen.

- **Suchtreffer (🔎)**: Die Karte springt nur noch dorthin. Gesucht wird erst mit „Hier suchen“, und zwar im Ausschnitt, den man bis dahin eingestellt hat.
- **Gesuchte Sehenswürdigkeit** (z. B. ein Museum): Ein roter Ring zeigt, wo sie liegt. Liegt sie nach „Hier suchen“ im Ausschnitt, öffnet sich ihr Fenster wie bisher. Danach verschwindet der Ring.
- **Stadt-Sterne**: „🔍 Hineinzoomen“ (vorher „Hineinzoomen und suchen“) und das Antippen einer Sehenswürdigkeit im Stadtfenster zoomen nur noch.

### Annahmen/Abweichungen

- **„📍 Standort“ sucht weiterhin sofort**: Der Wunsch betraf die Suche nach Orten. Das lässt sich genauso umstellen, falls gewünscht.
- Ist der Ausschnitt bei „Hier suchen“ zu groß, bleibt der rote Ring stehen, bis eine Suche wirklich gelaufen ist.

## v0.7.0 – 03.11.2026 – Stadt-Sterne für Ausflüge, Symbole auf der Karte, Installieren

Wunsch Nutzer: Symbole je Art, beim Herauszoomen ein Stern pro Stadt (für Ausflüge), Installation reparieren. Vorgezogen aus v0.9 (PROJEKT.md 6c).

- **Stadt-Sterne beim Herauszoomen** (Deutschland, Österreich, Schweiz, Frankreich, Belgien, Niederlande, Luxemburg, Italien, Großbritannien):
  - Zoom 9–11: Städte als Sterne-Schild („★★★ Brügge“), dazu große Ausflugsziele außerhalb von Städten (Burgen, Berge, Seen …) mit Symbol.
  - Zoom 8 und weiter draußen: nur Städte mit ★★ und ★★★.
  - Ab Zoom 12: die einzelnen Orte wie bisher.
  - Stadt antippen: die drei bekanntesten Sehenswürdigkeiten (antippen = dorthin zoomen und suchen), „🔍 Hineinzoomen und suchen“, Wikipedia.
- **Wie gerechnet wird**: Für jede Kartenkachel (1°) holt eine Wikidata-Abfrage alles mit Koordinaten und mindestens 12 Sprachversionen. Daraus werden:
  - **Städte**: Orte mit einer Stadt-, Gemeinde- oder Dorf-Klasse. Ein Ort nahe der Mitte eines größeren wird mit ihm zusammengelegt, der bekanntere Name bleibt (Lyon statt „Métropole de Lyon“). Verwaltungseinheiten wie „Metropolitanstadt Rom“ oder „Landkreis“ zählen nicht als Stadt. Der Radius kommt aus der Fläche (sonst aus der Einwohnerzahl).
  - **Sehenswürdigkeiten**: nur echte Ziele, also Museum, Kirche, Schloss, Platz, Friedhof, Triumphbogen und Ähnliches. Sprachen, Ereignisse, Verträge, Firmen, Bahnhöfe, Flughäfen, Hochschulen, Stadien und Verwaltungsgebiete zählen nicht. Die Punkte sind wie bei den Orten: Sprachversionen + Denkmal/UNESCO + Art, ohne Artikellänge.
  - **Stadt-Score**: Summe der 10 besten Sehenswürdigkeiten, +3 bei UNESCO-Welterbe, +1 für Hauptstädte, + 0,1 × Sprachversionen der Stadt selbst (nur ab zwei Sehenswürdigkeiten). So kommen Bamberg, Regensburg oder York nicht unter Industriestädte. UNESCO-Welterbe zählt immer als Sehenswürdigkeit.
  - **Sterne**: ★★★ ab 45, ★★ ab 25, ★ ab 12. Eine einzelne weltberühmte Sehenswürdigkeit reicht auch: ab 12 Punkten ★★★ (z. B. Versailles), ab 10,5 ★★, ab 7 ★.
  - **Natur** (Berge, Seen, Gletscher, Wasserfälle) zählt nie für eine Stadt, sondern als eigenes Ausflugsziel. Sonst sammeln Bergdörfer mit großer Gemeindefläche Dutzende Gipfel.
- **⚙ → „⭐ Stadt-Sterne (Ausflüge)“**: Stand und Zahl der Städte je Land, „Neu berechnen“ je Land oder „Alle Länder neu berechnen“. Das Handy fragt dabei selbst Wikidata ab, mit Fortschrittsleiste und Abbrechen; der Bildschirm bleibt an. Schalter „Stadt-Sterne auf der Karte zeigen“.
- **Mitgelieferte Daten**: `docs/staedte/*.json` (alle 9 Länder, zusammen gut 200 KB), berechnet von einer GitHub Action („Stadt-Sterne berechnen“, auf github.com mit „Run workflow“ startbar). Die Abfrage aller Länder dauert etwa 75 Minuten; die Rohdaten bleiben 25 Tage gespeichert, neu rechnen mit geänderten Regeln dauert dann 3 Minuten. Hat das Handy selbst neuer gerechnet, nimmt die App die eigenen Daten.
- **Symbole in den Kartenpunkten** (Farbe bleibt = Sterne): 🏛 Museum/Galerie, ✝ Kirche/Kathedrale/Kloster, Burg-Zinnen für Schloss/Burg/Palast/Herrenhaus, Obelisk für Denkmal/Welterbe/Kunst/Ausgrabung, Auge für Aussichtspunkt, Baum für Park/Natur. Alles andere bleibt ein schlichter Punkt. Punkte mit Symbol sind etwas größer.
- **Installieren**: Das Manifest ist wieder „standalone“ (in v0.6.1 „fullscreen“) und hat eine feste `id`. Die installierte App schaltet beim ersten Antippen selbst auf Vollbild (abschaltbar in ⚙).
- **Diagnose**: neuer Abschnitt v0.7. „Installieren“ zeigt, was Chrome sieht (Manifest, Symbole, Service Worker, ob Chrome Installieren anbietet), mit Feld für die Fehlermeldung. Dazu eine Checkliste für Symbole und Stadt-Sterne.

### Annahmen/Abweichungen

- **Neu berechnen geht im Handy**, nicht nur über die GitHub Action wie in PROJEKT.md 6c (Wunsch Nutzer: im Menü). Ein Knopf, der die GitHub Action direkt startet, ginge nur mit einem Schlüssel im Browsercode, und das verbietet PROJEKT.md.
- **Stadt-Marker bis Zoom 11** (PROJEKT.md: bis 12). „Hier suchen“ geht ab Zoom 12, dort sollen die eigenen Orte sichtbar sein.
- **Stadt-Score weicht von PROJEKT.md ab**: Zusätzlich zählt die Bekanntheit der Stadt (Sprachversionen). Nur mit der Summe der Sehenswürdigkeiten bekamen Bamberg, Regensburg und Heidelberg nur ★, weil ihre einzelnen Bauten wenige Sprachversionen haben.
- **Stadt-Score ohne Artikellänge und Seitenaufrufe**: Dafür wären zehntausende Wikipedia-Abfragen nötig. Darum gelten eigene Schwellen, und sie lassen sich in `config.json` ändern, ohne neu zu rechnen.
- **Bekannte Schwächen**:
  - Städte ohne berühmte Einzelbauten (Ostende, Quedlinburg ★, San Gimignano ★) werden unterschätzt. Manche Industrie- oder Vorstädte mit vielen Museen und Kirchen werden überschätzt (Essen, Derby, Courbevoie ★★★).
  - Orte mit wenigen Sprachversionen fehlen (unter 12, z. B. das Schloss Morges).
  - Bei Gemeinden mit vielen Ortsteilen steht der Marker am Gemeinde-Mittelpunkt.
- **Installation**: Warum sie in v0.6.1 fehlschlug, ist nicht geklärt; ohne den Text der Fehlermeldung ist die Umstellung auf „standalone“ eine Vermutung. Bitte ⚙ → Diagnose → „Installieren“ ausfüllen, wenn es wieder nicht geht.

## v0.6.1 – 03.11.2026 – Mehr Platz für die Liste, Herkunft auf einen Blick

Rückmeldungen vom Test in Morges (OSM kam erst nach 170 s; Liste zu klein; offline/online nicht erkennbar).

- **Mehr Platz für die Liste**: Versionszeile („Reiseführer v0.6.1 · Sterne = Faustregel“) und Statuszeile stehen jetzt oben in der Liste und scrollen mit weg; unten ist nichts mehr fest.
- **Statuszeile höchstens zwei Zeilen**: Sterne-Zahlen, darunter „📥 Offline: Gebiet „Morges“ · Stand …“ (Daten vom Handy) oder „🌐 Online · W ✓ 2 s · OSM ✓ 12 s“ (aus dem Internet). Antippen zeigt weiter die Details.
- **Karte/Liste verstellen**: Schieber größer und leichter zu greifen. Antippen wechselt zwischen „Liste groß“ (Karte 22 %) und „Karte groß“ (70 %), Ziehen stellt frei ein (Karte 12–85 %).
- **Vollbild**: Die installierte App startet im Vollbild (ohne Adresszeile und Android-Leiste). In ⚙ „📲 App installieren“ (wenn Chrome es anbietet) und „⛶ Vollbild jetzt“ für den Browser.
- **OSM kommt später → wird automatisch eingefügt**: Statt „Tippe Hier suchen“ sucht die App still nochmal (OSM ist dann gespeichert, geht schnell), das offene Ortsfenster bleibt. Meldung „OpenStreetMap ergänzt: 6 Orte dazu“, Statuszeile „OSM ✓ 170 s (nachgeladen)“.
- **Neuer Filter „Nur aus OSM“** im Typen-Filter: zeigt, was OpenStreetMap dazugebracht hat.
- **Gebiete zeigen mehr**: „77 Orte (14 nur aus OSM) · OSM ✓ 45 s“, Kurzinfos und Texte als „vorhanden/gewünscht“ (z. B. „5/7 Kurzinfos“), fehlgeschlagene Kurzinfos und Texte mit Namen und Grund, noch nicht übersetzte Kurzinfos. Fehlt etwas oder kam OSM nicht, ist das Gebiet „unvollständig“ und „Fortsetzen“ lädt genau das nach (bei fehlendem OSM auch die Orte neu, Kurzinfos bleiben erhalten).
- **Vorbereiten und Suchen nicht gleichzeitig bei OSM**: Während ein Gebiet vorbereitet wird, nimmt „Hier suchen“ nur schon gespeicherte OSM-Daten („OSM wartet (Gebiet wird vorbereitet)“). Vermutlich kamen die 170 s daher, dass beides gleichzeitig bei Overpass anfragte.
- **Ortsfenster**: Zeile „Quellen … Lizenzen …“ entfernt (Lizenzen stehen weiter in ⚙). Der Wikipedia-Knopf öffnet den längsten Artikel, egal in welcher Sprache, und zeigt die Sprache an, z. B. „Wikipedia (fr)“ (Wunsch Nutzer).

### Annahmen/Abweichungen

- Vollbild gilt für die installierte App. Ist sie schon installiert, übernimmt Chrome die Änderung erst nach einiger Zeit; sonst einmal vom Startbildschirm entfernen und neu installieren.
- Warum in Morges nur 5 Kurzinfos und 3 Texte kamen, ist noch offen. Viele Orte dort kommen nur aus OSM und haben keinen Wikipedia-Text. Ab jetzt zeigt das Gebiet in ⚙, was fehlt und warum.

## v0.6.0 – 03.11.2026 – Gebiet vorbereiten (offline)

Vorgezogen aus v0.7/v0.10 (Wunsch Nutzer): eine Suche vorbereiten, die länger dauern darf, damit sie unterwegs sofort da ist – auch ohne Internet.

- **⚙ → „Kartenausschnitt vorbereiten“**: lädt für den ganzen Ausschnitt (bis 400 km²) in drei Schritten
  1. alle Orte: Wikipedia in Teilbereichen von 3 km, OpenStreetMap (wartet bis 10 Minuten), Wikidata;
  2. deutsche Kurzinfos für alle Orte ab ★ (übersetzt, wenn nötig);
  3. die ganzen Wikipedia-Artikel für alle Orte ab ★ (für „Erzähl mir davon“).
- **Fortschrittsleiste** unter den Filtern mit Schritt, Zähler, Zeit und „Abbrechen“. Der Bildschirm bleibt dabei an (Wake Lock). Abgebrochen oder App geschlossen: „Fortsetzen“ macht dort weiter, wo es aufgehört hat.
- **Benutzen**: Liegt der Kartenausschnitt in einem vorbereiteten Gebiet, ist „Hier suchen“ sofort fertig, ohne Internet. Statuszeile: „📥 Vorbereitet: „Manchester“, Stand …“. Ohne Internet wird auch ein Gebiet benutzt, das den Ausschnitt nur teilweise abdeckt. In „Suche – Details“: „Trotzdem online neu suchen“.
- **Offline geht**: Karte (bereits angesehene Kacheln), Liste, Sterne, Kurzinfos, Merkliste, „Erzähl mir davon“ und „Übersicht und Bewertung“ bauen den Prompt und kopieren ihn. Claude selbst und die Bilder brauchen Internet (Bilder erscheinen wieder, sobald Internet da ist).
- **Gebiete verwalten** in ⚙: Größe, Stand, Zahl der Orte/Kurzinfos/Texte, „Zeigen“, „Aktualisieren“ bzw. „Fortsetzen“, „Löschen“. Vorbereitete Gebiete sind auf der Karte grün gestrichelt. Speicherbedarf der App steht in ⚙.
- „Zwischenspeicher leeren“ lässt vorbereitete Gebiete stehen.
- **Diagnose**: Zusammenfassung listet die vorbereiteten Gebiete.

### Annahmen/Abweichungen

- Kartenbilder werden nicht vorab heruntergeladen: Das verbieten die Nutzungsregeln von OpenStreetMap. Offline sieht man die Kacheln, die man vorher angeschaut hat. Für eine richtige Offline-Karte: OsmAnd (siehe v0.5.0).
- Übersetzungen: Der kostenlose Dienst MyMemory hat ein Tageslimit. Bei großen Gebieten bleiben dann einige Kurzinfos in der Originalsprache; „Aktualisieren“ an einem späteren Tag übersetzt sie nach.
- Daten liegen in IndexedDB. Die App bittet den Browser, sie dauerhaft zu behalten (`storage.persist`); ob Chrome zustimmt, entscheidet Chrome.
- Wie lange das Vorbereiten auf dem Handy dauert, konnte ich nicht messen (Cloud-Session ohne Zugang zu den echten Schnittstellen). Geschätzt: Innenstadt 3 × 3 km etwa 2–5 Minuten.

## v0.5.0 – 03.11.2026 – Kartenausschnitt, Herkunft, Abbrechen, OsmAnd

- **Suche im sichtbaren Kartenausschnitt** statt Radius (Wunsch Nutzer): „Hier suchen“ sucht genau, was die Karte zeigt (gestrichelter Rahmen); Liste und Karte zeigen nur Orte darin. Der Radius-Filter ist weg. Ist der Ausschnitt zu groß (halbe Diagonale über 10 km, Grenze von Wikipedia): Hinweis „Bitte näher heranzoomen“. „Mein Standort“ und die Ortssuche zoomen auf Stufe 14 (etwa 2 × 2 km), Sehenswürdigkeiten auf 15.
- **Dichte Stadtzentren vollständig**: Wikipedia liefert höchstens 500 Artikel je Abfrage. Kommen 500, wird der Bereich geviertelt und neu gefragt (bis zu zweimal).
- **Herkunft sichtbar**: Statuszeile zeigt nach jeder Suche z. B. „Wikipedia ✓ 3 s · OSM ✓ 12 s, 6 neue“ (oder „OSM ✓ gespeichert“, „OSM übersprungen“, „OSM ✗ keine Antwort nach 120 s“). Antippen öffnet „Suche – Details“: Zeiten, Artikel je Sprache, Wikidata, OSM-Kacheln und Server, Zusammenführung, Orte nur W / nur OSM / beide. In der Liste steht bei jedem Ort **W**, **OSM** oder **W+OSM**.
- **Sekundenzähler und Knöpfe beim Suchen**: Nach 3 s erscheinen „Abbrechen“ und – sobald nur noch OpenStreetMap fehlt – „Ohne OSM weiter“. Ohne Knopfdruck wartet die App bis zu 2 Minuten auf OSM (`osm.max_wartezeit_s` 120, je Server 40 s). Kommt OSM später doch, meldet die App das („Hier suchen“ ergänzt die OSM-Orte dann sofort aus dem Speicher).
- **Fehler behoben (v0.4.1)**: Die kleineren OSM-Kacheln hatten doppelte Namen, dadurch fehlte ein Teil des Suchgebiets. Zwischenspeicher-Version 3.
- **Deutscher Name nur, wenn er wirklich anders ist** (Wunsch Nutzer): „Espace Horloger Vallée de Joux“ / „Espace Horloger de la Vallée de Joux“ zeigt nur noch einen Namen; „Château de Morges“ / „Schloss Morges“ weiterhin beide. Regel: Wörter ohne kleine Wörter (de, la, of, …), Akzente und Bindestriche vergleichen; sind die Wörter des einen Namens alle im anderen enthalten, gilt er als gleich.
- **„📋 Übersicht und Bewertung“** statt „Lohnt sich das?“ (Wunsch Nutzer): zum Lesen, nicht zum Vorlesen. Claude antwortet in fester Gliederung: Was ist das? · Auf einen Blick (Tabelle: Bewertungen mit Anzahl, Zeitbedarf, Eintritt, Öffnungszeiten, beste Zeit, Andrang, für wen) · Lohnt es sich? (Ja/Bedingt/Eher nicht) · 👍/👎 · Praktische Tipps · Quellen mit Stand. „Erzähl mir davon“ bleibt zum Anhören vor Ort.
- **OsmAnd als Karten-App** (⚙): „In OsmAnd“ öffnet OsmAnd+ mit Pin (Android-Intent-Link, ohne App öffnet die OsmAnd-Webkarte); „Pin“ nutzt dann den geo:-Link.
- **Diagnose**: neuer Abschnitt v0.5/v0.6 mit drei OsmAnd-Link-Varianten zum Ankreuzen und Checkliste.

### Annahmen/Abweichungen

- Öffnungszeiten und Eintritt in „Übersicht und Bewertung“: Abweichung von PROJEKT.md (dort „nicht das Ziel“), auf Wunsch des Nutzers für die Entscheidung „hingehen oder nicht“. Die App lädt sie nicht selbst; Claude recherchiert und soll den Stand angeben.
- Ob der OsmAnd-Link auf dem Handy direkt OsmAnd+ öffnet, konnte ich nicht testen. Darum drei Varianten in der Diagnose; die App nimmt danach die, die funktioniert.
- Der Ortsname steht nicht mehr vorne in der Statuszeile (er steht oben auf der Karte), damit die Liste auf kleinen Bildschirmen Platz behält.

## v0.4.1 – 03.11.2026 – Suche hängt nicht mehr

Anlass: Am Handy blieb die Suche bei „Lade Wikipedia (de, en, fr) und OpenStreetMap …“ stehen.

- **Zeitgrenze für alle Anfragen** (20 s, Overpass 25 s). Vorher konnte ein Server, der nicht antwortet, die Suche endlos blockieren.
- **Höchstens 20 s Warten auf OpenStreetMap** (`osm.max_wartezeit_s`): Danach zeigt die App die Wikipedia-Orte mit Hinweis. OSM lädt im Hintergrund weiter und wird gespeichert, sodass es bei der nächsten Suche sofort da ist.
- **Kleinere OSM-Kacheln** (0,05° statt 0,1°): Jede Overpass-Abfrage ist etwa viermal kleiner und schneller. Zwischenspeicher-Version 2 (alte Kacheln werden nicht mehr benutzt).
- Statuszeile zeigt „Wikipedia fertig – warte auf OpenStreetMap …“.
- Zwischenspeicher (IndexedDB) blockiert höchstens 2 s.

### Annahmen/Abweichungen

- Ursache am Handy nicht direkt messbar; wahrscheinlich ein überlasteter Overpass-Server ohne Antwort. Die Diagnose („1. Schnittstellen prüfen“) zeigt die Antwortzeit von Overpass.

## v0.4.0 – 03.11.2026 – OpenStreetMap dazu, Duplikate zusammenführen

- **OpenStreetMap als zweite Quelle** (PROJEKT.md 5d): Overpass-Abfrage nach benannten Sehenswürdigkeiten (`tourism` attraction/museum/gallery/viewpoint/artwork, `historic` Burg, Denkmal, Ruine, Kirche …, `amenity` theatre/library/arts_centre, benannte Parks/Gärten, Gipfel/Wasserfälle). Abfrage pro Kachel (0,1°), 30 Tage im Gerät gespeichert (IndexedDB), höchstens 2 gleichzeitig, Ausweich-Server, wenn einer nicht antwortet.
- **Zusammenführen** (PROJEKT.md 5b): gleiche Wikidata-ID → ein Ort; sonst ähnlicher Name (≥ 0,85) und ≤ 150 m → ein Ort; Koordinaten von Wikipedia; im Zweifel nicht zusammenführen. Auch doppelte OSM-Objekte (Punkt und Gebäude) werden zu einem.
- **Bewertung:** bestätigt OSM einen Wikipedia-Ort, gibt es +0,5 Punkte. OSM-Orte mit Wikidata-Eintrag werden wie Wikipedia-Orte bewertet (Artikel aus dem OSM-Tag `wikipedia`, damit gehen Kurzinfo und „Erzähl mir davon“). OSM-Orte ohne Wikidata: Grundwert 3 + Typ + Denkmal, höchstens ★; Museen trotzdem ★★, Aussichtspunkte mindestens ★ (Entscheidungen Nutzer).
- **Ortsfenster:** Quellen (Wikipedia · OpenStreetMap) und Lizenzen je Ort, OSM-Tag in „Warum …?“. Bei Orten nur aus OSM nutzt „Erzähl mir davon“ die OSM-Angaben (Künstler, Entstehung, Inschrift, Beschreibung) und sagt offen, dass es keinen Wikipedia-Artikel gibt.
- **Einstellungen:** OpenStreetMap-Orte an/aus. „Zwischenspeicher leeren“ löscht auch die OSM-Daten.
- **Diagnose:** Overpass-Test; Goldliste prüft „Rathaus und Kathedrale genau einmal“, „mindestens ein Ort nur aus OSM“ und zeigt die Duplikat-Quote (vorher/nachher).

### Annahmen/Abweichungen

- `historic=*` ist auf sehenswerte Werte begrenzt, Gedenktafeln (`memorial=plaque`) sind ausgeschlossen, sonst kämen in Großstädten Hunderte Tafeln dazu. Alles in `config.json` → `osm.filter` änderbar.
- Neuer Typ „Sehenswürdigkeit“ (`tourism=attraction`, Wikidata „tourist attraction“), Gewicht +1.
- Im Erzähl-Prompt heißt der Platzhalter für die Quelle jetzt `{quelle}` („Englisch, Wikipedia“ bzw. „OpenStreetMap, kein Wikipedia-Artikel“).
- Nicht live geprüft (Cloud-Session ohne Zugang zu Overpass); getestet mit synthetischen OSM-Daten.

## v0.3.3 – 03.11.2026 – „Lohnt sich das?“

- **Neuer Knopf „💬 Lohnt sich das?“** im Ortsfenster (Wunsch Nutzer): schickt einen Prompt an die Claude-App. Claude sucht im Netz Bewertungen und Erfahrungen von Besuchern (Google Maps, Tripadvisor, Foren, Blogs) und fasst zusammen: Bewertung je Quelle, was gelobt und kritisiert wird, ob sich der Besuch lohnt, praktische Tipps. Vorlage in `config.json` → `besucher.vorlage`.
- **Entfernt** (Wunsch Nutzer): Link „Bei Tripadvisor suchen“ und Knopf „Teilen“ im Ortsfenster. „Liste teilen“ in der Merkliste bleibt.

### Annahmen/Abweichungen

- Abweichung von PROJEKT.md Regel 10 und Abschnitt 2 (Tripadvisor nur als Suchlink): Bewertungen werden nicht von der App geladen, sondern von Claude im Abo des Nutzers recherchiert. Die App selbst ruft weiterhin keine Bewertungsportale auf.
- Ob Claude im Netz sucht, hängt von der Einstellung „Websuche“ in der Claude-App ab.

## v0.3.2 – 03.11.2026 – Korrekturen Kurzinfo und Beschriftung

- **Kurzinfo:** Sätze, die nur sagen, wo etwas liegt („… befindet sich in Pendleton, Salford.“), bleiben vollständig; vorher blieb „… befindet sich.“ übrig (Entscheidung Nutzer: dann lieber mit Ort).
- **Beschriftung:** Der Ortsname fällt nur weg, wenn danach ein vollständiger Name übrig bleibt (mindestens zwei Wörter oder ein langes Wort). „Old Trafford“ und „Trafford Centre“ bleiben ganz (vorher „Old“).
- **Ortsfenster** beginnt beim Öffnen immer oben (Foto und Text), auch beim Wechsel von einem Ort zum nächsten.

## v0.3.1 – 03.11.2026 – Kurzinfo verbessert

- **Kurzinfo ohne Ortsangabe** (Wunsch Nutzer): Die Ortsangabe am Satzende fällt weg („… ein öffentliches Kunstmuseum in Manchester.“ → „… ein öffentliches Kunstmuseum.“, auch „based in …“, „situé à …“). Ist der Satz dann kurz, kommt der zweite Satz dazu; der sagt meist, welche Kunst oder was es zu sehen gibt.
- **Kurzinfo erscheint auch nachträglich im offenen Ortsfenster** (vorher z. B. bei Cube Gallery leer, wenn das Fenster schneller offen war als die Übersetzung).
- Fehler behoben: Beschreibung „Contemporary art gallery based“ (Rest von „based in Manchester“).
- Hinweis „maschinell übersetzt aus dem …“ entfernt (Wunsch Nutzer).
- Neuer Typ **Herrenhaus** (manor house, country house, Landsitz), Gewicht +2,5; vorher als „Schloss“ eingeordnet.
- Gespeicherte Kurztexte aus v0.2.3/v0.3.0 werden einmal neu geladen (neuer Speicher `rf.kurz2`).

## v0.3.0 – 03.11.2026 – „Erzähl mir davon“

- **Ortsfenster als Detailansicht:** Bild aus Wikipedia, deutsche Kurzinfo, Wikipedia-Einleitung zum Aufklappen, Link zu Wikipedia, Quellen und Lizenz.
- **„🎧 Erzähl mir davon“:** baut den Prompt nach PROJEKT.md Abschnitt 8 (Vorlage in `config.json` → `erzaehlen.vorlage`) und übergibt ihn an die Claude-App per `claude://claude.ai/new?q=` (Ergebnis v0.1). Der Prompt wird immer zusätzlich kopiert; „Nochmal kopieren“ und „Claude öffnen“ bleiben sichtbar.
- **Ausführlichkeit** kurz / normal / ausführlich (Standard kurz, schont das Nachrichtenlimit) und **Schwerpunkt** (Geschichte, Architektur, Kunst, Menschen und Geschichten, Kurioses). Die Wahl wird gemerkt.
- **Quelltext:** kurz = Einleitung, normal = bis 3.000 Zeichen, ausführlich = bis 10.000 Zeichen, aus dem längsten Artikel (de/en/Landessprache), an einer Satzgrenze gekürzt (im Prompt vermerkt). Literatur-, Einzelnachweis- und Weblink-Abschnitte werden weggelassen. Der ganze Prompt bleibt immer ≤ 12.000 Zeichen.
- **„Schon gehört“:** Erzählte Orte werden markiert und in der Liste grau mit „✓ gehört“ gezeigt. Von Hand umschaltbar, in den Einstellungen ausblendbar oder leerbar.
- **Einstellungen:** Übergabe an Claude (App mit Text / kopieren und App öffnen / nur kopieren), „Schon gehört“.
- **Diagnose v0.3:** Prompts für das Rathaus Manchester in allen drei Längen bauen und prüfen (≤ 12.000 Zeichen), Kurz-Prompt direkt an Claude schicken, Abhakliste, Zusammenfassung.

### Annahmen/Abweichungen

- Der Artikeltext wird beim Öffnen des Ortsfensters vorgeladen, damit Claude noch innerhalb des Antippens geöffnet werden kann (Browser erlauben App-Links nur kurz nach einer Berührung). Dauert das Laden länger als 4 Sekunden, erscheint stattdessen der Knopf „Claude öffnen“.
- Wikivoyage-Zeile entfällt im Prompt, bis Wikivoyage in v0.5 dazukommt.
- Kurz-Quelltext auf 2.500 Zeichen begrenzt (lange Einleitungen).
- Entfernung steht nur im Prompt, wenn „Mein Standort“ bekannt ist und unter 30 km liegt.

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
