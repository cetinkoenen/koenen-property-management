# Steuer-Report Anlage V

## Zentrale Datenquellen

- Buchungen und tatsächliches Zahlungsdatum: `finance_entry`
- Wohnfläche: `properties.living_area_m2`
- Schuldzinsen: `property_loan_ledger` des gewählten Steuerjahres
- Fahrtkosten: Fahrtenbuch
- Offene Mieten: Zahlungskalender der Seite Mieteingang
- Leerstand: Leerstandsverwaltung

Der Report führt diese Quellen nur für den Export zusammen. Er speichert keine zweite fachliche Kopie der Finanzdaten.

## Steuerobjekte

Hohenloher Str. 78 ist als selbstgenutztes Objekt vollständig von Anlage V ausgeschlossen. Exportiert werden vier vermietete Wohnungen und die drei Rosenstein-Stellplätze als getrennte Steuerobjekte:

- P250-E008440000121
- P253-E008440000122
- P254-E008440000123

## Fachliche Schutzregeln

- Buchungen werden ausschließlich nach dem tatsächlichen Zahlungsjahr ausgewählt.
- Tilgung und Kreditraten werden nicht als Werbungskosten exportiert.
- Kontoführungsgebühren werden nur aus echten Buchungen übernommen; es gibt keine Pauschale.
- Zuführungen zur Instandhaltungs-/Erhaltungsrücklage werden blockiert.
- Eine nicht aufgeschlüsselte Hausgeldzahlung wird blockiert, bis umlagefähige Kosten, nicht umlagefähige Kosten und Rücklage getrennt erfasst wurden.
- Der Zinsanteil wird jahresgenau aus dem Darlehens-Ledger übernommen. Da das Ledger Jahressummen enthält, bleibt der Einzelzahlungsnachweis als Prüfhinweis sichtbar.

## Formularzeilen

Die Zuordnung orientiert sich an der amtlichen ELSTER-Hilfe zur Anlage V 2025:

- Kaltmiete Wohnraum: Zeilen 13-15
- Miete andere Räume/Stellplätze: Zeilen 16-18
- Nebenkostenvorauszahlungen: Zeile 20
- Nachzahlungen und Erstattungen: Zeile 21
- Schuldzinsen: Zeilen 46-48
- Geldbeschaffungskosten: Zeilen 49-51
- Erhaltungsaufwand: Zeilen 55-72
- Umlagefähige Betriebskosten: Zeilen 73-75
- Nicht umlagefähige Kosten: Zeilen 76-78
- Sonstige Kosten/Fahrtkosten: Zeilen 80-82

Bei späteren Steuerjahren muss die Zeilenzuordnung vor der Abgabe mit dem dann gültigen amtlichen Formular abgeglichen werden.

## Ausgabe

PDF, Excel und CSV nutzen dieselbe aufbereitete Datenliste. CSV-Dateien werden mit Semikolon als Trennzeichen und beim direkten Download mit UTF-8-BOM erzeugt. Das Dateinamensschema lautet `Steuer-Report_Anlage_V_[Steuerjahr]`.
