export type PdfReportMetric = {
  label: string;
  value: string;
  hint?: string;
};

export type PdfReportTable = {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: Array<Array<string | number | null | undefined>>;
};

export type PdfReportSection = {
  title: string;
  subtitle?: string;
  metrics?: PdfReportMetric[];
  tables?: PdfReportTable[];
  paragraphs?: string[];
};

export type PdfReportOptions = {
  documentName: string;
  title: string;
  subtitle?: string;
  meta?: PdfReportMetric[];
  metrics?: PdfReportMetric[];
  sections: PdfReportSection[];
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
  return `
    <div class="table-block">
      <div class="table-title">${escapeHtml(table.title)}</div>
      ${table.subtitle ? `<div class="table-subtitle">${escapeHtml(table.subtitle)}</div>` : ""}
      <table>
        <thead>
          <tr>${table.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${
            table.rows.length
              ? table.rows
                  .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell ?? "")}</td>`).join("")}</tr>`)
                  .join("")
              : `<tr><td colspan="${table.headers.length}">Keine Daten vorhanden.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
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
      ${(section.tables ?? []).map(tableHtml).join("")}
    </section>
  `;
}

export function openProfessionalPdfReport(options: PdfReportOptions) {
  const printedAt = formatPrintedAt();
  const win = window.open("", "_blank", "width=1120,height=1400");
  if (!win) {
    alert("PDF-Fenster konnte nicht geöffnet werden. Bitte Pop-up-Blocker prüfen.");
    return;
  }

  win.document.open();
  win.document.write(`<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(options.documentName)}</title>
  <style>
    @page {
      size: A4;
      margin: 16mm 12mm 18mm;
      @bottom-left { content: "${escapeHtml(FOOTER_TEXT)}"; }
      @bottom-right { content: "Seite " counter(page) " / " counter(pages); }
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
    .footer {
      margin-top: 18px;
      display: flex;
      justify-content: space-between;
      gap: 10px;
      color: #64748b;
      font-size: 10px;
      font-weight: 750;
    }
    @media print {
      body { background: #ffffff; }
      .page { padding: 0; max-width: none; }
      .hero, .section { box-shadow: none; }
      .no-print { display: none !important; }
      .print-footer {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        color: #64748b;
        font-size: 9px;
        font-weight: 750;
        display: flex;
        justify-content: space-between;
        border-top: 1px solid #dbe3ea;
        padding-top: 5px;
      }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <div class="eyebrow">Koenen Investment · PDF-Bericht</div>
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
    <div class="print-footer">
      <span>${escapeHtml(FOOTER_TEXT)}</span>
      <span>Seite <span class="page-number"></span></span>
    </div>
  </main>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 350);
    };
  </script>
</body>
</html>`);
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
