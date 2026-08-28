# Zentrale Datenquellen, Exporte und Wiederherstellung

Stand: 28.08.2026

## Verbindliche Hauptquellen

| Fachbereich | Hauptquelle | Verwendung |
| --- | --- | --- |
| Zahlungseingänge | `finance_entry` / Seite **Mieteingang** | Ist-Zahlungen, Zahlungsdatum und Zahlungs-KPI |
| Sollmiete | **Mietentwicklung → Mietanpassungen**, ergänzt durch `tenant_contracts` | Monats- und Jahressoll |
| Mietverträge und Mieter | `tenant_contracts` und `tenant_profiles` | Einheit, Mieter, Vertragszeitraum und Vertragsmiete |
| Leerstand | `unit_vacancies` / Seite **Leerstand** | Neutralisierung des Solls in Leerstandszeiträumen |
| Vermietungszeiträume | `portfolio_property_rentals` | Vertrags- und Nutzungszeiträume im Portfolio |
| Objektzuordnung | `properties`, `portfolio_properties`, `property_id_aliases` | Zentrale Zuordnung historischer und aktueller Objekt-IDs |

Der Report **Mietkonto-Check & Offene Zahlungen** erzeugt keine zweite fachliche Datenquelle. Er erhält seine Jahresmatrix direkt von der Komponente der Seite **Mieteingang**.

## Exportfreigabe

Export-Schaltflächen werden erst aktiviert, wenn alle für den jeweiligen Bericht benötigten Quellen geladen wurden:

- Mietkonto: Buchungen, Mietverträge, Mietanpassungen, Vermietungszeiträume und Leerstände.
- Leerstandsbericht: App-Grunddaten und Leerstandszeiträume.
- Anlage V und §35a: App-Grunddaten und Fahrtenbuch.
- Steuerberater-Datenpaket: App-Grunddaten, Mietkonto, Leerstand und Fahrtenbuch.

Während eines laufenden Exports bleiben weitere Exportaktionen gesperrt. Leere Dateien werden nicht heruntergeladen. Blob-Dateien bleiben nach dem Klick 60 Sekunden verfügbar, damit Safari, Firefox und eingebettete Browser den Download zuverlässig übernehmen können.

## Sicherheitsgrundschutz

- Die Migration `20260826090000_lock_down_public_tables_without_rls.sql` aktiviert RLS für jede ungeschützte Tabelle im öffentlichen Schema und entzieht `anon` sowie `authenticated` zunächst alle Rechte.
- Ein Event-Trigger aktiviert RLS automatisch für später neu angelegte öffentliche Tabellen.
- Die Migration bricht ab, falls danach noch eine öffentliche Tabelle ohne RLS existiert.
- `20260827153000_private_exposes_storage.sql` hält den Exposes-Storage privat.
- `20260827163000_property_id_aliases.sql` schützt die zentrale Alias-Tabelle mit RLS.

Prüfbefehle:

```bash
npm run stress:security
npx supabase db lint --linked --level error
```

## Sicherung und Wiederherstellungsprüfung

Die Quellcodesicherung wird mit `scripts/backup-source-to-onedrive.mjs` erstellt. Jede Datei erhält eine SHA-256-Prüfsumme. Eine Sicherung gilt nur dann als geprüft, wenn:

1. `gzip -t` ohne Fehler endet.
2. Die berechnete SHA-256-Prüfsumme mit der `.sha256`-Datei übereinstimmt.
3. `tar -tzf` den Projektordner und die erwarteten Quelldateien auflisten kann.

Die Sicherung enthält bewusst keine Zugangsdaten aus `.env.local`, keine Abhängigkeiten aus `node_modules`, keine Build-Ausgabe und kein Git-Verzeichnis. Die Supabase-Nutzdaten benötigen zusätzlich die verwalteten Datenbank-Backups des Hosting-Anbieters.
