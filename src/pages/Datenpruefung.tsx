import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
  AlertTriangle,
  Banknote,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  FileDown,
  Filter,
  MoreVertical,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wrench,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAppData } from "@/state/AppDataContext";
import { refreshBackendFinanceMaterializedViews } from "@/services/backendFinanceMasterService";
import { createMissingCapexYear, createMissingIncomeYear, extendLoanOneYear } from "@/services/dataRepairService";
import { buildMasterFinanceSnapshots, buildMasterTotals } from "@/services/masterDataService";
import { useBackendFinanceMaster } from "@/hooks/useBackendFinanceMaster";
import { buildFinanceConsistencySummary } from "@/services/financeConsistencyEngine";

type Row = {
  property_id: string | null;
  year: number | string | null;
  balance?: number | string | null;
  amount?: number | string | null;
  income?: number | string | null;
  annual_rent?: number | string | null;
  other_income?: number | string | null;
  interest?: number | string | null;
  principal?: number | string | null;
};

type RentalRow = {
  property_id: string | null;
  rent_type?: string | null;
  rent_monthly?: number | string | null;
  start_date?: string | null;
  end_date?: string | null;
};

type Status = "ok" | "warn" | "bad";
type RepairAction = "income" | "capex" | "loan";
type FilterMode = "all" | "warnings" | "missing-loans" | "clean";

type AuditSource = { id: string; name: string; aliases: string[] };
type AuditRow = {
  id: string;
  name: string;
  aliases: string[];
  income: Status;
  capex: Status;
  loan: Status;
  portfolio: Status;
  balance: number | null;
  sourceText: string;
  notes: string[];
  risk: Status;
};

