export const ROSENSTEIN_TAX_UNITS = [
  { code: "P250", reference: "E008440000121", unitName: "Garage 1" },
  { code: "P253", reference: "E008440000122", unitName: "Garage 2" },
  { code: "P254", reference: "E008440000123", unitName: "Garage 3" },
] as const;

export type RosensteinTaxUnitCode = (typeof ROSENSTEIN_TAX_UNITS)[number]["code"];

function compact(value: unknown): string {
  return String(value ?? "")
    .toLocaleLowerCase("de-DE")
    .replaceAll("ß", "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function isRosensteinLabel(value: unknown): boolean {
  return compact(value).includes("rosenstein");
}

export function detectRosensteinTaxUnit(...values: unknown[]): RosensteinTaxUnitCode | null {
  const haystack = compact(values.join(" "));
  if (!haystack) return null;
  for (const unit of ROSENSTEIN_TAX_UNITS) {
    if (haystack.includes(compact(unit.code)) || haystack.includes(compact(unit.reference)) || haystack.includes(compact(unit.unitName))) {
      return unit.code;
    }
  }
  return null;
}

export function detectRosensteinTaxUnits(...values: unknown[]): RosensteinTaxUnitCode[] {
  const original = values.join(" ");
  if (/p?250\s*[-/,]\s*p?253\s*[-/,]\s*p?254/i.test(original)) return ["P250", "P253", "P254"];
  const haystack = compact(original);
  if (!haystack) return [];
  return ROSENSTEIN_TAX_UNITS
    .filter((unit) => haystack.includes(compact(unit.code)) || haystack.includes(compact(unit.reference)) || haystack.includes(compact(unit.unitName)))
    .map((unit) => unit.code);
}

export function rosensteinTaxUnitLabel(code: RosensteinTaxUnitCode): string {
  const unit = ROSENSTEIN_TAX_UNITS.find((candidate) => candidate.code === code);
  return unit ? `TG-Stellplatz ${unit.code} – ${unit.reference}` : code;
}

/**
 * Splits a shared Rosenstein amount into three cent-exact unit shares.
 * Remainder cents are assigned deterministically in P250/P253/P254 order,
 * so the three individual reports always add up to the original amount.
 */
export function allocateRosensteinThird(value: number, code: RosensteinTaxUnitCode): number {
  const unitIndex = ROSENSTEIN_TAX_UNITS.findIndex((unit) => unit.code === code);
  const sign = value < 0 ? -1 : 1;
  const cents = Math.round(Math.abs(value) * 100);
  const base = Math.floor(cents / ROSENSTEIN_TAX_UNITS.length);
  const remainder = cents % ROSENSTEIN_TAX_UNITS.length;
  const allocatedCents = base + (unitIndex >= 0 && unitIndex < remainder ? 1 : 0);
  return sign * allocatedCents / 100;
}
