# UI Refactoring Report

Stand: 2026-07-12

## Sicherung

- Backup-Branch: `backup/pre-ui-refactor`
- Snapshot-Commit: `441c15a PRE UI REFACTOR SNAPSHOT`
- Lokales Git-Bundle: `../backups/pre-ui-refactor-20260712.bundle`
- Arbeitsbranch: `codex/ui-refactor-navigation`
- Datenbank: Live-Dump wurde versucht, konnte in dieser lokalen Umgebung aber nicht erstellt werden, weil die Supabase-CLI kein Profil unter `~/.supabase/profile` gefunden hat. Datenmodelle, Migrationen und Konfigurationen sind über Git-Branch und Bundle gesichert; an der Live-Datenbank wurden keine Änderungen vorgenommen.

## Geänderte Dateien

- `src/App.tsx`
- `src/App.css`
- `src/components/ui/professional.tsx`
- `docs/ui-refactor-report.md`

## Phase 2: Professionalisierung

- Wiederverwendbare UI-Bausteine ergänzt: `PageHeader`, `ModuleCard`, `KpiCard`, `SectionPanel`, `InfoList`, `EmptyState`
- Buchhaltung als Arbeitscockpit mit vorhandenen Buchungsdaten aufgebaut
- Vermögen als aggregierte Sicht aus Portfolio, Buchhaltung und Darlehensdaten verbessert
- Nebenkosten-Startseite in dieselbe Modulstruktur gebracht
- Mobile Navigation als Akkordeon umgesetzt
- Read-only UX verfeinert: Lesezugänge behalten Such-, Filter- und Ladeaktionen, Admin-Aktionen werden aus Navigation/Hubs entfernt oder deaktiviert
- Darlehen auf `/darlehen` kanonisiert; alte Darlehensrouten bleiben kompatibel

## Phase 3: Nahaus-Funktionsvergleich

- Neue Seite `/funktionsvergleich` ergänzt
- Nahaus-Funktionsstruktur als Vorlage gegen die vorhandene Koenen Property Management gemappt
- Status je Funktionsblock ergänzt: `Vorhanden`, `Teilweise`, `Ausbau`
- Priorisierte Ausbauschritte sichtbar gemacht: Fristen/Erinnerungen, Vorlagen/Anschreiben, Bewerber-Pipeline, Zählerverwaltung, Bankintegration
- Keine Businesslogik, Datenmodelle oder vorhandenen Fachseiten geändert

## Verschobene Seiten / neue Informationsarchitektur

Die bestehenden Seiten wurden nicht fachlich verschoben oder neu implementiert. Es wurden neue Modul-Routen und Hubseiten ergänzt, die auf vorhandene Seiten zeigen.

## Neue Hauptmodule

- Dashboard
- Immobilien
- Mieter
- Buchhaltung
- Nebenkosten
- Kautionen
- Darlehen
- Vermögen
- Ticketing
- Dokumentenmanagement
- Produktivität
- Berichte
- Benutzer
- Einstellungen

## Alte Seite -> Neue Position

| Alte Seite | Neue Position |
| --- | --- |
| `/cockpit` | `/dashboard` |
| `/portfolio` | `/immobilien` |
| `/mieteruebersicht` | `/mieter/mieteingang` |
| `/mieter-anlegen` | `/mieter/stammdaten` |
| `/leerstand` | `/mieter/leerstand` |
| `/ein-auszug` | `/mieter/ein-auszug` |
| `/mahnwesen` | `/mieter/mahnwesen` oder `/buchhaltung/mahnwesen` |
| `/monate` | `/buchhaltung/transaktionen` |
| `/buchungen` | `/buchhaltung/neue-buchung` |
| `/transaktionsregeln` | `/buchhaltung/regeln` |
| `/nebenkosten` | `/nebenkosten` |
| `/nebenkosten/wohnungen` | unverändert |
| `/nebenkosten/tiefgarage` | unverändert |
| `/darlehensuebersicht` | `/darlehen` |
| `/auswertungen` | `/berichte` |
| `/steuer` | `/steuer` |
| `/datenpruefung` | `/datenpruefung` |
| `/administrator` | `/administrator` und `/benutzer` |

