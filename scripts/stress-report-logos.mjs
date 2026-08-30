import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [app, appCss, pdfLogo, rentAccountPdf, professionalReport, investmentReport, rentOverview, apartments, garages] = await Promise.all([
  read("src/App.tsx"),
  read("src/App.css"),
  read("src/lib/pdfLogo.ts"),
  read("src/lib/rentAccountPdf.ts"),
  read("src/lib/professionalPdfReport.ts"),
  read("src/pages/InvestmentBericht.tsx"),
  read("src/pages/Mietuebersicht.tsx"),
  read("src/pages/NebenkostenWohnungen.tsx"),
  read("src/pages/NebenkostenTiefgarage.tsx"),
]);

const image = (path) => sharp(fileURLToPath(new URL(path, root)));
const sourceMetadata = await image("src/assets/koenen-brand-logo.png").metadata();
const webpMetadata = await image("src/assets/koenen-brand-logo.webp").metadata();
const pdfMetadata = await image("src/assets/koenen-brand-logo-pdf.jpg").metadata();
const icon192 = await image("public/icons/icon-192.png").metadata();
const icon512 = await image("public/icons/icon-512.png").metadata();

assert.deepEqual([sourceMetadata.width, sourceMetadata.height, sourceMetadata.hasAlpha], [1983, 793, true], "Das bereitgestellte neue Logo muss unverändert als zentrale PNG-Quelle vorliegen");
assert.deepEqual([webpMetadata.width, webpMetadata.height, webpMetadata.hasAlpha], [1400, 560, true], "Das optimierte App-Logo muss Seitenverhältnis und Transparenz bewahren");
assert.deepEqual([pdfMetadata.width, pdfMetadata.height, pdfMetadata.format], [1200, 480, "jpeg"], "Für direkte PDF-Dateien muss eine druckoptimierte Logo-Version vorliegen");
assert.deepEqual([icon192.width, icon192.height], [192, 192], "Das kleine App-Icon muss aus der neuen Bildmarke erzeugt sein");
assert.deepEqual([icon512.width, icon512.height], [512, 512], "Das große App-Icon muss aus der neuen Bildmarke erzeugt sein");
assert.match(pdfLogo, /\/BrandLogo Do/, "Der zentrale PDF-Helfer muss das neue Logo als Bildobjekt zeichnen");
assert.match(app, /createPdfLogoObject\(\)/, "Direkt erzeugte Finanz- und Steuer-PDFs müssen das zentrale Logo einbetten");
assert.match(rentAccountPdf, /createPdfLogoObject\(\)/, "Mietkonto-PDFs müssen das zentrale Logo einbetten");
assert.doesNotMatch(rentAccountPdf, /text\("KOENEN"|text\("INVEST"/, "Mietkonto-PDFs dürfen keine alte Textlogo-Ersatzgrafik mehr verwenden");
assert.match(professionalReport, /<img class="brand-logo" src="\$\{brandLogo\}"/, "Professionelle PDF-Berichte müssen das zentrale Logo anzeigen");
assert.match(investmentReport, /<img class="logo" src="\$\{logo\}"/, "Investment-PDFs müssen das zentrale Logo anzeigen");
assert.match(rentOverview, /<img class="brand-logo" src="\$\{brandLogo\}"/, "Mieteingang-PDFs müssen das zentrale Logo anzeigen");
assert.match(apartments, /<img class="brand-logo" src="\$\{brandLogo\}"/, "Wohnungs-Nebenkosten-PDFs müssen das zentrale Logo anzeigen");
assert.match(garages, /<img class="brand-logo" src="\$\{brandLogo\}"/, "Tiefgaragen-Nebenkosten-PDFs müssen das zentrale Logo anzeigen");
assert.match(app, /className="app-global-print-logo"/, "Alle direkt aus App-Seiten gedruckten PDFs müssen eine zentrale Druckmarke erhalten");
assert.match(appCss, /@media print[\s\S]*\.app-global-print-logo/, "Die globale Druckmarke muss ausschließlich im PDF-/Druckmodus sichtbar werden");

console.log("16 Logo- und PDF-Berichtsprüfungen bestanden.");
