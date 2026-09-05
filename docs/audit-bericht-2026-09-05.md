# Tiefen-Audit – Koenen Property Management

**Prüfdatum:** 5. September 2026  
**Produktivsystem:** `https://koenen-investment.com`  
**Geprüfter Release:** `2a7f4b5`  
**Prüfart:** authentifizierter Live-Funktionstest, anonymer Zugriffstest, statische Code- und Datenflussanalyse, Build-/Lint-/Test-Suite, Dependency- und Supabase-Linter

## Management Summary

Das System ist **nicht als fehlerfrei oder vollständig sicher freizugeben**. Die technische Basis besitzt wichtige Schutzmaßnahmen – insbesondere aktivierte RLS-Regeln, blockierte anonyme Tabellenzugriffe, MFA für Administratoren, serverseitig gekapselte Service-Role-Zugriffe und gute HTTP-Sicherheitsheader. Es bestehen jedoch zwei unmittelbar zu priorisierende Sicherheitsprobleme und zwei wesentliche fachliche Datenprobleme:

1. Reale Personen- und Nebenkosten-Abrechnungsdaten sind fest in öffentlich abrufbaren JavaScript-Dateien eingebaut.
2. Der Tiefgaragen-PDF-/HTML-Export übernimmt editierbare Texte ungefiltert in HTML und ist dadurch für gespeichertes XSS anfällig.
3. Dashboard und Mieteingang verwenden unterschiedliche Berechnungs- und Zuordnungslogiken. Im geprüften Monat September 2026 unterscheiden sich die Ergebnisse deutlich.
4. Die selbstgenutzte Hohenloher Str. 78 wird im Mietbereich und in Miet-KPIs verarbeitet, obwohl sie aus Anlage V und Vermietungskennzahlen getrennt bleiben soll.

**Empfohlene Freigabeentscheidung:** Sicherheits- und Datenkorrekturen der Priorität P0/P1 vor einer Erweiterung des Benutzerkreises abschließen. Exporte, Miet-KPIs und Beraterzugänge bis dahin nur unter fachlicher Kontrolle verwenden.

## Prüfumfang und Nachweise

### Live geprüfte Haupt- und Unterseiten

- Dashboard: Finanz-Kennzahlen, Warnmeldungen, aktuelle Aufgaben
- Immobilienvermögen: Übersicht sowie alle sechs Objektseiten
- Mieter: Übersicht, Register, Stammdaten, Mietentwicklung, Mieteingang, Ein-/Auszug, Leerstand, Mahnwesen
- Buchhaltung: Buchungen, Einnahmen/Ausgaben, Transaktionen, Regeln, automatisiertes Mahnwesen, Sollstellungen/Mietanpassungen, Steuer-Center, Fahrtenbuch, Berichte & Exporte, Darlehen, Nebenkostenabrechnung, Steuerberater-Portal, Umsatzsteuer-Optionen
- Nebenkosten: Übersicht, Wohnungen und Tiefgarage
- Weitere Module: Auswertungen, Investment-Bericht, Tickets, Dokumente, Produktivität, Datenprüfung, Kautionen, Benutzerrechte, Datenschutz, Immobilie anlegen, Einheiten, Zählerstände und Objektdokumente

Alle genannten Routen wurden authentifiziert geladen. Auf den zentralen Seiten wurde bei einer Breite von 1280 px kein horizontales Dokument-Overflow festgestellt. Interne Tabellen verwenden überwiegend eigene horizontale Scrollbereiche.

### Automatisierte Prüfungen

