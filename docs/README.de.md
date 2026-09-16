# Codex Stream Deck – deutsche Anleitung

Diese macOS-Brücke zeigt Codex-Aufgaben und das verbleibende Wochenkontingent auf einem Stream Deck an. Sie arbeitet lokal und startet Codex nicht ungefragt neu. Hauptziel ist das **Stream Deck MK.2 mit 15 Tasten**.

**Experimentelle Community-Integration:** Codex-interne Datenformate und Tastenkürzel können sich ändern. Softwaretests ersetzen keine Prüfung am Gerät. Die genaue Testabdeckung steht in [VERIFICATION.md](VERIFICATION.md).

## Einrichtung

1. [Node.js](https://nodejs.org/en/download) installieren, mindestens Version 22.13; empfohlen ist Node 24. Codex normal installieren, öffnen und anmelden.
2. Auf GitHub **Code → Download ZIP** wählen und die ZIP entpacken. Terminal in diesem Projektordner öffnen.
3. Nacheinander ausführen:

   ```bash
   npm ci
   npm test
   npm run doctor
   ```

4. Die Elgato-Stream-Deck-App über ihr Menü beenden, damit sie das Gerät nicht gleichzeitig belegt.
5. Mit `npm start` starten. Das Terminal muss geöffnet bleiben. Mit **Strg+C** beenden.
6. Wenn macOS fragt, die Bedienung unter **Systemeinstellungen → Datenschutz & Sicherheit → Bedienungshilfen** sowie **Automation** für den ausführenden Node-/Terminal-Prozess erlauben. Das Projekt setzt diese Berechtigungen nicht selbst.

Zuerst eine Aufgabentaste testen: Sie muss die auf der Taste angezeigte Aufgabe öffnen. **Genehmigen sendet Enter und kann auch einen Entwurf absenden. Ablehnen sendet Escape.** Diese Tasten nur bei sichtbarem Codex-Fenster und bewusst verwenden.

## Tastenbelegung

| Spalte 1 | Spalte 2 | Spalte 3 | Spalte 4 | Spalte 5 |
| --- | --- | --- | --- | --- |
| Aufgabe 1 | Aufgabe 2 | Aufgabe 3 | Aufgabe 4 | Aufgabe 5 |
| Genehmigen / Enter | Ablehnen / Escape | Wochenrest | Fast Mode | Verzweigen |
| Quick Chat | Leer | Aktuelle Aufgabe archivieren | Sprache | Codex öffnen |

Blau: letzter gemeldeter Zustand „arbeitet“. Grau: abgeschlossen. Rot: abgebrochen. Nach einem Absturz kann der letzte Zustand veraltet sein. Fehlende Kontingentdaten werden als „KEINE DATEN“ dargestellt. Sprache ist ein Tastenkürzel zum Starten des Sprachmodus, kein Halten-zum-Sprechen.

## Autostart und Entfernen

Den manuell gestarteten Prozess zuerst mit Strg+C beenden. Dann:

```bash
npm run install:autostart -- --dry-run
npm run install:autostart
```

Nur der eigene Dienst wird geladen. Bestehende Laufzeit und Dienstdatei werden gesichert. Die Laufzeit liegt anschließend unter `~/Library/Application Support/CodexMicro`. Die Elgato-App darf bei der Anmeldung nicht gleichzeitig das Gerät übernehmen; ihren Autostart bei Bedarf selbst deaktivieren.

Entfernen: `npm run uninstall:autostart`. Laufzeit und Dienstdatei werden in den Papierkorb verschoben; Logs und Sicherungen bleiben erhalten. Codex-Daten werden nicht gelöscht. Danach kann die Elgato-App wieder normal geöffnet werden.

## Sprache und andere Installationsorte

Die Tastenbeschriftungen sind deutsch. Für englische Befehlsnamen: `CODEX_DECK_LOCALE=en npm start` bzw. dieselbe Variable vor `npm run install:autostart` setzen. Abweichende Befehlsnamen lassen sich über `CODEX_DECK_FAST_COMMAND` und `CODEX_DECK_SPLIT_COMMAND` einstellen. Andere CLI-Installationsorte über `CODEX_CLI_BIN`, eine bestimmte Node-Laufzeit über `CODEX_NODE_BIN` setzen. Details in der [englischen README](../README.md#configuration).

## Datenschutz und Hilfe

Die Brücke liest lokal Aufgabentitel, IDs und Statusmarker aus Codex-Dateien. Die Wochenanzeige fragt die installierte Codex-CLI ab; diese kann mit dem vorhandenen Konto OpenAI kontaktieren. Die Brücke überträgt keine Chatverläufe und enthält keine eigene Telemetrie. Sichtbare Aufgabentitel können von Personen am Schreibtisch gelesen werden.

Bei Problemen: [Fehlerbehebung](TROUBLESHOOTING.md). Niemals `.codex`, Zugangsdaten, Datenbanken oder echte Chat-/Sitzungsdateien in ein GitHub-Issue hochladen.

MIT-lizenziert, auf Basis von [Marcel Pociots Projekt](https://github.com/mpociot/codex-micro-stream-deck-emulator). Keine offizielle Erweiterung von OpenAI oder Elgato.
