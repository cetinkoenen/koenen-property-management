import { createPdfLogoObject, drawPdfLogo } from "@/lib/pdfLogo";

export type LoanInterestDetailMode = "selected-year" | "all-years";

export type LoanInterestSourceRow = {
  propertyId: string;
  propertyName: string;
  year: number;
  interest: number;
  principal: number;
  balance: number;
  source: string | null;
};

export type LoanInterestReportYearRow = {
  year: number;
  interest: number;
  principal: number;
  debtService: number;
  closingBalance: number;
  propertyCount: number;
};

export type LoanInterestReportSection = {
  propertyId: string;
  propertyName: string;
  rows: LoanInterestSourceRow[];
  interestTotal: number;
  principalTotal: number;
  debtServiceTotal: number;
  latestBalance: number;
  latestBalanceYear: number | null;
  sources: string[];
};

export type LoanInterestReportModel = {
  title: string;
  selectedYear: number;
  currentYear: number;
  detailMode: LoanInterestDetailMode;
  objectLabel: string;
  coverRows: LoanInterestReportYearRow[];
  sections: LoanInterestReportSection[];
  interestTotal: number;
  principalTotal: number;
  debtServiceTotal: number;
  latestBalanceTotal: number;
  generatedAt: string;
};

function roundCurrency(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function cleanSource(source: string | null): string {
  return String(source ?? "Darlehens-Ledger").replace(/^CSV-Monatsplan:\s*/i, "CSV: ");
}

export function buildLoanInterestReportModel(input: {
  rows: LoanInterestSourceRow[];
  properties?: Array<{ propertyId: string; propertyName: string }>;
  selectedYear: number;
  currentYear: number;
  detailMode: LoanInterestDetailMode;
  objectLabel: string;
}): LoanInterestReportModel {
  const rows = input.rows
    .filter((row) => row.year <= input.currentYear)
    .sort((left, right) => left.propertyName.localeCompare(right.propertyName, "de") || left.year - right.year);
  const firstYear = rows.length ? Math.min(...rows.map((row) => row.year)) : input.currentYear;
  const coverRows: LoanInterestReportYearRow[] = [];
  for (let year = firstYear; year <= input.currentYear; year += 1) {
    const yearRows = rows.filter((row) => row.year === year);
    coverRows.push({
      year,
      interest: roundCurrency(yearRows.reduce((sum, row) => sum + row.interest, 0)),
      principal: roundCurrency(yearRows.reduce((sum, row) => sum + row.principal, 0)),
      debtService: roundCurrency(yearRows.reduce((sum, row) => sum + row.interest + row.principal, 0)),
      closingBalance: roundCurrency(yearRows.reduce((sum, row) => sum + row.balance, 0)),
      propertyCount: new Set(yearRows.map((row) => row.propertyId)).size,
    });
  }

  const propertyNames = new Map(input.properties?.map((property) => [property.propertyId, property.propertyName]) ?? []);
  rows.forEach((row) => propertyNames.set(row.propertyId, row.propertyName));
  const propertyIds = Array.from(new Set([
    ...(input.properties ?? []).map((property) => property.propertyId),
    ...rows.map((row) => row.propertyId),
  ]));
  const sections = propertyIds.map((propertyId) => {
    const propertyRows = rows.filter((row) => row.propertyId === propertyId);
    const detailRows = propertyRows.filter((row) => input.detailMode === "all-years" || row.year === input.selectedYear);
    const latest = propertyRows.at(-1);
    return {
      propertyId,
      propertyName: propertyRows[0]?.propertyName ?? propertyNames.get(propertyId) ?? propertyId,
      rows: detailRows,
      interestTotal: roundCurrency(detailRows.reduce((sum, row) => sum + row.interest, 0)),
      principalTotal: roundCurrency(detailRows.reduce((sum, row) => sum + row.principal, 0)),
      debtServiceTotal: roundCurrency(detailRows.reduce((sum, row) => sum + row.interest + row.principal, 0)),
      latestBalance: roundCurrency(latest?.balance ?? 0),
      latestBalanceYear: latest?.year ?? null,
      sources: Array.from(new Set(propertyRows.map((row) => cleanSource(row.source)))),
    };
  });

  const currentYearRows = rows.filter((row) => row.year === input.currentYear);
  const currentBalances = currentYearRows
    .reduce((sum, row) => sum + row.balance, 0);
  return {
    title: "Tilgung & Zins - Jahresübersicht",
    selectedYear: input.selectedYear,
    currentYear: input.currentYear,
    detailMode: input.detailMode,
    objectLabel: input.objectLabel,
    coverRows,
    sections,
    interestTotal: roundCurrency(coverRows.reduce((sum, row) => sum + row.interest, 0)),
    principalTotal: roundCurrency(coverRows.reduce((sum, row) => sum + row.principal, 0)),
    debtServiceTotal: roundCurrency(coverRows.reduce((sum, row) => sum + row.debtService, 0)),
    latestBalanceTotal: roundCurrency(currentYearRows.length ? currentBalances : sections.reduce((sum, section) => sum + section.latestBalance, 0)),
    generatedAt: new Date().toLocaleString("de-DE"),
  };
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildLoanInterestReportCsv(model: LoanInterestReportModel): string {
  const headers = ["Bereich", "Objekt", "Jahr", "Zinsen", "Tilgung", "Kapitaldienst", "Restschuld Jahresende", "Objekte", "Quelle"];
  const rows: Array<Array<unknown>> = [
    ...model.coverRows.map((row) => ["Deckblatt / Jahressumme", model.objectLabel, row.year, row.interest, row.principal, row.debtService, row.closingBalance, row.propertyCount, "Darlehen / property_loan_ledger"]),
    ...model.sections.flatMap((section) => section.rows.length
      ? section.rows.map((row) => ["Immobilien-Detail", section.propertyName, row.year, row.interest, row.principal, roundCurrency(row.interest + row.principal), row.balance, 1, cleanSource(row.source)])
      : [["Immobilien-Detail", section.propertyName, model.detailMode === "selected-year" ? model.selectedYear : "", "", "", "", "", 1, "Keine Darlehenswerte vorhanden"]]),
  ];
  return [headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\n");
}

function html(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function deNumber(value: number): string {
  return value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function buildLoanInterestReportExcelHtml(model: LoanInterestReportModel): string {
  const yearRows = model.coverRows.map((row) => `<tr><td>${row.year}</td><td class="num">${deNumber(row.interest)}</td><td class="num">${deNumber(row.principal)}</td><td class="num">${deNumber(row.debtService)}</td><td class="num">${deNumber(row.closingBalance)}</td><td class="num">${row.propertyCount}</td></tr>`).join("");
  const detailRows = model.sections.flatMap((section) => section.rows.length
    ? section.rows.map((row) => `<tr><td>${html(section.propertyName)}</td><td>${row.year}</td><td class="num">${deNumber(row.interest)}</td><td class="num">${deNumber(row.principal)}</td><td class="num">${deNumber(row.interest + row.principal)}</td><td class="num">${deNumber(row.balance)}</td><td>${html(cleanSource(row.source))}</td></tr>`)
    : [`<tr><td>${html(section.propertyName)}</td><td>${model.detailMode === "selected-year" ? model.selectedYear : "-"}</td><td colspan="5">Keine Darlehenswerte für die Auswahl vorhanden.</td></tr>`]).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,sans-serif;color:#0f172a;margin:24px} h1{color:#082f49;font-size:24px;margin:0 0 6px} h2{color:#255f6f;font-size:16px;margin:24px 0 8px}.meta{color:#64748b;font-size:11px;margin-bottom:18px}.kpis{border-collapse:separate;border-spacing:8px;margin:0 -8px 18px}.kpis td{background:#eef7f4;border:1px solid #c9e8df;padding:12px 18px;font-weight:700}.kpis b{display:block;color:#64748b;font-size:10px;text-transform:uppercase;margin-bottom:4px}table.data{border-collapse:collapse;width:100%;margin-bottom:22px}table.data th{background:#234e59;color:white;text-align:left;font-size:11px;padding:9px}table.data td{border-bottom:1px solid #dbe4ee;padding:8px;font-size:11px}table.data tr:nth-child(even) td{background:#f8fafc}.num{text-align:right;mso-number-format:'\\#\\,\\#\\#0\\.00'} .note{background:#fff7ed;border:1px solid #fed7aa;padding:10px;font-size:11px;color:#9a3412}
  </style></head><body>
    <h1>${html(model.title)}</h1><div class="meta">Objektfilter: ${html(model.objectLabel)} | Erstellt: ${html(model.generatedAt)} | Hauptquelle: Darlehen / property_loan_ledger</div>
    <table class="kpis"><tr><td><b>Zinsen bis ${model.currentYear}</b>${deNumber(model.interestTotal)} EUR</td><td><b>Tilgung bis ${model.currentYear}</b>${deNumber(model.principalTotal)} EUR</td><td><b>Kapitaldienst</b>${deNumber(model.debtServiceTotal)} EUR</td><td><b>Restschuld</b>${deNumber(model.latestBalanceTotal)} EUR</td></tr></table>
    <h2>Deckblatt - Jahresentwicklung bis ${model.currentYear}</h2><table class="data"><thead><tr><th>Jahr</th><th>Zinsen</th><th>Tilgung</th><th>Kapitaldienst</th><th>Restschuld Jahresende</th><th>Objekte</th></tr></thead><tbody>${yearRows}</tbody></table>
    <h2>Immobilien-Details - ${model.detailMode === "all-years" ? `alle Jahre bis ${model.currentYear}` : model.selectedYear}</h2><table class="data"><thead><tr><th>Immobilie</th><th>Jahr</th><th>Zinsen</th><th>Tilgung</th><th>Kapitaldienst</th><th>Restschuld Jahresende</th><th>Quelle</th></tr></thead><tbody>${detailRows || '<tr><td colspan="7">Keine Darlehenswerte für die Auswahl vorhanden.</td></tr>'}</tbody></table>
    <div class="note">Steuerhinweis: Schuldzinsen können bei Vermietung steuerlich relevant sein. Tilgung ist keine Werbungskostenposition und wird nur zur Darlehens- und Vermögensdokumentation ausgewiesen.</div>
  </body></html>`;
}

function escapePdf(value: string): string {
  return value.replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/€/g, "EUR").replace(/–|—/g, "-").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[^\x20-\x7E]/g, " ");
}

export function createLoanInterestReportPdf(model: LoanInterestReportModel): Blob {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 42;
  const streams: string[] = [];
  const generatedAt = model.generatedAt;
  const money = (value: number) => `${deNumber(value)} EUR`;
  const navy = "0.055 0.075 0.13 rg";
  const slate = "0.39 0.45 0.56 rg";
  const teal = "0.15 0.37 0.44 rg";

  function pageBase(pageNumber: number): string[] {
    const content: string[] = ["0.96 0.98 1 rg", `0 ${pageHeight - 76} ${pageWidth} 76 re f`, ...drawPdfLogo(margin, pageHeight - 64, 118)];
    const text = (value: string, x: number, y: number, size = 10, bold = false, color = navy) => content.push(color, "BT", `/${bold ? "F2" : "F1"} ${size} Tf`, `${x} ${y} Td`, `(${escapePdf(value)}) Tj`, "ET");
    text("Darlehens- und Finanzreport", margin + 132, pageHeight - 35, 10, true, slate);
    text(`Erstellt: ${generatedAt}`, pageWidth - 210, pageHeight - 35, 8, false, slate);
    content.push("0.88 0.91 0.95 RG", "0.8 w", `${margin} ${pageHeight - 82} m ${pageWidth - margin} ${pageHeight - 82} l S`);
    text("Koenen Property Management | Hauptquelle: Darlehen / property_loan_ledger", margin, 34, 8, false, slate);
    text(`Seite ${pageNumber}`, pageWidth - 82, 34, 8, true, slate);
    return content;
  }

  function addText(content: string[], value: string, x: number, y: number, size = 10, bold = false, color = navy) {
    content.push(color, "BT", `/${bold ? "F2" : "F1"} ${size} Tf`, `${x} ${y} Td`, `(${escapePdf(value)}) Tj`, "ET");
  }

  function addRect(content: string[], x: number, y: number, width: number, height: number, fill: string, stroke = "0.84 0.88 0.93 RG") {
    content.push(fill, `${x} ${y} ${width} ${height} re f`, stroke, "0.7 w", `${x} ${y} ${width} ${height} re S`);
  }

  const cover = pageBase(1);
  addText(cover, model.title, margin, 690, 25, true);
  addText(cover, `Objektfilter: ${model.objectLabel}`, margin, 666, 11, false, slate);
  addText(cover, `Jahresentwicklung bis einschliesslich ${model.currentYear}`, margin, 648, 10, false, slate);
  const kpis = [
    ["ZINSEN BIS AKTUELL", money(model.interestTotal)],
    ["TILGUNG BIS AKTUELL", money(model.principalTotal)],
    ["KAPITALDIENST", money(model.debtServiceTotal)],
    ["RESTSCHULD", money(model.latestBalanceTotal)],
  ];
  kpis.forEach(([label, value], index) => {
    const x = margin + (index % 2) * 258;
    const y = 568 - Math.floor(index / 2) * 72;
    addRect(cover, x, y, 244, 58, "0.90 0.97 0.94 rg", "0.74 0.90 0.82 RG");
    addText(cover, label, x + 12, y + 38, 8, true, teal);
    addText(cover, value, x + 12, y + 16, 14, true);
  });
  addText(cover, "JAHRESENTWICKLUNG", margin, 442, 11, true, teal);
  const coverColumns = [margin, margin + 68, margin + 174, margin + 280, margin + 390, margin + 485];
  ["Jahr", "Zinsen", "Tilgung", "Kapitaldienst", "Restschuld", "Obj."].forEach((label, index) => addText(cover, label, coverColumns[index], 420, 8, true, slate));
  let coverY = 398;
  model.coverRows.forEach((row) => {
    if (coverY < 86) return;
    addRect(cover, margin - 6, coverY - 8, 516, 22, row.year === model.currentYear ? "0.90 0.97 0.94 rg" : "0.98 0.99 1 rg");
    [String(row.year), money(row.interest), money(row.principal), money(row.debtService), money(row.closingBalance), String(row.propertyCount)].forEach((value, index) => addText(cover, value, coverColumns[index], coverY, index ? 7.5 : 8, index === 0 || row.year === model.currentYear));
    coverY -= 26;
  });
  addText(cover, "Schuldzinsen koennen bei Vermietung steuerlich relevant sein. Tilgung ist nicht als Werbungskosten abziehbar.", margin, 62, 8, false, slate);
  streams.push(cover.join("\n"));

  model.sections.forEach((section) => {
    const content = pageBase(streams.length + 1);
    addText(content, section.propertyName, margin, 690, 23, true);
    addText(content, model.detailMode === "all-years" ? `Jahresdetails bis ${model.currentYear}` : `Jahresdetails ${model.selectedYear}`, margin, 666, 11, false, slate);
    addText(content, `Quelle: ${section.sources.join(", ") || "Darlehens-Ledger"}`, margin, 648, 8, false, slate);
    const cards = [["ZINSEN", money(section.interestTotal)], ["TILGUNG", money(section.principalTotal)], ["KAPITALDIENST", money(section.debtServiceTotal)], ["LETZTE RESTSCHULD", `${money(section.latestBalance)} (${section.latestBalanceYear ?? "-"})`]];
    cards.forEach(([label, value], index) => {
      const x = margin + index * 129;
      addRect(content, x, 570, 119, 54, "0.96 0.98 1 rg");
      addText(content, label, x + 8, 604, 7, true, slate);
      addText(content, value, x + 8, 583, 9, true, index === 0 ? teal : navy);
    });
    const columns = [margin, margin + 58, margin + 156, margin + 254, margin + 360, margin + 468];
    ["Jahr", "Zinsen", "Tilgung", "Kapitaldienst", "Restschuld", "Status"].forEach((label, index) => addText(content, label, columns[index], 536, 8, true, slate));
    let y = 510;
    if (!section.rows.length) {
      addRect(content, margin, y - 20, 511, 44, "1 0.97 0.93 rg", "0.99 0.78 0.53 RG");
      addText(content, `Keine Darlehenswerte fuer ${model.selectedYear} vorhanden.`, margin + 14, y, 10, true, "0.60 0.20 0.07 rg");
    } else {
      section.rows.forEach((row) => {
        addRect(content, margin - 6, y - 9, 516, 26, row.year === model.currentYear ? "0.90 0.97 0.94 rg" : "0.985 0.99 1 rg");
        [String(row.year), money(row.interest), money(row.principal), money(row.interest + row.principal), money(row.balance), row.year === model.currentYear ? "laufend" : "Plan"].forEach((value, index) => addText(content, value, columns[index], y, index ? 7.5 : 8, index === 0 || row.year === model.currentYear));
        y -= 31;
      });
    }
    addRect(content, margin, 102, 511, 62, "1 0.97 0.93 rg", "0.99 0.78 0.53 RG");
    addText(content, "STEUERLICHE EINORDNUNG", margin + 14, 143, 8, true, "0.60 0.20 0.07 rg");
    addText(content, "Zinsen: bei vermieteten Objekten als Schuldzinsen pruefen. Tilgung: nicht abzugsfaehig, nur Information.", margin + 14, 122, 8, false, "0.48 0.24 0.12 rg");
    streams.push(content.join("\n"));
  });

  const pageKids = streams.map((_, index) => `${6 + index * 2} 0 R`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageKids}] /Count ${streams.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    createPdfLogoObject(),
    ...streams.flatMap((content, index) => [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /BrandLogo 5 0 R >> >> /Contents ${7 + index * 2} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    ]),
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}
