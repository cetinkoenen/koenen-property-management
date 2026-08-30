# Koenen Property Management – Phase 3B Stabilität & Performance Update

Umgesetzt:
- neuer Bereich „Stabilität 3B“ im Auswertungscenter
- technische Stabilitäts-Checkliste für Single Source, Datenabweichungen, Lade-/Fallbackfähigkeit und UI-Stabilität
- Datenbereitschaftsanzeige für Objekte, Buchungen, Portfolio, Darlehen und Jahresfinanzen
- Objektliste mit höchstem Prüfbedarf auf Basis der Master-Finanzlogik
- klarere Empty-/Loading-Zustände und KPI-Skeletons
- robustere Diagnoseansicht ohne zusätzliche Supabase-Abfragen; nutzt vorhandenen App-Kontext und Master-Service
- bessere Hinweise, welche Datenbereiche fehlen oder geprüft werden sollten

Geprüft:
- npm run typecheck erfolgreich
- vollständiger Vite-Build im Container nicht möglich wegen lokaler Node/Rollup-Umgebung: Vite 7 benötigt Node 20.19+ und Rollup optional dependency fehlt in der Containerumgebung.

Lokal empfohlen:
- Node >= 20.19 verwenden
- npm install
- npm run build
- npm run dev
