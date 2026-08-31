import { supabase } from "@/lib/supabase";
import { canonicalizeFinanceCategory } from "@/lib/financeCategories";

export type LoanRatePlanRow = {
  id?: string;
  user_id?: string;
  property_id: string | null;
  object_id: string | null;
  objekt_code: string | null;
  property_key: string;
  property_name: string;
  plan_date: string;
  plan_year?: number;
  plan_month?: number;
  opening_balance: number | null;
  payment_amount: number;
  interest_amount: number;
  fee_amount: number;
  principal_amount: number;
  closing_balance: number | null;
  source_file: string;
  source_row: number;
  source_kind: "csv" | "manual";
  quality_status: "ok" | "warning";
  quality_note: string | null;
};

export type LoanObjectBridgeRow = {
  property_name: string | null;
  objekt_code: string | null;
  object_id: string | null;
  property_id: string | null;
};

export type ParsedLoanRatePlan = {
  propertyKey: string;
  propertyName: string;
  sourceFile: string;
  rows: LoanRatePlanRow[];
  warnings: string[];
};

const MONTHS: Record<string, number> = {
  januar: 1,
  februar: 2,
  marz: 3,
  maerz: 3,
  märz: 3,
  april: 4,
  mai: 5,
  juni: 6,
  juli: 7,
  august: 8,
  september: 9,
  oktober: 10,
  november: 11,
  dezember: 12,
};

const PROPERTY_DEFINITIONS = [
  { key: "colmarer-str-45", name: "Colmarer Str. 45", terms: ["colmarer"] },
  { key: "elsasser-str-52", name: "Elsasser Str. 52", terms: ["elsasser", "elsaesser"] },
  { key: "fuerther-str-74", name: "Fürther Str. 74", terms: ["furthere", "further", "fuerther", "fürther"] },
  { key: "hohenloher-str-78", name: "Hohenloher Str. 78", terms: ["hohenloher"] },
  { key: "lilienthaler-str-54", name: "Lilienthaler Str. 54", terms: ["lilienthaler"] },
  { key: "rosenstein-str-25", name: "Rosenstein Str. 25", terms: ["rosenstein"] },
] as const;

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveLoanProperty(value: string): { key: string; name: string } | null {
  const normalized = normalizeText(value);
  const found = PROPERTY_DEFINITIONS.find((item) => item.terms.some((term) => normalized.includes(normalizeText(term))));
  return found ? { key: found.key, name: found.name } : null;
}

