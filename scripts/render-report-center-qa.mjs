import { build } from "esbuild";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const bundleDir = await mkdtemp(join(tmpdir(), "tax-advisor-qa-"));
await build({
  entryPoints: ["src/services/reportCenterEngine.ts", "src/lib/professionalPdfReport.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outdir: bundleDir,
  loader: { ".webp": "dataurl" },
});

const { buildReportCenter, taxAdvisorReportIds } = await import(pathToFileURL(join(bundleDir, "services/reportCenterEngine.js")));
const { buildProfessionalPdfReportHtml } = await import(pathToFileURL(join(bundleDir, "lib/professionalPdfReport.js")));

const objects = [{ id: "fuerther", code: "Objekt_4", label: "Fürther Str. 74", livingAreaM2: 82 }];
const entries = [
  { id: "rent-1", object_id: "fuerther", booking_date: "2025-01-03", entry_type: "income", category: "Miete", amount: 650, note: "Wolfgang Stange" },
  { id: "rate-1", object_id: "fuerther", booking_date: "2025-01-15", entry_type: "expense", category: "Kreditrate", amount: 438.53, note: "Darlehensrate" },
  { id: "deposit-1", object_id: "fuerther", booking_date: "2025-02-01", entry_type: "income", category: "Kaution", amount: 1300, note: "Mietsicherheit" },
];
const months = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, expected: 725, paid: index < 9 ? 725 : 0, open: 0, status: index < 9 ? "paid" : "none" }));
const rent = { year: 2025, objectFilter: "", rows: [{ key: "wohnung", objectId: "fuerther", objectLabel: "Fürther Str. 74", unitLabel: "Wohnung", tenantName: "Wolfgang Stange", months }], totals: {}, propertyTotals: [], kpis: {} };
const sources = {
  tenant_profiles: [{ id: "wolfgang", first_name: "Wolfgang", last_name: "Stange" }],
  tenant_contracts: [{ id: "contract", tenant_id: "wolfgang", property_id: "fuerther", unit_label: "Wohnung", start_date: "2024-01-01", status: "active", cold_rent: 650, operating_costs: 75, total_rent: 725 }],
  property_extra: [{ property_id: "fuerther", wealth_profile: { totalArea: 82, street: "Fürther Str. 74", postalCode: "90429", city: "Nürnberg", equipmentYear: 1997 } }],
  property_loan_ledger: [{ property_id: "fuerther", year: 2025, interest: 1662.36, principal: 3600, balance: 91000, source: "Darlehens-Ledger" }],
  property_loan_rate_plan: [{ property_id: "fuerther", plan_date: "2025-01-31", payment_amount: 438.53, interest_amount: 138.53, principal_amount: 300, closing_balance: 91000, source_file: "Tilgungsplan Fürther.xlsx" }],
  rent_adjustments: [],
  portfolio_units: [{ id: "unit", property_id: "fuerther", name: "Wohnung", area_sqm: 82, is_active: true }],
  billing_workspaces: [],
};
const modules = buildReportCenter({ objects, entries, loans: [], sources, rent, from: "2025-01-01", to: "2025-12-31", objectId: "", today: "2026-09-15" });
const moduleById = new Map(modules.map((module) => [module.id, module]));
const sections = taxAdvisorReportIds.flatMap((id) => moduleById.get(id) ?? []);
const html = buildProfessionalPdfReportHtml({
  documentName: "Steuerberater-Report-QA-2025",
  title: "Steuerberater-Report 2025",
  subtitle: "Visuelle Regression",
  meta: [{ label: "Zeitraum", value: "01.01.2025 bis 31.12.2025" }],
  sections,
  landscape: true,
});

const outputDir = resolve("tmp/pdfs/report-center-qa");
await mkdir(outputDir, { recursive: true });
await writeFile(join(outputDir, "steuerberater-report-qa.html"), html);
console.log(join(outputDir, "steuerberater-report-qa.html"));
