# PHASE 1 – Bestandsaufnahme (Architektur-Review)

Datum: 2026-07-18
Autor: automatisierte Bestandsaufnahme (Sprint 1 – Phase 1)

## 1) Vorgehen
- Gelesen: `docs/ARCHITEKTUR-CHARTA.md`, `docs/meisterregeln.md`, `data/vorgaenge/VG-0001.json`, `public/app.js`, `public/index.html`.
- Zusätzlich Verzeichnisinhalt geprüft: `docs/`, `data/vorgaenge/`.

## 2) Kurzüberblick
Die aktuelle Implementierung ist ein leichtgewichtiger Prototyp, der Vorgangsdaten aus einer lokalen JSON-Datei lädt und im Browser darstellt. Ergänzende lokale Ereignisse werden in `localStorage` gehalten. Erste UI-Interaktionen (Ereignis hinzufügen, Entscheidung aus Ereignis erzeugen) sind umgesetzt.

## 3) Abgleich gegen Architektur-Prinzipien
- **1. Der Vorgang ist die universelle Grundeinheit.** ✅
  - Begründung: Die Anwendung lädt eine `Vorgang`-Datei (`VG-0001.json`) und behandelt `ereignisse`, `entscheidungen`, `aktionen`, `erfahrungen` als Unterstrukturen.

- **2. Fachsysteme bleiben Source of Truth.** 🟡
  - Begründung: Aktuell werden Daten aus einer lokalen JSON-Datei gelesen (Prototyp für SOT). Es gibt noch keine Anbindung an echte Fachsysteme; Prinzip ist konzeptionell respektiert, aber technisch nicht umgesetzt.

- **3. Stamm vor Blatt.** 🟡
  - Begründung: Daten sind in `vorgang`-Struktur gehalten; Erweiterungen (lokale Ereignisse) werden separat in `localStorage` gehalten. Gute Richtung, aber es fehlt ein klares Modell/Schema und zentraler Persistenzlayer.

- **4. Der Baum beschreibt die Struktur.** ✅
  - Begründung: `vorgang` mit Arrays (ereignisse/entscheidungen/aktionen/erfahrungen) entspricht einer baumähnlichen Struktur.

- **5. Der Wald beschreibt das Verhalten.** 🟡
  - Begründung: Verhalten wird lokal umgesetzt (UI-Handler, localStorage). Langfristiges Lern-/Analysesystem nicht vorhanden.

- **Ubiquitous Language (Begriffe vorhanden).** ✅
  - Begründung: Begriffe wie `Vorgang`, `Ereignis`, `Entscheidung`, `Aktion`, `Erfahrung` sind in Code/Datei/Nomenklatur vorhanden.

## 4) Datenstruktur-Check (gegen Anforderungen in der Charta)
- `data/vorgaenge/VG-0001.json` enthält: `id, titel, status, prioritaet, kontext, verantwortlich, quelle, ereignisse, entscheidungen, aktionen, erfahrungen` → entspricht Mindestanforderungen der Charta (ID, Titel, Status, Kontext, Verantwortliche, Priorität, Historie). ✅
- Feldnamen: `prioritaet` (ASCII) vs. Charta spricht generisch von `Priorität` — intern konsistent, empfehlenswert: Schema-Dokumentation. 🟡

## 5) Code-Übersicht (UI & Logik)
- `public/index.html` zeigt Haupt-Layout, Karten, Platzhalter-IDs für Vorgangsdaten (`vorgang-titel`, `vorgang-status`, ...). ✅
- `public/app.js` enthält minimalen Loader (`fetch` der JSON), `renderVorgang(vorgang)`, lokale Speicherung von Ereignissen (`localStorage` Key `keosVorgangEvents:VG-0001`), Erzeugung einer Entscheidung in-memory. ✅
- Beobachtungen:
  - Keine zentrale Datenzugriffsschicht (Repository/Service) — Fetchs erfolgen direkt an zwei Stellen.
  - UI-Rendering ist in `renderVorgang` zusammengefasst, aber gemischt mit persistence-Details (localStorage). 🟡
  - Validierung ist minimal (trim, keine HTML-Injection via innerHTML — gut). ✅

## 6) Sicherheits- / Qualitätsaspekte
- Keine Verwendung von `innerHTML` für Benutzereingaben — gute Praxis. ✅
- localStorage wird ohne verschlüsselung genutzt (erwartet für Prototyp). ❗ Hinweis: sensitiven Daten nicht dort ablegen.
- Fehlendes Schema-Validation/Type-Checks (kein JSON-Schema). 🟡

