import { detectRosensteinTaxUnit } from "./rosensteinTaxUnit";

export type CanonicalUnitLabelInput = {
  objectLabel?: string | null;
  objectCode?: string | null;
  unitLabel?: string | null;
  rentType?: string | null;
};

function normalize(value: unknown): string {
  return String(value ?? "")
    .toLocaleLowerCase("de-DE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ß", "ss")
    .replace(/straße|strasse/g, "str")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function objectNumber(input: CanonicalUnitLabelInput): number | null {
  const context = normalize(`${input.objectCode ?? ""} ${input.objectLabel ?? ""}`);
  const code = context.match(/\bobjekt\s*([1-6])\b/)?.[1];
  if (code) return Number(code);
  if (context.includes("lilienthaler str 54")) return 1;
  if (context.includes("elsasser str 52")) return 2;
  if (context.includes("colmarer str 45")) return 3;
  if (context.includes("further str 74") || context.includes("fuerther str 74")) return 4;
  if (context.includes("hohenloher str 78")) return 5;
  if (context.includes("rosenstein str 25")) return 6;
  return null;
}

function isGarage(value: unknown): boolean {
  const text = normalize(value);
  return /\b(garage|tiefgarage|stellplatz|tg)\b/.test(text) || /\bp25[034]\b/.test(text);
}

/**
 * Verbindliche Präsentationsbezeichnung einer Einheit.
 *
 * Technische IDs und Buchungsreferenzen werden nicht verändert. Alle Oberflächen
 * und Exporte können dadurch dieselbe Bezeichnung verwenden, ohne ihre fachliche
 * Zuordnungslogik zu duplizieren.
 */
export function canonicalUnitLabel(input: CanonicalUnitLabelInput): string | null {
  const raw = String(input.unitLabel ?? "").trim();
  const number = objectNumber(input);

  if (number === 6) {
    return detectRosensteinTaxUnit(raw, input.rentType) ?? (raw || null);
  }
  if (number === 4) {
    return isGarage(`${raw} ${input.rentType ?? ""}`) ? "Garage 01" : "Wohnung 03";
  }
  if (number === 1) return "Haus 01";
  if (number === 2) return "Wohnung 01";
  if (number === 3) return "Wohnung 02";
  if (number === 5) return "Wohnung 04";
  return raw || null;
}

export function canonicalizeUnitRow<
  T extends { object_code?: string | null; unit_label?: string | null; rent_type?: string | null },
>(row: T, objectLabel?: string | null): T {
  return {
    ...row,
    unit_label: canonicalUnitLabel({
      objectCode: row.object_code,
      objectLabel,
      unitLabel: row.unit_label,
      rentType: row.rent_type,
    }),
  };
}
