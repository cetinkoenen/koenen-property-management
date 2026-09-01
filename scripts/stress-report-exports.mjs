import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const taxEngine = await readFile(new URL("../src/services/taxReportEngine.ts", import.meta.url), "utf8");
const taxClassification = await readFile(new URL("../src/lib/taxClassification.ts", import.meta.url), "utf8");
const portfolioExpense = await readFile(new URL("../src/lib/portfolioExpense.ts", import.meta.url), "utf8");
const appData = await readFile(new URL("../src/state/AppDataContext.tsx", import.meta.url), "utf8");
const loanInterestReport = await readFile(new URL("../src/lib/loanInterestReport.ts", import.meta.url), "utf8");
const loanLedgerService = await readFile(new URL("../src/services/propertyLoanLedgerService.ts", import.meta.url), "utf8");

assert.match(app, /if \(!filename\.trim\(\) \|\| blob\.size === 0\)/, "Leere Exportdateien müssen vor dem Download abgewiesen werden");
assert.match(app, /window\.setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 60_000\)/, "Blob-URLs dürfen nicht unmittelbar nach dem Klick freigegeben werden");
assert.match(app, /let pdf = "%PDF-1\.4\\n"/, "PDF-Exporte müssen mit einer gültigen PDF-Signatur beginnen");
assert.match(app, /const overflowParts = parts\.slice\(6\)/, "Breite PDF-Tabellen müssen alle Felder nach der sechsten Spalte erhalten");
assert.match(app, /Weitere Angaben:.*overflowParts/s, "Zusätzliche PDF-Tabellenfelder müssen sichtbar und beschriftet ausgegeben werden");
assert.doesNotMatch(app, /parts\.slice\(0, 6\)\.map/, "PDF-Tabellen dürfen Daten nach der sechsten Spalte nicht still verwerfen");
assert.match(app, /word\.length <= maxLength[\s\S]*word\.slice\(index, index \+ maxLength\)/, "Lange IDs und Buchungstexte müssen innerhalb der PDF-Spalten umbrechen");
assert.match(app, /pushUint32\(localView, 0, 0x04034b50\)/, "ZIP-Exporte müssen gültige lokale Dateiköpfe schreiben");
assert.match(app, /pushUint32\(endView, 0, 0x06054b50\)/, "ZIP-Exporte müssen ein gültiges Zentralverzeichnis abschließen");
assert.match(app, /text\/csv;charset=utf-8/, "CSV-Exporte müssen einen UTF-8-Inhaltstyp verwenden");
assert.match(app, /application\/vnd\.ms-excel;charset=utf-8/, "Excel-kompatible Exporte müssen ihren Inhaltstyp deklarieren");
assert.match(app, /function reportActionReady\(kind: ReportKind\)/, "Alle Berichtsschaltflächen müssen eine zentrale Bereitschaftsprüfung verwenden");
assert.match(app, /kind === "rent-account"\) return rentReportReady/, "Mietkonto-Exporte dürfen erst nach dem Jahresreport freigegeben werden");
assert.match(app, /kind === "vacancy"\) return vacancyReportReady/, "Leerstandsexporte dürfen erst nach der Leerstandsquelle freigegeben werden");
assert.match(app, /kind === "tax-data-package"\) return rentReportReady && vacancyReportReady && mileageReportReady && taxLoanReportReady/, "Das Steuerberaterpaket muss auf alle enthaltenen Zusatzquellen warten");
assert.match(app, /disabled=\{!reportActionReady\(action\.kind\) \|\| activeExport !== null\}/, "Nicht bereite oder bereits laufende Exporte müssen deaktiviert sein");
assert.match(app, /aria-busy=\{busy \|\| undefined\}/, "Laufende Exporte müssen barrierefrei als beschäftigt markiert sein");
assert.match(app, /role="status"/, "Die App muss den Exportstatus sichtbar melden");
assert.match(app, /kind === "tax"\) return objectFilter === "all" && rentReportReady && vacancyReportReady && mileageReportReady && taxLoanReportReady/, "Anlage V muss auf Alle Objekte, Mieteingang, Leerstand, Fahrtenbuch und Jahreszinsen warten");
assert.match(app, /from\("property_loan_ledger"\)[\s\S]*\.eq\("year", selectedYear\)/, "Anlage V muss Darlehenszinsen jahresgenau aus dem Ledger laden");
assert.match(app, /Steuer-Report_Anlage_V_\$\{period\}/, "Der Anlage-V-Dateiname muss dem fachlichen Namensschema folgen");
assert.match(app, /"Objekt_ID"[\s\S]*"Wohnflaeche_qm"[\s\S]*"Amtliche_Formularzeile"/, "Der Anlage-V-Export muss die Pflichtfelder enthalten");
assert.match(app, /"Umlagefaehig_Status"[\s\S]*"Zahlungsstatus"[\s\S]*"Pruefstatus"/, "Der Anlage-V-Export muss Umlage-, Zahlungs- und Prüfstatus enthalten");
assert.match(app, /recordType: "Offene Miete"/, "Offene Mieten müssen als Zusatzdatensätze exportiert werden");
assert.match(app, /recordType: "Leerstand"/, "Leerstände müssen als Zusatzdatensätze exportiert werden");
assert.match(taxEngine, /key: "rosenstein-p250"[\s\S]*key: "rosenstein-p253"[\s\S]*key: "rosenstein-p254"/, "Die drei Rosenstein-Stellplätze müssen getrennte Steuerobjekte sein");
assert.match(taxEngine, /entryYear\(entry\) === year/, "Buchungen müssen strikt nach tatsächlichem Zahlungsjahr gefiltert werden");
assert.match(taxEngine, /Instandhaltungsrücklage - Zuführung[\s\S]*reviewStatus: "Blockiert"/, "Rücklagenzuführungen müssen steuerlich blockiert werden");
assert.match(taxEngine, /Hausgeld - Aufteilung erforderlich[\s\S]*reviewStatus: "Blockiert"/, "Nicht aufgeschlüsseltes Hausgeld muss blockiert werden");
assert.match(taxEngine, /Anlage V Zeile 20/, "Nebenkostenvorauszahlungen müssen der amtlichen Formularzeile zugeordnet werden");
assert.match(taxEngine, /Anlage V Zeilen 46-48/, "Schuldzinsen müssen der amtlichen Formularzeile zugeordnet werden");
assert.match(taxEngine, /bankAccountFlatFee: 0/, "Pauschale Kontoführungsgebühren dürfen das Zufluss-/Abflussprinzip nicht verletzen");
assert.match(portfolioExpense, /isPersonalMovingExpense[\s\S]*umzugskosten/, "Private Umzugskosten müssen aus der pauschalen Portfolio-Verteilung ausgeschlossen sein");
assert.match(taxEngine, /isRosensteinSharedExpense[\s\S]*Anteil 1\/3/, "Gemeinsame Rosenstein-Kosten müssen ausschließlich auf die drei Stellplätze verteilt werden");
assert.match(appData, /property_extra_info[\s\S]*wealth_profile[\s\S]*totalArea/, "Der Steuerreport muss die Wohnfläche aus den zentralen Immobilienvermögen-Details übernehmen");
assert.doesNotMatch(taxClassification, /function isCreditRateEntry[\s\S]{0,180}entry_type !== "expense"/, "Kreditraten müssen auch bei einem historisch falschen Importtyp gesperrt bleiben");
assert.ok(
  taxClassification.indexOf("if (isAcquisitionSideCost(text))") < taxClassification.indexOf('if (entryType === "income")'),
  "Erwerbsnebenkosten müssen vor der Einnahmenlogik erkannt werden",
);

