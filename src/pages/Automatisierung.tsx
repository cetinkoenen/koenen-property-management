import { useMemo, useState } from "react";
import { useAppData, type FinanceEntry } from "../state/AppDataContext";

type MonthRow = { month: number; income: number; expenses: number; rent: number; net: number; rentDay: number | null; rentStatus: "ok" | "late" | "critical" | "missing" | "unknown" | "future" };
type PropertyAutomationRow = {
  propertyId: string;
  propertyName: string;
  income: number;
  expenses: number;
  rentIncome: number;
  nkExpenses: number;
  capexLike: number;
  hausgeldLike: number;
  expectedRent: number;
  paidRent: number;
  rentGap: number;
  missingMonths: number[];
  monthly: MonthRow[];
};

const RENT_WORDS = ["miete", "kaltmiete", "warmmiete", "garage", "pacht"];
const CAPEX_WORDS = ["reparatur", "instand", "sanierung", "renovierung", "wartung", "handwerker", "therme", "schornstein", "dach", "fenster", "tür", "tür"];
const HAUSGELD_WORDS = [
  "hausgeld",
  "wohngeld",
  "hausverwaltung",
  "hausverwalter",
  "verwalter",
  "weg",
  "wirtschaftsplan",
  "treis",
  "gies wohnbau",
];
const RUECKLAGE_WORDS = ["rücklage", "ruecklage", "erhaltungsrücklage", "erhaltungsruecklage", "zuführung", "zufuehrung"];
const MONTH_NAMES = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];
const NK_WORDS = ["grundsteuer", "wasser", "abwasser", "müll", "muell", "versicherung", "hausstrom", "straßenreinigung", "strassenreinigung", "garten", "reinigung", "schornstein", "therme", "rauchwarn", "wartung"];


