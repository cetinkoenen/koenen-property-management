Koenen Property Management – Phase 2B Upgrade

Umgesetzt:
- neuer Bereich "Automatisierung 2B" im Auswertungscenter
- Hinweis- und Taskcenter mit Prioritäten
- automatische Mietcheck-Regel für fehlende Miet-/Garagenbuchungen im aktuellen Monat
- automatische Cashflow-Risikoampel je Objekt
- automatische Capex-Erkennung über Kategorien/Notizen (Sanierung, Reparatur, Modernisierung usw.)
- automatische NK-/Betriebskosten-Erkennung über Kategorien/Notizen
- Objekt-Risikoampel mit Einnahmen, Ausgaben, Netto und Status
- alle Regeln sind bewusst nur Prüf-/Vorschlagslogik: Es wird nichts automatisch gebucht, geändert oder gelöscht

Prüfung:
- npm run typecheck erfolgreich
- vollständiger Vite-Build im Container nicht ausführbar wegen Node 18 / Rollup optional dependency; auf dem Mac mit Node 20+ bitte npm install und npm run build ausführen.
