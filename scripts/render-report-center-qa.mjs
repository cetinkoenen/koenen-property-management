import { build } from "esbuild";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const bundleDir = await mkdtemp(join(tmpdir(), "tax-advisor-qa-"));
await build({
  entryPoints: ["src/services/reportCenterEngine.ts", "src/services/reportCenterPdf.ts", "src/lib/professionalPdfReport.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outdir: bundleDir,
  loader: { ".webp": "dataurl" },
});

const { buildReportCenter, taxAdvisorReportIds } = await import(pathToFileURL(join(bundleDir, "services/reportCenterEngine.js")));
const { prepareTaxAdvisorPdf } = await import(pathToFileURL(join(bundleDir, "services/reportCenterPdf.js")));
const { buildProfessionalPdfReportHtml } = await import(pathToFileURL(join(bundleDir, "lib/professionalPdfReport.js")));

const objects = [{ id: "colmarer", code: "Objekt_3", label: "Colmarer Str. 45", livingAreaM2: 36 }];
const entries = [
  { id: "rent-old", object_id: "colmarer", booking_date: "2025-01-03", entry_type: "income", category: "Miete", amount: 595, note: "Cansu Kurt" },
  { id: "rent-new", object_id: "colmarer", booking_date: "2025-08-03", entry_type: "income", category: "Miete", amount: 670, note: "Nicholas Kraeft-Wendte" },
  { id: "rate-1", object_id: "colmarer", booking_date: "2025-01-15", entry_type: "expense", category: "Kreditrate", amount: 410.67, note: "Darlehensrate", loan_interest_amount: 160.67, loan_principal_amount: 250 },
  { id: "deposit-in", object_id: "colmarer", booking_date: "2025-07-31", entry_type: "income", category: "Kaution", amount: 1650, note: "Mietsicherheit Nicholas Kraeft-Wendte" },
  { id: "deposit-out", object_id: "colmarer", booking_date: "2025-08-04", entry_type: "expense", category: "Kaution", amount: 940, note: "Rückgabe Kaution Guthaben" },
];
const months = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, expected: index < 7 ? 595 : 670, paid: index < 7 ? 595 : 670, open: 0, status: "paid" }));
const rent = { year: 2025, objectFilter: "", rows: [{ key: "wohnung", objectId: "colmarer", objectLabel: "Colmarer Str. 45", unitLabel: "Wohnung 02", tenantName: "Nicholas Kraeft-Wendte", months }], totals: {}, propertyTotals: [], kpis: {} };
const sources = {
  tenant_profiles: [{ id: "nicholas", first_name: "Nicholas", last_name: "Kraeft-Wendte" }],
  tenant_contracts: [{ id: "contract", tenant_id: "nicholas", property_id: "colmarer", unit_label: "Wohnung 02", start_date: "2025-08-01", status: "active", cold_rent: 550, operating_costs: 120, total_rent: 670, deposit_amount: 1650 }],
  property_extra: [{ property_id: "colmarer", wealth_profile: { totalArea: 36, street: "Colmarer Str. 45", postalCode: "28211", city: "Bremen", equipmentYear: 1997 } }],
  property_loan_ledger: [{ property_id: "colmarer", year: 2025, interest: 1928.04, principal: 3000, balance: 105616, source: "Darlehens-Ledger" }],
  property_loan_rate_plan: [{ property_id: "colmarer", plan_date: "2025-01-31", payment_amount: 410.67, interest_amount: 160.67, principal_amount: 250, closing_balance: 105616, source_file: "Tilgungsplan Colmarer.xlsx" }],
  rent_adjustments: [{ property_id: "colmarer", tenant_name: "Cansu Kurt", effective_date: "2025-01-01", effective_end_date: "2025-07-30", new_cold_rent: 485, new_operating_costs: 110, new_total_rent: 595 }],
  portfolio_units: [{ id: "unit", property_id: "colmarer", name: "Wohnung 02", area_sqm: 36, is_active: true }],
  billing_workspaces: [{ object_id: "colmarer", year: "2025", data: { billings: [
    { id: "anlage-1", workspace: { meta: { billingYear: 2025, propertyCode: "colmarer", propertyLabel: "Colmarer Str. 45", periodFrom: "2025-01-01", periodTo: "2025-07-30" }, apartments: [{ label: "Wohnung 02", tenantName: "Cansu Kurt", area: 36, occupancyMonths: 7, advancePayments: 770, active: true }], costs: [{ label: "Betriebskosten", amount: 700, allocation: "directAmount", directAmount: 700 }] } },
    { id: "anlage-2", workspace: { meta: { billingYear: 2025, propertyCode: "colmarer", propertyLabel: "Colmarer Str. 45", periodFrom: "2025-08-01", periodTo: "2025-12-31" }, apartments: [{ label: "Wohnung 02", tenantName: "Nicholas Kraeft-Wendte", area: 36, occupancyMonths: 5, advancePayments: 600, active: true }], costs: [{ label: "Betriebskosten", amount: 650, allocation: "directAmount", directAmount: 650 }] } },
  ] } }],
};
const modules = buildReportCenter({ objects, entries, loans: [], sources, rent, from: "2025-01-01", to: "2025-12-31", objectId: "", today: "2026-09-15" });
const moduleById = new Map(modules.map((module) => [module.id, module]));
const sections = taxAdvisorReportIds.flatMap((id) => moduleById.get(id) ?? []);
const prepared = prepareTaxAdvisorPdf(sections);
const html = buildProfessionalPdfReportHtml({
  documentName: "Steuerberater-Report-QA-2025",
  title: "Steuerberater-Report 2025",
  subtitle: "Visuelle Regression",
  meta: [{ label: "Zeitraum", value: "01.01.2025 bis 31.12.2025" }],
  metrics: prepared.metrics,
  sections: prepared.sections,
  landscape: false,
});

const outputDir = resolve("tmp/pdfs/report-center-qa");
await mkdir(outputDir, { recursive: true });
await writeFile(join(outputDir, "steuerberater-report-qa.html"), html);
console.log(join(outputDir, "steuerberater-report-qa.html"));
