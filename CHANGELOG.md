# Changelog

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
