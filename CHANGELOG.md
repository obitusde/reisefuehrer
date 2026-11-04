# Changelog

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
