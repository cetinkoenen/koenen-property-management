import { parseLocaleNumber, parseNullableLocaleNumber } from "@/utils/numberParser";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { APP_DATA_CACHE_KEY } from "../lib/appCache";
import { isPureRentBackPayment } from "../lib/financeCategories";

export type AppObject = {
  id: string;
  code: string | null;
  label: string;
  livingAreaM2?: number | null;
  /** Phase 5F: alle bekannten technischen IDs/Codes/Namen, die zu derselben Immobilie gehören. */
  aliases?: string[];
};

export type FinanceEntry = {
  id?: string | number | null;
  object_id: string | null;
  objekt_code?: string | null;
  entry_type: "income" | "expense" | string | null;
  booking_date: string | null;
  amount: number;
  category: string | null;
  note: string | null;
  tax_relevant?: boolean | null;
  nk_relevant?: boolean | null;
};


export type MonthlyRentSummaryRow = {
  object_id: string;
  objekt_code: string | null;
  user_id: string | null;
  jahr: number;
  monat: number;
  mieteingang_summe: number;
};

export type YearlyFinanceSummaryRow = {
  object_id: string;
  objekt_code: string | null;
  user_id: string | null;
  jahr: number;
  einnahmen: number;
  ausgaben: number;
  mieteingaenge: number;
};

export type PortfolioLoanRow = {
  property_id: string;
  portfolio_property_id: string | null;
  property_name: string;
  last_balance: number;
  principal_total: number;
  interest_total: number;
  repaid_percent: number;
  repayment_status: string | null;
  repayment_label: string | null;
};

export type LoanDashboardRow = {
  property_id: string;
  property_name: string;
  first_year: number | null;
  last_year: number | null;
  last_balance_year: number | null;
  last_balance: number | null;
  interest_total: number | null;
  principal_total: number | null;
  repaid_percent: number | null;
  repaid_percent_display: string | null;
  repayment_status: string | null;
  repayment_label: string | null;
  refreshed_at: string | null;
};

export type LoanChartPoint = {
  year: number;
  balance: number;
};

export type AppDataContextValue = {
  loading: boolean;
  error: string | null;
  objects: AppObject[];
  entries: FinanceEntry[];
  monthlyRentSummaries: MonthlyRentSummaryRow[];
  yearlyFinanceSummaries: YearlyFinanceSummaryRow[];
  portfolioRows: PortfolioLoanRow[];
  loanRows: LoanDashboardRow[];
  loanChartByPropertyId: Record<string, LoanChartPoint[]>;
  refresh: () => Promise<void>;
  getPropertyName: (propertyId: string | null | undefined) => string;
  getEntriesForProperty: (propertyId: string | null | undefined) => FinanceEntry[];
  getRentEntriesForProperty: (propertyId: string | null | undefined, start?: string, end?: string) => FinanceEntry[];
  getExpenseEntriesForProperty: (propertyId: string | null | undefined, year?: number) => FinanceEntry[];
  getIncomeEntriesForProperty: (propertyId: string | null | undefined, year?: number) => FinanceEntry[];
  getNetCashflow: (propertyId: string | null | undefined, year?: number) => number;
  getNebenkostenExpenses: (propertyId: string | null | undefined, year?: number) => FinanceEntry[];
  getMonthlyRentSummary: (propertyId: string | null | undefined, year: number, month: number) => number | null;
  getMonthlyRentSummaryByObjectCode: (objectCode: string | null | undefined, year: number, month: number) => number | null;
  getYearlyFinanceSummary: (propertyId: string | null | undefined, year: number) => YearlyFinanceSummaryRow | null;
  getYearlyFinanceSummaryByObjectCode: (objectCode: string | null | undefined, year: number) => YearlyFinanceSummaryRow | null;
};

type CachedAppData = {
  objects?: AppObject[];
  entries?: FinanceEntry[];
  monthlyRentSummaries?: MonthlyRentSummaryRow[];
  yearlyFinanceSummaries?: YearlyFinanceSummaryRow[];
  portfolioRows?: PortfolioLoanRow[];
  loanRows?: LoanDashboardRow[];
  loanChartByPropertyId?: Record<string, LoanChartPoint[]>;
};

type ObjectDropdownRow = {
  value: unknown;
  objekt_code: string | null;
  label: string | null;
  object_id: string | null;
  property_id: string | null;
};

type FinanceEntryRow = {
  id: string | number | null;
  object_id: string | null;
  objekt_code: string | null;
  entry_type: string | null;
  booking_date: string | null;
  amount: unknown;
  category: string | null;
  note: string | null;
  tax_relevant: boolean | null;
  nk_relevant: boolean | null;
};