- `npm run verify`: **12 von 12 Prüfsuiten erfolgreich**; darunter Build/Typecheck, Lint, Miet-/Leerstandslogik, Vermögen, Aliasauflösung, zentrale Quellen, Datenqualität, 82 Exportprüfungen, Security-Baseline, 40 Darlehensplanprüfungen und Branding.
- Supabase DB-Linter des verknüpften Projekts: **keine Schema-Warnungen**.
- Anonymer Zugriff auf `finance_entry`, `tenant_profiles`, `tenant_contracts`, `property_extra_info`, `property_loan_ledger`, `property_loan_rate_plan`, `apartment_billing_workspaces`, `portfolio_properties` sowie die zentralen Views: **blockiert**.
- Produktionsabhängigkeiten: **0 bekannte Schwachstellen**.
- Gesamter Dependency-Baum: **1 High-Warnung** in der Entwicklungs-/Build-Abhängigkeit `browserslist <= 4.28.6`.
- Security-Header: CSP, HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, restriktive Permissions-Policy und sichere Referrer-Policy vorhanden.
- Nicht authentifizierte Admin-/Freigabe-Endpunkte lieferten keine Daten und keinen erfolgreichen Schreibzugriff.

## 1. Gefundene Sicherheitslücken

### Hoch

#### SEC-H01 – Reale Abrechnungs- und Personendaten im öffentlichen Frontend-Bundle

**Befund:** `NebenkostenWohnungen.tsx` enthält reale Jahreskosten, Verteilerschlüssel, Mieternamen, Vermietername und Anschrift als feste Quellcodewerte. Die Werte wurden auch anonym im aktuell ausgelieferten JavaScript-Chunk gefunden. Eine Anmeldung schützt diese Daten daher nicht.

**Nachweise:**

- `src/pages/NebenkostenWohnungen.tsx:47-100` – feste Kosten und Verteilerschlüssel
- `src/pages/NebenkostenWohnungen.tsx:222-264` – feste Namen, Zeiträume, Anschrift und Abrechnungswerte

**Risiko:** Vertraulichkeitsverletzung, Datenschutzvorfall, dauerhafte Verbreitung über Browser-/CDN-Caches und gegebenenfalls Git-Historie.

**Maßnahme P0:** Alle realen Daten aus dem Frontend-Quellcode entfernen und ausschließlich aus RLS-geschützten Supabase-Tabellen laden. Danach neuen Build ausrollen, CDN-Cache invalidieren und Git-Historie/Artefakte auf dieselben Werte prüfen. Betroffene Personen- und Finanzdaten in Logs, Backups und Deploy-Artefakten inventarisieren.

#### SEC-H02 – Gespeichertes XSS im Tiefgaragen-HTML-/PDF-Export

**Befund:** Der HTML-Generator interpoliert editierbare Werte wie Kostenart, Objekt, Einheit, Vermieter, Mieter, Anschriften und Fußnote ohne HTML-Escaping. Das Ergebnis wird mit `document.write` in ein neues Fenster geschrieben.

**Nachweise:**

- `src/pages/NebenkostenTiefgarage.tsx:830-836` – ungefilterte Template-Interpolation
- `src/pages/NebenkostenTiefgarage.tsx:839-845` – Ausgabe mit `document.write`

**Risiko:** Ein gespeicherter Wert mit HTML/Script-Inhalt kann beim Öffnen der Druckvorschau Code im Browserkontext ausführen. Wegen der im Browser gespeicherten Finanzdaten kann dies zusätzlich Datenabfluss ermöglichen.

**Maßnahme P0:** Alle Textwerte mit einer zentralen `escapeHtml`-Funktion kodieren; idealerweise PDF über den bestehenden typisierten PDF-Renderer erzeugen und nicht über frei zusammengesetztes HTML. Regressionstests mit `<script>`, Ereignisattributen, SVG-Payloads und schließenden Tags ergänzen.

#### SEC-H03 – Zu breite Leseberechtigung für Viewer kombiniert mit MFA-Ausnahme

**Befund:** Zwei per E-Mail fest definierte Readonly-Benutzer erhalten per RLS-Policy Leserechte auf alle Datensätze zahlreicher Tabellen, darunter Mieter-, Finanz-, Dokument-, Objekt- und Darlehensdaten. Diese Benutzer umgehen zusätzlich die AAL2/MFA-Anforderung.

**Nachweise:**

