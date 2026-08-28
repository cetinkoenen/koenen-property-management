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

Die GitHub-Aktion `.github/workflows/quality.yml` führt dieselbe Prüfung bei jedem Push auf `main` und bei jedem Pull Request gegen `main` aus. Gemeinsam mit der verpflichtenden Vercel-Prüfung verhindert sie, dass ungeprüfte Änderungen unbemerkt in den Hauptstand oder in die Produktion gelangen.

## Warnungsbudget

Das aktuelle Budget liegt bei **0 Warnungen**. Neue Änderungen dürfen keine Warnung einführen. Laufzeitrelevante Warnungen der Regel `react-hooks/set-state-in-effect` wurden vollständig auf null reduziert. In Phase 8 wurden alle 33 unsicheren `any`-Typstellen beseitigt und die gemeinsame Fehlerauswertung zentralisiert. Phase 9 hat alle Hook-Abhängigkeits- und Memoisierungswarnungen behoben. Phase 10 hat Hilfsfunktionen und UI-Varianten aus Komponentendateien getrennt und die notwendigen Next.js-Exportkonventionen präzise freigegeben.

Es bestehen keine verbleibenden Lint-Kategorien. Das Null-Budget wird lokal und vor jeder Vercel-Veröffentlichung erzwungen.
