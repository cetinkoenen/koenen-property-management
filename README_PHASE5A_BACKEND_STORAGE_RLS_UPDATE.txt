Koenen Property Management – Phase 5A Backend-Finalisierung
============================================

Dieses Update ergänzt die echte Supabase-/Backend-Grundlage für Dokumente, Aufgaben und Audit-Log.

Neue Backend-Bestandteile
-------------------------
1. Supabase Storage Bucket
   - Bucket: property-documents
   - privat, nicht öffentlich
   - erlaubt PDF, Bilder, Excel, Word und CSV

2. Neue Tabellen
   - public.property_documents
   - public.property_tasks
   - public.app_audit_log

3. RLS-Policies
   - Single-Admin-Prinzip: nur info.koenen@gmail.com
   - Policies für property_documents, property_tasks, app_audit_log
   - Policies für storage.objects im Bucket property-documents

4. Neue RPC/SQL-Funktionen
   - get_property_document_summary(p_year integer)
   - get_property_task_summary()

5. Neue Frontend-Services
   - src/services/documentArchiveService.ts
   - src/services/workflowTaskService.ts
   - erweiterter auditLogService.ts

Migration ausführen
-------------------
Im Supabase SQL Editor ausführen:

supabase/migrations/20260518220000_phase5a_storage_documents_tasks_audit.sql

Oder per Supabase CLI als Migration deployen.

Wichtig
-------
Diese Phase legt die echte Backend-Basis. Danach können in Phase 5B die bestehenden UI-Dokumenten- und Workflowkarten vollständig an diese Tabellen/Storage-Funktionen angeschlossen werden.
