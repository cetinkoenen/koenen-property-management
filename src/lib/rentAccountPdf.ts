import type {
  RentAnnualKpiLabel,
  RentAnnualReportSnapshot,
} from "../pages/Mietuebersicht";
import { createPdfLogoObject, drawPdfLogo } from "./pdfLogo";

const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;

const colors = {
  navy: "0.055 0.075 0.13 rg",
  slate: "0.35 0.41 0.5 rg",
  border: "0.84 0.88 0.93 rg",
  soft: "0.96 0.98 1 rg",
  teal: "0.15 0.37 0.43 rg",
  white: "1 1 1 rg",
  green: "0.86 0.97 0.91 rg",
  greenText: "0.05 0.45 0.27 rg",
  tealSoft: "0.86 0.97 0.95 rg",
  tealText: "0.04 0.44 0.42 rg",
  sky: "0.88 0.96 1 rg",
  skyText: "0.02 0.4 0.64 rg",
  indigo: "0.93 0.94 1 rg",
  indigoText: "0.22 0.28 0.68 rg",
  amber: "1 0.96 0.82 rg",
  amberText: "0.63 0.32 0.02 rg",
  rose: "1 0.91 0.92 rg",
  roseText: "0.7 0.07 0.18 rg",
  zinc: "0.94 0.94 0.95 rg",
  zincText: "0.32 0.32 0.36 rg",
};

function escapePdfText(value: string): string {
  return value
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/€/g, "EUR")
    .replace(/–|—/g, "-")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, " ");
}

