import type { PdfReportMetric } from '../lib/professionalPdfReport';
import type { ReportModule } from './reportCenterEngine';

export type PreparedReportPdf = {
  sections: ReportModule[];
  metrics: PdfReportMetric[];
};

const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('de-DE');

export function prepareTaxAdvisorPdf(modules: ReportModule[]): PreparedReportPdf {
  const repeatedColumns = 3;
  const columnsPerPart = 6;
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
      const normalizedTable = { ...table, rows: uniqueRows };
      const fingerprint = JSON.stringify([normalizedTable.headers, normalizedTable.rows]);
      if (seenTables.has(fingerprint)) return [];
      seenTables.add(fingerprint);
      if (table.headers.length <= maxColumnsPerTable) return [normalizedTable];
      const parts: typeof table[] = [];
      for (let start = repeatedColumns; start < table.headers.length; start += columnsPerPart) {
        const end = Math.min(start + columnsPerPart, table.headers.length);
        const detailHeaders = table.headers.slice(start, end);
        parts.push({
          ...table,
          title: `${table.title} · ${detailHeaders[0]} bis ${detailHeaders.at(-1)}`,
          headers: [...table.headers.slice(0, repeatedColumns), ...detailHeaders],
          rows: uniqueRows.map(row => [...row.slice(0, repeatedColumns), ...row.slice(start, end)]),
        });
      }
      return parts;
    }) ?? [];
    // Leere optionale Anlagen erzeugen keine eigenen PDF-Seiten. Fachliche
    // Kernkapitel mit einem erläuternden Hinweis bleiben dagegen sichtbar.
    if (!tables.length && !module.metrics?.length && !module.charts?.length && (module.variant === 'appendix' || !paragraphs.length)) return [];
    return [{ ...module, tables, paragraphs }];
  });

  return { sections, metrics };
}