- `supabase/migrations/20260616202500_readonly_users_read_all_block_writes.sql:1-9` – Identität über feste E-Mail-Adressen
- dieselbe Migration `:35-79` – tabellenweite `SELECT`-Policies ohne Objekt-/Datendomänenfilter
- `src/components/RequireAuthMFA.tsx:210-245`, `:271-305` – Readonly-Ausnahme von AAL2

**Risiko:** Bei kompromittiertem Viewer-Konto sind alle privaten Miet-, Bank-, Darlehens- und Eigennutzungsdaten lesbar. Das ist keine klassische anonyme BOLA-Lücke, aber eine zu breite autorisierte Objektfreigabe.

**Maßnahme P1:** Berechtigungen aus `account_members` und serverseitigen Rollen ableiten; Viewer auf freigegebene Objekte und Datendomänen einschränken. Steuerberaterzugang darf weder Hohenloher-Eigennutzungsdaten noch nicht benötigte Mieter-Bankdaten sehen. MFA auch für Viewer erzwingen.

#### SEC-H04 – High-Risk-Schwachstelle in Build-Abhängigkeit

**Befund:** Der vollständige `npm audit` meldet `browserslist <= 4.28.6` mit zwei High-Advisories zu Speichererschöpfung/Crash und Prototype-Manipulation bei nicht vertrauenswürdigen Browserslist-Statistiken. Produktionsabhängigkeiten sind nicht betroffen.

**Risiko:** CI-/Build-DoS oder manipuliertes Build-Verhalten, falls nicht vertrauenswürdige Statistikdaten in den Build gelangen.

**Maßnahme P1:** Lockfile mit der gepatchten Version aktualisieren, vollständige Verify-Suite erneut ausführen und den Build reproduzierbar neu deployen.

### Mittel

#### SEC-M01 – Sensible Finanzfelder ohne Feldverschlüsselung

**Befund:** `tenant_profiles.iban` und `bank_name` sind normale `text`-Spalten. Darlehensnummern/BIC werden im JSONB-Profil `property_extra_info.wealth_profile` gespeichert. Eine anwendungsseitige Feldverschlüsselung oder Tokenisierung ist nicht implementiert.

**Nachweise:**

- `supabase/migrations/20260605160000_tenant_master_data.sql:6-28`
- `supabase/migrations/20260827090000_property_wealth_profiles.sql:1-11`

**Einordnung:** Supabase/TLS und Storage-Verschlüsselung schützen Transport und Datenträger; Daten sind jedoch für jeden berechtigten SQL-/API-Leser und in logischen Backups im Klartext sichtbar. Passwörter werden nicht in App-Tabellen gespeichert, sondern von Supabase Auth verwaltet.

**Maßnahme P1/P2:** Datenminimierung; IBAN nur speichern, wenn fachlich erforderlich. IBAN und Darlehenskennungen feldweise verschlüsseln oder tokenisieren; entschlüsselte Anzeige rollenbasiert und protokolliert freigeben.

#### SEC-M02 – Freigabe-Endpunkt kann Benachrichtigungen erzeugen, ohne Deduplizierung/Rate-Limit

**Befund:** Jeder angemeldete freigabepflichtige Readonly-Benutzer kann wiederholt Datensätze und Admin-E-Mails erzeugen. Es gibt keine serverseitige Deduplizierung, Abklingzeit oder IP-/Benutzerbegrenzung.

**Nachweis:** `api/login-approval-request.ts:46-87`.

**Maßnahme:** Pro Benutzer und Zeitfenster eindeutigen Pending-Datensatz verwenden, Rate-Limit einführen und Mail nur beim Statuswechsel senden.

#### SEC-M03 – Admin-API meldet Auth-Fehler als HTTP 500 und gibt interne Meldungen zurück

**Befund:** Nicht authentifizierte Aufrufe von `/api/admin-users` und `/api/admin-create-user` endeten mit 500 statt 401/403. Die Catch-Blöcke liefern die interne Exception-Nachricht an den Client.

**Nachweise:** `api/admin-users.ts:216-245`, `api/admin-create-user.ts:215-224`.

**Risiko:** Schlechtere Erkennung echter Serverfehler, unnötige Informationspreisgabe und unpräzises Security-Monitoring.