function normalizeKey(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll("ß", "ss")
    .replace(/[ä]/g, "a")
    .replace(/[ö]/g, "o")
    .replace(/[ü]/g, "u")
    .replace(/strasse/g, "str")
    .replace(/straße/g, "str")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function localNamesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeKey(a);
  const right = normalizeKey(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}
function entriesForObjectStrict(entries: FinanceEntry[], object: { id: string; code: string | null; label: string; aliases?: string[] }) {
  const objectId = String(object.id);
  const objectCode = object.code;
  const objectLabel = object.label;
  const aliases = Array.from(new Set([objectId, objectCode, objectLabel, ...(object.aliases ?? [])].map((value) => String(value ?? "").trim()).filter(Boolean)));
  return entries.filter((entry) => {
    const entryObjectId = String(entry.object_id ?? "");
    if (entryObjectId && aliases.includes(entryObjectId)) return true;
    const code = String(entry.objekt_code ?? "");
    if (code && aliases.some((alias) => localNamesMatch(code, alias))) return true;
    return false;
  });
}
function dayOf(date: string | null) {
  const d = Number(String(date ?? "").slice(8, 10));
  return Number.isFinite(d) && d >= 1 && d <= 31 ? d : null;
}
function classifyRentMonth(
  rent: number,
  expectedRent: number,
  firstRentDay: number | null,
  month: number,
  selectedYear: number,
  referenceDate: Date
): MonthRow["rentStatus"] {
  if (expectedRent <= 0) return "unknown";
  const referenceYear = referenceDate.getFullYear();
  const referenceMonth = referenceDate.getMonth() + 1;
  const referenceDay = referenceDate.getDate();
  const isFutureMonth = selectedYear > referenceYear || (selectedYear === referenceYear && month > referenceMonth);
  const isCurrentMonthBeforeGracePeriod = selectedYear === referenceYear && month === referenceMonth && referenceDay <= 7;

  if (isFutureMonth) return "future";
  if (rent + 1 < expectedRent * 0.85) {
    return isCurrentMonthBeforeGracePeriod ? "unknown" : "missing";
  }
  if (!firstRentDay) return "unknown";
  if (firstRentDay <= 7) return "ok";
  if (firstRentDay <= 14) return "late";
  return "critical";
}

function textOf(entry: FinanceEntry) {
  return `${entry.category ?? ""} ${entry.note ?? ""}`.toLowerCase();
}
function hasAny(entry: FinanceEntry, words: string[]) {
  const t = textOf(entry);
  return words.some((word) => t.includes(word));
}
function yearOf(date: string | null) {
  const y = Number(String(date ?? "").slice(0, 4));
  return Number.isFinite(y) && y > 1900 ? y : null;
}
function monthOf(date: string | null) {
  const m = Number(String(date ?? "").slice(5, 7));
  return Number.isFinite(m) && m >= 1 && m <= 12 ? m : null;
}
function eur(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number.isFinite(value) ? value : 0);
}
function pct(value: number) {
  return `${Number.isFinite(value) ? value.toFixed(1).replace(".", ",") : "0,0"} %`;
}
function monthLabel(month: number) {
  return MONTH_NAMES[month - 1] ?? String(month).padStart(2, "0");
}
function monthListLabel(months: number[]) {
  if (!months.length) return "keine";
  return months.map(monthLabel).join(", ");
}
function rentStatus(row: PropertyAutomationRow) {
  if (row.expectedRent <= 0) return "Keine Sollmiete ermittelbar";
  const problematic = row.monthly.filter((m) => ["late", "critical", "missing"].includes(m.rentStatus));
  if (row.rentGap >= -1 && problematic.length === 0) return "OK";
  if (row.rentGap < -1) return `Differenz ${eur(row.rentGap)}`;
  return `${problematic.length} Monat(e) prüfen`;
}
function rentStatusHint(row: PropertyAutomationRow) {
  if (row.expectedRent <= 0) return "Keine regelmäßige Sollmiete erkannt.";
  return `Soll ${eur(row.expectedRent)} · Ist ${eur(row.paidRent)}`;
}
function rentLegendText() {
  return "Grün = Zahlung bis 7. Tag · Gelb = 8.–14. Tag · Rot = überfällig/fehlend · Grau = zukünftiger Monat";
}
function csvCell(value: unknown) {
  const raw = String(value ?? "");
  return `"${raw.replace(/"/g, '""')}"`;
}
function median(values: number[]) {
  const sorted = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function download(filename: string, content: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob(["\uFEFF" + content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function AutomationAnalytics({ embedded = false }: { embedded?: boolean } = {}) {
  const app = useAppData();
  const today = useMemo(() => new Date(), []);
  const currentYear = today.getFullYear();
  const [year, setYear] = useState(currentYear);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("all");

  const rows = useMemo<PropertyAutomationRow[]>(() => {
    return app.objects.map((object) => {
      const entries = entriesForObjectStrict(app.entries, object).filter((entry) => yearOf(entry.booking_date) === year);
      const incomeEntries = entries.filter((entry) => entry.entry_type === "income");
      const expenseEntries = entries.filter((entry) => entry.entry_type === "expense");
      const rentEntries = incomeEntries.filter((entry) => hasAny(entry, RENT_WORDS));
      const baseMonthly = Array.from({ length: 12 }, (_, index) => {
        const month = index + 1;
        const monthEntries = entries.filter((entry) => monthOf(entry.booking_date) === month);
        const income = monthEntries.filter((entry) => entry.entry_type === "income").reduce((sum, entry) => sum + entry.amount, 0);
        const expenses = monthEntries.filter((entry) => entry.entry_type === "expense").reduce((sum, entry) => sum + entry.amount, 0);
        const rentMonthEntries = monthEntries.filter((entry) => entry.entry_type === "income" && hasAny(entry, RENT_WORDS));
        const rent = rentMonthEntries.reduce((sum, entry) => sum + entry.amount, 0);
        const rentDays = rentMonthEntries.map((entry) => dayOf(entry.booking_date)).filter((value): value is number => value !== null);
        const rentDay = rentDays.length ? Math.min(...rentDays) : null;
        return { month, income, expenses, rent, net: income - expenses, rentDay, rentStatus: "unknown" as const };
      });
      const expectedRent = median(baseMonthly.map((m) => m.rent).filter((v) => v > 0));
      const monthly = baseMonthly.map((m) => ({ ...m, rentStatus: classifyRentMonth(m.rent, expectedRent, m.rentDay, m.month, year, today) }));
      const paidRent = rentEntries.reduce((sum, entry) => sum + entry.amount, 0);
      const dueMonthsCount = monthly.filter((m) => m.rentStatus !== "future").length;
      const expectedYearRent = expectedRent * dueMonthsCount;
      const missingMonths = expectedRent > 0 ? monthly.filter((m) => m.rentStatus === "missing").map((m) => m.month) : [];
      return {
        propertyId: object.id,
        propertyName: object.label,
        income: incomeEntries.reduce((sum, entry) => sum + entry.amount, 0),
        expenses: expenseEntries.reduce((sum, entry) => sum + entry.amount, 0),
        rentIncome: paidRent,
        nkExpenses: expenseEntries.filter((entry) => hasAny(entry, NK_WORDS)).reduce((sum, entry) => sum + entry.amount, 0),
        capexLike: expenseEntries.filter((entry) => hasAny(entry, CAPEX_WORDS)).reduce((sum, entry) => sum + entry.amount, 0),
        hausgeldLike: expenseEntries.filter((entry) => hasAny(entry, HAUSGELD_WORDS) || hasAny(entry, RUECKLAGE_WORDS)).reduce((sum, entry) => sum + entry.amount, 0),
        expectedRent: expectedYearRent,
        paidRent,
        rentGap: expectedYearRent > 0 ? paidRent - expectedYearRent : 0,
        missingMonths,
        monthly,
      };
    }).filter((row) => row.income || row.expenses || row.rentIncome);
  }, [app, year, today]);

  const visibleRows = useMemo(
    () => selectedPropertyId === "all" ? rows : rows.filter((row) => row.propertyId === selectedPropertyId),
    [rows, selectedPropertyId],
  );
  const totals = visibleRows.reduce((acc, row) => ({
    income: acc.income + row.income,
    expenses: acc.expenses + row.expenses,
    rent: acc.rent + row.rentIncome,
    nk: acc.nk + row.nkExpenses,
    capex: acc.capex + row.capexLike,
    hausgeld: acc.hausgeld + row.hausgeldLike,
    rentGap: acc.rentGap + row.rentGap,
  }), { income: 0, expenses: 0, rent: 0, nk: 0, capex: 0, hausgeld: 0, rentGap: 0 });
  const net = totals.income - totals.expenses;
  const rentCollectionRate = totals.rent - totals.rentGap > 0 ? (totals.rent / (totals.rent - totals.rentGap)) * 100 : 0;

  const qualityChecks = useMemo(() => {
    const selectedIds = new Set(visibleRows.map((row) => row.propertyId));
    const relevantEntries = app.entries.filter((entry) => !selectedIds.size || selectedIds.has(String(entry.object_id ?? "")) || selectedPropertyId === "all");
    return {
      missingObject: relevantEntries.filter((entry) => !entry.object_id && !entry.objekt_code).length,
      missingCategory: relevantEntries.filter((entry) => !entry.category).length,
      missingDate: relevantEntries.filter((entry) => !entry.booking_date).length,
      uncategorizedExpense: relevantEntries.filter((entry) => entry.entry_type === "expense" && !hasAny(entry, [...NK_WORDS, ...CAPEX_WORDS, ...HAUSGELD_WORDS])).length,
    };
  }, [app.entries, selectedPropertyId, visibleRows]);

  function exportCsv() {
    const header = ["Objekt", "Jahr", "Einnahmen", "Ausgaben", "Cashflow", "Mieten", "NK-Kosten", "Capex/Wartung", "Hausgeld/WEG", "Mietdifferenz", "fehlende Monate"];
    const lines = [header.map(csvCell).join(";")];
    for (const row of visibleRows) {
      lines.push([
        row.propertyName,
        year,
        row.income,
        row.expenses,
        row.income - row.expenses,
        row.rentIncome,
        row.nkExpenses,
        row.capexLike,
        row.hausgeldLike,
        row.rentGap,
        monthListLabel(row.missingMonths),
      ].map(csvCell).join(";"));
    }
    download(`koenen-automatisierung-${year}.csv`, lines.join("\n"));
  }

  function printReport() {
    window.print();
  }

  if (app.loading) return <div className="rounded-[28px] border border-slate-200 bg-white p-8 font-bold text-slate-600 shadow-sm">Automatisierungsdaten werden geladen …</div>;
  if (app.error) return <div className="rounded-[28px] border border-red-200 bg-red-50 p-8 font-bold text-red-800 shadow-sm">{app.error}</div>;

  return (
    <div className="space-y-6 automation-page">
      {!embedded ? <section className="rounded-[30px] border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6 shadow-sm md:p-8">
        <div className="inline-flex rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-indigo-700">Interne Verwaltung</div>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">Automatisierung & Prüfcenter</h1>
            <p className="mt-3 max-w-4xl text-slate-600">Professionelles Prüfcenter auf Basis der echten Buchungen: Mietzahlungen, Hausgeld/WEG, Buchungsqualität, Capex, Cashflow und Liquiditätsverlauf. Bestehende NK-Funktionen bleiben unverändert.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <select className="rounded-2xl border border-slate-300 bg-white px-4 py-3 font-bold" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {Array.from({ length: 7 }, (_, i) => currentYear - 4 + i).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select className="rounded-2xl border border-slate-300 bg-white px-4 py-3 font-bold" value={selectedPropertyId} onChange={(e) => setSelectedPropertyId(e.target.value)}>
              <option value="all">Alle Objekte</option>
              {app.objects.map((object) => <option key={object.id} value={object.id}>{object.label}</option>)}
            </select>
            <button onClick={exportCsv} className="rounded-2xl bg-slate-900 px-4 py-3 font-extrabold text-white">CSV exportieren</button>
            <button onClick={printReport} className="rounded-2xl border border-slate-300 bg-white px-4 py-3 font-extrabold text-slate-900">Drucken/PDF</button>
          </div>
        </div>
      </section> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi title="Jahres-Cashflow" value={eur(net)} hint="Einnahmen minus Ausgaben" positive={net >= 0} />
        <Kpi title="Mieten gebucht" value={eur(totals.rent)} hint={`geschätzte Quote ${pct(rentCollectionRate)}`} />
        <Kpi title="NK-/Betriebskosten" value={eur(totals.nk)} hint="automatisch aus Kostenbegriffen erkannt" />
        <Kpi title="Hausgeld/WEG" value={eur(totals.hausgeld)} hint="inkl. Hausverwaltung, WEG, Rücklage/Wirtschaftsplan" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-950">Objekt-Jahresübersicht</h2>
              <p className="text-sm font-semibold text-slate-500">Jahreswerte {year} · Hausgeld wird u.a. über „Hausverwaltung“, „Hausgeld“, „WEG“ und „Wirtschaftsplan“ erkannt. · {rentLegendText()}</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-separate border-spacing-0 text-left text-sm">
              <thead><tr className="text-xs uppercase tracking-wide text-slate-500"><Th>Objekt</Th><Th>Einnahmen</Th><Th>Ausgaben</Th><Th>Cashflow</Th><Th>Miete</Th><Th>NK</Th><Th>Capex</Th><Th>Hausgeld/WEG</Th><Th>Mietcheck</Th></tr></thead>
              <tbody>{visibleRows.map((row) => <tr key={row.propertyId} className="border-t border-slate-100"><Td strong>{row.propertyName}</Td><Td>{eur(row.income)}</Td><Td>{eur(row.expenses)}</Td><Td good={row.income - row.expenses >= 0}>{eur(row.income - row.expenses)}</Td><Td>{eur(row.rentIncome)}</Td><Td>{eur(row.nkExpenses)}</Td><Td>{eur(row.capexLike)}</Td><Td>{eur(row.hausgeldLike)}</Td><Td><RentTrafficLight row={row} /></Td></tr>)}</tbody>
            </table>
          </div>
        </div>

        <div className="space-y-5">
          <Panel title="Funktionaler Check">
            <CheckLine label="Buchungen ohne Objekt" value={qualityChecks.missingObject} critical={qualityChecks.missingObject > 0} />
            <CheckLine label="Buchungen ohne Kategorie" value={qualityChecks.missingCategory} critical={qualityChecks.missingCategory > 0} />
            <CheckLine label="Buchungen ohne Datum" value={qualityChecks.missingDate} critical={qualityChecks.missingDate > 0} />
            <CheckLine label="Ausgaben ohne klare Zuordnung" value={qualityChecks.uncategorizedExpense} critical={qualityChecks.uncategorizedExpense > 0} />
          </Panel>
          <Panel title="Automatik-Empfehlungen">
            <ul className="space-y-2 text-sm font-semibold text-slate-600">
              <li>• Fehlende Monate in der Mietenprüfung zuerst kontrollieren.</li>
              <li>• Capex/Wartung prüfen: umlagefähig nur bei Wartung, nicht bei Instandsetzung.</li>
              <li>• Hausgeld/Rücklage getrennt halten: Rücklage nie in Mieter-NK übernehmen.</li>
              <li>• CSV-Export für Excel-/Steuerprüfung nutzen.</li>
            </ul>
          </Panel>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black text-slate-950">Liquiditätsverlauf je Objekt nach Monaten · {year}</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {visibleRows.slice(0, 6).map((row) => <MonthlyCard key={row.propertyId} row={row} />)}
        </div>
      </section>
    </div>
  );
}

function Kpi({ title, value, hint, positive }: { title: string; value: string; hint: string; positive?: boolean }) {
  return <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">{title}</p><p className={`mt-3 text-2xl font-black ${positive === false ? "text-red-700" : "text-slate-950"}`}>{value}</p><p className="mt-2 text-sm font-semibold text-slate-500">{hint}</p></div>;
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-black text-slate-950">{title}</h2><div className="mt-4">{children}</div></div>; }
function CheckLine({ label, value, critical }: { label: string; value: number; critical: boolean }) { return <div className="flex items-center justify-between border-t border-slate-100 py-3 first:border-t-0"><span className="font-semibold text-slate-600">{label}</span><span className={`rounded-full px-3 py-1 text-sm font-black ${critical ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{critical ? value : "OK"}</span></div>; }
function Th({ children }: { children: React.ReactNode }) { return <th className="border-b border-slate-200 px-3 py-3 font-black">{children}</th>; }
function Td({ children, strong, good }: { children: React.ReactNode; strong?: boolean; good?: boolean }) { return <td className={`border-b border-slate-100 px-3 py-3 align-middle ${strong ? "font-black text-slate-950" : "font-semibold text-slate-700"} ${good === true ? "text-emerald-700" : good === false ? "text-red-700" : ""}`}>{children}</td>; }
function rentDotClass(status: MonthRow["rentStatus"]) {
  if (status === "ok") return "bg-emerald-500 text-white border-emerald-600";
  if (status === "late") return "bg-amber-400 text-amber-950 border-amber-500";
  if (status === "critical" || status === "missing") return "bg-red-500 text-white border-red-600";
  if (status === "future") return "bg-slate-100 text-slate-400 border-slate-200";
  return "bg-slate-200 text-slate-600 border-slate-300";
}
function RentTrafficLight({ row }: { row: PropertyAutomationRow }) {
  return <div className="min-w-[260px]">
    <div className="mb-2 flex items-center justify-between gap-3">
      <span className={`rounded-full px-3 py-1 text-xs font-black ${row.rentGap >= -1 && row.missingMonths.length === 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{rentStatus(row)}</span>
      <span className="text-xs font-bold text-slate-500">{rentStatusHint(row)}</span>
    </div>
    <div className="grid grid-cols-12 gap-1">
      {row.monthly.map((m) => {
        const title = m.rentStatus === "future" ? `${monthLabel(m.month)}: zukünftiger Monat, noch nicht fällig` : `${monthLabel(m.month)}: ${eur(m.rent)}${m.rentDay ? ` · Zahlungstag ${m.rentDay}` : " · keine Mietzahlung erkannt"}`;
        return <span key={m.month} title={title} className={`flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-black ${rentDotClass(m.rentStatus)}`}>{m.month}</span>;
      })}
    </div>
  </div>;
}
function MonthlyCard({ row }: { row: PropertyAutomationRow }) { const maxAbs = Math.max(...row.monthly.map((m) => Math.abs(m.net)), 1); return <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-black text-slate-950">{row.propertyName}</h3><p className="text-xs font-semibold text-slate-500">Echte Buchungen dieses Objekts · Einnahmen minus Ausgaben</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${row.income - row.expenses >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{eur(row.income - row.expenses)}</span></div><div className="mt-3 grid gap-2">{row.monthly.map((m) => <div key={m.month} className="grid grid-cols-[54px_1fr_110px] items-center gap-3 text-sm"><span className="font-black text-slate-500">{monthLabel(m.month)}</span><div className="h-3 overflow-hidden rounded-full bg-white"><div className={`h-full rounded-full ${m.net >= 0 ? "bg-emerald-500" : "bg-red-400"}`} style={{ width: `${Math.max(4, Math.min(100, (Math.abs(m.net) / maxAbs) * 100))}%` }} /></div><span className={`text-right font-black ${m.net >= 0 ? "text-emerald-700" : "text-red-700"}`}>{eur(m.net)}</span></div>)}</div></div>; }


export default function Automatisierung() {
  return <AutomationAnalytics />;
}
