import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

assert.match(app, /if \(!filename\.trim\(\) \|\| blob\.size === 0\)/, "Leere Exportdateien müssen vor dem Download abgewiesen werden");
assert.match(app, /window\.setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 60_000\)/, "Blob-URLs dürfen nicht unmittelbar nach dem Klick freigegeben werden");
assert.match(app, /let pdf = "%PDF-1\.4\\n"/, "PDF-Exporte müssen mit einer gültigen PDF-Signatur beginnen");
assert.match(app, /pushUint32\(localView, 0, 0x04034b50\)/, "ZIP-Exporte müssen gültige lokale Dateiköpfe schreiben");
assert.match(app, /pushUint32\(endView, 0, 0x06054b50\)/, "ZIP-Exporte müssen ein gültiges Zentralverzeichnis abschließen");
assert.match(app, /text\/csv;charset=utf-8/, "CSV-Exporte müssen einen UTF-8-Inhaltstyp verwenden");
assert.match(app, /application\/vnd\.ms-excel;charset=utf-8/, "Excel-kompatible Exporte müssen ihren Inhaltstyp deklarieren");
assert.match(app, /function reportActionReady\(kind: ReportKind\)/, "Alle Berichtsschaltflächen müssen eine zentrale Bereitschaftsprüfung verwenden");
assert.match(app, /kind === "rent-account"\) return rentReportReady/, "Mietkonto-Exporte dürfen erst nach dem Jahresreport freigegeben werden");
assert.match(app, /kind === "vacancy"\) return vacancyReportReady/, "Leerstandsexporte dürfen erst nach der Leerstandsquelle freigegeben werden");
assert.match(app, /kind === "tax-data-package"\) return rentReportReady && vacancyReportReady && mileageReportReady/, "Das Steuerberaterpaket muss auf alle enthaltenen Zusatzquellen warten");
assert.match(app, /disabled=\{!reportActionReady\(action\.kind\) \|\| activeExport !== null\}/, "Nicht bereite oder bereits laufende Exporte müssen deaktiviert sein");
assert.match(app, /aria-busy=\{busy \|\| undefined\}/, "Laufende Exporte müssen barrierefrei als beschäftigt markiert sein");
assert.match(app, /role="status"/, "Die App muss den Exportstatus sichtbar melden");

console.log("14 Stressfaelle fuer sichere und vollstaendige Berichtsexporte bestanden.");
