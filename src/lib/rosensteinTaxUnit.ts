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

export function rosensteinTaxUnitLabel(code: RosensteinTaxUnitCode): string {
  const unit = ROSENSTEIN_TAX_UNITS.find((candidate) => candidate.code === code);
  return unit ? `TG-Stellplatz ${unit.code} – ${unit.reference}` : code;
}
