import type {
  AppObject,
  FinanceEntry,
  LoanChartPoint,
  LoanDashboardRow,
  PortfolioLoanRow,
  YearlyFinanceSummaryRow,
} from "@/state/AppDataContext";

export type MasterDataSeverity = "ok" | "warning" | "critical";

export type MasterFinanceSnapshot = {
  propertyId: string;
  portfolioPropertyId: string | null;
  propertyName: string;
  aliases: string[];
  year: number;
  income: number;
  expenses: number;
  capex: number;
  operatingExpenses: number;
  netCashflow: number;
  rentIncome: number;
  latestBalance: number | null;
  latestBalanceYear: number | null;
  interestTotal: number;
  principalTotal: number;
  loanChart: LoanChartPoint[];
  sources: {
    income: "entries" | "yearly_summary" | "none";
    expenses: "entries" | "yearly_summary" | "none";
    capex: "entries" | "none";
    balance: "ledger_chart" | "portfolio" | "loan_dashboard" | "none";
  };
  issues: string[];
  severity: MasterDataSeverity;
};

export type MasterDataInput = {
  objects: AppObject[];
  entries: FinanceEntry[];
  yearlyFinanceSummaries: YearlyFinanceSummaryRow[];
  portfolioRows: PortfolioLoanRow[];
  loanRows: LoanDashboardRow[];
  loanChartByPropertyId: Record<string, LoanChartPoint[]>;
};


export function cleanMasterDisplayName(value: unknown, fallback = "Objekt"): string {
  const raw = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const known = [
    "Lilienthaler Str. 54",
    "Colmarer Str. 45",
    "Elsasser Str. 52",
    "Fürther Str. 74",
    "Hohenloher Str. 78",
    "Rosenstein Str. 25",
    "Rosensteinstraße 25",
  ];

  const lowered = raw.toLowerCase();
  for (const candidate of known) {
    if (lowered.startsWith(candidate.toLowerCase())) {
      return candidate === "Rosensteinstraße 25" ? "Rosenstein Str. 25" : candidate;
    }
  }

  const cleaned = raw
    .replace(/\s*\(?\s*core[\W_]*shadow\s*\)?/gi, "")
    .replace(/\s*\(?\s*shadow\s*\)?/gi, "")
    .replace(/\s+\d{5}(?:\s+[^\d,;|/]+)?\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return cleaned || fallback;
}

export function toMasterNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? roundMasterCurrency(value) : 0;
  if (value === null || value === undefined) return 0;
  const rawValue = String(value).trim();
  if (!rawValue) return 0;
  let raw = rawValue.replace(/\s+/g, "").replace(/[^\d,.-]/g, "");
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) raw = comma > dot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  else if (comma >= 0) raw = raw.replace(/\./g, "").replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? roundMasterCurrency(parsed) : 0;
}

function roundMasterCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function sumMasterCurrency<T>(rows: T[], selector: (row: T) => number): number {
  return roundMasterCurrency(rows.reduce((sum, row) => sum + selector(row), 0));
}