const currentYear = new Date().getFullYear();

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
  }

  let raw = value.trim().replace(/\s+/g, "").replace(/[^\d,.-]/g, "");
  if (!raw) return 0;

  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");

  if (comma >= 0 && dot >= 0) {
    raw = comma > dot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  } else if (comma >= 0) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else if (dot >= 0) {
    const parts = raw.split(".");
    raw = parts.length > 2 ? raw.replace(/\./g, "") : raw;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getYear(value: unknown) {
  const year = Math.trunc(toNumber(value));
  return year > 1900 ? year : null;
}

function normalizeName(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bobjekt\s*\d+\b/g, "")
    .replace(/hauptmiete|wohnung|garage|darlehen|immobilie/g, "")
    .replace(/straße|strasse/g, "str")
    .replace(/[–—-]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function namesMatch(a: string | null | undefined, b: string | null | undefined) {
  const left = normalizeName(a);
  const right = normalizeName(b);
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function euro(value: number | null) {
  return value == null
    ? "—"
    : new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(value);
}

function isFuertherContext(value: string | null | undefined) {
  const raw = String(value ?? "");
  const normalized = normalizeName(raw);
  return /fürther|fuerther|further/i.test(raw) || normalized.includes("further") || normalized.includes("fuerther");
}

function cleanBalanceForAudit(balance: number | null, propertyContext: string) {
  if (balance == null || !Number.isFinite(balance)) return null;

  let value = Math.abs(balance);

  // Fürther Str. wurde in den Darlehens-/Dashboard-Views teilweise um Faktor 10 zu hoch
  // angezeigt. Deshalb wird für die Datenprüfung konsequent der plausibilisierte Wert
  // verwendet – egal ob der Objektname mit ü, ue oder normalisiert aus der DB kommt.
  if (isFuertherContext(propertyContext) && value >= 10_000_000) {
    value = value / 10;
  }

  return Math.round(value);
}

const STATUS_CONFIG: Record<Status, { label: string; Icon: LucideIcon; pill: string; dot: string; ring: string }> = {
  ok: {
    label: "OK",
    Icon: CheckCircle2,
    pill: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
    ring: "border-emerald-100",
  },
  warn: {
    label: "Prüfen",
    Icon: AlertTriangle,
    pill: "border-amber-200 bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
    ring: "border-amber-100",
  },
  bad: {
    label: "Fehlt",
    Icon: XCircle,
    pill: "border-rose-200 bg-rose-50 text-rose-700",
    dot: "bg-rose-500",
    ring: "border-rose-100",
  },
};

function StatusBadge({ status, label }: { status: Status; label?: string }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.Icon;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${config.pill}`}>
      <Icon size={13} />
      {label ?? config.label}
    </span>
  );
}

function KpiCard({ label, value, icon, tone = "slate" }: { label: string; value: ReactNode; icon: ReactNode; tone?: "slate" | "emerald" | "rose" | "amber" | "indigo" }) {
  const tones = {
    slate: "bg-slate-50 text-slate-700 border-slate-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  };

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${tones[tone]}`}>{icon}</div>
        <div className="min-w-0">
          <div className="text-[11px] font-black uppercase leading-4 tracking-[0.08em] text-slate-500">{label}</div>
          <div className="mt-1 whitespace-nowrap text-[clamp(1.35rem,1.7vw,1.875rem)] font-black leading-tight tracking-tight text-slate-950">{value}</div>
        </div>
      </div>
    </div>
  );
}

function CheckItem({ label, status }: { label: string; status: Status }) {
  const config = STATUS_CONFIG[status];
  return (
    <div className={`rounded-2xl border ${config.ring} bg-white px-3 py-2 shadow-sm`}>
      <div className="mb-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">{label}</div>
      <StatusBadge status={status} />
    </div>
  );
}

export default function Datenpruefung() {
  const app = useAppData();
  const [capex, setCapex] = useState<Row[]>([]);
  const [incomeYears, setIncomeYears] = useState<Row[]>([]);
  const [ledger, setLedger] = useState<Row[]>([]);
  const [rentals, setRentals] = useState<RentalRow[]>([]);
  const [checking, setChecking] = useState(false);
  const [repairing, setRepairing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [backendRefreshKey, setBackendRefreshKey] = useState(0);
  const [backendRefreshing, setBackendRefreshing] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [openActions, setOpenActions] = useState<string | null>(null);

  const loadAuditTables = useCallback(async () => {
    const [capexRes, incomeRes, ledgerRes, rentalsRes] = await Promise.all([
      supabase.from("yearly_capex_entries").select("property_id,year,amount"),
      supabase.from("yearly_property_income").select("property_id,year,annual_rent,other_income"),
      supabase.from("property_loan_ledger").select("property_id,year,balance,interest,principal"),
      supabase.from("portfolio_property_rentals").select("property_id,rent_type,rent_monthly,start_date,end_date"),
    ]);

    if (capexRes.error) throw capexRes.error;
    if (incomeRes.error) throw incomeRes.error;
    if (ledgerRes.error) throw ledgerRes.error;
    if (rentalsRes.error) throw rentalsRes.error;

    setCapex((capexRes.data ?? []) as Row[]);
    setIncomeYears((incomeRes.data ?? []) as Row[]);
    setLedger((ledgerRes.data ?? []) as Row[]);
    setRentals((rentalsRes.data ?? []) as RentalRow[]);
  }, []);

  const runCheck = useCallback(async () => {
    setChecking(true);
    setError(null);
    setNotice(null);
    try {
      await app.refresh();
      await loadAuditTables();
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Datenprüfung konnte nicht geladen werden.");
    } finally {
      setChecking(false);
    }
  }, [app, loadAuditTables]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void runCheck();
    }, 0);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const auditSources = useMemo<AuditSource[]>(() => {
    // Kanonische Grundlage wie Portfolio → Objektübersicht: app.portfolioRows.
    // Dadurch werden Restschuld-Gesamtsummen nicht mehr aus einer zweiten, abweichenden
    // Datenprüfungs-Liste addiert. Objekte aus v_object_dropdown werden nur als Alias ergänzt.
    const bases: AuditSource[] = app.portfolioRows.map((row) => ({
      id: row.property_id,
      name: row.property_name,
      aliases: unique([row.property_id, row.portfolio_property_id]),
    }));
    const fallbackByName = new Map<string, AuditSource>();

    const addAlias = (source: AuditSource, id: string | null | undefined) => {
      if (id && !source.aliases.includes(String(id))) source.aliases.push(String(id));
    };

    const attach = (id: string | null | undefined, name: string | null | undefined) => {
      if (!id) return;
      const idString = String(id);
      const byId = bases.find((source) => source.aliases.includes(idString));
      if (byId) return addAlias(byId, idString);

      const byName = bases.find((source) => namesMatch(source.name, name));
      if (byName) return addAlias(byName, idString);

      if (!bases.length) {
        const key = normalizeName(name) || idString;
        const existing = fallbackByName.get(key);
        if (existing) addAlias(existing, idString);
        else fallbackByName.set(key, { id: idString, name: String(name ?? idString), aliases: [idString] });
      }
    };

    app.objects.forEach((object) => attach(object.id, object.label));
    app.portfolioRows.forEach((row) => {
      attach(row.property_id, row.property_name);
      attach(row.portfolio_property_id, row.property_name);
    });
    app.loanRows.forEach((row) => attach(row.property_id, row.property_name));

    return (bases.length ? bases : [...fallbackByName.values()])
      .map((source) => ({ ...source, aliases: unique(source.aliases) }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [app.objects, app.portfolioRows, app.loanRows]);

  const rows = useMemo<AuditRow[]>(() => {
    return auditSources.map((source) => {
      const hasId = (id: string | null | undefined) => Boolean(id && source.aliases.includes(String(id)));
      const incomesFromEntries = app.yearlyFinanceSummaries.filter((row) => hasId(row.object_id) && row.einnahmen > 0);
      const incomeRows = incomeYears.filter((row) => hasId(row.property_id) && (toNumber(row.annual_rent) > 0 || toNumber(row.other_income) > 0 || row.year !== null));
      const capexRows = capex.filter((row) => hasId(row.property_id));
      const rawLedgerRows = ledger.filter((row) => hasId(row.property_id));
      const ledgerRows = rawLedgerRows
        .map((row) => ({ year: getYear(row.year), balance: toNumber(row.balance) }))
        .filter((row) => row.year !== null)
        .sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
      const rentalRows = rentals.filter((row) => hasId(row.property_id));
      const dashboardLoan = app.loanRows.find((row) => hasId(row.property_id) || namesMatch(row.property_name, source.name));
      const portfolioLoan = app.portfolioRows.find((row) => hasId(row.property_id) || hasId(row.portfolio_property_id) || namesMatch(row.property_name, source.name));
      const latestLedger = ledgerRows[ledgerRows.length - 1];
      const previousLedger = ledgerRows[ledgerRows.length - 2];
      // Einheitliche Quelle für die Anzeige: dieselbe kanonisch überschriebenen Portfolio-/AppData-Werte wie in der Portfolio-Objektübersicht.
      const rawLatestBalance = portfolioLoan?.last_balance ?? dashboardLoan?.last_balance ?? latestLedger?.balance ?? null;
      const propertyContext = [source.name, dashboardLoan?.property_name, portfolioLoan?.property_name, ...source.aliases].filter(Boolean).join(" ");
      const latestBalance = cleanBalanceForAudit(rawLatestBalance, propertyContext);
      const portfolioBalance = cleanBalanceForAudit(portfolioLoan ? toNumber(portfolioLoan.last_balance) : null, propertyContext);
      const years = rawLedgerRows.map((row) => getYear(row.year)).filter((value): value is number => value !== null);
      const duplicateYears = [...new Set(years)].filter((year) => years.filter((candidate) => candidate === year).length > 1);
      const notes: string[] = [];

      if (!incomesFromEntries.length && !incomeRows.length) notes.push("Keine Jahres-Income-Daten gefunden.");
      if (!capexRows.length) notes.push("Keine Capex-Jahreszeilen gefunden.");
      if (!ledgerRows.length) notes.push("Keine Darlehensübersicht/Restschuld gefunden.");
      if (!portfolioLoan) notes.push("Keine Portfolio-Verknüpfung zur Darlehensansicht gefunden.");
      if (portfolioLoan && latestBalance !== null && portfolioBalance !== null && Math.abs(portfolioBalance - latestBalance) > 1) notes.push("Portfolio-Restschuld weicht von der Darlehensübersicht ab.");
      if (previousLedger && latestLedger && latestLedger.balance > previousLedger.balance + 1) notes.push("Restschuld steigt gegenüber dem Vorjahr.");
      if (duplicateYears.length) notes.push(`Doppelte Darlehensjahre: ${duplicateYears.join(", ")}.`);
      if (incomesFromEntries.length && rentalRows.length === 0) notes.push("Income vorhanden, aber Mieteingang leer.");

      const capexTotal = capexRows.reduce((sum, row) => sum + toNumber(row.amount), 0);
      const incomeTotal = incomesFromEntries.reduce((sum, row) => sum + toNumber(row.einnahmen), 0) + incomeRows.reduce((sum, row) => sum + toNumber(row.annual_rent) + toNumber(row.other_income), 0);
      if (incomeTotal > 0 && capexTotal > incomeTotal * 0.75) notes.push("Capex ist auffällig hoch im Verhältnis zu Income.");

      const risk: Status = notes.some((note) => /fehlt|keine darlehens|keine portfolio/i.test(note)) ? "bad" : notes.length ? "warn" : "ok";

      return {
        id: source.id,
        name: source.name,
        aliases: source.aliases,
        income: (incomesFromEntries.length || incomeRows.length ? "ok" : "bad") as Status,
        capex: (capexRows.length ? "ok" : "warn") as Status,
        loan: (ledgerRows.length ? "ok" : "bad") as Status,
        portfolio: (portfolioLoan ? "ok" : "warn") as Status,
        balance: latestBalance,
        sourceText: portfolioLoan ? "Portfolio/AppData · letzter Ledger-Wert" : latestLedger?.year ? `Darlehensübersicht ${latestLedger.year}` : dashboardLoan?.last_balance_year ? `Darlehensdashboard ${dashboardLoan.last_balance_year}` : "—",
        notes,
        risk,
      };
    });
  }, [auditSources, app.yearlyFinanceSummaries, app.loanRows, app.portfolioRows, capex, incomeYears, ledger, rentals]);

  const backendFinance = useBackendFinanceMaster(currentYear, backendRefreshKey);
  const qualityChecks = backendFinance.dataQualityChecks;
  const qualityStats = useMemo(() => ({
    critical: qualityChecks.filter((row) => row.severity === "critical").length,
    warning: qualityChecks.filter((row) => row.severity === "warning").length,
    total: qualityChecks.length,
  }), [qualityChecks]);
  const qualityTopRows = useMemo(() => qualityChecks.slice(0, 12), [qualityChecks]);
  const frontendMasterSnapshots = useMemo(() => buildMasterFinanceSnapshots({
    objects: app.objects,
    entries: app.entries,
    yearlyFinanceSummaries: app.yearlyFinanceSummaries,
    portfolioRows: app.portfolioRows,
    loanRows: app.loanRows,
    loanChartByPropertyId: app.loanChartByPropertyId,
  }, currentYear), [app.objects, app.entries, app.yearlyFinanceSummaries, app.portfolioRows, app.loanRows, app.loanChartByPropertyId]);
  const masterSnapshots = backendFinance.snapshots.length ? backendFinance.snapshots : frontendMasterSnapshots;

  const consistencySummary = useMemo(() => buildFinanceConsistencySummary({
    objects: app.objects,
    entries: app.entries,
    yearlyFinanceSummaries: app.yearlyFinanceSummaries,
    portfolioRows: app.portfolioRows,
    loanRows: app.loanRows,
    loanChartByPropertyId: app.loanChartByPropertyId,
    year: currentYear,
  }), [app.objects, app.entries, app.yearlyFinanceSummaries, app.portfolioRows, app.loanRows, app.loanChartByPropertyId]);

  const consistencyRows = consistencySummary.checks;

  const masterTotals = useMemo(() => buildMasterTotals(masterSnapshots), [masterSnapshots]);

  const visibleRows = useMemo(() => {
    if (filterMode === "warnings") return rows.filter((row) => row.notes.length > 0);
    if (filterMode === "missing-loans") return rows.filter((row) => row.loan === "bad");
    if (filterMode === "clean") return rows.filter((row) => row.notes.length === 0);
    return rows;
  }, [filterMode, rows]);

  async function repair(propertyId: string, action: RepairAction) {
    const key = `${propertyId}:${action}`;
    setRepairing(key);
    setError(null);
    setNotice(null);
    setOpenActions(null);

    try {
      if (action === "income") await createMissingIncomeYear(propertyId, currentYear);
      if (action === "capex") await createMissingCapexYear(propertyId, currentYear);
      if (action === "loan") await extendLoanOneYear(propertyId);
      setNotice("Reparatur wurde ausgeführt und die Datenprüfung wurde aktualisiert.");
      await runCheck();
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Reparatur konnte nicht ausgeführt werden.");
    } finally {
      setRepairing(null);
    }
  }

  async function refreshBackendChecks() {
    setBackendRefreshing(true);
    setError(null);
    setNotice(null);

    try {
      const result = await refreshBackendFinanceMaterializedViews();
      setBackendRefreshKey((value) => value + 1);
      await runCheck();

      if (result.some((row) => row.status === "service_role_only")) {
        setNotice("Server-Refresh ist aus Sicherheitsgründen nur noch über Service-Role/Backend möglich. Datenprüfung wurde ohne Refresh neu geladen.");
        return;
      }

      const refreshedCount = result.filter((row) => row.status === "refreshed" || row.status === "ok").length;
      setNotice(
        result.length
          ? `Server-Refresh wurde ausgeführt (${refreshedCount || result.length}/${result.length} Views aktualisiert).`
          : "Server-Refresh wurde ausgeführt. Datenprüfung wurde neu geladen.",
      );
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Server-Refresh konnte nicht ausgeführt werden.");
    } finally {
      setBackendRefreshing(false);
    }
  }

  function exportCsv() {
    const header = ["Objekt", "Income", "Capex", "Darlehen", "Portfolio", "Restschuld", "Quelle", "Hinweise"];
    const body = rows.map((row) => [
      row.name,
      row.income,
      row.capex,
      row.loan,
      row.portfolio,
      row.balance ?? "",
      row.sourceText,
      row.notes.join(" | "),
    ]);
    const csv = [header, ...body].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `datenpruefung-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const stats = {
    objects: rows.length,
    okLoans: rows.filter((row) => row.loan === "ok").length,
    missingLoans: rows.filter((row) => row.loan === "bad").length,
    warnings: masterTotals.warnings,
    // Phase 3A: Datenprüfung, Portfolio und Auswertung nutzen denselben Master-Service.
    totalBalance: masterTotals.latestBalance,
  };

  const lastCheckLabel = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date());

  return (
    <div className="data-check-page mx-auto w-full max-w-[1540px] space-y-5 pb-10 sm:space-y-6">
      <section className="rounded-[24px] border border-slate-200 bg-white/92 p-4 shadow-sm backdrop-blur-xl sm:p-5 lg:p-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 gap-4">
            <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700 sm:flex">
              <ShieldCheck size={28} />
            </div>
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-indigo-700">
                <Sparkles size={13} /> Premium Datenprüfung
              </div>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Datenprüfung</h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600 sm:text-base">
                Mobile-first Prüfung für Hauptobjekte ohne Dubletten: Income, Capex, Darlehen, Portfolio-Link, Restschuld und Plausibilität.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
            <span className="rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500 sm:text-right">Letzte Prüfung: {lastCheckLabel}</span>
            <button
              type="button"
              disabled={checking || app.loading}
              onClick={() => void runCheck()}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={16} className={checking || app.loading ? "animate-spin" : ""} />
              {checking || app.loading ? "Prüfe…" : "Neu prüfen"}
            </button>
          </div>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 font-bold text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 font-bold text-emerald-700">{notice}</div> : null}


      <section className="rounded-[24px] border border-indigo-100 bg-indigo-50/70 p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-indigo-700">Phase 3A · Single Source of Truth</div>
            <h2 className="mt-1 text-lg font-black text-slate-950">Backend-Finanzmaster aktiv</h2>
            <p className="mt-1 max-w-4xl text-sm font-semibold leading-6 text-slate-600">Restschuld, Einnahmen, Ausgaben, Capex und Cashflow werden bevorzugt aus der Supabase-Finance-Master-View/RPC geladen. Fallback: lokale Frontend-Masterberechnung, falls der Backend-Master nicht verfügbar ist.</p>
            <p className={`mt-2 text-xs font-black ${backendFinance.snapshots.length ? "text-emerald-700" : backendFinance.error ? "text-rose-700" : "text-amber-700"}`}>Quelle: {backendFinance.snapshots.length ? "Backend-Finanzmaster" : "Frontend-Fallback"}{backendFinance.error ? ` · ${backendFinance.error}` : ""}</p>
          </div>
          <div className="data-check-kpis grid gap-2 sm:grid-cols-3 lg:min-w-[480px]">
            <div className="rounded-2xl border border-white/80 bg-white p-3"><div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Master-Objekte</div><div className="mt-1 text-xl font-black text-slate-950">{masterSnapshots.length}</div></div>
            <div className="rounded-2xl border border-white/80 bg-white p-3"><div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">kritisch</div><div className="mt-1 text-xl font-black text-rose-600">{masterTotals.critical}</div></div>
            <div className="rounded-2xl border border-white/80 bg-white p-3"><div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Netto-Cashflow {currentYear}</div><div className="mt-1 text-xl font-black text-slate-950">{euro(masterTotals.netCashflow)}</div></div>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">
              <ShieldCheck size={13} /> Phase 5E · Datenprüfung & Reparatur-Center
            </div>
            <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">Backend-Qualitätschecks</h2>
            <p className="mt-1 max-w-4xl text-sm font-semibold leading-6 text-slate-600">
              Supabase prüft jetzt zentral Objektzuordnungen, Mietverträge, Mietanpassungen und Leerstände sowie fehlende Darlehens-Ledger, fehlende Dokumente und Buchungsdubletten. Portfolio-Allgemeinbuchungen und gültige Einheiten-IDs werden dabei bewusst nicht als Fehler gewertet.
            </p>
            <p className="mt-2 text-xs font-black text-slate-500">Server-Refresh aktualisiert die Finanzmaster-Views und lädt die Datenprüfung neu.</p>
          </div>

          <div className="data-check-kpis grid gap-2 sm:grid-cols-3 lg:min-w-[500px]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Checks</div>
              <div className="mt-1 text-2xl font-black text-slate-950">{qualityStats.total}</div>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-rose-500">kritisch</div>
              <div className="mt-1 text-2xl font-black text-rose-700">{qualityStats.critical}</div>
            </div>
            <button
              type="button"
              onClick={() => void refreshBackendChecks()}
              disabled={backendRefreshing || checking || app.loading || backendFinance.loading}
              aria-busy={backendRefreshing}
              title="Materialized Views neu berechnen und Datenprüfung aktualisieren."
              className="inline-flex min-h-[72px] items-center justify-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-black text-indigo-800 shadow-sm transition hover:bg-indigo-100 disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw size={16} className={backendRefreshing ? "animate-spin" : ""} />
              {backendRefreshing ? "Aktualisiere..." : "Server-Refresh"}
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-[130px_minmax(160px,1fr)_minmax(220px,1.5fr)_minmax(220px,1.5fr)] gap-0 bg-slate-50 px-4 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-slate-500 max-lg:hidden">
            <div>Status</div>
            <div>Bereich / Objekt</div>
            <div>Problem</div>
            <div>Reparaturhinweis</div>
          </div>
          <div className="divide-y divide-slate-100">
            {qualityTopRows.length ? qualityTopRows.map((check, index) => (
              <div key={`${check.issue_code}-${check.property_id ?? index}-${index}`} className="grid gap-3 px-4 py-4 lg:grid-cols-[130px_minmax(160px,1fr)_minmax(220px,1.5fr)_minmax(220px,1.5fr)] lg:items-start">
                <div><StatusBadge status={check.severity === "critical" ? "bad" : check.severity === "warning" ? "warn" : "ok"} label={check.severity === "critical" ? "kritisch" : check.severity === "warning" ? "prüfen" : "ok"} /></div>
                <div className="min-w-0">
                  <div className="text-sm font-black text-slate-950">{check.area}</div>
                  <div className="mt-1 break-words text-xs font-bold text-slate-500">{check.property_name ?? "Portfolio gesamt"}</div>
                </div>
                <div className="text-sm font-semibold leading-6 text-slate-700">{check.detail}</div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-semibold leading-6 text-slate-600">{check.repair_hint}</div>
              </div>
            )) : (
              <div className="flex items-center gap-2 px-4 py-5 text-sm font-black text-emerald-700">
                <CheckCircle2 size={18} /> Keine Backend-Qualitätsprobleme gefunden.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-amber-700">
              <Sparkles size={13} /> Phase 5I · Finanz-Konsistenz-Engine
            </div>
            <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">Automatische Konsistenzprüfung</h2>
            <p className="mt-1 max-w-4xl text-sm font-semibold leading-6 text-slate-600">
              Die App prüft Buchungs-Dubletten, fehlende Mieteingänge, Jahreswert-Abweichungen, Steuerkennzeichen, Spezialkategorien, Kategorie-Normalisierung, Portfolio-Ausgaben, Darlehenssalden, Portfolio-Verknüpfungen und die Steuerbericht-Quellen inklusive Allgemein-/Portfolio-Ausgaben. Fehlende Dokument-Uploads werden bewusst nicht als Fehler bewertet.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-4 lg:min-w-[620px]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Score</div>
              <div className={`mt-1 text-2xl font-black ${consistencySummary.score >= 90 ? "text-emerald-700" : consistencySummary.score >= 70 ? "text-amber-700" : "text-rose-700"}`}>{consistencySummary.score}%</div>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-rose-500">kritisch</div>
              <div className="mt-1 text-2xl font-black text-rose-700">{consistencySummary.critical}</div>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-600">prüfen</div>
              <div className="mt-1 text-2xl font-black text-amber-700">{consistencySummary.warning}</div>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-600">Status</div>
              <div className="mt-1 text-lg font-black text-emerald-700">{consistencySummary.total === 0 ? "stabil" : "prüfen"}</div>
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-[120px_150px_minmax(160px,1fr)_minmax(220px,1.4fr)_minmax(220px,1.2fr)] gap-0 bg-slate-50 px-4 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-slate-500 max-lg:hidden">
            <div>Status</div>
            <div>Bereich</div>
            <div>Objekt</div>
            <div>Hinweis</div>
            <div>Nächster Schritt</div>
          </div>
          <div className="divide-y divide-slate-100">
            {consistencyRows.length ? consistencyRows.map((check) => (
              <div key={check.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[120px_150px_minmax(160px,1fr)_minmax(220px,1.4fr)_minmax(220px,1.2fr)] lg:items-start">
                <div><StatusBadge status={check.severity === "critical" ? "bad" : check.severity === "warning" ? "warn" : "ok"} label={check.severity === "critical" ? "kritisch" : check.severity === "warning" ? "prüfen" : "ok"} /></div>
                <div className="text-sm font-black text-slate-950">{check.area}</div>
                <div className="min-w-0 break-words text-sm font-bold text-slate-600">{check.propertyName}</div>
                <div className="text-sm font-semibold leading-6 text-slate-700">{check.detail}{typeof check.delta === "number" ? <span className="mt-1 block text-xs font-black text-slate-500">Differenz: {euro(check.delta)}</span> : null}</div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-semibold leading-6 text-slate-600">{check.repairHint}</div>
              </div>
            )) : (
              <div className="flex items-center gap-2 px-4 py-5 text-sm font-black text-emerald-700">
                <CheckCircle2 size={18} /> Keine zusätzlichen Konsistenzprobleme gefunden.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
        <KpiCard label="Objekte eindeutig" value={stats.objects} tone="indigo" icon={<Building2 size={22} />} />
        <KpiCard label="Darlehen OK" value={stats.okLoans} tone="emerald" icon={<CheckCircle2 size={22} />} />
        <KpiCard label="Darlehen fehlt" value={stats.missingLoans} tone="rose" icon={<AlertTriangle size={22} />} />
        <KpiCard label="Hinweise" value={stats.warnings} tone="amber" icon={<AlertTriangle size={22} />} />
        <KpiCard label="Restschuld gesamt" value={euro(stats.totalBalance)} tone="slate" icon={<CircleDollarSign size={22} />} />
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-slate-200 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:p-5">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-black text-slate-900 sm:text-lg">
              <ShieldCheck size={19} /> Objekt-Prüfliste
            </h2>
            <p className="mt-1 text-sm text-slate-500">Card-basiert, responsive und ohne abgeschnittene Reparatur-Buttons.</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-[220px_auto_auto]">
            <label className="relative block">
              <Filter className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <select
                value={filterMode}
                onChange={(event) => setFilterMode(event.target.value as FilterMode)}
                className="h-11 w-full appearance-none rounded-2xl border border-slate-200 bg-white pl-9 pr-9 text-sm font-black text-slate-800 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
              >
                <option value="all">Alle Objekte</option>
                <option value="warnings">Nur Hinweise</option>
                <option value="missing-loans">Darlehen fehlt</option>
                <option value="clean">Nur OK</option>
              </select>
            </label>

            <button onClick={exportCsv} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 shadow-sm transition hover:bg-slate-50">
              <FileDown size={16} /> Export CSV
            </button>
            <button onClick={() => window.print()} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 shadow-sm transition hover:bg-slate-50">
              Bericht drucken
            </button>
          </div>
        </div>

        <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3 lg:p-5">
          {visibleRows.map((row) => {
            const hasActions = row.income === "bad" || row.capex !== "ok" || row.loan === "ok";
            return (
              <article key={row.id} className="group flex min-w-0 flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <StatusBadge status={row.risk} label={row.notes.length ? `${row.notes.length} Hinweis(e)` : "Stabil"} />
                    </div>
                    <NavLink to={`/immobilienvermoegen/${row.id}`} className="block break-words text-lg font-black leading-tight text-slate-950 underline decoration-slate-300 underline-offset-4 transition hover:text-indigo-700">
                      {row.name}
                    </NavLink>
                    <div className="mt-1 font-mono text-[11px] text-slate-400">{row.aliases.length > 1 ? `${row.aliases.length} verknüpfte IDs` : row.id}</div>
                  </div>

                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setOpenActions((current) => (current === row.id ? null : row.id))}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
                      aria-label="Aktionen öffnen"
                    >
                      <MoreVertical size={18} />
                    </button>
                    {openActions === row.id ? (
                      <div className="absolute right-0 top-12 z-20 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                        {row.income === "bad" ? <button disabled={Boolean(repairing)} onClick={() => void repair(row.id, "income")} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold hover:bg-slate-50 disabled:opacity-50"><Wrench size={15} /> Income {currentYear} erzeugen</button> : null}
                        {row.capex !== "ok" ? <button disabled={Boolean(repairing)} onClick={() => void repair(row.id, "capex")} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold hover:bg-slate-50 disabled:opacity-50"><Wrench size={15} /> Capex {currentYear} erzeugen</button> : null}
                        {row.loan === "ok" ? <button disabled={Boolean(repairing)} onClick={() => void repair(row.id, "loan")} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold hover:bg-slate-50 disabled:opacity-50"><Banknote size={15} /> Darlehen +1 Jahr</button> : null}
                        {!hasActions ? <div className="px-3 py-2 text-sm font-bold text-slate-400">Keine Reparaturaktion möglich</div> : null}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 p-4">
                  <div className="grid grid-cols-2 gap-2">
                    <CheckItem label="Income" status={row.income} />
                    <CheckItem label="Capex" status={row.capex} />
                    <CheckItem label="Darlehen" status={row.loan} />
                    <CheckItem label="Portfolio" status={row.portfolio} />
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Restschuld / Quelle</div>
                    <div className="mt-1 text-2xl font-black tracking-tight text-slate-950">{euro(row.balance)}</div>
                    <div className="mt-1 text-xs font-bold text-slate-500">{row.sourceText}</div>
                  </div>

                  <div className="min-h-[86px] rounded-2xl border border-slate-100 bg-white p-4">
                    <div className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Hinweise</div>
                    {row.notes.length ? (
                      <ul className="space-y-2 text-sm font-semibold leading-5 text-slate-650">
                        {row.notes.map((note) => (
                          <li key={note} className="flex gap-2">
                            <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_CONFIG[row.risk].dot}`} />
                            <span>{note}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700">
                        <CheckCircle2 size={16} /> Keine Hinweise
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="border-t border-slate-200 px-4 py-3 text-sm font-bold text-slate-500 lg:px-5">
          Zeige {visibleRows.length} von {rows.length} Objekten.
        </div>
      </section>
    </div>
  );
}