function currency(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function compactCurrency(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function shorten(value: string, limit: number): string {
  const normalized = value.trim();
  return normalized.length > limit ? `${normalized.slice(0, Math.max(1, limit - 3))}...` : normalized;
}

function kpiStyle(label: RentAnnualKpiLabel): { fill: string; text: string; short: string } {
  if (label === "1.-5. Tag") return { fill: colors.green, text: colors.greenText, short: "1-5" };
  if (label === "6.-10. Tag") return { fill: colors.tealSoft, text: colors.tealText, short: "6-10" };
  if (label === "11.-20. Tag") return { fill: colors.sky, text: colors.skyText, short: "11-20" };
  if (label === "ab 21. Tag") return { fill: colors.indigo, text: colors.indigoText, short: "AB 21" };
  if (label === "Teilweise") return { fill: colors.amber, text: colors.amberText, short: "TEIL" };
  if (label === "Fehlt") return { fill: colors.rose, text: colors.roseText, short: "FEHLT" };
  if (label === "Leerstand") return { fill: colors.zinc, text: colors.zincText, short: "LEER" };
  if (label === "Neutral") return { fill: colors.soft, text: colors.slate, short: "NEUT" };
  return { fill: colors.white, text: colors.slate, short: "-" };
}

function assemblePdf(pageStreams: string[]): Blob {
  const pageKids = pageStreams.map((_, index) => `${6 + index * 2} 0 R`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageKids}] /Count ${pageStreams.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    createPdfLogoObject(),
    ...pageStreams.flatMap((content, index) => [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /BrandLogo 5 0 R >> >> /Contents ${7 + index * 2} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    ]),
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

export function createRentAccountPdf(
  report: RentAnnualReportSnapshot,
  objectFilterLabel: string,
): Blob {
  const pageStreams: string[] = [];
  const generatedAt = new Date().toLocaleString("de-DE");

  function newPage(pageNumber: number, subtitle: string) {
    const commands: string[] = [];
    const rect = (x: number, y: number, width: number, height: number, fill: string, stroke = colors.border) => {
      commands.push(fill, `${x} ${y} ${width} ${height} re f`, stroke.replace(" rg", " RG"), "0.65 w", `${x} ${y} ${width} ${height} re S`);
    };
    const text = (value: string, x: number, y: number, size = 9, bold = false, fill = colors.navy) => {
      commands.push(fill, "BT", `/${bold ? "F2" : "F1"} ${size} Tf`, `${x} ${y} Td`, `(${escapePdfText(value)}) Tj`, "ET");
    };
    const line = (x1: number, y1: number, x2: number, y2: number) => {
      commands.push(colors.border.replace(" rg", " RG"), "0.65 w", `${x1} ${y1} m ${x2} ${y2} l S`);
    };

    rect(0, PAGE_HEIGHT - 62, PAGE_WIDTH, 62, colors.soft, colors.soft);
    commands.push(...drawPdfLogo(24, PAGE_HEIGHT - 52, 112));
    text("Mietkonto-Check & Offene Zahlungen", 150, PAGE_HEIGHT - 28, 16, true);
    text(subtitle, 150, PAGE_HEIGHT - 43, 8, false, colors.slate);
    text(`Erstellt ${generatedAt}`, PAGE_WIDTH - 172, PAGE_HEIGHT - 28, 8, false, colors.slate);
    line(24, PAGE_HEIGHT - 68, PAGE_WIDTH - 24, PAGE_HEIGHT - 68);
    text(`Hauptquelle: Mieteingang / Zahlungskalender ${report.year}`, 24, 22, 7.5, false, colors.slate);
    text(`Seite ${pageNumber}`, PAGE_WIDTH - 68, 22, 7.5, true, colors.slate);
    return { commands, rect, text, line };
  }

  {
    const page = newPage(1, `${objectFilterLabel} - Jahresuebersicht ${report.year}`);
    page.text("Jahresauswertung aus derselben Berechnung wie die Seite Mieteingang", 24, 500, 11, true, colors.teal);
    page.text("Soll: Mietentwicklung/Mietanpassungen und Mieterregister | Ist: Buchungen | Leerstand: Seite Leerstand", 24, 484, 8, false, colors.slate);

    const summaryCards = [
      { label: "SUMME ZAHLUNGSEINGAENGE", value: report.totals.paid, fill: colors.green, text: colors.greenText },
      { label: "SOLL GESAMT", value: report.totals.expected, fill: colors.soft, text: colors.navy },
      { label: "NOCH OFFEN", value: report.totals.open, fill: colors.rose, text: colors.roseText },
      { label: "UEBERZAHLUNG", value: report.totals.overpaid, fill: colors.indigo, text: colors.indigoText },
    ];
    summaryCards.forEach((card, index) => {
      const x = 24 + index * 198;
      page.rect(x, 416, 184, 54, card.fill);
      page.text(card.label, x + 10, 452, 7.5, true, card.text);
      page.text(currency(card.value), x + 10, 430, 14, true, card.text);
    });

    const kpiOrder: Array<Exclude<RentAnnualKpiLabel, "—">> = [
      "1.-5. Tag",
      "6.-10. Tag",
      "11.-20. Tag",
      "ab 21. Tag",
      "Teilweise",
      "Fehlt",
      "Leerstand",
      "Neutral",
    ];
    kpiOrder.forEach((label, index) => {
      const style = kpiStyle(label);
      const x = 24 + (index % 4) * 198;
      const y = index < 4 ? 370 : 330;
      page.rect(x, y, 184, 30, style.fill);
      page.text(label, x + 9, y + 18, 8, true, style.text);
      page.text(String(report.kpis[label]), x + 160, y + 18, 9, true, style.text);
    });

    page.text("JAHRESSUMMEN NACH IMMOBILIE", 24, 303, 10, true, colors.teal);
    const tableX = 24;
    const widths = [282, 126, 126, 116, 116];
    const headers = ["Immobilie", "Zahlungseingaenge", "Soll gesamt", "Noch offen", "Ueberzahlung"];
    let x = tableX;
    headers.forEach((header, index) => {
      page.rect(x, 272, widths[index], 24, colors.soft);
      page.text(header, x + 7, 281, 7.5, true, colors.slate);
      x += widths[index];
    });
    report.propertyTotals.slice(0, 9).forEach((row, rowIndex) => {
      const y = 248 - rowIndex * 25;
      const values = [row.objectLabel, currency(row.paid), currency(row.expected), currency(row.open), currency(row.overpaid)];
      let cellX = tableX;
      values.forEach((value, index) => {
        page.rect(cellX, y, widths[index], 25, rowIndex % 2 ? colors.soft : colors.white);
        page.text(shorten(value, index === 0 ? 43 : 20), cellX + 7, y + 9, index === 0 ? 8.5 : 8, index === 0, index === 3 ? colors.roseText : index === 4 ? colors.indigoText : colors.navy);
        cellX += widths[index];
      });
    });
    pageStreams.push(page.commands.join("\n"));
  }

  const propertyRowsPerContinuationPage = 17;
  for (let offset = 9; offset < report.propertyTotals.length; offset += propertyRowsPerContinuationPage) {
    const pageNumber = pageStreams.length + 1;
    const page = newPage(pageNumber, `Jahressummen nach Immobilie - ${objectFilterLabel}`);
    const tableX = 24;
    const widths = [282, 126, 126, 116, 116];
    const headers = ["Immobilie", "Zahlungseingaenge", "Soll gesamt", "Noch offen", "Ueberzahlung"];
    let x = tableX;
    headers.forEach((header, index) => {
      page.rect(x, 478, widths[index], 24, colors.soft);
      page.text(header, x + 7, 487, 7.5, true, colors.slate);
      x += widths[index];
    });
    report.propertyTotals
      .slice(offset, offset + propertyRowsPerContinuationPage)
      .forEach((row, rowIndex) => {
        const y = 453 - rowIndex * 25;
        const values = [row.objectLabel, currency(row.paid), currency(row.expected), currency(row.open), currency(row.overpaid)];
        let cellX = tableX;
        values.forEach((value, index) => {
          page.rect(cellX, y, widths[index], 25, rowIndex % 2 ? colors.soft : colors.white);
          page.text(shorten(value, index === 0 ? 43 : 20), cellX + 7, y + 9, index === 0 ? 8.5 : 8, index === 0, index === 3 ? colors.roseText : index === 4 ? colors.indigoText : colors.navy);
          cellX += widths[index];
        });
      });
    pageStreams.push(page.commands.join("\n"));
  }

  const rowsPerPage = 7;
  for (let offset = 0; offset < report.rows.length; offset += rowsPerPage) {
    const pageNumber = pageStreams.length + 1;
    const page = newPage(pageNumber, `Zahlungskalender ${report.year} - ${objectFilterLabel}`);
    const pageRows = report.rows.slice(offset, offset + rowsPerPage);
    const startX = 24;
    const objectWidth = 126;
    const monthWidth = 40;
    const totalWidth = 44;
    const headerY = 478;
    const rowHeight = 55;
    const monthLabels = ["JAN", "FEB", "MAE", "APR", "MAI", "JUN", "JUL", "AUG", "SEP", "OKT", "NOV", "DEZ"];

    page.text("ZAHLUNGSKALENDER", 24, 505, 11, true, colors.teal);
    page.text("Farbe und Kurzstatus entsprechen den KPI-Kategorien der Mieteingang-Jahresuebersicht.", 150, 505, 8, false, colors.slate);
    page.rect(startX, headerY, objectWidth, 26, colors.soft);
    page.text("OBJEKT / EINHEIT", startX + 6, headerY + 9, 7, true, colors.slate);
    monthLabels.forEach((label, index) => {
      const x = startX + objectWidth + index * monthWidth;
      page.rect(x, headerY, monthWidth, 26, colors.soft);
      page.text(label, x + 10, headerY + 9, 6.5, true, colors.slate);
    });
    ["IST", "SOLL", "OFFEN", "UEZ"].forEach((label, index) => {
      const x = startX + objectWidth + 12 * monthWidth + index * totalWidth;
      page.rect(x, headerY, totalWidth, 26, colors.soft);
      page.text(label, x + 8, headerY + 9, 6.5, true, colors.slate);
    });

    pageRows.forEach((row, rowIndex) => {
      const y = headerY - (rowIndex + 1) * rowHeight;
      page.rect(startX, y, objectWidth, rowHeight, rowIndex % 2 ? colors.soft : colors.white);
      page.text(shorten(row.objectLabel, 22), startX + 6, y + 36, 7.5, true);
      page.text(shorten(row.unitLabel, 22), startX + 6, y + 23, 6.5, false, colors.slate);
      page.text(shorten(row.tenantName, 22), startX + 6, y + 10, 6.2, false, colors.slate);

      row.months.forEach((month, monthIndex) => {
        const style = kpiStyle(month.kpi);
        const x = startX + objectWidth + monthIndex * monthWidth;
        page.rect(x, y, monthWidth, rowHeight, style.fill);
        page.text(style.short, x + 5, y + 35, 5.8, true, style.text);
        page.text(compactCurrency(month.paid), x + 4, y + 20, 6.3, true, style.text);
        if (month.open > 0) page.text(`O ${compactCurrency(month.open)}`, x + 4, y + 8, 5.4, true, colors.roseText);
      });

      const totals = [row.yearPaid, row.yearExpected, row.yearOpen, row.yearOverpaid];
      totals.forEach((value, totalIndex) => {
        const x = startX + objectWidth + 12 * monthWidth + totalIndex * totalWidth;
        const fill = totalIndex === 2 ? colors.rose : totalIndex === 3 ? colors.indigo : rowIndex % 2 ? colors.soft : colors.white;
        const textColor = totalIndex === 2 ? colors.roseText : totalIndex === 3 ? colors.indigoText : colors.navy;
        page.rect(x, y, totalWidth, rowHeight, fill);
        page.text(compactCurrency(value), x + 4, y + 24, 6.4, true, textColor);
      });
    });
    pageStreams.push(page.commands.join("\n"));
  }

  return assemblePdf(pageStreams);
}
