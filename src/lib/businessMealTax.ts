import { normalizeFinanceCategoryText } from "./financeCategories";

export const BUSINESS_MEAL_CATEGORY = "Bewirtungskosten";
export const BUSINESS_MEAL_DEDUCTIBLE_RATE = 0.7;

export type BusinessMealDetails = {
  totalAmount: number;
  deductibleAmount: number;
  persons: string;
  occasion: string;
  targetObject: string;
};

export function isBusinessMealCategory(category: string | null | undefined): boolean {
  return normalizeFinanceCategoryText(category) === normalizeFinanceCategoryText(BUSINESS_MEAL_CATEGORY);
}

export function calculateBusinessMealDeductible(totalAmount: number): number {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return 0;
  return Math.round(totalAmount * BUSINESS_MEAL_DEDUCTIBLE_RATE * 100) / 100;
}

export function buildBusinessMealNote(input: {
  existingNote?: string | null;
  totalAmount: number;
  persons: string;
  occasion: string;
  targetObject: string;
}): string {
  const deductibleAmount = calculateBusinessMealDeductible(input.totalAmount);
  const baseNote = String(input.existingNote ?? "").trim();
  const details = [
    `Bewirtungskosten steuerlich: Gesamtsumme laut Beleg ${input.totalAmount.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}`,
    `absetzbarer Anteil 70% ${deductibleAmount.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}`,
    `privater Anteil 30% ${(input.totalAmount - deductibleAmount).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}`,
    `Personen: ${input.persons.trim()}`,
    `Anlass: ${input.occasion.trim()}`,
    `Ziel-Immobilie: ${input.targetObject.trim()}`,
  ].join(" | ");

  return baseNote ? `${baseNote} | ${details}` : details;
}

export function parseBusinessMealDetails(input: {
  amount?: number | null;
  note?: string | null;
  category?: string | null;
  objectLabel?: string | null;
}): BusinessMealDetails | null {
  if (!isBusinessMealCategory(input.category)) return null;
  const totalAmount = Math.abs(Number(input.amount ?? 0));
  const note = String(input.note ?? "");
  const persons = note.match(/Personen:\s*([^|]+)/i)?.[1]?.trim() ?? "";
  const occasion = note.match(/Anlass:\s*([^|]+)/i)?.[1]?.trim() ?? "";
  const targetObject = note.match(/Ziel-Immobilie:\s*([^|]+)/i)?.[1]?.trim() ?? String(input.objectLabel ?? "").trim();

  return {
    totalAmount,
    deductibleAmount: calculateBusinessMealDeductible(totalAmount),
    persons,
    occasion,
    targetObject,
  };
}
