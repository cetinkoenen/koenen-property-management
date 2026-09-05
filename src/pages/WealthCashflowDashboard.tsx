import { useEffect, useMemo, useState } from "react";
import { BarChart3, RefreshCw, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { canonicalizeFinanceCategory, isPureRentBackPayment, normalizeFinanceCategoryText } from "@/lib/financeCategories";
import { listLoanRatePlanRowsForYear, resolveLoanProperty, type LoanRatePlanRow } from "@/services/loanRatePlanService";
import { useAppData, type AppObject, type FinanceEntry } from "@/state/AppDataContext";

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const PIE_COLORS = ["#0f766e", "#2563eb", "#d97706", "#7c3aed", "#64748b"];

function euro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(value || 0);
}

function normalized(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function entryBelongsToObject(entry: FinanceEntry, object: AppObject, getPropertyName: (id: string | null | undefined) => string) {
  if (entry.object_id === object.id || (entry.objekt_code && entry.objekt_code === object.code)) return true;
  const source = normalized(`${getPropertyName(entry.object_id)} ${entry.objekt_code ?? ""}`);
  return [object.label, object.code, ...(object.aliases ?? [])].filter(Boolean).some((candidate) => {
    const target = normalized(candidate);
    return target.length > 3 && (source.includes(target) || target.includes(source));
  });
}

function loanBelongsToObject(row: LoanRatePlanRow, object: AppObject) {
  if (row.property_id === object.id || row.object_id === object.id || (row.objekt_code && row.objekt_code === object.code)) return true;
  const objectKey = resolveLoanProperty(object.label)?.key;
  return Boolean(objectKey && objectKey === row.property_key);
}

function isRent(entry: FinanceEntry) {
  if (entry.entry_type !== "income" || isPureRentBackPayment(entry.category, entry.note)) return false;
  const category = normalizeFinanceCategoryText(canonicalizeFinanceCategory(entry.category, "income"));
  return category === "miete" || category === "miete garage" || category.includes("mieteinnahme");
}

function expenseBucket(entry: FinanceEntry) {
  const value = normalizeFinanceCategoryText(`${entry.category ?? ""} ${entry.note ?? ""}`);
  if (value.includes("grundsteuer")) return "Grundsteuer";
  if (value.includes("verwaltung")) return "Verwaltungskosten";
  if (value.includes("versicherung")) return "Versicherungen";
  if (value.includes("abfall") || value.includes("mull") || value.includes("muell")) return "Abfallgebühren";
  return "Sonstiges";
}

function Filters({ objects, propertyId, year, years, onProperty, onYear }: {
  objects: AppObject[]; propertyId: string; year: number; years: number[];
  onProperty: (value: string) => void; onYear: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <select aria-label="Immobilie" value={propertyId} onChange={(event) => onProperty(event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-800 shadow-sm">
        <option value="all">Alle Immobilien</option>
        {objects.map((object) => <option key={object.id} value={object.id}>{object.label}</option>)}
      </select>
      <select aria-label="Jahr" value={year} onChange={(event) => onYear(Number(event.target.value))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-800 shadow-sm">
        {years.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </div>
  );
}

function ChartCard({ title, description, actions, children }: { title: string; description: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div><h2 className="text-xl font-black text-slate-950">{title}</h2><p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{description}</p></div>
        {actions}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function WealthCashflowDashboard() {
  const { objects, entries, getPropertyName, loading } = useAppData();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [propertyId, setPropertyId] = useState("all");
  const [loanRows, setLoanRows] = useState<LoanRatePlanRow[]>([]);
  const [loanError, setLoanError] = useState<string | null>(null);
  const [loanLoading, setLoanLoading] = useState(true);

  const years = useMemo(() => Array.from(new Set([currentYear, ...entries.map((entry) => Number(entry.booking_date?.slice(0, 4))).filter(Number.isFinite)])).sort((a, b) => b - a), [currentYear, entries]);
  const selectedObject = objects.find((object) => object.id === propertyId) ?? null;

  async function loadLoans() {
    setLoanLoading(true);
    setLoanError(null);
    try { setLoanRows(await listLoanRatePlanRowsForYear(year)); }
    catch (error) { setLoanRows([]); setLoanError(error instanceof Error ? error.message : String(error)); }
    finally { setLoanLoading(false); }
  }

  useEffect(() => {
    let alive = true;
    listLoanRatePlanRowsForYear(year)
      .then((rows) => { if (alive) { setLoanRows(rows); setLoanError(null); } })
      .catch((error) => { if (alive) { setLoanRows([]); setLoanError(error instanceof Error ? error.message : String(error)); } })
      .finally(() => { if (alive) setLoanLoading(false); });
    return () => { alive = false; };
  }, [year]);

  const scopedEntries = useMemo(() => entries.filter((entry) => entry.booking_date?.startsWith(`${year}-`) && (!selectedObject || entryBelongsToObject(entry, selectedObject, getPropertyName))), [entries, getPropertyName, selectedObject, year]);
  const scopedLoans = useMemo(() => loanRows.filter((row) => !selectedObject || loanBelongsToObject(row, selectedObject)), [loanRows, selectedObject]);
  const monthly = useMemo(() => MONTHS.map((month, index) => {
    const monthNumber = index + 1;
    const monthEntries = scopedEntries.filter((entry) => Number(entry.booking_date?.slice(5, 7)) === monthNumber);
    const income = monthEntries.filter((entry) => entry.entry_type === "income").reduce((sum, entry) => sum + Math.abs(entry.amount), 0);
    const expenses = monthEntries.filter((entry) => entry.entry_type === "expense").reduce((sum, entry) => sum + Math.abs(entry.amount), 0);
    const rent = monthEntries.filter(isRent).reduce((sum, entry) => sum + Math.abs(entry.amount), 0);
    const annuity = scopedLoans.filter((row) => Number(row.plan_month ?? row.plan_date.slice(5, 7)) === monthNumber).reduce((sum, row) => sum + Math.abs(Number(row.payment_amount || 0)), 0);
    return { month, income, expenses, cashflow: income - expenses, rent, annuity, surplus: rent - annuity };
  }), [scopedEntries, scopedLoans]);
  const cumulative = useMemo(() => monthly.reduce<Array<{ month: string; value: number }>>((rows, row) => [
    ...rows,
    { month: row.month, value: (rows.at(-1)?.value ?? 0) + row.cashflow },
  ], []), [monthly]);
  const expenseData = useMemo(() => {
    const totals = new Map<string, number>([["Grundsteuer", 0], ["Verwaltungskosten", 0], ["Versicherungen", 0], ["Abfallgebühren", 0], ["Sonstiges", 0]]);
    scopedEntries.filter((entry) => entry.entry_type === "expense").forEach((entry) => totals.set(expenseBucket(entry), (totals.get(expenseBucket(entry)) ?? 0) + Math.abs(entry.amount)));
    return Array.from(totals, ([name, value]) => ({ name, value })).filter((row) => row.value > 0);
  }, [scopedEntries]);
  const totals = useMemo(() => monthly.reduce((result, row) => ({ annuity: result.annuity + row.annuity, rent: result.rent + row.rent, surplus: result.surplus + row.surplus }), { annuity: 0, rent: 0, surplus: 0 }), [monthly]);
  const filters = <Filters objects={objects} propertyId={propertyId} year={year} years={years} onProperty={setPropertyId} onYear={setYear} />;

  return (
    <div className="mx-auto max-w-[1760px] space-y-5">
      <section className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-xs font-black uppercase tracking-[.12em] text-teal-800"><TrendingUp size={15}/> Cockpit</div><h1 className="mt-4 text-3xl font-black text-slate-950">Vermögensübersicht & Cashflow-Dashboard</h1><p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-slate-600">Ist-Buchungen und importierte Darlehens-Tilgungspläne werden live aggregiert. Es gibt keine zweite Report-Datenquelle.</p></div><button type="button" onClick={() => void loadLoans()} disabled={loanLoading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black"><RefreshCw size={16}/> Aktualisieren</button></div>
      </section>
      {loanError ? <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">Darlehens-Tilgungspläne konnten nicht geladen werden: {loanError}</div> : null}
      <ChartCard title="Mieteinnahmen vs. Kreditrate" description="Monatlicher Soll-/Ist-Vergleich aus Buchungen und Darlehens-Tilgungsplan." actions={filters}>
        <div className="h-[340px] min-w-0"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthly}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="month"/><YAxis tickFormatter={(v) => `${Math.round(v / 1000)} T€`}/><Tooltip formatter={(v) => euro(Number(v))}/><Legend/><Bar dataKey="rent" name="Mieteinnahmen" fill="#0f766e" radius={[5,5,0,0]}/><Bar dataKey="annuity" name="Annuität" fill="#d97706" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200"><table className="w-full min-w-[980px] text-sm"><thead><tr className="bg-slate-50 text-slate-500"><th className="px-4 py-3 text-left">Kennzahl</th>{MONTHS.map((month) => <th key={month} className="px-3 py-3 text-right">{month}</th>)}<th className="px-4 py-3 text-right">Summe</th></tr></thead><tbody>{([['Annuität','annuity',totals.annuity],['Mieteinnahmen','rent',totals.rent],['Überschuss','surplus',totals.surplus]] as const).map(([label,key,total]) => <tr key={label} className="border-t border-slate-100"><th className="px-4 py-3 text-left font-black">{label}</th>{monthly.map((row) => <td key={row.month} className="px-3 py-3 text-right tabular-nums">{euro(row[key])}</td>)}<td className="px-4 py-3 text-right font-black tabular-nums">{euro(total)}</td></tr>)}</tbody></table></div>
      </ChartCard>
      <ChartCard title="Cashflow-Detailansicht" description="Gesamte Einnahmen, gesamte Ausgaben und tatsächlicher Netto-Cashflow pro Monat." actions={filters}>
        <div className="h-[350px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthly}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="month"/><YAxis tickFormatter={(v) => `${Math.round(v / 1000)} T€`}/><Tooltip formatter={(v) => euro(Number(v))}/><Legend/><Bar dataKey="income" name="Einnahmen" fill="#059669"/><Bar dataKey="expenses" name="Ausgaben" fill="#dc2626"/><Bar dataKey="cashflow" name="Cashflow" fill="#2563eb"/></BarChart></ResponsiveContainer></div>
      </ChartCard>
      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Kumulierter Cashflow" description="Fortlaufender Saldo von Januar bis Dezember." actions={<Filters objects={objects} propertyId={propertyId} year={year} years={years} onProperty={setPropertyId} onYear={setYear}/>}><div className="h-[330px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={cumulative}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="month"/><YAxis tickFormatter={(v) => `${Math.round(v / 1000)} T€`}/><Tooltip formatter={(v) => euro(Number(v))}/><Line type="monotone" dataKey="value" name="Kumulierter Cashflow" stroke="#0f766e" strokeWidth={3} dot={{ r: 4 }}/></LineChart></ResponsiveContainer></div></ChartCard>
        <ChartCard title="Ausgabenverteilung" description="Betriebskosten aus Buchungen, einschließlich NK-relevanter Datensätze." actions={filters}><div className="h-[330px]">{expenseData.length ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={expenseData} dataKey="value" nameKey="name" outerRadius={105} label={({ name }) => name}>{expenseData.map((row, index) => <Cell key={row.name} fill={PIE_COLORS[index % PIE_COLORS.length]}/>)}</Pie><Tooltip formatter={(v) => euro(Number(v))}/><Legend/></PieChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center rounded-2xl bg-slate-50 text-sm font-bold text-slate-500">Keine Ausgaben im gewählten Zeitraum.</div>}</div></ChartCard>
      </div>
      {(loading || loanLoading) ? <div className="text-center text-sm font-bold text-slate-500"><BarChart3 className="mr-2 inline" size={16}/>Daten werden aktualisiert…</div> : null}
    </div>
  );
}
