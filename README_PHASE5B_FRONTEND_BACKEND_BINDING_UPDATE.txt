Koenen Property Management – Phase 5B Frontend-Backend-Anbindung

Umgesetzt:
- Auswertung enthält neuen Bereich "Backend 5B".
- Dokumente werden über property_documents geladen und in den privaten Supabase Storage Bucket property-documents hochgeladen.
- Dokumente können per Signed URL geöffnet und gelöscht werden.
- Aufgaben werden über property_tasks geladen, neu erstellt und als erledigt markiert.
- Audit-Logs werden aus app_audit_log geladen und neue Dokument-/Aufgabenaktionen werden persistiert.
- Dashboard-KPIs nutzen die Phase-5A-RPCs get_property_document_summary und get_property_task_summary.

Voraussetzung:
- Phase-5A-SQL-Migration muss in Supabase bereits erfolgreich ausgeführt sein.
- Der aktive Supabase-User muss info.koenen@gmail.com sein, weil die RLS-Policies darauf beschränkt sind.

Prüfung:
- npm run typecheck erfolgreich.
- Vollständiger Vite-Build im Container wegen Node 18/Rollup optional dependency nicht möglich. Lokal bitte Node 20.19+ verwenden.
