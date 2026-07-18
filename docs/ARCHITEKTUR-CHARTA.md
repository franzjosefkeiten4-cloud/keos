# KEOS – Architektur-Charta

Version: 0.1 (Arbeitsentwurf)

---

## Präambel

Das Keiten Enterprise Operating System (KEOS) unterstützt Menschen dabei,
bessere Entscheidungen zu treffen.

KEOS ersetzt keine bestehenden Fachsysteme.
KEOS ersetzt keine Menschen.

KEOS verbindet Informationen, Kontext, Erfahrungen und Prioritäten zu einer
gemeinsamen Arbeitsoberfläche.

KI unterstützt.

Der Mensch entscheidet.---

# Grundprinzipien

## 1. Der Vorgang ist die universelle Grundeinheit.

Alles beginnt als Vorgang.

---

## 2. Fachsysteme bleiben Source of Truth.

KEOS ergänzt.
KEOS ersetzt nicht.

---

## 3. Stamm vor Blatt.

Neue Ideen werden zuerst bestehenden Bausteinen zugeordnet.

---

## 4. Der Baum beschreibt die Struktur.

Architektur muss klar, stabil und verständlich bleiben.

---

## 5. Der Wald beschreibt das Verhalten.

Das Unternehmen lernt durch Erfahrungen, Signale und Zusammenhänge.---

# Gemeinsame Sprache (Ubiquitous Language)

KEOS verwendet eine gemeinsame Sprache für alle Menschen, Prozesse,
Fachsysteme und KI-Agenten.

Bevor neue Datenstrukturen, Module oder Schnittstellen entstehen,
werden zuerst die fachlichen Begriffe definiert.

## Zentrale Begriffe

- Vorgang
- Beobachtung
- Signal
- Kontext
- Entscheidung
- Aktion
- Ergebnis
- Erfahrung
- Lernen
- Priorität
- Mensch
- Rolle
- Kunde
- Projekt
- Aufgabe
- Termin
- Kommunikation
- Dokument
- Wissen
- Meisterregel---

# Definition: Vorgang

Ein Vorgang ist die kleinste zusammenhängende fachliche Arbeitseinheit innerhalb des
Keiten Betriebssystems.

Ein Vorgang entsteht immer dann, wenn etwas beobachtet,
ausgelöst oder entschieden wird.

Ein Vorgang ist zunächst neutral.

Er ist noch kein Kunde.
Er ist noch kein Angebot.
Er ist noch keine Aufgabe.

Er beschreibt lediglich:

"Hier ist etwas passiert oder soll etwas passieren."

Aus einem Vorgang können später unter anderem entstehen:

- ein Lead
- ein Kunde
- ein Angebot
- ein Auftrag
- eine Reklamation
- eine Aufgabe
- ein Termin
- eine Verbesserung
- ein Wissenseintrag---

## Abgrenzung: Vorgang und Ereignis

Ein Ereignis ist etwas, das passiert.

Ein Vorgang ist der fachliche Zusammenhang, der daraus entsteht.

Beispiel:

- Ereignis: Ein Kunde ruft an.
- Vorgang: Rückfrage zur Matratzenanpassung.

Ein Vorgang kann aus einem einzelnen Ereignis entstehen.
Er kann aber auch mehrere Ereignisse zusammenhalten.

Beispiel:

- Kunde ruft an.
- Rückfrage wird notiert.
- Termin wird vereinbart.
- Anpassung wird durchgeführt.
- Ergebnis wird dokumentiert.

Diese einzelnen Ereignisse gehören zu einem gemeinsamen Vorgang.

---

## Eigenschaften eines Vorgangs

Jeder Vorgang besitzt mindestens:

- eine eindeutige Kennung
- einen Titel
- einen Entstehungszeitpunkt
- einen aktuellen Status
- einen Kontext
- eine verantwortliche Person oder Rolle
- eine Quelle
- eine Priorität
- eine Historie

Optional kann ein Vorgang zusätzlich enthalten:

- beteiligte Personen
- verknüpfte Kunden
- verknüpfte Projekte
- Termine
- Aufgaben
- Dokumente
- Entscheidungen
- Beobachtungen
- Signale
- Erfahrungen
- Verweise auf Fachsysteme

---

## Grundzustände eines Vorgangs

Ein Vorgang kann mindestens folgende Zustände durchlaufen:

1. Erfasst
2. Zu prüfen
3. In Bearbeitung
4. Wartet
5. Entschieden
6. Erledigt
7. Abgebrochen
8. Archiviert

Die Zustände sollen den tatsächlichen Arbeitsstand beschreiben.

Sie dürfen nicht unnötig kompliziert werden.

---

## Lebenszyklus eines Vorgangs

Ein typischer Vorgang durchläuft folgende Schritte:

Beobachtung  
→ Erfassung  
→ Einordnung  
→ Priorisierung  
→ Entscheidung  
→ Aktion  
→ Ergebnis  
→ Erfahrung  
→ Lernen

Nicht jeder Vorgang muss jeden Schritt durchlaufen.

---

## Verantwortlichkeit

Ein Vorgang kann einer Person oder einer Rolle zugeordnet sein.

Beispiele:

- Franz-Josef
- Elias
- Samuel
- Viktor
- Verkauf
- Werkstatt
- Nachbetreuung
- Buchhaltung

