import { canonicalizeFinanceCategory, normalizeFinanceCategoryText } from "./financeCategories";

export type RepairCapexEntryLike = {
  id?: string | number | null;
  entry_type?: string | null;
  booking_date?: string | null;
  amount?: number | null;
  category?: string | null;
  note?: string | null;
};

export type RepairCapexSummary = {
  entries: RepairCapexEntryLike[];
  totalAmount: number;
  latestYear: number | null;
  lines: string[];
};

export const REPAIR_CAPEX_DISPLAY_CATEGORY = "Capex";

const REPAIR_CAPEX_TERMS = [
  "reparatur",
  "instandhaltung",
  "handwerker",
  "sanierung",
  "modernisierung",
  "renovierung",
  "umbau",
  "capex",
];

function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "ohne Datum";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("de-DE");
}

function formatAmount(value: unknown): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(toNumber(value)));
}

export function getRepairCapexYear(entry: RepairCapexEntryLike): number | null {
  const parsed = new Date(entry.booking_date ?? "");
  if (!Number.isNaN(parsed.getTime())) return parsed.getFullYear();
  const fallback = String(entry.booking_date ?? entry.note ?? "").match(/\b(20\d{2})\b/);
  return fallback ? Number(fallback[1]) : null;
}

export function isRepairCapexEntry(entry: RepairCapexEntryLike): boolean {
  if (entry.entry_type !== "expense") return false;

  const category = canonicalizeFinanceCategory(entry.category, "expense");
  if (category === "Reparatur") return true;

  const searchable = normalizeFinanceCategoryText(`${entry.category ?? ""} ${entry.note ?? ""}`);
  return REPAIR_CAPEX_TERMS.some((term) => searchable.includes(term));
}

export function getRepairCapexDisplayCategory(entry: RepairCapexEntryLike): string | null {
  return isRepairCapexEntry(entry) ? REPAIR_CAPEX_DISPLAY_CATEGORY : null;
}

export function extractRepairCapexInvoiceReference(entry: RepairCapexEntryLike): string {
  const text = `${entry.note ?? ""} ${entry.category ?? ""}`;
  const match = text.match(/\b(?:rechnung(?:s)?(?:nummer|nr\.?)?|rechnungsnr\.?|beleg(?:nr\.?)?|invoice)\s*[:#-]?\s*([A-Z0-9][A-Z0-9./_-]{1,})/i);
  if (match?.[1]) return match[1];
  return entry.id ? `Buchung #${entry.id}` : "Buchung ohne Rechnungsnummer";
}

export function buildRepairCapexSummary(entries: RepairCapexEntryLike[]): RepairCapexSummary {
  const repairEntries = entries
    .filter(isRepairCapexEntry)
    .sort((a, b) => String(a.booking_date ?? "").localeCompare(String(b.booking_date ?? "")));

  const totalAmount = repairEntries.reduce((sum, entry) => sum + Math.abs(toNumber(entry.amount)), 0);
  const years = repairEntries.map(getRepairCapexYear).filter((year): year is number => year !== null);
  const latestYear = years.length ? Math.max(...years) : null;
  const lines = repairEntries.map((entry) => {
    const year = getRepairCapexYear(entry) ?? "ohne Jahr";
    const invoice = extractRepairCapexInvoiceReference(entry);
    const note = String(entry.note ?? entry.category ?? "").trim();
    return `${year} | ${invoice} | ${formatDate(entry.booking_date)} | ${formatAmount(entry.amount)}${note ? ` | ${note}` : ""}`;
  });

  return { entries: repairEntries, totalAmount, latestYear, lines };
}