type PropertyMasterAreaRow = {
  id: string | null;
  property_id: string | null;
  name: string | null;
  title: string | null;
  address: string | null;
  living_area_m2: unknown;
};

type PropertyExtraAreaRow = {
  property_id: string | null;
  living_area: unknown;
  wealth_profile: Record<string, unknown> | null;
};

type PortfolioLoanSourceRow = {
  property_id: string | null;
  portfolio_property_id: string | null;
  property_name: string | null;
  last_balance: unknown;
  principal_total: unknown;
  interest_total: unknown;
  repaid_percent: unknown;
  repayment_status: string | null;
  repayment_label: string | null;
};

type LoanDashboardSourceRow = {
  property_id: string | null;
  property_name: string | null;
  first_year: unknown;
  last_year: unknown;
  last_balance_year: unknown;
  last_balance: unknown;
  interest_total: unknown;
  principal_total: unknown;
  repaid_percent: unknown;
  repaid_percent_display: string | null;
  repayment_status: string | null;
  repayment_label: string | null;
  refreshed_at: string | null;
};

type LoanLedgerSourceRow = {
  property_id: string | null;
  year: unknown;
  balance: unknown;
  interest?: unknown;
  principal?: unknown;
};

const AppDataContext = createContext<AppDataContextValue | null>(null);

function toNumber(value: unknown): number {
  return parseLocaleNumber(value, 0);
}

function getErrorMessage(err: unknown, fallback = "Daten konnten nicht geladen werden."): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    const candidate = err as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [candidate.message, candidate.details, candidate.hint, candidate.code]
      .map((part) => (typeof part === "string" ? part.trim() : ""))
      .filter(Boolean);
    if (parts.length) return parts.join(" ");
  }
  return fallback;
}

function parseMaybeNumber(value: unknown): number | null {
  return parseNullableLocaleNumber(value);
}