Es soll immer erkennbar sein:

- Wer trägt aktuell Verantwortung?
- Wer wartet auf wen?
- Was ist der nächste sinnvolle Schritt?

---

## Fachsystem-Verweise

Ein Vorgang darf auf Datensätze in Fachsystemen verweisen.

Beispiele:

- HERO-Projekt
- GoHighLevel-Kontakt
- Lexware-Rechnung
- Kalendereintrag
- E-Mail
- Dokument

Diese Fachsystem-Verweise ersetzen keine Source of Truth.

Sie verbinden den Vorgang lediglich mit den führenden Datenquellen.

---

## Schutzregel

Ein Vorgang darf nicht allein deshalb entstehen, weil ein Fachsystem einen Datensatz besitzt.

Ein Vorgang entsteht nur dann, wenn daraus ein relevanter Arbeits-, Entscheidungs- oder Lernzusammenhang entsteht.---

# Definition: Kontext

Kontext beschreibt den fachlichen Zusammenhang, in dem ein Vorgang
gerade betrachtet, verstanden oder bearbeitet wird.

Kontext beantwortet insbesondere die Fragen:

- Worum geht es gerade?
- Für wen ist dieser Vorgang relevant?
- In welcher Situation befinden wir uns?
- Welche Informationen gehören zusammen?
- Welche Entscheidung steht an?
- Was ist jetzt wichtig?

Ein Vorgang kann mehrere Kontexte besitzen.

Beispiele:

- Mein Tag
- aktueller Kunde
- aktuelles Projekt
- aktuelle Reklamation
- aktuelle Beratung
- aktuelle Nachbetreuung
- aktueller Werkstattauftrag
- aktuelle Entscheidung

Kontext ist keine Kopie von Fachsystemdaten.

Er verbindet Informationen aus verschiedenen Quellen zu einer
verständlichen Arbeitssituation.

---

## Kontext und Fachsystem

Ein Fachsystem zeigt Daten aus seiner eigenen Domäne.

Kontext verbindet diese Daten über Systemgrenzen hinweg.

Beispiel:

Ein Kunde kann gleichzeitig verbunden sein mit:

- einem GoHighLevel-Kontakt
- einem HERO-Projekt
- einer Lexware-Rechnung
- einem Kalendereintrag
- mehreren E-Mails
- einem offenen Vorgang in KEOS

KEOS fasst diese Informationen nicht vollständig doppelt zusammen.

KEOS zeigt nur den Zusammenhang, der für die aktuelle Arbeit relevant ist.

---

## Kontext und Mensch

Kontext ist immer abhängig von der Person oder Rolle, die gerade arbeitet.

Der gleiche Vorgang kann für verschiedene Menschen unterschiedlich
dargestellt werden.

Beispiel:

Für Franz-Josef ist relevant:

- Welche Entscheidung muss getroffen werden?
- Welche Kundenzusage darf nicht liegen bleiben?

Für Samuel ist relevant:

- Was muss in der Werkstatt umgesetzt werden?
- Welche technische Information fehlt?

Für Elias ist relevant:

- Welcher Kunde muss zurückgerufen werden?
- Welche Nachverfolgung ist fällig?

Für Viktor ist relevant:

- Welcher kaufmännische Schritt fehlt?
- Welche Information muss dokumentiert oder weitergegeben werden?

Der Vorgang bleibt derselbe.

Der Arbeitskontext verändert die Sicht darauf.

---

## Kontext und Priorität

Priorität entsteht nicht allein aus dem Vorgang.

Sie entsteht aus dem Zusammenspiel von:

- Vorgang
- Rolle
- Zeitpunkt
- Verpflichtung
- Auswirkung
- Meisterregel
- aktuellem Arbeitskontext

Ein Vorgang kann deshalb für eine Person heute sehr wichtig sein und für
eine andere Person nur informativ.

---

## Kontextarten

KEOS unterscheidet zunächst mindestens:

### Persönlicher Kontext

Beispiele:

- Mein Tag
- Meine offenen Entscheidungen
- Meine Zusagen
- Meine wartenden Vorgänge

### Kundenkontext

Beispiele:

- offene Beratung
- Angebot
- Auftrag
- Reklamation
- Nachbetreuung

### Projektkontext

Beispiele:

- Planung
- Freigabe
- Produktion
- Montage
- Abrechnung

### Organisationskontext

Beispiele:

- wiederkehrender Fehler
- Verbesserungsidee
- Erfahrungswissen
- relevantes Signal
- neue Meisterregel

### Zeitlicher Kontext

Beispiele:

- heute
- diese Woche
- überfällig
- wartet seit
- fällig am

---

## Kontextwechsel

KEOS soll einen Kontextwechsel erleichtern.

Ein Mitarbeiter soll nicht jedes Fachsystem einzeln durchsuchen müssen,
um zu verstehen, was gerade relevant ist.

Stattdessen soll KEOS den passenden Zusammenhang sichtbar machen und bei
Bedarf gezielt zum führenden Fachsystem weiterleiten.

---

## Schutzregel

Kontext darf nicht zu einer vollständigen Kopie aller verfügbaren Daten
werden.

Es wird nur angezeigt und gespeichert, was für Verständnis, Entscheidung,
Aktion oder Lernen notwendig ist.