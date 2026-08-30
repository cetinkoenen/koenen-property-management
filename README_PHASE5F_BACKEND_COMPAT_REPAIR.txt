Koenen Property Management – Phase 5F Backend Compatibility Repair

Dieses Paket behebt die Fehler:
- column v_object_dropdown.objekt_code does not exist
- Backend-Finanzmaster konnte nicht geladen werden: column objekt_code does not exist
- Automatisierung 2B kann Objektliste nicht laden
- Buchungen kann Objektliste nicht laden

Anwendung:
1. SQL-Datei im Supabase SQL Editor ausführen:
   supabase/migrations/20260519161000_phase5f_backend_compat_repair.sql

2. Danach testen:
   select * from public.v_object_dropdown;
   select * from public.get_property_finance_master(2026);
   select * from public.get_koenen_data_quality_checks(2026);

3. Danach App neu laden / Vercel Deployment erneut öffnen.