## Neue Routen

- `/dashboard`
- `/immobilien`
- `/immobilien/:propertyId/...`
- `/mieter`
- `/mieter/uebersicht`
- `/mieter/stammdaten`
- `/mieter/vertrag`
- `/mieter/zahlungen`
- `/mieter/mieteingang`
- `/mieter/dokumente`
- `/mieter/historie`
- `/mieter/ein-auszug`
- `/mieter/notizen`
- `/mieter/kommunikation`
- `/mieter/leerstand`
- `/mieter/mahnwesen`
- `/buchhaltung`
- `/buchhaltung/transaktionen`
- `/buchhaltung/einnahmen`
- `/buchhaltung/ausgaben`
- `/buchhaltung/neue-buchung`
- `/buchhaltung/regeln`
- `/buchhaltung/mahnwesen`
- `/buchhaltung/kautionen`
- `/buchhaltung/nebenkosten`
- `/buchhaltung/berichte`
- `/buchhaltung/export`
- `/darlehen/tilgungsplan`
- `/darlehen/zahlungen`
- `/darlehen/restschuld`
- `/darlehen/zinsen`
- `/darlehen/historie`
- `/darlehen/dokumente`
- `/darlehen/immobilienzuordnung`
- `/kautionen`
- `/vermoegen`
- `/ticketing`
- `/dokumente`
- `/produktivitaet`
- `/berichte`
- `/benutzer`
- `/einstellungen`

## Wiederverwendete Komponenten / Seiten

- `Cockpit`
- `Portfolio`
- `PortfolioPropertyLayout`
- `PortfolioObjectDetail`
- `PortfolioDetails`
- `PortfolioRenting`
- `PortfolioFinance`
- `PortfolioFinanceModules`
- `PortfolioAddress`
- `PortfolioEnergy`
- `Monate`
- `EntryAdd`
- `Transaktionsregeln`
- `Mietuebersicht`
- `MieterAnlegen`
- `Leerstand`
- `EinAuszug`
- `Mahnwesen`
- `NebenkostenWohnungen`
- `NebenkostenTiefgarage`
- `Darlehensuebersicht`
- `SteuerCenter`
- `Auswertung`
- `Datenpruefung`
- `Administrator`

## Risiken

- Neue Hubseiten sind reine Navigation. Falls zukünftig echte Dokumenten-, Ticket- oder Kautionsseiten entstehen, sollten die Hub-Links auf diese Fachseiten umgestellt werden.
- Einige neue Detailrouten nutzen bewusst vorhandene Seiten als fachliche Quelle. Dadurch bleibt die Datenlogik stabil, aber nicht jede Route hat bereits eine speziell gestaltete Detailansicht.
- Das bestehende globale Lint-Backlog bleibt als Warnungen bestehen.

## Regression-Check

- TypeScript Build: bestanden
- Gezielter ESLint-Check `src/App.tsx`: bestanden
- Gesamt-Lint: bestanden mit bestehendem Warnungs-Backlog
- Browser-Routing-Check: bestanden fuer neue und alte Kernrouten
- Mobile Navigation 390px: bestanden, kein horizontaler Overflow
- Browser Console Errors: keine
- Businesslogik: nicht verändert
- Datenmodelle: nicht verändert
- APIs/Services: nicht verändert
- Datenquellen: nicht verändert
- Bestehende Alt-Routen: erhalten oder auf neue Struktur umgeleitet

## Bestätigung

Dieses Refactoring ändert Navigation, Routing und Informationsarchitektur. Bestehende Businesslogik, Datenquellen, Berechnungen, Services, APIs und Datenmodelle wurden nicht ersetzt.
