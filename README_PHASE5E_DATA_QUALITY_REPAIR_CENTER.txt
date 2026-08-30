Koenen Property Management – Phase 5E: Datenprüfung & Reparatur-Center

Umgesetzt:
- neue Supabase-RPC get_koenen_data_quality_checks(p_year)
- serverseitige Qualitätschecks für:
  - doppelte Objekt-Normalisierung
  - Test-/Trigger-/RLS-/Dummy-Objekte
  - fehlende Darlehens-Ledgerdaten
  - fehlende Einnahmen im aktuellen Jahr
  - negative Cashflows
  - auffällig hohe Capex-Quote
  - fehlende Dokumente je Objekt
  - Backend-Finanzkonsistenz aus Phase 5C
- Frontend-Datenprüfung erweitert:
  - Phase-5E Backend-Qualitätscenter
  - kritische/warnende Checks
  - konkrete Reparaturhinweise
  - Button zum Refresh der Materialized Views
- Backend-Finance-Hook erweitert um dataQualityChecks

Wichtig:
Die SQL-Migration muss in Supabase ausgeführt werden:
supabase/migrations/20260518224500_phase5e_data_quality_repair_center.sql

Geprüft:
- TypeScript-Check erfolgreich über ./node_modules/.bin/tsc -b --noEmit
- vollständiger Vite-Build im Container nicht möglich wegen Node 18/Rollup optional dependency; lokal bitte Node 20.19+ verwenden.
