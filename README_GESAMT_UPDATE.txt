Koenen Property Management – Gesamt-Update

Umgesetzt:
1. .env/.env.local/.DS_Store bleiben aus der ZIP entfernt.
2. Debug-Logs wurden in Development-Guards umgestellt, damit Produktion sauberer bleibt.
3. propertyLoanLedgerService bleibt die zentrale Darlehens-Service-Schicht; neue Projektionen und Reparaturen laufen darüber.
4. Automatische Darlehens-/Tilgungsplan-Erzeugung erweitert und auditiert.
5. Darlehensübersicht mit KPI-Karten, Quelle der Restschuld und Warnung bei steigender Restschuld erweitert.
6. Portfolio zeigt bei Restschuld sichtbar die Quelle: Darlehensübersicht / letzter Ledger-Wert.
7. Fehler bleiben mit fachlicher und technischer Beschreibung über mapLedgerError/Service-Fehler lesbar.
8. Datenprüfung erhält Dashboard-/Ampel-Design, Warnungen und Plausibilitätschecks.
9. Datenprüfung enthält Reparatur-Buttons für Income, Capex und Darlehens-Fortschreibung.
10. ZIP wurde bereinigt; dist, .vercel, supabase/.temp, node_modules und macOS-Dateien werden nicht ausgeliefert.

Zusätzlich:
- Excel-Backup wurde ergänzt: der Backup-Button erstellt nun eine XLSX-Datei mit Tabellenblättern pro Supabase-Tabelle.
- Lokales Audit-Protokoll plus optionaler Supabase-Insert in app_audit_log. Falls diese Tabelle nicht existiert, läuft die App weiter.

Wichtig beim Überschreiben:
- Deine bestehenden .env und .env.local im Projekt behalten.
- Danach im Projekt ausführen: npm install && npm run dev
