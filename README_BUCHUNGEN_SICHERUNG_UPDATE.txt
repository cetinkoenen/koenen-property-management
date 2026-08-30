Koenen Property Management · Buchungen Sicherung Update

Ziel:
- Buchungen in finance_entry sollen nicht mehr endgültig gelöscht werden.
- Gelöschte Buchungen werden als Papierkorb markiert und können wiederhergestellt werden.
- Alle Buchungen können als Backup-CSV exportiert werden.
- Andere App-Bereiche wurden nicht funktional erweitert oder umgebaut.

Geänderte Dateien:
- src/pages/Monate.tsx
- src/pages/Mietuebersicht.tsx
- src/features/entries/useMonthlyEntries.ts
- src/features/entries/EntryForm.tsx
- src/state/AppDataContext.tsx
- src/services/financeConsistencyEngine.ts
- supabase/migrations/20260531190000_finance_entry_soft_delete_backup.sql

Wichtig:
Die Supabase-Migration muss angewendet werden. Sie ergänzt finance_entry um:
- is_deleted
- deleted_at
- updated_at

Zusätzlich erstellt sie finance_entry_audit und verhindert per Datenbank-Regel harte Deletes.

Getestet:
- npx tsc -b --noEmit erfolgreich
- npm run build erfolgreich