function germanMoney(value: unknown): number | null {
  const raw = String(value ?? "").replace(/\u00a0/g, " ").replace(/€/g, "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function isoDate(year: number, month: number, day = 1): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parsePlanDate(first: string, second: string): string | null {
  if (/^\d{4}$/.test(first.trim())) {
    const month = MONTHS[normalizeText(second)];
    return month ? isoDate(Number(first), month, 1) : null;
  }
  const match = first.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return match ? isoDate(Number(match[3]), Number(match[2]), Number(match[1])) : null;
}

function nearlyEqual(left: number | null, right: number | null, tolerance = 0.02): boolean {
  if (left === null || right === null) return true;
  return Math.abs(left - right) <= tolerance;
}

export function parseLoanRatePlanCsv(filename: string, csvText: string): ParsedLoanRatePlan {
  const property = resolveLoanProperty(filename);
  if (!property) throw new Error(`Objekt konnte aus dem Dateinamen "${filename}" nicht erkannt werden.`);

  const rawLines = csvText.replace(/^\uFEFF/, "").split(/\r?\n/);
  const headerIndex = rawLines.findIndex((line) => {
    const normalized = normalizeText(line);
    return normalized.startsWith("jahr monat restschuld") || normalized.startsWith("datum restschuld");
  });
  if (headerIndex < 0) throw new Error(`${filename}: Tabellenkopf mit Jahr/Monat oder Datum fehlt.`);

  const header = rawLines[headerIndex].split(";").map(normalizeText);
  const datedFormat = header[0] === "datum";
  const warnings: string[] = [];
  const rows: LoanRatePlanRow[] = [];
  let previousClosing: number | null = null;

  for (let index = headerIndex + 1; index < rawLines.length; index += 1) {
    const cells = rawLines[index].split(";").map((cell) => cell.trim());
    if (!cells.some(Boolean) || normalizeText(cells.join(" ")).includes("gesamt")) continue;
    const planDate = parsePlanDate(cells[0] ?? "", datedFormat ? "" : cells[1] ?? "");
    if (!planDate) continue;

    const offset = datedFormat ? 0 : 1;
    const opening = germanMoney(cells[1 + offset]);
    const payment = germanMoney(cells[2 + offset]);
    const interest = germanMoney(cells[3 + offset]);
    const fee = datedFormat ? 0 : germanMoney(cells[4 + offset]) ?? 0;
    const principal = germanMoney(cells[(datedFormat ? 4 : 5) + offset]);
    const closing = germanMoney(cells[(datedFormat ? 5 : 6) + offset]);
    if (payment === null || interest === null || principal === null) continue;

    const rowWarnings: string[] = [];
    if (!nearlyEqual(payment, interest + principal)) {
      rowWarnings.push(`Rate ${payment.toFixed(2)} stimmt nicht mit Zins + Tilgung ${(interest + principal).toFixed(2)} überein.`);
    }
    if (!nearlyEqual(closing, opening === null ? null : opening - principal)) {
      rowWarnings.push("Restschuld-Fortschreibung innerhalb der Zeile ist abweichend.");
    }
    if (!nearlyEqual(opening, previousClosing)) {
      rowWarnings.push("Anfangsrestschuld weicht vom Endstand des Vormonats ab.");
    }
    previousClosing = closing;

    if (rowWarnings.length) warnings.push(`${property.name} · ${planDate}: ${rowWarnings.join(" ")}`);
    rows.push({
      property_id: null,
      object_id: null,
      objekt_code: null,
      property_key: property.key,
      property_name: property.name,
      plan_date: planDate,
      opening_balance: opening,
      payment_amount: payment,
      interest_amount: interest,
      fee_amount: fee,
      principal_amount: principal,
      closing_balance: closing,
      source_file: filename,
      source_row: index + 1,
      source_kind: "csv",
      quality_status: rowWarnings.length ? "warning" : "ok",
      quality_note: rowWarnings.join(" ") || null,
    });
  }

  if (!rows.length) throw new Error(`${filename}: Keine verwertbaren Monatszeilen gefunden.`);
  const uniqueMonths = new Set(rows.map((row) => row.plan_date.slice(0, 7)));
  if (uniqueMonths.size !== rows.length) throw new Error(`${filename}: Ein Monat ist mehrfach vorhanden.`);
  return { propertyKey: property.key, propertyName: property.name, sourceFile: filename, rows, warnings };
}

function bridgeForPlan(plan: ParsedLoanRatePlan, bridges: LoanObjectBridgeRow[]): LoanObjectBridgeRow | null {
  return bridges.find((row) => resolveLoanProperty(row.property_name ?? "")?.key === plan.propertyKey) ?? null;
}

async function ensureLoanId(propertyId: string): Promise<string> {
  const existing = await supabase.from("property_loans").select("id").eq("property_id", propertyId).order("created_at", { ascending: false }).limit(1);
  if (existing.error) throw existing.error;
  const current = String(existing.data?.[0]?.id ?? "");
  if (current) return current;
  const created = await supabase.from("property_loans").insert({ property_id: propertyId }).select("id").single();
  if (created.error) throw created.error;
  return String(created.data.id);
}

async function syncYearlyLedger(plan: ParsedLoanRatePlan, propertyId: string) {
  const loanId = await ensureLoanId(propertyId);
  const grouped = new Map<number, LoanRatePlanRow[]>();
  for (const row of plan.rows) {
    const year = Number(row.plan_date.slice(0, 4));
    grouped.set(year, [...(grouped.get(year) ?? []), row]);
  }
  const payload = Array.from(grouped.entries()).map(([year, rows]) => {
    const ordered = [...rows].sort((a, b) => a.plan_date.localeCompare(b.plan_date));
    return {
      loan_id: loanId,
      property_id: propertyId,
      year,
      interest: Math.round(ordered.reduce((sum, row) => sum + row.interest_amount, 0) * 100) / 100,
      principal: Math.round(ordered.reduce((sum, row) => sum + row.principal_amount, 0) * 100) / 100,
      balance: ordered.at(-1)?.closing_balance ?? 0,
      source: `CSV-Monatsplan: ${plan.sourceFile}`,
    };
  });
  const result = await supabase.from("property_loan_ledger").upsert(payload, { onConflict: "property_id,year" });
  if (result.error) throw result.error;
}

async function backfillBookedLoanSplits(plan: ParsedLoanRatePlan, bridge: LoanObjectBridgeRow): Promise<number> {
  if (!bridge.object_id) return 0;
  const dates = plan.rows.map((row) => row.plan_date).sort();
  const start = `${dates[0].slice(0, 7)}-01`;
  const last = new Date(`${dates.at(-1)?.slice(0, 7)}-01T00:00:00`);
  last.setMonth(last.getMonth() + 1);
  const end = last.toISOString().slice(0, 10);
  const result = await supabase
    .from("finance_entry")
    .select("id,booking_date,amount,category,entry_type")
    .eq("is_deleted", false)
    .eq("object_id", bridge.object_id)
    .gte("booking_date", start)
    .lt("booking_date", end);
  if (result.error) throw result.error;

  let updated = 0;
  for (const schedule of plan.rows) {
    const month = schedule.plan_date.slice(0, 7);
    const candidates = (result.data ?? [])
      .filter((entry) => String(entry.booking_date ?? "").startsWith(month))
      .filter((entry) => canonicalizeFinanceCategory(String(entry.category ?? ""), entry.entry_type === "expense" ? "expense" : "income") === "Kreditrate")
      .sort((a, b) => Math.abs(Math.abs(Number(a.amount ?? 0)) - schedule.payment_amount) - Math.abs(Math.abs(Number(b.amount ?? 0)) - schedule.payment_amount));
    const selected = candidates[0];
    if (!selected) continue;
    const update = await supabase.from("finance_entry").update({
      loan_interest_amount: schedule.interest_amount,
      loan_principal_amount: schedule.principal_amount,
      loan_rate_plan_id: schedule.id ?? null,
      loan_split_source: `csv:${plan.sourceFile}`,
      tax_relevant: false,
    }).eq("id", selected.id).eq("is_deleted", false);
    if (update.error) throw update.error;
    updated += 1;
  }
  return updated;
}

export async function importLoanRatePlanFiles(files: File[]): Promise<{ rows: number; bookings: number; warnings: string[] }> {
  const userResult = await supabase.auth.getUser();
  const user = userResult.data.user;
  if (!user) throw new Error("Nicht angemeldet.");
  const bridgeResult = await supabase.from("v_koenen_object_bridge").select("property_name,objekt_code,object_id,property_id");
  if (bridgeResult.error) throw bridgeResult.error;
  const bridges = (bridgeResult.data ?? []) as LoanObjectBridgeRow[];

  let importedRows = 0;
  let updatedBookings = 0;
  const allWarnings: string[] = [];
  for (const file of files) {
    const plan = parseLoanRatePlanCsv(file.name, await file.text());
    const bridge = bridgeForPlan(plan, bridges);
    const rows = plan.rows.map((row) => ({
      ...row,
      user_id: user.id,
      property_id: bridge?.property_id ?? null,
      object_id: bridge?.object_id ?? null,
      objekt_code: bridge?.objekt_code ?? null,
    }));
    const upsert = await supabase.from("property_loan_rate_plan").upsert(rows, { onConflict: "user_id,property_key,plan_year,plan_month" }).select("id,plan_date");
    if (upsert.error) throw upsert.error;
    const idByDate = new Map((upsert.data ?? []).map((row) => [String(row.plan_date), String(row.id)]));
    for (const row of plan.rows) row.id = idByDate.get(row.plan_date);
    importedRows += rows.length;
    allWarnings.push(...plan.warnings);
    if (bridge?.property_id) await syncYearlyLedger(plan, bridge.property_id);
    if (bridge) updatedBookings += await backfillBookedLoanSplits(plan, bridge);
  }
  return { rows: importedRows, bookings: updatedBookings, warnings: allWarnings };
}

export async function findLoanRatePlanForBooking(input: {
  objectId: string;
  objectLabel: string;
  bookingDate: string;
}): Promise<LoanRatePlanRow | null> {
  const year = Number(input.bookingDate.slice(0, 4));
  const month = Number(input.bookingDate.slice(5, 7));
  if (!year || !month) return null;
  let query = supabase.from("property_loan_rate_plan").select("*").eq("plan_year", year).eq("plan_month", month);
  if (input.objectId) query = query.eq("object_id", input.objectId);
  const direct = await query.maybeSingle();
  if (direct.error) throw direct.error;
  if (direct.data) return direct.data as LoanRatePlanRow;

  const property = resolveLoanProperty(input.objectLabel);
  if (!property) return null;
  const fallback = await supabase.from("property_loan_rate_plan").select("*").eq("property_key", property.key).eq("plan_year", year).eq("plan_month", month).maybeSingle();
  if (fallback.error) throw fallback.error;
  return (fallback.data as LoanRatePlanRow | null) ?? null;
}
