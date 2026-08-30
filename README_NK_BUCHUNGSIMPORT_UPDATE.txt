Koenen Property Management – Update: Buchungen → automatische Nebenkostenabrechnung

Umgesetzt:
- Neues Modul in NebenkostenWohnungen: „Buchungen → automatische NK-Abrechnung“.
- Button „Buchungen importieren“ liest echte Ausgaben aus finance_entry für das gewählte Objekt und den gewählten Abrechnungszeitraum.
- Automatische Erkennung über Kategorie/Notiz, u.a. Grundsteuer, Wasser/Abwasser, Müll/Abfall, Versicherungen, Hausstrom/Allgemeinstrom, Straßenreinigung, Gebäudereinigung, Gartenpflege, Schornsteinfeger, Thermenwartung, Rauchwarnmelder, Dachrinnenreinigung, Winterdienst, Pumpen/Hebeanlage.
- Automatische Anwendung der objektindividuellen Umlageschlüssel/Vorlagen für Colmarer, Elsasser, Fürther und Lilienthaler Str.
- Direktvertrag-Heizung wird berücksichtigt: bei Elsasser/Fürther/Lilienthaler werden Gas/Heizung/Warmwasser/CO2 nicht importiert, außer umlagefähige Wartungspositionen wie Thermenwartung oder Schornsteinfeger.
- Nicht umlagefähige oder riskante Buchungen werden bewusst nicht übernommen und in einer Prüfliste angezeigt, z.B. Rücklage, Reparaturen/Instandhaltung, Verwaltergebühren, Bankgebühren, Hausgeld-Sammelzahlungen.
- Importierte Kosten werden in bestehende Kostenarten übernommen oder als neue Kostenzeile angelegt.
- Build getestet: npm run build erfolgreich.

Hinweis:
- Für WEG-Objekte sollte nicht die Hausgeld-Gesamtrate importiert werden, sondern die Einzelpositionen aus Hausgeldabrechnung oder konkrete Buchungen je Kostenart.
- Vor finaler PDF-Erstellung weiterhin Prüfliste und Beträge kontrollieren.
