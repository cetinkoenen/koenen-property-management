import brandLogo from "../assets/koenen-brand-logo.webp";

export type PdfReportMetric = {
  label: string;
  value: string;
  hint?: string;
};

export type PdfReportTable = {
  title: string;
  subtitle?: string;
  pageBreakBefore?: boolean;
  /** Internal SSOT provenance. Intentionally excluded from every visible export. */
  sourceReferences?: Array<{ field: string; source: string }>;
  headers: string[];
  rows: Array<Array<string | number | null | undefined>>;
};

export type PdfReportChart = {
  title: string;
  subtitle?: string;
  labels: string[];
  series: Array<{
    label: string;
    values: number[];
    color?: string;
  }>;
};

export type PdfReportSection = {
  title: string;
  subtitle?: string;
  metrics?: PdfReportMetric[];
  tables?: PdfReportTable[];
  paragraphs?: string[];
  charts?: PdfReportChart[];
};

export type PdfReportOptions = {
  documentName: string;
  title: string;
  subtitle?: string;
  meta?: PdfReportMetric[];
  metrics?: PdfReportMetric[];
  sections: PdfReportSection[];
  landscape?: boolean;
};

const FOOTER_TEXT = "Hohenloher Str. 78 74243 Langenbrettach - info.koenen@gmail.com";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatPrintedAt(date = new Date()): string {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function metricHtml(metrics: PdfReportMetric[] = [], variant: "hero" | "section" = "section") {
  if (!metrics.length) return "";
  const className = variant === "hero" ? "metric-grid hero-metrics" : "metric-grid";
  return `<div class="${className}">${metrics
    .map(
      (metric) => `
        <div class="metric-card">
          <div class="metric-label">${escapeHtml(metric.label)}</div>
          <div class="metric-value">${escapeHtml(metric.value)}</div>
          ${metric.hint ? `<div class="metric-hint">${escapeHtml(metric.hint)}</div>` : ""}
        </div>
      `,
    )
    .join("")}</div>`;
}

function tableHtml(table: PdfReportTable) {
  const normalizedHeader = (header: string) => header.trim().toLocaleLowerCase("de-DE");
  const isMoneyHeader = (header: string) => /betrag|summe|saldo|eingang|ausgabe|kosten|rate|zins|tilgung|restschuld|kalt|gesamt|vorauszahlung|quote|netto|steuer|brutto|kaution|€\/m²/.test(normalizedHeader(header));
  const isDescriptionHeader = (header: string) => /beschreibung|verwendungszweck|notiz|details|hinweis|quelle/.test(normalizedHeader(header));
  const moneyValuePattern = /^-?\d{1,3}(?:\.\d{3})*,\d{2}[\s\u00a0]*€$/;
  const paymentParts = (value: unknown) => String(value ?? "").trim().match(/^(.+?€)\s*\/\s*(.+?€)\s*·\s*(.+)$/);
  const paymentStatusClass = (status: string): string => {
    const normalized = status.toLocaleLowerCase("de-DE");
    if (normalized.includes("bezahlt") || normalized.includes("guthaben")) return "payment-paid";
    if (normalized.includes("offen") || normalized.includes("nachzahlung") || normalized.includes("teilweise") || normalized.includes("fehlt")) return "payment-open";
    return "payment-neutral";
  };
  const columnWeight = (header: string): number => {
    const normalized = normalizedHeader(header);
    if (isDescriptionHeader(header)) return 2.8;
    if (/objekt|immobilie|mieter|bezug|kategorie/.test(normalized)) return 1.35;
    if (/einheit|datum|von|bis|typ|status/.test(normalized)) return 1.05;
    return 1;
  };
  const weights = table.headers.map(columnWeight);
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const columnClass = (header: string, value: unknown): string => {
    const text = String(value ?? "").trim();
    const classes: string[] = [];
    if (/^\d{4}-\d{2}-\d{2}$/.test(text) || /^\d{2}\.\d{2}\.\d{4}$/.test(text)) classes.push("date-cell");
    if (isMoneyHeader(header) || moneyValuePattern.test(text)) classes.push("money-cell");
    if (isDescriptionHeader(header)) classes.push("description-cell");
    const status = text.endsWith("· bezahlt") || text.startsWith("Guthaben ·")
      ? "payment-paid"
      : text.endsWith("· offen") || text.startsWith("Nachzahlung ·")
        ? "payment-open"
        : "";
    if (status) classes.push(status);
    return classes.join(" ");
  };
  const cellHtml = (header: string, value: unknown): string => {
    const parts = paymentParts(value);
    if (parts) {
      const [, actual, expected, status] = parts;
      return `<td class="payment-cell ${paymentStatusClass(status)}"><span class="payment-amount"><small>Ist</small>${escapeHtml(actual)}</span><span class="payment-amount"><small>Soll</small>${escapeHtml(expected)}</span><span class="payment-status">${escapeHtml(status)}</span></td>`;
    }
    return `<td class="${columnClass(header, value)}">${escapeHtml(value ?? "")}</td>`;
  };
  const isSummaryRow = (row: PdfReportTable["rows"][number]): boolean => /^(summe|gesamt(?:summe|betrag|kosten|einnahmen|ausgaben)?|ergebnis|überschuss|saldo)\b/i.test(String(row[0] ?? "").trim());
  return `
    <div class="table-block${table.pageBreakBefore ? " page-break-before" : ""}">
      <div class="table-title">${escapeHtml(table.title)}</div>
      ${table.subtitle ? `<div class="table-subtitle">${escapeHtml(table.subtitle)}</div>` : ""}
      <table>
        <colgroup>${weights.map((weight) => `<col style="width:${((weight / weightTotal) * 100).toFixed(3)}%">`).join("")}</colgroup>
        <thead>
          <tr>${table.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${
            table.rows.length
              ? table.rows
                  .map((row) => `<tr class="${isSummaryRow(row) ? "summary-row" : ""}">${row.map((cell, index) => cellHtml(table.headers[index] ?? "", cell)).join("")}</tr>`)
                  .join("")
              : `<tr><td colspan="${table.headers.length}">Keine Daten vorhanden.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function chartHtml(chart: PdfReportChart) {
  const width = 920;
  const height = 310;
  const left = 62;
  const top = 24;
  const right = 18;
  const bottom = 54;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const allValues = chart.series.flatMap((series) => series.values).filter(Number.isFinite);
  const maximum = Math.max(1, ...allValues);
  const groups = Math.max(1, chart.labels.length);
  const groupWidth = plotWidth / groups;
  const seriesCount = Math.max(1, chart.series.length);
  const barWidth = Math.min(34, Math.max(7, (groupWidth * 0.68) / seriesCount));
  const defaultColors = ["#0f766e", "#c9972b", "#2563eb", "#7c3aed"];
  const grid = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const y = top + plotHeight * ratio;
    const value = maximum * (1 - ratio);
    return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="#dbe3ea" stroke-width="1"/><text x="${left - 8}" y="${y + 4}" text-anchor="end" class="chart-axis">${escapeHtml(new Intl.NumberFormat("de-DE", { notation: "compact", maximumFractionDigits: 1 }).format(value))}</text>`;
  }).join("");
  const bars = chart.labels.flatMap((label, labelIndex) => chart.series.map((series, seriesIndex) => {
    const value = Number(series.values[labelIndex] ?? 0);
    const barHeight = Math.max(0, value / maximum * plotHeight);
    const groupStart = left + labelIndex * groupWidth;
    const barsWidth = barWidth * seriesCount;
    const x = groupStart + (groupWidth - barsWidth) / 2 + seriesIndex * barWidth;
    const y = top + plotHeight - barHeight;
    const color = series.color ?? defaultColors[seriesIndex % defaultColors.length];
    return `<rect x="${x + 1}" y="${y}" width="${Math.max(2, barWidth - 2)}" height="${barHeight}" rx="3" fill="${escapeHtml(color)}"><title>${escapeHtml(`${label} · ${series.label}: ${euroChart(value)}`)}</title></rect>`;
  })).join("");
  const labels = chart.labels.map((label, index) => `<text x="${left + index * groupWidth + groupWidth / 2}" y="${height - 29}" text-anchor="middle" class="chart-label">${escapeHtml(label)}</text>`).join("");
  const legend = chart.series.map((series, index) => `<span><i style="background:${escapeHtml(series.color ?? defaultColors[index % defaultColors.length])}"></i>${escapeHtml(series.label)}</span>`).join("");
  return `<div class="chart-block"><div class="table-title">${escapeHtml(chart.title)}</div>${chart.subtitle ? `<div class="table-subtitle">${escapeHtml(chart.subtitle)}</div>` : ""}<svg class="report-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(chart.title)}">${grid}${bars}${labels}</svg><div class="chart-legend">${legend}</div></div>`;
}

function euroChart(value: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function sectionHtml(section: PdfReportSection) {
  return `
    <section class="section">
      <div class="section-head">
        <h2>${escapeHtml(section.title)}</h2>
        ${section.subtitle ? `<p>${escapeHtml(section.subtitle)}</p>` : ""}
      </div>
      ${metricHtml(section.metrics)}
      ${(section.paragraphs ?? []).map((text) => `<p class="body-text">${escapeHtml(text)}</p>`).join("")}
      ${(section.charts ?? []).map(chartHtml).join("")}
      ${(section.tables ?? []).map(tableHtml).join("")}
    </section>
  `;
}

export function buildProfessionalPdfReportHtml(options: PdfReportOptions) {
  const printedAt = formatPrintedAt();
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(options.documentName)}</title>
  <style>
    @page {
      size: ${options.landscape ? "A4 landscape" : "A4"};
      margin: 16mm 16mm 18mm;
      @bottom-left { content: "${escapeHtml(FOOTER_TEXT)}"; }
      @bottom-right { content: "Seite " counter(page); }
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #f4f1ea;
      color: #111827;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.42;
    }
    .page {
      max-width: 1120px;
      margin: 0 auto;
      padding: 28px;
    }
    .hero {
      position: relative;
      border: 1px solid #dbe3ea;
      border-radius: 28px;
      background: linear-gradient(135deg, #ffffff 0%, #f8fbff 58%, #eefaf4 100%);
      padding: 34px;
      box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
      overflow: hidden;
    }
    .hero::after {
      content: "";
      position: absolute;
      right: 26px;
      top: 24px;
      width: 190px;
      height: 120px;
      border-radius: 24px;
      border: 1px solid rgba(37, 99, 235, 0.10);
      background-image:
        linear-gradient(rgba(37, 99, 235, 0.06) 1px, transparent 1px),
        linear-gradient(90deg, rgba(37, 99, 235, 0.06) 1px, transparent 1px);
      background-size: 20px 20px;
    }
    .eyebrow {
      color: #2563eb;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }
    .brand-logo {
      display: block;
      width: 240px;
      height: auto;
      max-height: 96px;
      object-fit: contain;
      object-position: left center;
      margin-bottom: 18px;
    }
    h1 {
      margin: 12px 0 0;
      max-width: 760px;
      color: #0f172a;
      font-size: 34px;
      line-height: 1.08;
      letter-spacing: 0;
    }
    .subtitle {
      margin: 14px 0 0;
      max-width: 760px;
      color: #526173;
      font-size: 15px;
      font-weight: 650;
    }
    .meta-row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 22px;
    }
    .meta-pill {
      border: 1px solid #dbe3ea;
      border-radius: 999px;
      background: rgba(255,255,255,0.82);
      padding: 9px 12px;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #475569;
    }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-top: 14px;
    }
    .hero-metrics { margin-top: 24px; }
    .metric-card {
      break-inside: avoid;
      border: 1px solid #dbe3ea;
      border-radius: 16px;
      background: #ffffff;
      padding: 13px 14px;
      box-shadow: 0 8px 22px rgba(15, 23, 42, 0.04);
    }
    .metric-label {
      color: #66758a;
      font-size: 10px;
      font-weight: 950;
      letter-spacing: 0.13em;
      text-transform: uppercase;
    }
    .metric-value {
      margin-top: 7px;
      color: #0f172a;
      font-size: 19px;
      font-weight: 950;
    }
    .metric-hint {
      margin-top: 5px;
      color: #64748b;
      font-size: 10px;
      font-weight: 750;
    }
    .section {
      break-inside: avoid;
      border: 1px solid #dbe3ea;
      border-radius: 22px;
      background: #ffffff;
      margin-top: 18px;
      padding: 22px;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.055);
    }
    .section-head h2 {
      margin: 0;
      color: #0f172a;
      font-size: 20px;
      font-weight: 950;
    }
    .section-head p {
      margin: 7px 0 0;
      color: #64748b;
      font-size: 12px;
      font-weight: 750;
    }
    .body-text {
      margin: 12px 0 0;
      color: #334155;
      font-size: 12px;
      font-weight: 650;
    }
    .table-block { margin-top: 14px; }
    .chart-block {
      margin-top: 16px;
      padding: 14px;
      border: 1px solid #dbe3ea;
      border-radius: 16px;
      background: linear-gradient(180deg, #ffffff, #f8fafc);
      break-inside: avoid;
    }
    .report-chart { display: block; width: 100%; height: 255px; margin-top: 8px; }
    .chart-axis { fill: #64748b; font-size: 9px; font-weight: 700; }
    .chart-label { fill: #334155; font-size: 10px; font-weight: 850; }
    .chart-legend { display: flex; justify-content: center; gap: 18px; color: #475569; font-size: 10px; font-weight: 850; }
    .chart-legend span { display: inline-flex; align-items: center; gap: 6px; }
    .chart-legend i { width: 10px; height: 10px; border-radius: 3px; }
    .table-title {
      color: #334155;
      font-size: 12px;
      font-weight: 950;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .table-subtitle {
      margin-top: 3px;
      color: #64748b;
      font-size: 10px;
      font-weight: 750;
    }
    table {
      width: 100%;
      table-layout: fixed;
      border-collapse: separate;
      border-spacing: 0;
      margin-top: 8px;
      overflow: hidden;
      border: 1px solid #dbe3ea;
      border-radius: 14px;
      font-size: 10.5px;
    }
    th {
      background: #f1f5f9;
      color: #607089;
      text-align: left;
      font-size: 9px;
      font-weight: 950;
      letter-spacing: 0.11em;
      text-transform: uppercase;
      padding: 9px 10px;
      border-bottom: 1px solid #dbe3ea;
    }
    td {
      padding: 8px 10px;
      border-bottom: 1px solid #edf2f7;
      color: #1f2937;
      vertical-align: top;
      font-weight: 650;
    }
    tr:last-child td { border-bottom: 0; }
    tr.summary-row td {
      font-weight: 950;
      border-bottom: 4px double #64748b;
      background: #f8fafc;
    }
    tr.summary-row:last-child td { border-bottom: 4px double #64748b; }
    .footer {
      margin-top: 18px;
      display: flex;
      justify-content: space-between;
      gap: 10px;
      color: #64748b;
      font-size: 10px;
      font-weight: 750;
    }
    .payment-paid { background: #e2f4e8; color: #21603a; }
    .payment-open { background: #fce6e5; color: #a02626; }
    .payment-neutral { background: #f8fafc; color: #475569; }
    td, th { overflow-wrap: break-word; word-break: normal; hyphens: auto; }
    td.date-cell { white-space: nowrap; font-variant-numeric: tabular-nums; }
    td.money-cell { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    td.description-cell {
      white-space: normal;
      overflow-wrap: anywhere;
      word-break: normal;
      font-size: 9.2px;
      line-height: 1.35;
    }
    td.payment-cell {
      padding: 7px 8px;
      text-align: right;
      white-space: normal;
      font-variant-numeric: tabular-nums;
      line-height: 1.2;
    }
    .payment-amount {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 4px;
      white-space: nowrap;
      font-size: 8.6px;
      font-weight: 850;
    }
    .payment-amount + .payment-amount { margin-top: 3px; }
    .payment-amount small {
      color: currentColor;
      font-size: 6.8px;
      font-weight: 800;
      letter-spacing: 0.04em;
      opacity: 0.72;
      text-transform: uppercase;
    }
    .payment-status {
      display: block;
      margin-top: 4px;
      white-space: normal;
      font-size: 6.8px;
      font-weight: 900;
      letter-spacing: 0.05em;
      text-align: right;
      text-transform: uppercase;
    }
    @media print {
      * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .hero { break-after: page; }
      .section {
        break-before: page;
        break-inside: auto;
        margin-top: 0;
        padding: 0;
        border: 0;
        border-radius: 0;
      }
      .table-block { break-inside: auto; }
      .table-block.page-break-before { break-before: page; }
      .section-head, .table-title { break-after: avoid; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; }
      body { background: #ffffff; }
      .page { padding: 0; max-width: none; }
      .hero, .section { box-shadow: none; }
      .no-print, .footer, .print-footer { display: none !important; }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <img class="brand-logo" src="${brandLogo}" alt="Koenen Property Management Logo" />
      <div class="eyebrow">Koenen Property Management · PDF-Bericht</div>
      <h1>${escapeHtml(options.title)}</h1>
      ${options.subtitle ? `<p class="subtitle">${escapeHtml(options.subtitle)}</p>` : ""}
      <div class="meta-row">
        <div class="meta-pill">Dokument: ${escapeHtml(options.documentName)}</div>
        <div class="meta-pill">Printed: ${escapeHtml(printedAt)}</div>
        ${(options.meta ?? []).map((item) => `<div class="meta-pill">${escapeHtml(item.label)}: ${escapeHtml(item.value)}</div>`).join("")}
      </div>
      ${metricHtml(options.metrics, "hero")}
    </section>
    ${options.sections.map(sectionHtml).join("")}
    <div class="footer">
      <span>${escapeHtml(FOOTER_TEXT)}</span>
      <span>${escapeHtml(options.documentName)}</span>
    </div>
  </main>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 350);
    };
  </script>
</body>
</html>`;
}

export function openProfessionalPdfReport(options: PdfReportOptions) {
  const win = window.open("", "_blank", "width=1120,height=1400");
  if (!win) {
    alert("PDF-Fenster konnte nicht geöffnet werden. Bitte Pop-up-Blocker prüfen.");
    return;
  }

  win.document.open();
  win.document.write(buildProfessionalPdfReportHtml(options));
  win.document.close();
}

export function downloadTextReport(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