**Maßnahme:** Auth-/Autorisierungsfehler typisieren und als 401/403 liefern; extern generische Fehler-ID, intern vollständige Audit-ID protokollieren.

### Niedrig / Härtung

#### SEC-L01 – CSP benötigt weiterhin `style-src 'unsafe-inline'`

Scripts sind auf eigene Quellen beschränkt; Inline-Styles bleiben jedoch erlaubt. Das ist aktuell wegen zahlreicher Inline-Style-Objekte funktional erforderlich, reduziert aber die CSP-Härtung.

#### SEC-L02 – Öffentliche HTML-Antwort sendet `Access-Control-Allow-Origin: *`

Für eine statische SPA-Antwort ist dies kein direkter Datenzugriff, aber unnötig weit. Auf sensitive API-Antworten darf diese Freigabe nicht übertragen werden.

### Positive Sicherheitskontrollen

- Anonyme Supabase-Abfragen auf alle geprüften Tabellen/Views sind blockiert.
- RLS ist auf den geprüften Datentabellen aktiv; der verknüpfte Supabase-Linter meldet keine Warnung.
- Die zuvor problematische Bridge-View wird im aktuellen Linter nicht mehr als `SECURITY DEFINER` beanstandet.
- Service-Role-Schlüssel werden nur serverseitig verwendet; im Frontend liegen ausschließlich Supabase-URL und Anon-Key.
- Admin-Aktionen validieren das Token über Supabase `getUser`; Admin-MFA/AAL2 ist vorhanden.
- Sicherheitsheader gegen Framing, MIME-Sniffing und Protokoll-Downgrade sind aktiv.

## 2. Datenkonsistenz-Fehler

### DATA-H01 – Dashboard und Mieteingang widersprechen sich im September 2026

| Kennzahl | Mieteingang | Dashboard | Abweichung Dashboard |
|---|---:|---:|---:|
| Soll gesamt | 5.891,33 € | 5.731,33 € | -160,00 € |
| Zahlungseingänge | 4.455,00 € | 4.100,00 € | -355,00 € |
| Noch offen | 1.436,33 € | 1.631,33 € | +195,00 € |
| Überzahlung | 0,00 € | im Cockpit nicht gleichwertig ausgewiesen | – |

**Ursachen im geprüften Datensatz:**

- Rosenstein P253 fehlt im Dashboard vollständig: 85,00 € Soll und 85,00 € bezahlt.
- Fürther Garage fehlt als eigener Soll-Vertrag: 75,00 €; die Zahlung wird stattdessen der Wohnung zugerechnet.
- Bei Hohenloher fehlen im Dashboard 270,00 € Zahlungskomponente; dort werden 1.690,00 € statt 1.960,00 € bezahlt gewertet.

Die Mieteingang-Jahressummen wurden aus allen sichtbaren Objektzeilen centgenau nachgerechnet und stimmen intern: 49.693,65 € Zahlung, 52.641,13 € Soll, 3.028,33 € offen und 80,85 € Überzahlung.

**Technische Ursache:** `professionalCockpitService` lädt direkt `tenant_contracts` und baut eine zweite Zuordnungslogik über Text-/Einheiten-Matching auf (`src/services/professionalCockpitService.ts:497-595`). Die Mieteingang-Seite verwendet dagegen ihr vollständiges Einheiten-/Mietanpassungsmodell.

**Maßnahme P0/P1:** Dashboard-KPIs und Zeilen ausschließlich aus demselben zentralen Mieteingang-Service/View erzeugen. Keine zweite Matching-Implementierung. Ein verbindlicher Integrationstest muss für jeden Monat und jede Einheit die vier Kennzahlen auf beiden Seiten centgenau vergleichen.

### DATA-H02 – Selbstgenutzte Hohenloher Str. 78 fließt in Mietbereich und Miet-KPIs ein

