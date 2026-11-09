import type { PdfReportMetric } from '../lib/professionalPdfReport';
import type { ReportModule } from './reportCenterEngine';

export type PreparedReportPdf = {
  sections: ReportModule[];
  metrics: PdfReportMetric[];
};

const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('de-DE');

export function prepareTaxAdvisorPdf(modules: ReportModule[]): PreparedReportPdf {
  const repeatedColumns = 3;
  // A4-Hochformat: Neben den drei Identifikationsspalten bleiben drei
  // Detailspalten pro Tabellenblock gut lesbar. Breitere Tabellen werden
  // automatisch in fortlaufende Teile zerlegt, statt Text zu verkleinern
  // oder Spalten ineinander laufen zu lassen.
  const columnsPerPart = 3;
  const maxColumnsPerTable = repeatedColumns + columnsPerPart;
  const seenTables = new Set<string>();
  const seenParagraphs = new Set<string>();
  const coverRows = modules.find(module => module.id === 'cover')?.tables?.find(table => table.title === 'Kennzahlen')?.rows ?? [];
  const wantedMetrics = new Set([
    'Steuerlich vorbereitete Einnahmen (EÜR)',
    'Steuerlich vorbereitete Ausgaben (EÜR)',
    'Steuerlich vorbereitetes Ergebnis (EÜR)',
    'Soll-Mieten',
    'Ist-Mieten',
    'Zahlungsquote',
  ]);
  const metrics = coverRows
    .filter(row => wantedMetrics.has(String(row[0] ?? '')))
    .map(row => ({ label: String(row[0] ?? ''), value: String(row[1] ?? '—') }));

  const validation = modules.find(module => module.id === 'validation');
  const validationMetric = (label: string) => validation?.metrics?.find(metric => metric.label === label)?.value ?? '—';
  const isFullPackage = modules.some(module => module.id === 'journal');
  const contents = modules
    .filter(module => !['validation', 'cover'].includes(module.id))
    .map((module, index) => [String(index + 1), module.title, module.variant === 'appendix' ? 'Anlage' : 'Kernkapitel']);
  const handoffSections: ReportModule[] = [{
    id: 'handoff',
    title: isFullPackage ? 'Übergabe- und Freigabeblatt · Vollakte' : 'Übergabe- und Freigabeblatt · Kurzakte',
    subtitle: 'Arbeitsübersicht für die steuerliche Bearbeitung. Fachliche Beurteilung und Abgabe bleiben dem Steuerberater vorbehalten.',
    variant: 'summary',
    metrics: [
      { label: 'Exportstatus', value: validationMetric('Exportstatus') },
      { label: 'Blocker', value: validationMetric('Blocker') },
      { label: 'Prüffälle', value: validationMetric('Prüffälle') },
      { label: 'Ausgabe', value: isFullPackage ? 'Vollakte mit Anlagen' : 'Kurzakte' },
    ],
    tables: [
      { title: 'Inhalt und Bearbeitungsreihenfolge', headers: ['Nr.', 'Kapitel', 'Art'], rows: contents },
      {
        title: 'Datenquellen und Prüfumfang',
        headers: ['Bereich', 'Verbindliche Hauptquelle'],
        rows: [
          ['Buchungen und Belegnachweise', 'Buchungsjournal / finance_entry'],
          ['Mietverträge und Sollmieten', 'Mietkonto, Mietverträge und Mietanpassungen'],
          ['Zinsen und Tilgung', 'property_loan_ledger und Tilgungsplan'],
          ['Flächen und Objektstammdaten', 'Immobilienvermögen / property_extra_info'],
        ],
      },
    ],
    paragraphs: [isFullPackage
      ? 'Die Vollakte enthält die vollständigen Nachweise. Jede Buchung wird ausschließlich im Buchungsjournal als Belegreferenz geführt; Kernkapitel zeigen nur die fachlich notwendige Zusammenfassung.'
      : 'Die Kurzakte enthält die steuerlich entscheidungsrelevanten Kernkapitel. Für Einzelbelege und vollständige Nachweise ist die Vollakte zu verwenden.'],
  }];

  const sections = modules.flatMap((module) => {
    // Die wichtigsten Kennzahlen erscheinen direkt auf dem echten Deckblatt.
    // Das bisherige zweite Kennzahlen-Deckblatt wird dadurch vermieden.
    if (module.id === 'cover') return [];
    const paragraphs = (module.paragraphs ?? []).filter((paragraph) => {
      const key = normalizeText(paragraph);
      if (!key || seenParagraphs.has(key)) return false;
      seenParagraphs.add(key);
      return true;
    });
    const tables = module.tables?.flatMap((table) => {
      if (!table.rows.length) return [];
      const uniqueRows = table.rows.filter((row, index, rows) => rows.findIndex(candidate => JSON.stringify(candidate) === JSON.stringify(row)) === index);
      const isJournal = module.id === 'journal' && table.title === 'Alle Geldbewegungen';
      const normalizedTable = isJournal
        ? {
            ...table,
            title: 'Belegverzeichnis · Buchungsnachweis',
            headers: ['Belegreferenz', ...table.headers],
            rows: uniqueRows.map((row, index) => [`B-${String(index + 1).padStart(5, '0')}`, ...row]),
          }
        : { ...table, rows: uniqueRows };
      const fingerprint = JSON.stringify([normalizedTable.headers, normalizedTable.rows]);
      if (seenTables.has(fingerprint)) return [];
      seenTables.add(fingerprint);
      if (normalizedTable.headers.length <= maxColumnsPerTable) return [normalizedTable];
      const parts: typeof table[] = [];
      for (let start = repeatedColumns; start < normalizedTable.headers.length; start += columnsPerPart) {
        const end = Math.min(start + columnsPerPart, normalizedTable.headers.length);
        const detailHeaders = normalizedTable.headers.slice(start, end);
        parts.push({
          ...normalizedTable,
          title: `${normalizedTable.title} · ${detailHeaders[0]} bis ${detailHeaders.at(-1)}`,
          headers: [...normalizedTable.headers.slice(0, repeatedColumns), ...detailHeaders],
          rows: normalizedTable.rows.map(row => [...row.slice(0, repeatedColumns), ...row.slice(start, end)]),
        });
      }
      return parts;
    }) ?? [];
    // Leere optionale Anlagen erzeugen keine eigenen PDF-Seiten. Fachliche
    // Kernkapitel mit einem erläuternden Hinweis bleiben dagegen sichtbar.
    if (!tables.length && !module.metrics?.length && !module.charts?.length && (module.variant === 'appendix' || !paragraphs.length)) return [];
    return [{ ...module, tables, paragraphs, pageBreakBefore: true }];
  });

  return { sections: [...handoffSections, ...sections], metrics };
}
