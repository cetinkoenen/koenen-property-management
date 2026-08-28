# Automatische Qualitätsprüfung

Stand: 28.08.2026

Der zentrale Befehl für die vollständige lokale Prüfung lautet:

```bash
npm run verify
```

Er führt neun Prüfschritte aus:

1. TypeScript- und Produktions-Build
2. Lint-Warnungsbudget
3. Mietentwicklung und Leerstand
4. Immobilienvermögen
5. Historische Objekt-ID-Aliase
6. Zentrale Datenquellen und Navigationspfade
7. Datenqualität und Objektzuordnung
8. Berichtsexporte
9. RLS-, Rollen- und Storage-Grundschutz

Vercel führt durch `vercel.json` denselben Befehl vor jeder Veröffentlichung aus. Eine fehlerhafte Version kann dadurch nicht als neue Produktionsversion bereitgestellt werden.

Eine zusätzliche GitHub-Aktion ist lokal vorbereitet. Für deren Upload benötigt die GitHub-Anmeldung einmalig die Berechtigung `workflow`; bis dahin ist die verpflichtende Vercel-Prüfung die aktive automatische Schutzschicht.

## Warnungsbudget

Das aktuelle Budget liegt bei höchstens 19 Warnungen. Neue Änderungen dürfen diese Zahl nicht erhöhen. Laufzeitrelevante Warnungen der Regel `react-hooks/set-state-in-effect` wurden vollständig auf null reduziert. In Phase 8 wurden alle 33 unsicheren `any`-Typstellen beseitigt und die gemeinsame Fehlerauswertung zentralisiert.

Verbleibende Kategorien:

- 9 Abhängigkeits-Hinweise für React-Hooks
- 9 Entwicklungs-Hinweise zur Fast-Refresh-Dateistruktur
- 1 Hinweis zur manuellen Memoisierung

Diese Restpunkte sind für die nächste Bereinigungsphase dokumentiert. Das Warnungsbudget wird bei jeder Korrektur weiter abgesenkt und darf nicht wieder angehoben werden.