**Befund:** Die Live-Seite Mieteingang zeigt Hohenloher als Mietvertrag inklusive persönlicher Kontaktdaten und 1.960,00 € Soll/Ist. Auch das Dashboard verarbeitet das Objekt im Miet-Soll und offenen Bestand. Steuerlogik und Hinweise definieren Hohenloher dagegen korrekt als `self_used_weg` und für Anlage V gesperrt.

**Auswirkung:** Mietportfolio-KPIs, Zahlungsstatus und personenbezogene Mietansicht werden fachlich verfälscht; private Eigennutzungsdaten gelangen in eine Vermietungsdomäne.

**Maßnahme P0/P1:** Einen zentralen, in der Datenbank gepflegten Nutzungstyp als Filterkriterium verwenden. `self_used` muss standardmäßig aus Mieteingang, Mietrückständen, Mahnwesen und Anlage-V-Exports ausgeschlossen sein. §35a darf über einen separat autorisierten Datenpfad zugreifen.

### DATA-M01 – Unterschiedliche Jahresperiodik auf derselben Reportseite

**Befund 2026:** Der Buchungsbericht zeigt Einnahmen von 49.148,72 €, die eingebettete Mieteingang-Jahresübersicht 49.693,65 €; Differenz 544,93 €.

**Wahrscheinliche Ursache:** Buchungen werden nach Buchungsdatum aggregiert, Mieteingänge nach wirtschaftlichem Mietmonat (25.-des-Monats-Regel). Beide Zahlen können einzeln korrekt sein, aber Titel und Erläuterung machen die unterschiedliche Periodenbasis nicht eindeutig.

**Maßnahme:** Kennzahlen explizit mit „Buchungsdatum“ bzw. „zugeordneter Mietmonat“ beschriften und eine Überleitungsrechnung ausgeben. Ohne Überleitung dürfen die Summen nicht als direkt vergleichbare Jahreswerte nebeneinanderstehen.

### DATA-L01 – Während des Ladens werden echte Nullen statt Ladezustand gezeigt

Auf der Immobilienvermögen-Seite erschien beim ersten Rendern kurzfristig 0,00 €; nach vollständigem Laden war der Cashflow korrekt 49.148,72 € minus 51.735,81 € = -2.587,09 €. Das ist kein dauerhafter Rechenfehler, kann aber zu Fehlinterpretation oder zu früh erzeugten Exporten führen.

**Maßnahme:** Bis zum Abschluss aller Pflichtquellen Skeleton/„wird geladen“ anzeigen und Exportaktionen sperren.

## 3. Redundanz-Warnungen / Single Source of Truth

### SSOT-H01 – Zwei unabhängige Miet-Soll- und Zahlungs-Matching-Engines

- Mieteingang nutzt ein vollständiges Modell aus Objektmieten, Verträgen, Anpassungen, Leerstand und Buchungen.
- Dashboard berechnet denselben fachlichen Sachverhalt erneut direkt aus `tenant_contracts` und `finance_entry`.

Dies ist die direkte Ursache von DATA-H01. Zielarchitektur: ein einziger `RentLedger`-Service oder eine serverseitige View/RPC, deren Ergebnis von Dashboard, Mieteingang, Reports und Mahnwesen nur noch dargestellt wird.

### SSOT-H02 – Nebenkosten-Stammdaten zugleich in Supabase und im Frontend-Quellcode

`NebenkostenWohnungen.tsx` enthält mehrere objektspezifische Standardkosten, Flächen, Erwerbs-/Abrechnungsdaten und Namen. Parallel speichert die App Arbeitsstände in `apartment_billing_workspaces`. Dadurch können Quellcode-Defaults bestehende Daten beeinflussen und Deployments fachliche Werte verändern.

**Maßnahme:** Stammdaten, Periodenwerte und Personen ausschließlich versioniert in der Datenbank speichern. Im Code nur neutrale leere Strukturen und Berechnungsregeln belassen.

### SSOT-M01 – Vollständiger Finanz- und Darlehenscache in `localStorage`

`AppDataContext` lädt Objekte, bis zu 5.000 Buchungen, Mietzusammenfassungen und Darlehenswerte aus `localStorage`, bevor der Server antwortet, und schreibt sie anschließend wieder zurück (`src/state/AppDataContext.tsx:491-527`, `:703-724`). Bei einem Ladefehler bleibt der Cache ohne sichtbare Fehlermeldung aktiv.