export function normalizeMasterText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/straße|strasse/g, "str")
    // Daten aus verschiedenen Quellen schreiben Straßennamen teils als
    // „Rosensteinstraße 25“ und teils als „Rosenstein Str. 25“.
    // Ohne diesen Schritt werden solche Einträge als zwei Immobilien gezählt.
    .replace(/([a-z])str\b/g, "$1 str")
    .replace(/\bobjekt\s*\d+\b/g, "")
    .replace(/\b(core\s*shadow|shadow|hauptmiete|wohnung|garage|darlehen|immobilie)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function masterNamesMatch(a: unknown, b: unknown): boolean {
  const left = normalizeMasterText(a);
  const right = normalizeMasterText(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

export function isHiddenMasterObjectName(value: unknown): boolean {
  const text = normalizeMasterText(value);
  if (!text) return true;
  return /\b(rls|test|trigger|debug|dummy|sample)\b/.test(text);
}

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

function entryYear(value: string | null): number | null {
  if (!value || value.length < 4) return null;
  const year = Number(value.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

function isCapexEntry(entry: FinanceEntry): boolean {
  if (entry.entry_type !== "expense") return false;
  const text = normalizeMasterText(`${entry.category ?? ""} ${entry.note ?? ""}`);
  return /\b(capex|sanierung|modernisierung|renovierung|reparatur|instandhaltung|umbau|anlage|investition)\b/.test(text);
}

function isRentEntry(entry: FinanceEntry): boolean {
  if (entry.entry_type !== "income") return false;
  const text = normalizeMasterText(`${entry.category ?? ""} ${entry.note ?? ""}`);
  return /\b(miete|kaltmiete|warmmiete|garage|pacht)\b/.test(text);
}

function matchesAlias(value: string | null | undefined, aliases: string[], names: string[]): boolean {
  if (!value) return false;
  const raw = String(value);
  if (aliases.includes(raw)) return true;
  return names.some((name) => masterNamesMatch(raw, name));
}

function buildCanonicalProperties(input: MasterDataInput) {
  const byId = new Map<string, { propertyId: string; portfolioPropertyId: string | null; propertyName: string; aliases: string[] }>();

  for (const row of input.portfolioRows) {
    if (!row.property_id || isHiddenMasterObjectName(row.property_name)) continue;
    byId.set(row.property_id, {
      propertyId: row.property_id,
      portfolioPropertyId: row.portfolio_property_id ?? null,
      propertyName: cleanMasterDisplayName(row.property_name),
      aliases: uniqueStrings([row.property_id, row.portfolio_property_id, row.property_name]),
    });
  }

  const ensure = (id: string | null | undefined, name: string | null | undefined) => {
    if (!id || isHiddenMasterObjectName(name)) return;
    const existing = byId.get(id);
    if (existing) {
      existing.aliases = uniqueStrings([...existing.aliases, id, name]);
      if (!existing.propertyName && name) existing.propertyName = cleanMasterDisplayName(name);
      return;
    }
    const byName = Array.from(byId.values()).find((row) => masterNamesMatch(row.propertyName, name));
    if (byName) {
      byName.aliases = uniqueStrings([...byName.aliases, id, name]);
      return;
    }
    byId.set(id, { propertyId: id, portfolioPropertyId: null, propertyName: cleanMasterDisplayName(name ?? id), aliases: uniqueStrings([id, name]) });
  };

  for (const row of input.loanRows) ensure(row.property_id, row.property_name);
  for (const row of input.objects) ensure(row.id, row.label);

  return Array.from(byId.values()).sort((a, b) => a.propertyName.localeCompare(b.propertyName, "de"));
}

export function buildMasterFinanceSnapshots(input: MasterDataInput, year = new Date().getFullYear()): MasterFinanceSnapshot[] {
  const canonical = buildCanonicalProperties(input);

  return canonical.map((property) => {
    const names = uniqueStrings([property.propertyName, ...property.aliases]);
    const aliases = property.aliases;
    const entryRows = input.entries.filter((entry) => matchesAlias(entry.object_id, aliases, names) || matchesAlias(entry.objekt_code, aliases, names));
    const yearEntries = entryRows.filter((entry) => entryYear(entry.booking_date) === year);
    const summaryRows = input.yearlyFinanceSummaries.filter((row) => row.jahr === year && (matchesAlias(row.object_id, aliases, names) || matchesAlias(row.objekt_code, aliases, names)));
    const incomeFromEntries = sumMasterCurrency(yearEntries.filter((entry) => entry.entry_type === "income"), (entry) => toMasterNumber(entry.amount));
    const expensesFromEntries = sumMasterCurrency(yearEntries.filter((entry) => entry.entry_type === "expense"), (entry) => toMasterNumber(entry.amount));
    const incomeFromSummary = sumMasterCurrency(summaryRows, (row) => toMasterNumber(row.einnahmen));
    const expensesFromSummary = sumMasterCurrency(summaryRows, (row) => toMasterNumber(row.ausgaben));
    const income = incomeFromEntries;
    const expenses = expensesFromEntries;
    const capex = sumMasterCurrency(yearEntries.filter(isCapexEntry), (entry) => toMasterNumber(entry.amount));
    const rentIncome = sumMasterCurrency(yearEntries.filter(isRentEntry), (entry) => toMasterNumber(entry.amount));

    const portfolio = input.portfolioRows.find((row) => matchesAlias(row.property_id, aliases, names) || matchesAlias(row.portfolio_property_id, aliases, names) || masterNamesMatch(row.property_name, property.propertyName));
    const loan = input.loanRows.find((row) => matchesAlias(row.property_id, aliases, names) || masterNamesMatch(row.property_name, property.propertyName));
    const chart = aliases.flatMap((id) => input.loanChartByPropertyId[id] ?? []);
    const chartSorted = chart
      .filter((point) => Number.isFinite(point.year) && Number.isFinite(point.balance))
      .sort((a, b) => a.year - b.year);
    const latestChart = chartSorted[chartSorted.length - 1];
    const latestBalance = latestChart?.balance ?? portfolio?.last_balance ?? loan?.last_balance ?? null;
    const latestBalanceYear = latestChart?.year ?? loan?.last_balance_year ?? loan?.last_year ?? null;

    const issues: string[] = [];
    if (!portfolio && !loan) issues.push("Keine zentrale Portfolio-/Darlehensverknüpfung gefunden.");
    if (!chartSorted.length && latestBalance === null) issues.push("Keine Restschuld aus Darlehens-Ledger gefunden.");
    if (!yearEntries.length) issues.push(`Keine Buchungen aus finance_entry für ${year} gefunden.`);
    if (incomeFromEntries && incomeFromSummary && Math.abs(incomeFromEntries - incomeFromSummary) > 1) issues.push("Einnahmen aus Buchungen und Jahresübersicht weichen ab.");
    if (expensesFromEntries && expensesFromSummary && Math.abs(expensesFromEntries - expensesFromSummary) > 1) issues.push("Ausgaben aus Buchungen und Jahresübersicht weichen ab.");
    if (portfolio?.last_balance && latestChart?.balance && Math.abs(toMasterNumber(portfolio.last_balance) - latestChart.balance) > 1) issues.push("Portfolio-Restschuld weicht vom letzten Ledger-Wert ab.");

    const severity: MasterDataSeverity = issues.some((issue) => /keine restschuld|keine zentrale/i.test(issue)) ? "critical" : issues.length ? "warning" : "ok";

    return {
      ...property,
      aliases: uniqueStrings([...aliases, property.propertyName]),
      year,
      income,
      expenses,
      capex,
      operatingExpenses: roundMasterCurrency(Math.max(0, expenses - capex)),
      netCashflow: roundMasterCurrency(income - expenses),
      rentIncome,
      latestBalance: latestBalance === null ? null : toMasterNumber(latestBalance),
      latestBalanceYear,
      interestTotal: toMasterNumber(portfolio?.interest_total ?? loan?.interest_total),
      principalTotal: toMasterNumber(portfolio?.principal_total ?? loan?.principal_total),
      loanChart: chartSorted,
      sources: {
        income: incomeFromEntries ? "entries" : "none",
        expenses: expensesFromEntries ? "entries" : "none",
        capex: capex ? "entries" : "none",
        balance: latestChart ? "ledger_chart" : portfolio?.last_balance ? "portfolio" : loan?.last_balance ? "loan_dashboard" : "none",
      },
      issues,
      severity,
    };
  });
}

export type BackendMasterLikeRow = {
  property_id: string;
  portfolio_property_id: string | null;
  objekt_code: string | null;
  property_name: string;
  normalized_name: string;
  year: number;
  income: number;
  expenses: number;
  capex: number;
  operating_expenses: number;
  net_cashflow: number;
  rent_income: number;
  interest_total: number;
  principal_total: number;
  debt_service: number;
  dscr: number | null;
  balance_at_year: number | null;
  latest_balance: number | null;
  latest_balance_year: number | null;
  refreshed_at: string | null;
};

export function buildMasterFinanceSnapshotsFromBackend(rows: BackendMasterLikeRow[]): MasterFinanceSnapshot[] {
  return rows
    .filter((row) => row.property_id && !isHiddenMasterObjectName(row.property_name))
    .map((row) => {
      const issues: string[] = [];
      if (row.latest_balance == null && row.balance_at_year == null) issues.push("Keine Restschuld aus Backend-Finanzmaster gefunden.");
      if (!row.income && !row.rent_income) issues.push(`Keine Einnahmen im Backend-Finanzmaster für ${row.year} gefunden.`);
      return {
        propertyId: row.property_id,
        portfolioPropertyId: row.portfolio_property_id,
        propertyName: cleanMasterDisplayName(row.property_name || row.objekt_code || row.property_id),
        aliases: uniqueStrings([row.property_id, row.portfolio_property_id, row.objekt_code, row.property_name, row.normalized_name]),
        year: row.year,
        income: toMasterNumber(row.income),
        expenses: toMasterNumber(row.expenses),
        capex: toMasterNumber(row.capex),
        operatingExpenses: toMasterNumber(row.operating_expenses),
        netCashflow: toMasterNumber(row.net_cashflow),
        rentIncome: toMasterNumber(row.rent_income),
        latestBalance: row.latest_balance ?? row.balance_at_year ?? null,
        latestBalanceYear: row.latest_balance_year,
        interestTotal: toMasterNumber(row.interest_total),
        principalTotal: toMasterNumber(row.principal_total),
        loanChart: [],
        sources: {
          income: (row.income || row.rent_income ? "entries" : "none") as "entries" | "yearly_summary" | "none",
          expenses: (row.expenses ? "entries" : "none") as "entries" | "yearly_summary" | "none",
          capex: (row.capex ? "entries" : "none") as "entries" | "none",
          balance: (row.latest_balance != null || row.balance_at_year != null ? "ledger_chart" : "none") as "ledger_chart" | "portfolio" | "loan_dashboard" | "none",
        },
        issues,
        severity: (issues.some((issue) => /restschuld/i.test(issue)) ? "critical" : issues.length ? "warning" : "ok") as MasterDataSeverity,
      };
    })
    .sort((a, b) => a.propertyName.localeCompare(b.propertyName, "de"));
}

export function buildMasterTotals(snapshots: MasterFinanceSnapshot[]) {
  const totals = snapshots.reduce(
    (totals, row) => ({
      income: totals.income + row.income,
      expenses: totals.expenses + row.expenses,
      capex: totals.capex + row.capex,
      netCashflow: totals.netCashflow + row.netCashflow,
      latestBalance: totals.latestBalance + (row.latestBalance ?? 0),
      warnings: totals.warnings + row.issues.length,
      critical: totals.critical + (row.severity === "critical" ? 1 : 0),
    }),
    { income: 0, expenses: 0, capex: 0, netCashflow: 0, latestBalance: 0, warnings: 0, critical: 0 },
  );
  return {
    ...totals,
    income: roundMasterCurrency(totals.income),
    expenses: roundMasterCurrency(totals.expenses),
    capex: roundMasterCurrency(totals.capex),
    netCashflow: roundMasterCurrency(totals.netCashflow),
    latestBalance: roundMasterCurrency(totals.latestBalance),
  };
}
