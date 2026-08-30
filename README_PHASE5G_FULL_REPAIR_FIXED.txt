Koenen Property Management · Phase 5G Full Repair FIXED

Diese ZIP enthält die korrigierte SQL-Migration:
  supabase/migrations/20260519190000_phase5g_full_repair_fixed.sql

Wichtig:
- finance_entry.object_id bleibt objects.id
- entries.property_id bleibt objects.id
- property_documents/property_income/property_loan_ledger bleiben properties.id

Nach SQL-Ausführung testen:
  select * from public.v_object_dropdown;
  select * from public.get_property_finance_master(2026);
  select * from public.get_koenen_data_quality_checks(2026);

Danach lokal:
  npm run build
  vercel --prod --force
