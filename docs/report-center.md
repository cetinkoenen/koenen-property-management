# Berichte & Reports

Die neuen geschützten Routen sind `/berichte/steuerberater` und `/berichte/portfolio`.
`/berichte` zeigt die Auswahlseite mit genau zwei Bereichskacheln; `/buchhaltung/berichte-exporte` führt dorthin. Beide Unterseiten sind außerdem direkt im Desktop- und Mobilmenü verlinkt.
Die bisherigen Spezialexporte bleiben unter `/buchhaltung/berichte-exporte/archiv` erreichbar.

## Daten und Berechnungen

- Die zentralen Buchungen, Objekt-Aliase und Darlehensstände kommen aus `useAppData`.
- Ergänzende Tabellen werden mit bestehender Anmeldung und RLS gelesen: `portfolio_properties`, `portfolio_units`, `tenant_profiles`, `tenant_contracts`, `property_extra_info`, `rent_adjustments`, `unit_vacancies`, `property_mileage_trips`, `property_documents` und `apartment_billing_workspaces`. Die Zusatzabfragen sind paginiert. Es werden keine Geschäftsdaten geschrieben.
- Soll/Ist und Rückstände übernehmen die vorhandene Mietkonto-Jahresberechnung. Ein Zeitraum ist auf ein Kalenderjahr begrenzt. Buchungen werden taggenau gefiltert; Soll/Ist betrachtet volle betroffene Mietmonate, wie in der Oberfläche beschrieben. Künftige Monate sind neutral und werden nicht als fällige Rückstände summiert.
- Fehler in den Zusatzquellen sperren den Export. Fehler oder laufende Abfragen im Mietkonto sperren die davon abhängigen Module zusätzlich.
- Cashflow berücksichtigt jede gebuchte Kreditrate einmal. EÜR berücksichtigt bei Kreditraten nur gespeicherte Zinsen. Kautionen, Anschaffungskosten und nicht aufgeteilte Kreditraten stehen separat.
- Buchungen ohne getrennte Kalt-/NK-Aufteilung bleiben als unaufgeteilte Miete sichtbar. Netto und Steuer sind mangels separater Buchungsfelder als nicht hinterlegt markiert. Keine Steuerbeträge oder AfA-Sätze werden erfunden.
- Objektkennzahlen und Finanzierung zeigen aktuelle Stammdaten, nicht einen rekonstruierten historischen Stichtag. Kaution ist der gespeicherte Vertragsbetrag, nicht ein belegter Zahlungseingang.
- Nebenkostenmodule dokumentieren gespeicherte Abrechnungen, Kosten, Verteilerschlüssel und Archivnachweise. Sie erzeugen keine neue rechtsverbindliche Mieterabrechnung. Anschaffungskosten/AfA dokumentiert vorhandene Basisdaten; eine nicht gespeicherte AfA-Berechnung wird nicht geschätzt.

## Ausgabe und Prüfung

PDF wird über die bestehende Druckansicht als Querformat erzeugt. Die Zahlungsmatrix wird darin in zwei Halbjahrestabellen mit wiederholter Objekt-/Mieterzuordnung geteilt. Die Vorschau zeigt alle zwölf Monate nebeneinander.
Excel ist ein echtes XLSX mit separaten Tabellenblättern; CSV verwendet Semikolon und UTF-8-BOM. Benutzertexte können in beiden Formaten keine Formeln ausführen.

`npm run test:report-center` prüft Summen, EÜR-Abgrenzung, Darlehensraten, Aliase, Objektfilter, Rückstände, Zukunftsmonate, Leerzustand und CSV-Schutz. Zusätzlich wurden Build, ESLint, bestehende Report-Stresstests und ein lokaler Browsertest mit isolierten Testdaten (Desktop/Mobil, Modulwechsel, XLSX-Download, PDF-Druckansicht) ausgeführt. Die XLSX-Datei wurde mit openpyxl geöffnet. Ein Abgleich mit angemeldeten Produktivdaten wurde nicht durchgeführt. Am 06.09.2026 wurde die korrigierte Navigation auf `https://koenen-investment.com` veröffentlicht (Deployment `dpl_BJ55Py2WD4wxSDTUWRrzaKExsAqj`). Der neue Build, die Auswahlseite und beide Direktadressen wurden anschließend per HTTP geprüft.
