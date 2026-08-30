Koenen Property Management – NK Automatisierung/Archiv Update

Neu ergänzt:
1. Vollautomatische Zuordnung neuer Buchungen bleibt aktiv über „Buchungen importieren“.
2. Mieterportal-HTML Export für eine teilbare/archivierbare Abrechnungsansicht.
3. Archivierung fertiger NK-Abrechnungen über „Archivieren“ bzw. „Abschließen“.
4. Versionierung: Archivliste mit Wiederherstellen-Funktion pro Objekt/Jahr.
5. §35a-EStG-Ausweis bleibt automatisch über relevante Kostenarten/Wartungen/Reinigung/Handwerkerpositionen aktiv.
6. CSV Import/Export für Kostenzeilen als Brücke zu Excel/DATEV/externen Abrechnungen.
7. Mietkonto-Plausibilitätsprüfung anhand vorhandener Einnahmebuchungen.
8. Mieterportal-Grundlage als HTML-Datei; später kann daraus ein echtes Mieterportal entstehen.

Wichtig vor Nutzung der Archiv-Speicherung in Supabase:
Bitte zusätzlich ausführen:
supabase/migrations/20260517_nk_statement_archive.sql

Die App funktioniert auch ohne diese Tabelle lokal mit localStorage-Archiv, aber dauerhaft/professionell ist Supabase empfohlen.

Build geprüft: npm run build erfolgreich.
