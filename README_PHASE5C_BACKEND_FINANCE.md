# Koenen Property Management – Phase 5C Backend-Finanzlogik

Diese Phase ergänzt die Datenbank um eine serverseitige **Single Source of Truth** für zentrale Finanzkennzahlen.

## Neue Migration

```text
supabase/migrations/20260518223000_phase5c_backend_finance_master.sql
```

Bitte im Supabase SQL Editor ausführen.

## Enthalten

- `koenen_normalize_object_name(text)`  
  Einheitliche Normalisierung von Objekt-/Straßennamen, inkl. Rosenstein/Rosensteinstraße und Testobjekt-Filter.

- `v_property_master_objects`  
  Kanonische Objektliste aus Objekt-Dropdown + Darlehensdashboard.

- `v_property_finance_master_yearly`  
  Zentrale Jahres-Finanzsicht je Objekt:
  - Einnahmen
  - Ausgaben
  - Capex
  - operativer Aufwand
  - Cashflow
  - Mietanteil
  - Zins
  - Tilgung
  - Debt Service
  - DSCR
  - Restschuld je Jahr
  - letzte Restschuld

- `get_property_finance_master(p_year)`  
  RPC für Frontend/Reports.

- `get_property_finance_consistency(p_year)`  
  RPC für Datenprüfung:
  - Einnahmen-Abweichungen
  - Ausgaben-Abweichungen
  - Restschuld-Abweichungen
  - doppelte Objekt-Normalisierungen

- `refresh_koenen_finance_materialized_views()`  
  RPC zum sicheren Aktualisieren bekannter Materialized Views. Nicht vorhandene Views werden übersprungen.

## Neue Frontend-Service-Datei

```text
src/services/backendFinanceMasterService.ts
```

Diese Datei stellt typisierte Funktionen bereit:

- `loadBackendFinanceMaster(year)`
- `loadBackendFinanceConsistency(year)`
- `refreshBackendFinanceMaterializedViews()`

## Ziel

Ab Phase 5C können Portfolio, Auswertung, Datenprüfung und spätere Reports dieselben Backend-Masterwerte nutzen, statt jede Seite separat rechnen zu lassen.
