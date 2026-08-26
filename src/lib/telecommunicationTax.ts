import { normalizeFinanceCategoryText } from "./financeCategories";

export const TELECOMMUNICATION_CATEGORY = "Handy & Internet";
export const TELECOMMUNICATION_DEDUCTIBLE_RATE = 0.2;
export const TELECOMMUNICATION_MONTHLY_CAP_PER_CONTRACT = 20;

export type TelecommunicationTaxInput = {
  spouseA: number;
  spouseB: number;
  landlineInternet: number;
};

export type TelecommunicationTaxDetails = TelecommunicationTaxInput & {
  totalAmount: number;
  spouseADeductible: number;
  spouseBDeductible: number;
  landlineInternetDeductible: number;
  deductibleTotal: number;
  allocatedPerRentedObject: number;
};

export function isTelecommunicationCategory(category: string | null | undefined): boolean {
  return normalizeFinanceCategoryText(category) === normalizeFinanceCategoryText(TELECOMMUNICATION_CATEGORY);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function deductiblePart(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return roundMoney(Math.min(value * TELECOMMUNICATION_DEDUCTIBLE_RATE, TELECOMMUNICATION_MONTHLY_CAP_PER_CONTRACT));
}

export function calculateTelecommunicationTax(input: TelecommunicationTaxInput, rentedObjectCount = 5): TelecommunicationTaxDetails {
  const spouseA = Number.isFinite(input.spouseA) ? Math.max(0, input.spouseA) : 0;
  const spouseB = Number.isFinite(input.spouseB) ? Math.max(0, input.spouseB) : 0;
  const landlineInternet = Number.isFinite(input.landlineInternet) ? Math.max(0, input.landlineInternet) : 0;
  const spouseADeductible = deductiblePart(spouseA);
  const spouseBDeductible = deductiblePart(spouseB);
  const landlineInternetDeductible = deductiblePart(landlineInternet);
  const deductibleTotal = roundMoney(spouseADeductible + spouseBDeductible + landlineInternetDeductible);

  return {
    spouseA,
    spouseB,
    landlineInternet,
    totalAmount: roundMoney(spouseA + spouseB + landlineInternet),
    spouseADeductible,
    spouseBDeductible,
    landlineInternetDeductible,
    deductibleTotal,
    allocatedPerRentedObject: rentedObjectCount > 0 ? roundMoney(deductibleTotal / rentedObjectCount) : 0,
  };
}

export function buildTelecommunicationNote(input: {
  existingNote?: string | null;
  spouseA: number;
  spouseB: number;
  landlineInternet: number;
  rentedObjectCount?: number;
}): string {
  const details = calculateTelecommunicationTax(input, input.rentedObjectCount ?? 5);
  const baseNote = String(input.existingNote ?? "").trim();
  const taxNote = [
    `Telekommunikation steuerlich: Ehepartner A ${details.spouseA.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}`,
    `Ehepartner B ${details.spouseB.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}`,
    `Festnetz & Internet ${details.landlineInternet.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}`,
    `absetzbar 20% gedeckelt ${details.deductibleTotal.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}`,
    `je vermietetes Objekt ${details.allocatedPerRentedObject.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}`,
  ].join(" | ");

  return baseNote ? `${baseNote} | ${taxNote}` : taxNote;
}

export function parseTelecommunicationTaxDetails(input: {
  amount?: number | null;
  note?: string | null;
  category?: string | null;
  rentedObjectCount?: number;
}): TelecommunicationTaxDetails | null {
  if (!isTelecommunicationCategory(input.category)) return null;

  const note = String(input.note ?? "");
  const parseEuro = (pattern: RegExp): number | null => {
    const raw = note.match(pattern)?.[1]?.trim();
    if (!raw) return null;
    const parsed = Number(raw.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  };

  const total = Math.abs(Number(input.amount ?? 0));
  const spouseA = parseEuro(/Ehepartner A\s*([^|]+)/i);
  const spouseB = parseEuro(/Ehepartner B\s*([^|]+)/i);
  const landlineInternet = parseEuro(/Festnetz\s*&\s*Internet\s*([^|]+)/i);

  if (spouseA != null || spouseB != null || landlineInternet != null) {
    return calculateTelecommunicationTax(
      {
        spouseA: spouseA ?? 0,
        spouseB: spouseB ?? 0,
        landlineInternet: landlineInternet ?? 0,
      },
      input.rentedObjectCount ?? 5,
    );
  }

  return calculateTelecommunicationTax(
    {
      spouseA: total,
      spouseB: 0,
      landlineInternet: 0,
    },
    input.rentedObjectCount ?? 5,
  );
}