**Risiken:** veraltete Werte als scheinbar aktuelle Quelle, sensible Daten auf dem Endgerät und leichte Auslesbarkeit bei XSS.

**Maßnahme:** Cache auf kurzlebige, nicht sensible Darstellungsdaten begrenzen; `savedAt` und Serverstand sichtbar prüfen; bei Netzfehler klar „Offline/Stand …“ markieren; Cache bei Logout löschen. Finanz-, Mieter- und Darlehensdetails nicht persistent in `localStorage` halten.

### SSOT-M02 – Automatische Tiefgaragen-Migration aus altem Browser-Storage

Wenn die zentrale Abrechnung fehlt, liest das Modul alte Werte aus `localStorage` (`src/pages/NebenkostenTiefgarage.tsx:439-463`) und kann sie zur Initialquelle machen. Das ist für Migrationen nützlich, aber nach Abschluss der Migration ein zweiter impliziter Datenpfad.

**Maßnahme:** Einmalige, explizite und protokollierte Migration mit Versionsmarker; danach Legacy-Fallback entfernen.

### SSOT-M03 – Steuerprofile und Anschaffungswerte als Code-Konstanten

`TAX_OBJECT_PROFILES` hält Baujahre, Anschaffungspreise, AfA-Sätze und Kontoführungspauschalen im Code (`src/services/taxReportEngine.ts:139-244`). Diese Werte überschneiden sich fachlich mit Immobilienvermögen/Stammdaten und können durch ein Deployment geändert werden.

**Maßnahme:** Steuerlich relevante Objektparameter in einer versionierten DB-Tabelle mit Gültigkeitszeitraum, Änderungsprotokoll, Belegreferenz und Freigabestatus pflegen. Der Steuerreport liest nur diese Quelle.

### Positiv bestätigte SSOT-Bereiche

- Restschuld wird im zentralen App-Kontext ausschließlich aus `property_loan_ledger` überschrieben; Portfolio-Views und Browsercache dürfen diesen Wert nicht ersetzen (`src/state/AppDataContext.tsx:647-683`).
- Wohnfläche wird aus `property_extra_info` übernommen (`src/state/AppDataContext.tsx:549-583`).
- Objekt-ID-Aliase werden über Datenbankzeilen expandiert; `propertyIdAliases.ts` enthält keine zweite feste Aliasliste.

## 4. UI/UX-Verbesserungsvorschläge

### UI-M01 – Doppelte H1-Überschriften

Mehrere Module besitzen zwei H1-Elemente, unter anderem Finanz-Kennzahlen und Darlehensübersicht. Das schwächt Dokumentstruktur, Screenreader-Navigation und visuelle Hierarchie.

**Maßnahme:** Workspace-Überschrift als einziges H1, interne Komponententitel als H2.

### UI-M02 – Tiefgaragen-Hero besitzt festes Zweispalten-Layout

`NebenkostenTiefgarage.tsx:49-60` definiert `minmax(0, 1.6fr) minmax(320px, 0.9fr)` als Inline-Style ohne mobilen Breakpoint. Bei 1280 px besteht kein Seiten-Overflow; auf kleinen Displays kann der zweite Mindestwert jedoch Inhalt stark zusammendrücken oder Overflow verursachen.

**Maßnahme:** Responsive CSS-Klasse; unter etwa 900 px einspaltig, reduzierte Paddings und zweispaltige Kennzahlen erst ab ausreichender Breite.

### UI-L01 – Falsche Dokumentsprache und unvollständige App-Icons

`index.html` setzt `lang="en"`, obwohl die Oberfläche deutsch ist. Das Favicon verweist noch auf `/vite.svg`; das referenzierte Apple-Touch-Icon `180x180` fehlt, während nur 192/512 vorhanden sind.

**Maßnahme:** `lang="de"`, Marken-Favicon und tatsächlich vorhandenes 180x180-Apple-Icon bereitstellen.

