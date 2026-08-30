Koenen Property Management · Monate robust Ladefix

Geändert:
- Nur src/pages/Monate.tsx
- Die Monate-Seite liest weiter aus finance_entry, filtert is_deleted aber clientseitig.
- Sicherheits-Fallback auf v_income_entries/v_expense_entries, falls finance_entry unerwartet 0 Zeilen liefert.
- Keine Datenbankänderung, keine Änderung an Portfolio, Darlehen, Mieterübersicht, Aufgaben, Dokumenten oder Exposé.

Ziel:
- Bestehende Buchungen wieder sichtbar machen, ohne Daten zu verändern.