function cleanDisplayName(value: unknown, fallback = "Unbenanntes Objekt"): string {
  const raw = String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const knownNames = [
    "Lilienthaler Str. 54",
    "Colmarer Str. 45",
    "Elsasser Str. 52",
    "Fürther Str. 74",
    "Hohenloher Str. 78",
    "Rosenstein Str. 25",
    "Rosensteinstraße 25",
  ];
  const lowered = raw.toLowerCase();
  for (const candidate of knownNames) {
    if (lowered.startsWith(candidate.toLowerCase())) {
      return candidate === "Rosensteinstraße 25" ? "Rosenstein Str. 25" : candidate;
    }
  }
  const cleaned = raw
    .replace(/\s*\(?\s*core[\W_]*shadow\s*\)?/gi, "")
    .replace(/\s*\(?\s*shadow\s*\)?/gi, "")
    .replace(/\s+\d{5}(?:\s+[^\d,;|/]+)?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}

function isHiddenTechnicalPropertyName(value: unknown): boolean {
  const name = String(value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!name) return true;

  return [
    /\brls\b/,
    /\btest\b/,
    /\btrigger\b/,
    /\bdebug\b/,
    /\bdummy\b/,
    /\bsample\b/,
  ].some((pattern) => pattern.test(name));
}

function dateInRange(value: string | null, start?: string, end?: string) {
  if (!value) return false;
  if (start && value < start) return false;
  if (end && value > end) return false;
  return true;
}

function dateInYear(value: string | null, year?: number) {
  if (!year) return true;
  return Boolean(value?.startsWith(`${year}-`));
}

function isRentEntry(entry: FinanceEntry): boolean {
  if (entry.entry_type !== "income") return false;
  if (isPureRentBackPayment(entry.category, entry.note)) return false;
  const text = `${entry.category ?? ""} ${entry.note ?? ""}`.toLowerCase();
  return text.includes("miet") || text.includes("kaltmiete") || text.includes("warmmiete") || text.includes("pacht");
}

function isNebenkostenExpense(entry: FinanceEntry): boolean {
  if (entry.entry_type !== "expense") return false;
  if (entry.nk_relevant === true) return true;
  if (entry.nk_relevant === false) return false;
  const text = `${entry.category ?? ""} ${entry.note ?? ""}`.toLowerCase();
  return (
    text.includes("nebenkosten") ||
    text.includes("betriebskosten") ||
    text.includes("grundsteuer") ||
    text.includes("versicherung") ||
    text.includes("wasser") ||
    text.includes("heizung") ||
    text.includes("strom") ||
    text.includes("müll") ||
    text.includes("muell") ||
    text.includes("hausgeld") ||
    text.includes("wartung") ||
    text.includes("reinigung") ||
    text.includes("winterdienst") ||
    text.includes("garten")
  );
}

function normalizeMatchText(value: string | null | undefined): string {
  return cleanDisplayName(value, "")
    .toLowerCase()
    .replaceAll("ß", "ss")
    .replace(/[ä]/g, "a")
    .replace(/[ö]/g, "o")
    .replace(/[ü]/g, "u")
    .replace(/strasse/g, "str")
    .replace(/straße/g, "str")
    .replace(/([a-z])str\b/g, "$1 str")
    .replace(/\bobjekt\s*\d+\b/g, "")
    .replace(/\b\d{5}\b/g, "")
    .replace(/\b(bremen|stuttgart|deutschland|germany)\b/g, "")
    .replace(/\b(core\s*shadow|shadow|hauptmiete|wohnung|garage|darlehen|immobilie)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeMatchText(a);
  const right = normalizeMatchText(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function uniqueClean(values: unknown[]): string[] {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

function dedupeObjectsByCanonicalName(rows: AppObject[]): AppObject[] {
  const byKey = new Map<string, AppObject>();

  for (const row of rows) {
    if (!row.id || isHiddenTechnicalPropertyName(row.label)) continue;
    const label = cleanDisplayName(row.label, "Unbenanntes Objekt");
    const key = normalizeMatchText(label || row.code || row.id);
    if (!key) continue;

    const aliases = uniqueClean([row.id, row.code, row.label, label, ...(row.aliases ?? [])]);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, { ...row, label, aliases });
      continue;
    }

    const existingLabelLooksGeneric = /^objekt\s*\d+/i.test(existing.label);
    const rowLabelLooksSpecific = !/^objekt\s*\d+/i.test(label);
    const preferred = existingLabelLooksGeneric && rowLabelLooksSpecific ? { ...row, label } : existing;

    byKey.set(key, {
      ...preferred,
      aliases: uniqueClean([...(existing.aliases ?? []), ...aliases, existing.id, existing.code, existing.label]),
    });
  }

  return Array.from(byKey.values()).sort((a, b) => a.label.localeCompare(b.label, "de"));
}

function sameProperty(entry: FinanceEntry, propertyId: string | null | undefined, propertyNameById: Record<string, string>, aliasesById: Record<string, string[]> = {}) {
  if (!propertyId) return false;
  const id = String(propertyId);
  const entryObjectId = String(entry.object_id ?? "");
  if (entryObjectId === id) return true;

  const targetName = propertyNameById[id];
  const entryObjectName = propertyNameById[entryObjectId];
  const aliases = aliasesById[id] ?? [];
  if (entryObjectId && aliases.includes(entryObjectId)) return true;
  if (namesMatch(entryObjectName, targetName)) return true;

  const code = String(entry.objekt_code ?? "");
  if (code && namesMatch(targetName, code)) return true;
  if (code && namesMatch(entryObjectName, code)) return true;
  if (code && aliases.some((alias) => namesMatch(alias, code))) return true;
  if (entryObjectName && aliases.some((alias) => namesMatch(alias, entryObjectName))) return true;

  return false;
}

function getEntryYearMonth(value: string | null): { year: number; month: number } | null {
  if (!value || value.length < 7) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return { year, month };
}

function getEffectiveRentYearMonth(value: string | null): { year: number; month: number } | null {
  if (!value || value.length < 10) return getEntryYearMonth(value);
  const ym = getEntryYearMonth(value);
  if (!ym) return null;
  const day = Number(value.slice(8, 10));
  if (!Number.isFinite(day) || day < 25) return ym;
  const nextMonth = ym.month === 12 ? 1 : ym.month + 1;
  const nextYear = ym.month === 12 ? ym.year + 1 : ym.year;
  return { year: nextYear, month: nextMonth };
}

function isEffectiveRentMonth(entry: FinanceEntry, year: number, month: number): boolean {
  const ym = getEffectiveRentYearMonth(entry.booking_date);
  return ym?.year === year && ym.month === month;
}

function buildMonthlyRentSummariesFromEntries(entries: FinanceEntry[]): MonthlyRentSummaryRow[] {
  const map = new Map<string, MonthlyRentSummaryRow>();
  for (const entry of entries) {
    if (!entry.object_id || !isRentEntry(entry)) continue;
    const ym = getEffectiveRentYearMonth(entry.booking_date);
    if (!ym) continue;
    const key = `${entry.object_id}|${entry.objekt_code ?? ""}|${ym.year}|${ym.month}`;
    const existing = map.get(key) ?? {
      object_id: String(entry.object_id),
      objekt_code: entry.objekt_code ?? null,
      user_id: null,
      jahr: ym.year,
      monat: ym.month,
      mieteingang_summe: 0,
    };
    existing.mieteingang_summe += entry.amount;
    map.set(key, existing);
  }
  return Array.from(map.values());
}

function buildYearlyFinanceSummariesFromEntries(entries: FinanceEntry[]): YearlyFinanceSummaryRow[] {
  const map = new Map<string, YearlyFinanceSummaryRow>();
  for (const entry of entries) {
    if (!entry.object_id) continue;
    const ym = getEntryYearMonth(entry.booking_date);
    if (!ym) continue;
    const key = `${entry.object_id}|${entry.objekt_code ?? ""}|${ym.year}`;
    const existing = map.get(key) ?? {
      object_id: String(entry.object_id),
      objekt_code: entry.objekt_code ?? null,
      user_id: null,
      jahr: ym.year,
      einnahmen: 0,
      ausgaben: 0,
      mieteingaenge: 0,
    };
    if (entry.entry_type === "income") existing.einnahmen += entry.amount;
    if (entry.entry_type === "expense") existing.ausgaben += entry.amount;
    if (isRentEntry(entry)) {
      const rentYm = getEffectiveRentYearMonth(entry.booking_date);
      if (rentYm?.year === ym.year) existing.mieteingaenge += entry.amount;
    }
    map.set(key, existing);
  }
  return Array.from(map.values());
}

function groupLedgerRows(rows: Array<{ property_id: string | null; year: unknown; balance: unknown }>) {
  const grouped: Record<string, LoanChartPoint[]> = {};
  for (const row of rows) {
    if (!row.property_id) continue;
    const year = parseMaybeNumber(row.year);
    const balance = parseMaybeNumber(row.balance);
    if (year === null || balance === null) continue;
    const key = String(row.property_id);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({ year, balance });
  }
  for (const key of Object.keys(grouped)) grouped[key].sort((a, b) => a.year - b.year);
  return grouped;
}

function isFuertherName(value: string | null | undefined): boolean {
  const normalized = String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/straße|strasse/g, "str");
  return normalized.includes("further") || normalized.includes("fuerther") || normalized.includes("furth");
}

function cleanLoanBalance(value: unknown, propertyName: string | null | undefined): number | null {
  const parsed = parseNullableLocaleNumber(value);
  if (parsed === null) return null;
  // Safety net for old cached/view values. The canonical source is the latest
  // property_loan_ledger row, but if a stale dashboard view still returns
  // 1.250.628,60 for Fürther Str., the UI must show 125.062,86.
  return isFuertherName(propertyName) && Math.abs(parsed) >= 1_000_000 ? parsed / 10 : parsed;
}

function buildFallbackChart(row: LoanDashboardRow): LoanChartPoint[] {
  if (row.first_year === null || row.last_year === null || row.last_balance === null) return [];
  const principal = row.principal_total ?? 0;
  const startBalance = Math.max(row.last_balance, row.last_balance + principal);
  if (row.first_year === row.last_year) return [{ year: row.last_year, balance: row.last_balance }];
  return [
    { year: row.first_year, balance: startBalance },
    { year: row.last_year, balance: row.last_balance },
  ];
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [objects, setObjects] = useState<AppObject[]>([]);
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [monthlyRentSummaries, setMonthlyRentSummaries] = useState<MonthlyRentSummaryRow[]>([]);
  const [yearlyFinanceSummaries, setYearlyFinanceSummaries] = useState<YearlyFinanceSummaryRow[]>([]);
  const [portfolioRows, setPortfolioRows] = useState<PortfolioLoanRow[]>([]);
  const [loanRows, setLoanRows] = useState<LoanDashboardRow[]>([]);
  const [loanChartByPropertyId, setLoanChartByPropertyId] = useState<Record<string, LoanChartPoint[]>>({});

  const applyCachedData = useCallback((cached: CachedAppData) => {
    setObjects(Array.isArray(cached.objects) ? cached.objects : []);
    setEntries(Array.isArray(cached.entries) ? cached.entries : []);
    setMonthlyRentSummaries(Array.isArray(cached.monthlyRentSummaries) ? cached.monthlyRentSummaries : []);
    setYearlyFinanceSummaries(Array.isArray(cached.yearlyFinanceSummaries) ? cached.yearlyFinanceSummaries : []);
    setPortfolioRows(Array.isArray(cached.portfolioRows) ? cached.portfolioRows : []);
    setLoanRows(Array.isArray(cached.loanRows) ? cached.loanRows : []);
    setLoanChartByPropertyId(cached.loanChartByPropertyId && typeof cached.loanChartByPropertyId === "object" ? cached.loanChartByPropertyId : {});
  }, []);

  const hydrateFromCache = useCallback(() => {
    try {
      const raw = window.localStorage.getItem(APP_DATA_CACHE_KEY);
      if (!raw) return false;
      const cached = JSON.parse(raw) as CachedAppData;
      const hasUsefulData = Array.isArray(cached.objects) || Array.isArray(cached.entries) || Array.isArray(cached.portfolioRows);
      if (!hasUsefulData) return false;
      applyCachedData(cached);
      setError(null);
      return true;
    } catch {
      return false;
    }
  }, [applyCachedData]);

  const load = useCallback(async () => {
    const hydrated = hydrateFromCache();
    setLoading(!hydrated);
    setError(null);
    try {
      const [objectsRes, entriesRes, portfolioRes, loanRes, propertyMasterRes, propertyExtraRes] = await Promise.all([
        supabase.from("v_object_dropdown").select("value,objekt_code,label,object_id,property_id").order("label", { ascending: true }),
        supabase.from("finance_entry").select("id,object_id,objekt_code,entry_type,booking_date,amount,category,note,tax_relevant,nk_relevant").eq("is_deleted", false).order("booking_date", { ascending: false }).limit(5000),
        supabase.from("vw_property_loan_dashboard_portfolio_v2").select("property_id,portfolio_property_id,property_name,last_balance,principal_total,interest_total,repaid_percent,repayment_status,repayment_label").order("property_name", { ascending: true }),
        supabase.from("vw_property_loan_dashboard_dedup").select("property_id,property_name,first_year,last_year,last_balance_year,last_balance,interest_total,principal_total,repaid_percent,repaid_percent_display,repayment_status,repayment_label,refreshed_at").order("property_name", { ascending: true }),
        supabase.from("properties").select("id,name,title,address,living_area_m2"),
        supabase.from("property_extra_info").select("property_id,living_area,wealth_profile"),
      ]);

      // Objekt- und Buchungsdaten sind die Pflichtquelle fuer die App.
      // Darlehens-/Portfolio-Views duerfen Mieteingang, Buchhaltung und andere
      // Seiten nicht blockieren, wenn eine View kurzfristig nicht erreichbar ist.
      const firstBlockingError = objectsRes.error || entriesRes.error;
      if (firstBlockingError) throw firstBlockingError;
      if (portfolioRes.error) console.warn("Portfolio-Darlehensdaten konnten nicht geladen werden:", portfolioRes.error.message);
      if (loanRes.error) console.warn("Darlehensdashboard konnte nicht geladen werden:", loanRes.error.message);
      if (propertyMasterRes.error) console.warn("Wohnflächen-Stammdaten konnten nicht geladen werden:", propertyMasterRes.error.message);
      if (propertyExtraRes.error) console.warn("Wohnflächen aus Immobilienvermögen konnten nicht geladen werden:", propertyExtraRes.error.message);

      const baseObjects = dedupeObjectsByCanonicalName(((objectsRes.data ?? []) as ObjectDropdownRow[])
        .filter((row) => row.value)
        .map((row) => ({
          // AppObject.id muss zur Buchungstabelle passen: finance_entry.object_id -> public.objects.id.
          // v_object_dropdown.value kann je nach Migration property_id sein; daher object_id bevorzugen.
          id: String(row.object_id ?? row.value),
          code: row.objekt_code ?? null,
          label: cleanDisplayName(row.label ?? row.objekt_code ?? row.value, "Unbenanntes Objekt"),
          aliases: uniqueClean([row.object_id, row.property_id, row.value, row.objekt_code, row.label]),
        })));

      const propertyMasterRows = (propertyMasterRes.error ? [] : propertyMasterRes.data ?? []) as PropertyMasterAreaRow[];
      const propertyExtraRows = (propertyExtraRes.error ? [] : propertyExtraRes.data ?? []) as PropertyExtraAreaRow[];
      const portfolioSourceRows = (portfolioRes.error ? [] : portfolioRes.data ?? []) as PortfolioLoanSourceRow[];
      const mappedObjects = baseObjects.map((object) => {
        const master = propertyMasterRows.find((row) => {
          const ids = uniqueClean([row.id, row.property_id]);
          const names = uniqueClean([row.name, row.title, row.address]);
          return ids.some((id) => id === object.id || object.aliases?.includes(id))
            || names.some((name) => namesMatch(name, object.label) || object.aliases?.some((alias) => namesMatch(name, alias)));
        });
        const matchingPortfolio = portfolioSourceRows.find((row) => namesMatch(row.property_name, object.label));
        const portfolioIds = uniqueClean([matchingPortfolio?.property_id, matchingPortfolio?.portfolio_property_id]);
        const extra = propertyExtraRows.find((row) => {
          const id = String(row.property_id ?? "").trim();
          return Boolean(id && (
            id === object.id
            || object.aliases?.includes(id)
            || portfolioIds.includes(id)
            || namesMatch(id, object.label)
            || object.aliases?.some((alias) => namesMatch(id, alias))
          ));
        });
        const wealthArea = extra?.wealth_profile?.totalArea ?? extra?.wealth_profile?.livingArea ?? extra?.wealth_profile?.living_area;
        return {
          ...object,
          // Eine zentrale Lesekette: properties ist primaer; die bereits in
          // Immobilienvermoegen gepflegte Objektdetailflaeche ist der Fallback.
          livingAreaM2: parseMaybeNumber(master?.living_area_m2)
            ?? parseMaybeNumber(extra?.living_area)
            ?? parseMaybeNumber(wealthArea),
        };
      });

      const mappedEntries = ((entriesRes.data ?? []) as FinanceEntryRow[]).map((row) => ({
        id: row.id ?? null,
        object_id: row.object_id == null ? null : String(row.object_id),
        objekt_code: row.objekt_code ?? null,
        entry_type: row.entry_type ?? null,
        booking_date: row.booking_date ?? null,
        amount: toNumber(row.amount),
        category: row.category ?? null,
        note: row.note ?? null,
        tax_relevant: typeof row.tax_relevant === "boolean" ? row.tax_relevant : null,
        nk_relevant: typeof row.nk_relevant === "boolean" ? row.nk_relevant : null,
      }));

      // Monatsmieten werden absichtlich aus finance_entry berechnet, damit die 25.-des-Monats-Regel überall gleich gilt.

      // Single Source of Truth im Frontend: Mietmonate werden immer nach der Hausverwaltungs-Regel berechnet.
      // Zahlungen ab dem 25. eines Monats zählen als Mieteingang für den Folgemonat.
      // Die DB-View bleibt als Backend-Quelle verfügbar, wird hier aber nicht bevorzugt, weil ältere Views diese Regel nicht kennen.
      const mappedMonthlyRentSummaries = buildMonthlyRentSummariesFromEntries(mappedEntries);
      const mappedYearlyFinanceSummaries = buildYearlyFinanceSummariesFromEntries(mappedEntries);

      let mappedPortfolio = ((portfolioRes.error ? [] : portfolioRes.data ?? []) as PortfolioLoanSourceRow[])
        .filter((row) => row.property_id)
        .filter((row) => !isHiddenTechnicalPropertyName(row.property_name))
        .map((row) => ({
          property_id: String(row.property_id ?? ""),
          portfolio_property_id: row.portfolio_property_id == null ? null : String(row.portfolio_property_id),
          property_name: cleanDisplayName(row.property_name, "Unbenanntes Objekt"),
          last_balance: cleanLoanBalance(row.last_balance, row.property_name) ?? 0,
          principal_total: toNumber(row.principal_total),
          interest_total: toNumber(row.interest_total),
          repaid_percent: toNumber(row.repaid_percent),
          repayment_status: row.repayment_status ?? null,
          repayment_label: row.repayment_label ?? null,
        }));

      let mappedLoans = ((loanRes.error ? [] : loanRes.data ?? []) as LoanDashboardSourceRow[])
        .filter((row) => row.property_id)
        .filter((row) => !isHiddenTechnicalPropertyName(row.property_name))
        .map((row) => ({
          property_id: String(row.property_id ?? ""),
          property_name: cleanDisplayName(row.property_name, "Unbenannte Immobilie"),
          first_year: parseMaybeNumber(row.first_year),
          last_year: parseMaybeNumber(row.last_year),
          last_balance_year: parseMaybeNumber(row.last_balance_year),
          last_balance: cleanLoanBalance(row.last_balance, row.property_name),
          interest_total: parseMaybeNumber(row.interest_total),
          principal_total: parseMaybeNumber(row.principal_total),
          repaid_percent: parseMaybeNumber(row.repaid_percent),
          repaid_percent_display: row.repaid_percent_display ?? null,
          repayment_status: row.repayment_status ?? null,
          repayment_label: row.repayment_label ?? null,
          refreshed_at: row.refreshed_at ?? null,
        }));

      // Canonical ledger override: Portfolio and Objekt pages must not depend on
      // stale dashboard views. The latest row in property_loan_ledger is the
      // source of truth for Restschuld.
      const ledgerOverrideIds = Array.from(new Set([
        ...mappedLoans.map((row) => row.property_id),
        ...mappedPortfolio.map((row) => row.property_id),
        ...mappedPortfolio.map((row) => row.portfolio_property_id),
      ].filter(Boolean)));
      if (ledgerOverrideIds.length) {
        const ledgerOverrideRes = await supabase
          .from("property_loan_ledger")
          .select("property_id,year,balance,interest,principal")
          .in("property_id", ledgerOverrideIds)
          .order("property_id", { ascending: true })
          .order("year", { ascending: true });

        if (!ledgerOverrideRes.error) {
          const latestByProperty: Record<string, { year: number; balance: number; interestTotal: number; principalTotal: number }> = {};
          for (const rawRow of (ledgerOverrideRes.data ?? []) as LoanLedgerSourceRow[]) {
            const propertyId = String(rawRow.property_id ?? "");
            if (!propertyId) continue;
            const year = parseMaybeNumber(rawRow.year);
            const balance = parseMaybeNumber(rawRow.balance);
            const interest = parseMaybeNumber(rawRow.interest) ?? 0;
            const principal = parseMaybeNumber(rawRow.principal) ?? 0;
            if (year === null || balance === null) continue;
            const existing = latestByProperty[propertyId];
            latestByProperty[propertyId] = {
              year: existing && existing.year > year ? existing.year : year,
              balance: existing && existing.year > year ? existing.balance : balance,
              interestTotal: (existing?.interestTotal ?? 0) + interest,
              principalTotal: (existing?.principalTotal ?? 0) + principal,
            };
          }

          mappedLoans = mappedLoans.map((row) => {
            const latest = latestByProperty[row.property_id];
            if (!latest) return row;
            return {
              ...row,
              last_year: Math.max(row.last_year ?? latest.year, latest.year),
              last_balance_year: latest.year,
              last_balance: latest.balance,
              interest_total: latest.interestTotal || row.interest_total,
              principal_total: latest.principalTotal || row.principal_total,
            };
          });

          mappedPortfolio = mappedPortfolio.map((row) => {
            const latest = latestByProperty[row.property_id] ?? (row.portfolio_property_id ? latestByProperty[row.portfolio_property_id] : undefined);
            if (!latest) return row;
            return {
              ...row,
              last_balance: latest.balance,
              interest_total: latest.interestTotal || row.interest_total,
              principal_total: latest.principalTotal || row.principal_total,
            };
          });
        }
      }

      let charts: Record<string, LoanChartPoint[]> = {};
      const ids = mappedLoans.map((row) => row.property_id);
      if (ids.length) {
        const ledgerRes = await supabase
          .from("property_loan_ledger")
          .select("property_id,year,balance")
          .in("property_id", ids)
          .order("property_id", { ascending: true })
          .order("year", { ascending: true });
        if (!ledgerRes.error) charts = groupLedgerRows((ledgerRes.data ?? []) as LoanLedgerSourceRow[]);
      }
      for (const row of mappedLoans) {
        if (!charts[row.property_id] || charts[row.property_id].length === 0) {
          const fallback = buildFallbackChart(row);
          if (fallback.length) charts[row.property_id] = fallback;
        }
      }

      setObjects(mappedObjects);
      setEntries(mappedEntries);
      setMonthlyRentSummaries(mappedMonthlyRentSummaries);
      setYearlyFinanceSummaries(mappedYearlyFinanceSummaries);
      setPortfolioRows(mappedPortfolio);
      setLoanRows(mappedLoans);
      setLoanChartByPropertyId(charts);
      window.localStorage.setItem(APP_DATA_CACHE_KEY, JSON.stringify({
        objects: mappedObjects,
        entries: mappedEntries,
        monthlyRentSummaries: mappedMonthlyRentSummaries,
        yearlyFinanceSummaries: mappedYearlyFinanceSummaries,
        portfolioRows: mappedPortfolio,
        loanRows: mappedLoans,
        loanChartByPropertyId: charts,
        savedAt: new Date().toISOString(),
      }));
    } catch (err: unknown) {
      if (!hydrated && !hydrateFromCache()) {
        setError(getErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }, [hydrateFromCache]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    const handler = () => void load();
    window.addEventListener("koenen:finance-entry-changed", handler);
    window.addEventListener("focus", handler);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener("koenen:finance-entry-changed", handler);
      window.removeEventListener("focus", handler);
    };
  }, [load]);

  const propertyNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const object of objects) {
      map[object.id] = object.label;
      for (const alias of object.aliases ?? []) map[String(alias)] = object.label;
    }
    for (const row of portfolioRows) map[row.property_id] = cleanDisplayName(row.property_name, "Unbekanntes Objekt");
    for (const row of loanRows) map[row.property_id] = cleanDisplayName(row.property_name, "Unbekanntes Objekt");
    return map;
  }, [objects, portfolioRows, loanRows]);

  const aliasesById = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const object of objects) map[object.id] = uniqueClean([object.id, object.code, object.label, ...(object.aliases ?? [])]);
    return map;
  }, [objects]);

  const value = useMemo<AppDataContextValue>(() => {
    const getPropertyName = (propertyId: string | null | undefined) => (propertyId ? propertyNameById[String(propertyId)] ?? "Unbekanntes Objekt" : "Unbekanntes Objekt");
    const getEntriesForProperty = (propertyId: string | null | undefined) => entries.filter((entry) => sameProperty(entry, propertyId, propertyNameById, aliasesById));
    const getRentEntriesForProperty = (propertyId: string | null | undefined, start?: string, end?: string) => getEntriesForProperty(propertyId).filter((entry) => isRentEntry(entry) && (!start || !end || dateInRange(entry.booking_date, start, end)));
    const getExpenseEntriesForProperty = (propertyId: string | null | undefined, year?: number) => getEntriesForProperty(propertyId).filter((entry) => entry.entry_type === "expense" && dateInYear(entry.booking_date, year));
    const getIncomeEntriesForProperty = (propertyId: string | null | undefined, year?: number) => getEntriesForProperty(propertyId).filter((entry) => entry.entry_type === "income" && dateInYear(entry.booking_date, year));
    const getNetCashflow = (propertyId: string | null | undefined, year?: number) => {
      const income = getIncomeEntriesForProperty(propertyId, year).reduce((sum, entry) => sum + entry.amount, 0);
      const expense = getExpenseEntriesForProperty(propertyId, year).reduce((sum, entry) => sum + entry.amount, 0);
      return income - expense;
    };
    const getNebenkostenExpenses = (propertyId: string | null | undefined, year?: number) => getExpenseEntriesForProperty(propertyId, year).filter(isNebenkostenExpense);
    const getMonthlyRentSummary = (propertyId: string | null | undefined, year: number, month: number) => {
      if (!propertyId) return null;
      const id = String(propertyId);
      const row = monthlyRentSummaries.find((summary) => sameProperty({ object_id: summary.object_id, objekt_code: summary.objekt_code, entry_type: null, booking_date: null, amount: 0, category: null, note: null }, id, propertyNameById, aliasesById) && summary.jahr === year && summary.monat === month);
      if (row) return row.mieteingang_summe;
      const total = getEntriesForProperty(id).filter((entry) => isRentEntry(entry) && isEffectiveRentMonth(entry, year, month)).reduce((sum, entry) => sum + entry.amount, 0);
      return total > 0 ? total : null;
    };
    const getMonthlyRentSummaryByObjectCode = (objectCode: string | null | undefined, year: number, month: number) => {
      if (!objectCode) return null;
      const code = normalizeMatchText(objectCode);
      const row = monthlyRentSummaries.find((summary) => normalizeMatchText(summary.objekt_code) === code && summary.jahr === year && summary.monat === month);
      if (row) return row.mieteingang_summe;
      const total = entries
        .filter((entry) => normalizeMatchText(entry.objekt_code) === code && isRentEntry(entry))
        .filter((entry) => isEffectiveRentMonth(entry, year, month))
        .reduce((sum, entry) => sum + entry.amount, 0);
      return total > 0 ? total : null;
    };
    const getYearlyFinanceSummary = (propertyId: string | null | undefined, year: number) => {
      if (!propertyId) return null;
      return yearlyFinanceSummaries.find((summary) => summary.object_id === String(propertyId) && summary.jahr === year) ?? null;
    };
    const getYearlyFinanceSummaryByObjectCode = (objectCode: string | null | undefined, year: number) => {
      if (!objectCode) return null;
      const code = normalizeMatchText(objectCode);
      return yearlyFinanceSummaries.find((summary) => normalizeMatchText(summary.objekt_code) === code && summary.jahr === year) ?? null;
    };

    return {
      loading,
      error,
      objects,
      entries,
      monthlyRentSummaries,
      yearlyFinanceSummaries,
      portfolioRows,
      loanRows,
      loanChartByPropertyId,
      refresh: load,
      getPropertyName,
      getEntriesForProperty,
      getRentEntriesForProperty,
      getExpenseEntriesForProperty,
      getIncomeEntriesForProperty,
      getNetCashflow,
      getNebenkostenExpenses,
      getMonthlyRentSummary,
      getMonthlyRentSummaryByObjectCode,
      getYearlyFinanceSummary,
      getYearlyFinanceSummaryByObjectCode,
    };
  }, [loading, error, objects, entries, monthlyRentSummaries, yearlyFinanceSummaries, portfolioRows, loanRows, loanChartByPropertyId, load, propertyNameById, aliasesById]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData muss innerhalb von AppDataProvider genutzt werden.");
  return ctx;
}
