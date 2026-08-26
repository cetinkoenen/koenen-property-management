import { canonicalizeFinanceCategory, normalizeFinanceCategoryText } from "./financeCategories";
import { getRepairCapexDisplayCategory } from "./repairCapex";

export const MIETBESTANDTEIL_NK_CATEGORY = "Mietbestandteil-NK";
export { MIETE_NACHZAHLUNG_CATEGORY, isPureRentBackPayment } from "./financeCategories";

type FinanceEntryLike = {
  entry_type?: string | null;
  amount?: number | null;
  category?: string | null;
  note?: string | null;
  objekt_code?: string | null;
};

function normalize(value: string | null | undefined): string {
  return normalizeFinanceCategoryText(value);
}

export function isHohenloherMietbestandteilNk(entry: FinanceEntryLike, objectLabel?: string | null): boolean {
  if (entry.entry_type !== "income") return false;
  if (Math.abs(Number(entry.amount ?? 0) - 270) > 0.01) return false;

  const combined = normalize(`${entry.category ?? ""} ${entry.note ?? ""} ${entry.objekt_code ?? ""} ${objectLabel ?? ""}`);
  const isHohenloher = combined.includes("hohenloher");
  const isNkComponent =
    combined.includes("mietbestandteil nk") ||
    combined.includes("hausverwaltung") ||
    combined.includes("hausgeld") ||
    combined.includes("nebenkosten") ||
    combined.includes("betriebskosten") ||
    combined.split(" ").includes("nk");

  return isHohenloher && isNkComponent;
}

export function displayFinanceCategory(entry: FinanceEntryLike, objectLabel?: string | null): string {
  if (isHohenloherMietbestandteilNk(entry, objectLabel)) return MIETBESTANDTEIL_NK_CATEGORY;
  const repairCapexCategory = getRepairCapexDisplayCategory(entry);
  if (repairCapexCategory) return repairCapexCategory;
  return canonicalizeFinanceCategory(entry.category, entry.entry_type === "income" || entry.entry_type === "expense" ? entry.entry_type : null) || "Ohne Kategorie";
}