### UI-L02 – Uneinheitliche Objektbezeichnung Rosenstein

Navigation und Steuerprofile verwenden teilweise „Rosensteinstr. 25“, andere Ansichten „Rosenstein Str. 25“. Objektname und Schreibweise sollten aus einer zentralen Anzeigequelle kommen.

### UI-L03 – Berichte & Exporte ist sehr lang und fachlich dicht

Die Seite enthält zahlreiche Berichtsgruppen sowie den kompletten Zahlungskalender. Bei vielen Reports wird die Zielaktion schwer auffindbar.

**Maßnahme:** Nach Zweck gruppieren („Steuerberater“, „Mieter/Nebenkosten“, „Finanzierung“, „Intern“), mit Suchfeld, Jahresfilter, einklappbaren Gruppen und klarer Kennzeichnung der Datenbasis.

### UI-L04 – Ladezustände und Exportbereitschaft

Kennzahlen dürfen vor Abschluss aller Pflichtabfragen nicht 0,00 € anzeigen. Buttons sollten „Daten werden geladen“ zeigen und bis zum konsistenten Snapshot deaktiviert bleiben.

## Priorisierter Maßnahmenplan

### P0 – sofort

1. Reale Daten aus öffentlichen Bundles entfernen und neu deployen.
2. XSS im Tiefgaragenexport schließen.
3. Dashboard auf die zentrale Mieteingang-Berechnung umstellen.
4. Hohenloher zentral aus allen Vermietungsdatenpfaden ausschließen.

### P1 – vor zusätzlichem Benutzer-/Beraterzugang

1. Viewer objekt- und datendomänenbezogen autorisieren; MFA erzwingen.
2. `browserslist` aktualisieren.
3. IBAN/Darlehenskennungen minimieren und feldverschlüsseln.
4. Jahresperiodik in Reports transparent überleiten.
5. Sicherheitsregressionstests für RLS, Exporte und Rollen ergänzen.

### P2 – Qualität und Bedienbarkeit

1. Browsercache sicher und nachvollziehbar gestalten.
2. Legacy-Datenpfade entfernen.
3. Steuer- und Nebenkostenstammdaten vollständig in zentrale, versionierte Quellen überführen.
4. Überschriften, mobile Layouts, App-Icons, Schreibweisen und Ladezustände bereinigen.

## Grenzen dieses Audits

- Es wurden keine destruktiven Penetrationstests, keine Passwortangriffe und keine Änderungen an Produktionsdaten durchgeführt.
- Der anonyme Datenzugriff wurde aktiv geprüft; eine vollständige Matrix mit separaten echten Konten für Admin, Viewer, Steuerberater und potenzielle künftige Rollen erfordert dedizierte Testkonten und Testdaten.
- Responsive Verhalten wurde live bei 1280 px und statisch im Code geprüft; eine abschließende Geräte-Matrix sollte zusätzlich 320, 375, 768, 1024, 1440 und Drucklayout/PDF umfassen.
- Die automatisierten Tests bestätigen die von ihnen abgedeckten Regeln, ersetzen aber keine fachliche Einzelbelegprüfung oder Steuerberatung.

## Abnahmekriterien nach Korrektur

- Keine reale Person, Anschrift oder Finanzzahl ist anonym in einem JS-/Source-Map-/CDN-Artefakt auffindbar.
- Alle Benutzertexte bestehen XSS-Tests in UI, HTML, PDF, CSV und Excel.
- Dashboard, Mieteingang, Reports und Mahnwesen liefern für jeden Monat exakt dieselben Soll-/Ist-/Offen-/Überzahlungswerte.
- Hohenloher erscheint nicht in Vermietungs- oder Anlage-V-Daten; §35a bleibt getrennt und rollenbasiert.
- Viewer sehen nur explizit freigegebene Objekte/Felder und verwenden MFA.
- Supabase-Linter, anonyme Zugriffsmatrix, `npm audit`, `npm run verify` und visuelle Regressionstests sind ohne High-/Critical-Befund.