## 7) Dokumente / Dateien geprüft
- `docs/ARCHITEKTUR-CHARTA.md` (vollständig gelesen)
- `docs/meisterregeln.md` (gelesen)
- `data/vorgaenge/VG-0001.json` (gelesen)
- `public/app.js` (gelesen)
- `public/index.html` (gelesen)
- Verzeichnisse geprüft: `docs/`, `data/vorgaenge/`

## 8) Markierungen (erfüllt / teilweise / nicht vorhanden)
- Vorgang als Einheit geladen und dargestellt: ✅
- Gemeinsame Sprache sichtbar im Code: ✅
- Source-of-Truth Anbindung an Fachsysteme: ❌ (nur lokales JSON als Prototyp)
- Zentrale Persistenz/Repository-Layer: ❌
- Schema-Validierung für Vorgänge: ❌
- Konkrete Rollen-/Zugriffsmodellierung: ❌
- Historie- und Audit-Mechanismen: 🟡 (Basale Felder vorhanden, keine Implementierung)
- Trennung von UI-Rendering und Datenzugriff: 🟡

## 9) Konkrete Empfehlungen (kurz & priorisiert)
1. Kurzfristig (niedriger Aufwand)
   - 1.1 Dokumentiere das JSON-Schema (z.B. `docs/schema/vorgang-schema.md`) und Benennungskonventionen (`prioritaet` vs `priorität`).
   - 1.2 Verschiebe `localStorage`-Key-Namenslogik in eine kleine Hilfsfunktion (in `app.js`) zur Wiederverwendbarkeit.
   - 1.3 Entferne Inline-Styles in `index.html` (z. B. `style="margin-top:8px;"`) zugunsten vorhandener Klassen.

2. Mittelfristig (moderater Aufwand)
   - 2.1 Implementiere eine einfache Data-Service-Schicht (`vorgangService`) zur Kapselung von Laden, Mergen (JSON + local) und optionaler Persistenz-Anbindung.
   - 2.2 Führe JSON-Schema-Validation beim Laden ein; zeige klare Fehlermeldungen in UI/Console.
   - 2.3 Trenne Rendering-Logik in kleinere Render-Helper (z. B. `renderEreignisse`, `renderEntscheidungen`).

3. Langfristig (größerer Aufwand)
   - 3.1 Anbindung an echte Fachsysteme (Source of Truth) via adaptierbare Connector-Interfaces.
   - 3.2 Einführung von Konfigurierbarem Kontext/Role-Based Views.
   - 3.3 Persistenzlayer für Entscheidungen/Aktionen (eventuell serverseitig oder per Sync-Service).

## 10) Vorschläge für sinnvolle Ergänzungen (Dateien)
- `docs/schema/vorgang-schema.md` — JSON-Schema + Feldbeschreibung.
- `docs/architecture/README.md` — kurze Roadmap für Phase 2+.
- `docs/notes/best-practices.md` — lokale Richtlinien (no innerHTML, localStorage usage, key naming).

## 11) Punkte bewusst NICHT übernommen / nicht empfohlen
- Direkter Schreibzugriff auf `data/vorgaenge/*.json` aus dem Browser (keine Persistenz auf Dateisystem im Client).
- Verwendung schwergewichtiger Frameworks in dieser Projektphase.
- Änderung der bestehenden IDs, Funktionen oder der `ARCHITEKTUR-CHARTA.md`.

## 12) Empfohlener EINER Mini-Sprint (konkret)
Sprint-Ziel: Grundlegende Sauberkeit der Datenzugriffsschicht und Dokumentation.
- Tasks (3–5 Tage / 1 Entwickler):
  1. Erstelle `docs/schema/vorgang-schema.md` (JSON-Schema + Feldbeschreibungen).
  2. Implementiere in `public/app.js` (klein) einen `vorgangService` mit Funktionen `loadVorgang()`, `loadLocalEvents(vorgangId)`, `mergeEvents(vorgang)` — refactor minimal und lokal.
  3. Extrahiere `localStorage`-Key in eine zentrale Konstante/helper.
  4. Entferne Inline-Styles und passe `index.html` auf bestehende Klassen um.
- Erfolgskriterien: Anwendung verhält sich unverändert sichtbar (Regressionsfrei), JSON-Schema existiert, Rendering nutzt `vorgangService` intern.

## 13) Welche Dateien wurden geprüft (Kurzliste)
- docs/ARCHITEKTUR-CHARTA.md
- docs/meisterregeln.md
- public/index.html
- public/app.js
- data/vorgaenge/VG-0001.json

---

Wenn du freigibst, kann ich aus dieser Bestandsaufnahme einen enger gefassten Mini-Sprint (Ticket-Liste) erzeugen oder direkt die vorgeschlagene `docs/schema/vorgang-schema.md` anlegen (nur Dokumentation, kein Codeänderung).