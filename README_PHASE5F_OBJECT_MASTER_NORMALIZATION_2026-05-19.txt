Koenen Property Management – Phase 5F Objekt-Master-Normalisierung
Stand: 2026-05-19

Umgesetzt:
1. Backend: neue Migration 20260519130000_phase5f_object_master_normalization.sql
   - verbessert koenen_normalize_object_name
   - führt v_koenen_property_object_aliases ein
   - überschreibt v_property_master_objects und v_property_finance_master_yearly alias-basiert
   - überschreibt get_koenen_data_quality_checks ohne doppelte Objektvarianten

2. Backend: alte Phase-5E-Migration repariert
   - kein ORDER-BY-Ausdruck direkt nach UNION mehr
   - keine objects.name-Abhängigkeit
   - Phase 5F überschreibt die Funktion anschließend final

3. Frontend: AppDataContext.tsx
   - dedupliziert app.objects nach kanonischem Objektnamen
   - speichert Alias-IDs/Codes/Namen je Objekt
   - matched Buchungen über Alias-IDs, Objektcodes und bereinigte Anzeigenamen

4. Frontend: Automatisierung.tsx
   - Objekt-Risikoampel nutzt Alias-Zuordnung
   - doppelte Objektzeilen durch Objekt_1 / Adresse / Adresse+PLZ werden reduziert

5. Build-Fix:
   - react-is als Dependency ergänzt, weil Recharts diese Dependency im Vite/Rollup-Build benötigt

Geprüft:
npm install --legacy-peer-deps
npm run build
=> erfolgreich

Nach dem Überschreiben:
1. npm install --legacy-peer-deps
2. npm run build
3. supabase db push
4. vercel --prod --force

SQL-Test danach:
select * from public.get_koenen_data_quality_checks(2026);

Erwartung:
- Objektvarianten wie "Elsasser Str. 52" und "Elsasser Str. 52 28211 Bremen" werden backendseitig als Alias derselben Immobilie behandelt.
- Die Risikoampel sollte Objekte nicht mehr mehrfach anzeigen.
- Dokumentenwarnungen sollten nicht mehr doppelt für alte/alternative Objekt-UUIDs erscheinen, sofern Dokumente über eine Alias-ID vorhanden sind.
