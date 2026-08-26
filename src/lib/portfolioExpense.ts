import { canonicalizeFinanceCategory, normalizeFinanceCategoryText } from "./financeCategories";

export const PORTFOLIO_GENERAL_OBJECT_ID = "__portfolio_general__";
export const PORTFOLIO_GENERAL_OBJECT_CODE = "PORTFOLIO_GENERAL";
export const PORTFOLIO_GENERAL_LABEL = "Allgemein / Portfolio-Ausgabe";

const PORTFOLIO_EXPENSE_CATEGORIES = new Set([
  "Allgemein",
  "Büro / Porto",
  "Kontoführungsgebühr",
  "Software",
  "Steuer",
  "Steuerberater",
  "Verwaltungskosten",
]);

export function isPortfolioGeneralReference(value: unknown): boolean {
  const normalized = normalizeFinanceCategoryText(String(value ?? ""));
  return normalized === normalizeFinanceCategoryText(PORTFOLIO_GENERAL_OBJECT_ID)
    || normalized === normalizeFinanceCategoryText(PORTFOLIO_GENERAL_OBJECT_CODE)
    || normalized === normalizeFinanceCategoryText(PORTFOLIO_GENERAL_LABEL)
    || normalized.includes("portfolio ausgabe")
    || normalized.includes("allgemein portfolio");
}

export function isPortfolioGeneralEntry(entry: { object_id?: unknown; objekt_code?: unknown; note?: unknown; category?: unknown }): boolean {
  return isPortfolioGeneralReference(entry.object_id)
    || isPortfolioGeneralReference(entry.objekt_code)
    || isPortfolioGeneralReference(entry.note);
}

export function isPortfolioExpenseCategory(category: unknown): boolean {
  const canonical = canonicalizeFinanceCategory(String(category ?? ""), "expense");
  return PORTFOLIO_EXPENSE_CATEGORIES.has(canonical);
}