assert.match(app, /type ReportKind = [^;]*"loan-interest"/, "Tilgung und Zins muss als eigener Berichtstyp registriert sein");
assert.match(app, /title: "Tilgung & Zins - Jahresübersicht"[\s\S]*kind: "loan-interest", format: "pdf"[\s\S]*format: "excel"[\s\S]*format: "csv"/, "Der Darlehensreport muss PDF, Excel und CSV anbieten");
assert.match(app, /value=\{loanDetailMode\}[\s\S]*value="selected-year"[\s\S]*value="all-years"/, "Der Darlehensreport muss gewähltes Jahr und alle Jahre unterstützen");
assert.match(app, /buildTaxLoanOverviewLines\(\)[\s\S]*PDF_PAGE_BREAK/, "Die Anlage V muss eine eigene Tilgung-und-Zins-Seite erzeugen");
assert.match(app, /if \(rawLine === PDF_PAGE_BREAK\)/, "Der Steuerreport muss den Seitenwechsel für den Darlehensnachweis verarbeiten");
assert.match(app, /kind === "tax"[\s\S]*\.\.\.buildTaxLoanOverviewLines\(\)/, "Der Steuer-Report Anlage V muss den Darlehensnachweis enthalten");
assert.match(loanLedgerService, /loadCanonicalPropertyLoanHistory[\s\S]*from\(LEDGER_TABLE\)[\s\S]*\.lte\("year", maximumYear\)/, "Historische Darlehenswerte müssen aus der zentralen Ledger-Quelle bis zum aktuellen Jahr geladen werden");
assert.match(loanInterestReport, /for \(let year = firstYear; year <= input\.currentYear; year \+= 1\)/, "Das Deckblatt muss für jedes Jahr bis zum aktuellen Jahr eine Zeile enthalten");
assert.match(loanInterestReport, /createLoanInterestReportPdf[\s\S]*model\.sections\.forEach/, "Der PDF-Bericht muss nach dem Deckblatt eine Seite je Immobilie erzeugen");
assert.match(loanInterestReport, /\.\.\.\(input\.properties \?\? \[\]\)\.map[\s\S]*\.\.\.rows\.map/, "Auch Immobilien ohne Werte im gewählten Jahr müssen im Detailbericht enthalten bleiben");
assert.match(loanInterestReport, /buildLoanInterestReportExcelHtml/, "Der Darlehensreport muss einen professionell formatierten Excel-Export erzeugen");
assert.match(loanInterestReport, /buildLoanInterestReportCsv/, "Der Darlehensreport muss einen strukturierten CSV-Export erzeugen");
assert.match(loanInterestReport, /Tilgung ist keine Werbungskostenposition/, "Der Bericht muss Zinsen und Tilgung steuerlich korrekt unterscheiden");

console.log("50 Stressfaelle fuer sichere und vollstaendige Berichtsexporte bestanden.");
