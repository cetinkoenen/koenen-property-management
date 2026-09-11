import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

import {
  buildTaxAdvisorDashboard,
  isAnlageVEligible,
  isRosensteinSharedExpense,
  isSection35aProfile,
  resolveEntryTaxProfile,
  type TaxReportEntry,
  type TaxReportLoanRow,
  type TaxReportObjectOption,
} from "../src/services/taxReportEngine";
import { canonicalCategoryForTax } from "../src/lib/taxClassification";
import { isAllocatablePortfolioExpenseEntry, isPortfolioGeneralEntry } from "../src/lib/portfolioExpense";
import type { MileageTripRow } from "../src/services/mileageTripService";

const PROJECT_REF = "ufqfrotpefxtwczuqrxf";
const YEARS = [2024, 2025, 2026] as const;

type ObjectRow = {
  value: string | null;
  object_id: string | null;
  property_id: string | null;
  objekt_code: string | null;
  label: string | null;
};

type ExtraRow = {
  property_id: string | null;
  living_area: number | string | null;
  wealth_profile: Record<string, unknown> | null;
};

type PlanRow = {
  property_id: string | null;
  property_key: string | null;
  property_name: string | null;
  plan_year: number;
  plan_month: number;
  interest_amount: number | string | null;
  principal_amount: number | string | null;
  closing_balance: number | string | null;
  source_file: string | null;
};

type AuditQuery<T> = PromiseLike<{
  data: T[] | null;
  error: { message: string } | null;
}> & {
  range(from: number, to: number): AuditQuery<T>;
  eq(column: string, value: unknown): AuditQuery<T>;
  gte(column: string, value: unknown): AuditQuery<T>;
  lte(column: string, value: unknown): AuditQuery<T>;
  order(column: string): AuditQuery<T>;
};

function normalize(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ß", "ss")
    .replace(/straße|strasse/g, "str")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) / 100 : 0;
}

function closeMoney(left: number, right: number): boolean {
  return Math.abs(money(left) - money(right)) <= 0.01;
}

function serviceRoleKey(): string {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  const output = execFileSync(
    "supabase",
    ["projects", "api-keys", "--project-ref", PROJECT_REF, "-o", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  const keys = JSON.parse(output) as Array<Record<string, string>>;
  const row = keys.find((item) => item.name === "service_role" || item.type === "secret");
  const key = row?.api_key ?? row?.key ?? row?.value;
  if (!key) throw new Error("Service-Role-Schlüssel konnte nicht gelesen werden.");
  return key;
}

async function fetchAll<T>(table: string, select: string, configure?: (query: AuditQuery<T>) => AuditQuery<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    let query = (supabase.from(table).select(select) as unknown as AuditQuery<T>).range(from, from + 999);
    if (configure) query = configure(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return rows;
  }
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
if (!supabaseUrl) throw new Error("VITE_SUPABASE_URL fehlt. Audit mit --env-file=.env.local starten.");
const supabase = createClient(supabaseUrl, serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } });

const [objectRows, extraRows, entries, planRows, mileageResult] = await Promise.all([
  fetchAll<ObjectRow>("v_object_dropdown", "value,object_id,property_id,objekt_code,label"),
  fetchAll<ExtraRow>("property_extra_info", "property_id,living_area,wealth_profile"),
  fetchAll<TaxReportEntry>(
    "finance_entry",
    "id,object_id,objekt_code,entry_type,booking_date,amount,category,note,tax_relevant,nk_relevant,loan_interest_amount,loan_principal_amount,loan_rate_plan_id,loan_split_source,is_deleted",
    (query) => query.eq("is_deleted", false).gte("booking_date", "2024-01-01").lte("booking_date", "2026-12-31").order("booking_date"),
  ),
  fetchAll<PlanRow>(
    "property_loan_rate_plan",
    "property_id,property_key,property_name,plan_year,plan_month,interest_amount,principal_amount,closing_balance,source_file",
    (query) => query.gte("plan_year", 2024).lte("plan_year", 2026).order("plan_year").order("plan_month"),
  ),
  supabase.from("property_mileage_trips").select("*").gte("steuerjahr", 2024).lte("steuerjahr", 2026),
]);

if (mileageResult.error) throw new Error(`property_mileage_trips: ${mileageResult.error.message}`);
const mileageTrips = (mileageResult.data ?? []) as MileageTripRow[];

function positiveArea(row: ExtraRow): number | null {
  const profile = row.wealth_profile ?? {};
  const candidates = [row.living_area, profile.totalArea, profile.livingArea, profile.living_area];
  for (const candidate of candidates) {
    const value = Number(candidate ?? 0);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function extraIdentity(row: ExtraRow): string {
  const profile = row.wealth_profile ?? {};
  return normalize([
    row.property_id,
    profile.name,
    profile.address,
    profile.street,
    profile.houseNumber,
  ].join(" "));
}

const objects: TaxReportObjectOption[] = objectRows
  .filter((row) => row.value || row.object_id || row.objekt_code)
  .map((row) => {
    const aliases = [row.value, row.object_id, row.property_id, row.objekt_code, row.label].filter(Boolean) as string[];
    const identities = aliases.map(normalize).filter(Boolean);
    const matchingExtras = extraRows.filter((candidate) => {
      const identity = extraIdentity(candidate);
      return identities.some((item) => item === identity || identity.includes(item) || item.includes(identity));
    });
    const extraArea = matchingExtras.map(positiveArea).find((area): area is number => area != null);
    return {
      id: row.object_id ?? row.value,
      code: row.objekt_code,
      label: row.label ?? row.objekt_code ?? row.value ?? "Unbekannt",
      aliases,
      livingAreaM2: extraArea ?? null,
    };
  });

function objectForEntry(entry: TaxReportEntry): TaxReportObjectOption | undefined {
  const ids = [entry.object_id, entry.objekt_code].map(normalize).filter(Boolean);
  return objects.find((object) => [object.id, object.code, ...(object.aliases ?? [])].map(normalize).some((id) => id && ids.includes(id)));
}

function planIdentity(row: PlanRow): string {
  return normalize(`${row.property_name ?? ""} ${row.property_key ?? ""} ${row.property_id ?? ""}`);
}

function planMatchesObject(row: PlanRow, object: TaxReportObjectOption): boolean {
  const plan = planIdentity(row);
  const identities = [object.label, object.id, object.code, ...(object.aliases ?? [])].map(normalize).filter(Boolean);
  return identities.some((identity) => plan.includes(identity) || identity.includes(plan));
}

function loanRowsForYear(year: number, yearEntries: TaxReportEntry[]): TaxReportLoanRow[] {
  return objects.map((object) => {
    const creditRows = yearEntries.filter((entry) => {
      const mapped = objectForEntry(entry);
      return mapped?.id === object.id && canonicalCategoryForTax(entry, object.label) === "Kreditrate";
    });
    if (creditRows.length && creditRows.every((entry) => entry.loan_interest_amount != null && entry.loan_principal_amount != null)) {
      return {
        property_id: object.id,
        property_label: object.label,
        year,
        interest: money(creditRows.reduce((sum, entry) => sum + Number(entry.loan_interest_amount ?? 0), 0)),
        principal: money(creditRows.reduce((sum, entry) => sum + Number(entry.loan_principal_amount ?? 0), 0)),
        source: `Gebuchte Monatsraten (${creditRows.length})`,
      };
    }
    const plans = planRows.filter((row) => row.plan_year === year && planMatchesObject(row, object));
    return {
      property_id: object.id,
      property_label: object.label,
      year,
      interest: money(plans.reduce((sum, row) => sum + Number(row.interest_amount ?? 0), 0)),
      principal: money(plans.reduce((sum, row) => sum + Number(row.principal_amount ?? 0), 0)),
      source: plans.length ? `Tilgungsplan (${plans.length} Monatswerte)` : "Kein Darlehens-Jahreswert erfasst",
    };
  });
}

type Finding = { year: number; severity: "error" | "warning"; code: string; detail: string; entryId?: string | number | null };
const findings: Finding[] = [];
const add = (year: number, severity: Finding["severity"], code: string, detail: string, entryId?: string | number | null) => findings.push({ year, severity, code, detail, entryId });
const yearSummaries: Array<Record<string, unknown>> = [];
let accountedTotal = 0;

for (const year of YEARS) {
  const yearEntries = entries.filter((entry) => Number(String(entry.booking_date ?? "").slice(0, 4)) === year);
  const yearTrips = mileageTrips.filter((trip) => Number(trip.steuerjahr) === year);
  const loans = loanRowsForYear(year, yearEntries);
  const dashboard = buildTaxAdvisorDashboard({ year, entries: yearEntries, loans, mileageTrips: yearTrips, objects });
  const reportEntryOccurrences = new Map<string, number>();
  const portfolioOccurrences = new Map<string, number>();
  const sectionOccurrences = new Map<string, number>();

  for (const report of dashboard.AnlageVReports) {
    if (report.profile.usage === "rented_residential" && report.livingAreaM2 == null) {
      add(year, "error", "missing_living_area", `${report.profile.reportLabel}: Wohnfläche fehlt.`);
    }
    const directRows = report.bookingRows.slice(0, report.entries.length);
    if (directRows.length !== report.entries.length) add(year, "error", "row_count", `${report.profile.reportLabel}: Buchungszeilen unvollständig.`);
    report.entries.forEach((entry, index) => {
      const key = String(entry.id ?? "");
      if (key) reportEntryOccurrences.set(key, (reportEntryOccurrences.get(key) ?? 0) + 1);
      const row = directRows[index];
      if (!row) return;
      if (row.reviewStatus === "Prüfung erforderlich" || row.categoryName === "Nicht zugeordnet - Prüfung erforderlich") {
        add(year, "error", "unclassified_export_row", `${report.profile.reportLabel}: ${row.bookingDate} ${row.bookingText}`, entry.id);
      }
      if (row.bookingDate && !row.bookingDate.startsWith(`${year}-`)) {
        add(year, "error", "wrong_year", `${report.profile.reportLabel}: Buchung ${row.bookingDate} im Export ${year}.`, entry.id);
      }
      if (!Number.isFinite(row.incomeAmount) || !Number.isFinite(row.expenseAmount)) {
        add(year, "error", "invalid_amount", `${report.profile.reportLabel}: ungültiger Exportbetrag.`, entry.id);
      }
    });
    for (const entry of report.portfolioAdministrationRows) {
      const key = String(entry.id ?? "");
      if (key) portfolioOccurrences.set(key, (portfolioOccurrences.get(key) ?? 0) + 1);
    }
    const expectedIncome = money(report.bookingRows.reduce((sum, row) => sum + row.incomeAmount, 0));
    if (!closeMoney(report.income, expectedIncome)) add(year, "error", "income_sum", `${report.profile.reportLabel}: ${report.income} != ${expectedIncome}`);
    const expectedNet = money(report.income - report.buildingAfa - report.inventoryAfa - report.loanInterest - report.moneyProcurementCosts - report.maintenance - report.runningCosts - report.administrationCosts);
    if (!closeMoney(report.net, expectedNet)) add(year, "error", "net_sum", `${report.profile.reportLabel}: ${report.net} != ${expectedNet}`);
  }

  for (const entry of dashboard.section35aReport.entries) {
    const key = String(entry.id ?? "");
    if (key) sectionOccurrences.set(key, (sectionOccurrences.get(key) ?? 0) + 1);
  }

  let accounted = 0;
  let excluded = 0;
  for (const entry of yearEntries) {
    const key = String(entry.id ?? "");
    const profile = resolveEntryTaxProfile(entry, objects);
    const reportCount = reportEntryOccurrences.get(key) ?? 0;
    const portfolioCount = portfolioOccurrences.get(key) ?? 0;
    const sectionCount = sectionOccurrences.get(key) ?? 0;
    const shared = isRosensteinSharedExpense(entry, objects);
    const portfolio = entry.entry_type === "expense" && isAllocatablePortfolioExpenseEntry(entry);

    if (isAnlageVEligible(profile)) {
      if (reportCount !== 1) add(year, "error", "anlage_v_occurrence", `Buchung muss genau einmal einem Anlage-V-Objekt zugeordnet sein; gefunden ${reportCount}.`, entry.id);
      else accounted += 1;
    } else if (isSection35aProfile(profile)) {
      if (sectionCount !== 1 || reportCount !== 0) add(year, "error", "section35a_occurrence", `§35a-Zuordnung ${sectionCount}, Anlage-V-Zuordnung ${reportCount}.`, entry.id);
      else accounted += 1;
    } else if (shared) {
      if (reportCount !== 3) add(year, "error", "rosenstein_split", `Gemeinsame Rosenstein-Ausgabe wurde ${reportCount} statt 3 Mal aufgeteilt.`, entry.id);
      else accounted += 1;
    } else if (portfolio || (isPortfolioGeneralEntry(entry) && entry.entry_type === "expense")) {
      if (portfolio && portfolioCount !== dashboard.AnlageVReports.length) add(year, "error", "portfolio_split", `Portfolio-Ausgabe wurde ${portfolioCount} statt ${dashboard.AnlageVReports.length} Mal verteilt.`, entry.id);
      else if (!portfolio && entry.tax_relevant === true) add(year, "error", "portfolio_unclassified", "Steuerrelevante Portfolio-Ausgabe ist nicht freigegeben.", entry.id);
      else accounted += 1;
    } else if (entry.tax_relevant === true) {
      add(year, "error", "unaccounted_tax_entry", `Steuerrelevante Buchung ohne Exportziel: ${entry.booking_date} ${entry.category ?? ""} ${entry.note ?? ""}`, entry.id);
    } else {
      excluded += 1;
      accounted += 1;
    }
  }

  accountedTotal += accounted;
  const actionableWarnings = dashboard.warnings.filter((warning) => !warning.includes("Hohenloher Str. 78 ist als Selbstgenutzt / WEG fuer Anlage V gesperrt"));
  for (const warning of actionableWarnings) add(year, "warning", "dashboard_warning", warning);
  yearSummaries.push({
    year,
    sourceEntries: yearEntries.length,
    accounted,
    explicitlyExcluded: excluded,
    AnlageVReports: dashboard.AnlageVReports.length,
    AnlageVBookingRows: dashboard.AnlageVReports.reduce((sum, report) => sum + report.bookingRows.length, 0),
    section35aEntries: dashboard.section35aReport.entries.length,
    warnings: actionableWarnings.length,
  });
}

if (accountedTotal !== entries.length) {
  add(2026, "error", "global_coverage", `${accountedTotal} von ${entries.length} Buchungen bilanziert.`);
}

console.log(`STEUERREPORT-LIVE-AUDIT 2024-2026 · ${entries.length} aktive Buchungen`);
console.table(yearSummaries);
console.table([
  { severity: "error", count: findings.filter((item) => item.severity === "error").length },
  { severity: "warning", count: findings.filter((item) => item.severity === "warning").length },
]);
if (findings.length) console.table(findings);
console.log(JSON.stringify({ entries: entries.length, accounted: accountedTotal, years: yearSummaries, findings }, null, 2));

if (findings.some((item) => item.severity === "error")) process.exitCode = 1;
