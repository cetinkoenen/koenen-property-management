export type FinanceEntryType = "income" | "expense";

export type FinanceCategoryOption = {
  value: string;
  type: FinanceEntryType | "both";
};

export const MIETE_NACHZAHLUNG_CATEGORY = "Miete Nachzahlung";

export const FINANCE_CATEGORY_OPTIONS: FinanceCategoryOption[] = [
  { value: "Miete", type: "income" },
  { value: "Miete Garage", type: "income" },
  { value: MIETE_NACHZAHLUNG_CATEGORY, type: "income" },
  { value: "Kaution", type: "both" },
  { value: "Mietbestandteil-NK", type: "income" },

  { value: "Abfallgebühr", type: "expense" },
  { value: "Allgemein", type: "both" },
  { value: "Verwaltungskosten", type: "expense" },
  { value: "Bewirtungskosten", type: "expense" },
  { value: "Erwerbsnebenkosten / Anschaffungskosten", type: "expense" },
  { value: "Fahrtkosten", type: "expense" },
  { value: "Grundsteuer", type: "expense" },
  { value: "Handy & Internet", type: "expense" },
  { value: "Kontoführungsgebühr", type: "expense" },
  { value: "Kreditrate", type: "expense" },
  { value: "Büro / Porto", type: "expense" },
  { value: "Schonsteinfeger", type: "expense" },
  { value: "Software", type: "expense" },
  { value: "Steuer", type: "expense" },
  { value: "Steuerberater", type: "expense" },
  { value: "Capex", type: "expense" },
  { value: "Reparatur", type: "expense" },
  { value: "Versicherung", type: "expense" },
  { value: "Wartung", type: "expense" },
];

const CATEGORY_ALIAS_PAIRS: Array<[string, string]> = [
  ["nebenkosten", "Mietbestandteil-NK"],
  ["betriebskosten", "Mietbestandteil-NK"],
  ["mietbestandteil nk", "Mietbestandteil-NK"],
  ["hausverwaltung", "Verwaltungskosten"],
  ["hausgeld", "Verwaltungskosten"],
  ["weg", "Verwaltungskosten"],
  ["weg hausgeld", "Verwaltungskosten"],
  ["verwaltung", "Verwaltungskosten"],
  ["verwaltungskosten", "Verwaltungskosten"],
  ["bewirtung", "Bewirtungskosten"],
  ["bewirtungskosten", "Bewirtungskosten"],
  ["geschaeftsessen", "Bewirtungskosten"],
  ["geschäftsessen", "Bewirtungskosten"],
  ["restaurant", "Bewirtungskosten"],
  ["anschaffungskosten", "Erwerbsnebenkosten / Anschaffungskosten"],
  ["anschaffungsnebenkosten", "Erwerbsnebenkosten / Anschaffungskosten"],
  ["erwerbsnebenkosten", "Erwerbsnebenkosten / Anschaffungskosten"],
  ["kaufnebenkosten", "Erwerbsnebenkosten / Anschaffungskosten"],
  ["eigentrumumschreibung", "Erwerbsnebenkosten / Anschaffungskosten"],
  ["eigentumsumschreibung", "Erwerbsnebenkosten / Anschaffungskosten"],
  ["eigentrumsumschreibung", "Erwerbsnebenkosten / Anschaffungskosten"],
  ["eigentumsueberschreibung", "Erwerbsnebenkosten / Anschaffungskosten"],
  ["eigentumsuebertragung", "Erwerbsnebenkosten / Anschaffungskosten"],
  ["eigentumsübertragung", "Erwerbsnebenkosten / Anschaffungskosten"],
  ["notar", "Erwerbsnebenkosten / Anschaffungskosten"],
  ["notarkosten", "Erwerbsnebenkosten / Anschaffungskosten"],
  ["grundbuch", "Erwerbsnebenkosten / Anschaffungskosten"],
  ["grundbuchamt", "Erwerbsnebenkosten / Anschaffungskosten"],
  ["grundbuchkosten", "Erwerbsnebenkosten / Anschaffungskosten"],
  ["grunderwerbsteuer", "Erwerbsnebenkosten / Anschaffungskosten"],
  ["grunderwerbssteuer", "Erwerbsnebenkosten / Anschaffungskosten"],
  ["makler", "Erwerbsnebenkosten / Anschaffungskosten"],
  ["maklerkosten", "Erwerbsnebenkosten / Anschaffungskosten"],
  ["kaufvertrag", "Erwerbsnebenkosten / Anschaffungskosten"],
  ["handy", "Handy & Internet"],
  ["internet", "Handy & Internet"],
  ["telefon", "Handy & Internet"],
  ["telefonkosten", "Handy & Internet"],
  ["mobilfunk", "Handy & Internet"],
  ["handy internet", "Handy & Internet"],
  ["handy und internet", "Handy & Internet"],
  ["reparatur", "Reparatur"],
  ["handwerker", "Reparatur"],
  ["instandhaltung", "Reparatur"],
  ["sanierung", "Reparatur"],
  ["modernisierung", "Reparatur"],
  ["capex", "Capex"],
  ["versicherung", "Versicherung"],
  ["wartung", "Wartung"],
  ["grundsteuer", "Grundsteuer"],
  ["abfall", "Abfallgebühr"],
  ["abfallgebuehr", "Abfallgebühr"],
  ["abfallgebühr", "Abfallgebühr"],
  ["muell", "Abfallgebühr"],
  ["müll", "Abfallgebühr"],
  ["müllgebühren", "Abfallgebühr"],
  ["kontofuehrungsgebuehr", "Kontoführungsgebühr"],
  ["kontofuehrungsgebuehren", "Kontoführungsgebühr"],
  ["kontoführungsgebühr", "Kontoführungsgebühr"],
  ["kontoführungsgebühren", "Kontoführungsgebühr"],
  ["kontofuehrung", "Kontoführungsgebühr"],
  ["kontoführung", "Kontoführungsgebühr"],
  ["kontofuehrungskosten", "Kontoführungsgebühr"],
  ["kontoführungskosten", "Kontoführungsgebühr"],
  ["kontokosten", "Kontoführungsgebühr"],
  ["bankgebuehren", "Kontoführungsgebühr"],
  ["bankgebühren", "Kontoführungsgebühr"],
  ["monatsrate", "Kreditrate"],
  ["kreditrate", "Kreditrate"],
  ["darlehensrate", "Kreditrate"],
  ["darlehen", "Kreditrate"],
  ["tilgung", "Kreditrate"],
  ["schonsteinfeger", "Schonsteinfeger"],
  ["schornsteinfeger", "Schonsteinfeger"],
  ["software", "Software"],
  ["buero", "Büro / Porto"],
  ["büro", "Büro / Porto"],
  ["porto", "Büro / Porto"],
  ["brief", "Büro / Porto"],
  ["post", "Büro / Porto"],
  ["steuer", "Steuer"],
  ["steuerberater", "Steuerberater"],
  ["steuerberatung", "Steuerberater"],
  ["steuerberatung", "Steuer"],
  ["steuerberater rechnung", "Steuerberater"],
  ["steuerberaterrechnung", "Steuerberater"],
  ["fahrtkosten", "Fahrtkosten"],
  ["fahrt", "Fahrtkosten"],
  ["kaution", "Kaution"],
  ["miete nachzahlung", MIETE_NACHZAHLUNG_CATEGORY],
  ["mietnachzahlung", MIETE_NACHZAHLUNG_CATEGORY],
  ["miet nachzahlung", MIETE_NACHZAHLUNG_CATEGORY],
  ["nachzahlung miete", MIETE_NACHZAHLUNG_CATEGORY],
  ["nachzahlung miet", MIETE_NACHZAHLUNG_CATEGORY],
  ["miete", "Miete"],
  ["kaltmiete", "Miete"],
  ["warmmiete", "Miete"],
  ["miete garage", "Miete Garage"],
  ["garage", "Miete Garage"],
  ["stellplatz", "Miete Garage"],
  ["allgemein", "Allgemein"],
];

export function normalizeFinanceCategoryText(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll("ß", "ss")
    .replace(/[ä]/g, "ae")
    .replace(/[ö]/g, "oe")
    .replace(/[ü]/g, "ue")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function canonicalizeFinanceCategory(value: string | null | undefined, _entryType?: FinanceEntryType | null): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const normalized = normalizeFinanceCategoryText(raw);
  const exactOption = FINANCE_CATEGORY_OPTIONS.find((option) => normalizeFinanceCategoryText(option.value) === normalized);
  if (exactOption) return exactOption.value;

  const alias = CATEGORY_ALIAS_PAIRS.find(([source]) => normalized === normalizeFinanceCategoryText(source));
  return alias?.[1] ?? raw;
}

export function isPureRentBackPayment(
  category: string | null | undefined,
  note?: string | null | undefined,
): boolean {
  const categoryText = normalizeFinanceCategoryText(category);
  const noteText = normalizeFinanceCategoryText(note);
  const backPaymentCategory = normalizeFinanceCategoryText(MIETE_NACHZAHLUNG_CATEGORY);

  if (
    categoryText === backPaymentCategory ||
    categoryText.includes("mietnachzahlung") ||
    (categoryText.includes("miet") && categoryText.includes("nachzahlung"))
  ) {
    return true;
  }

  const noteLooksBackPayment =
    noteText.includes("mietnachzahlung") ||
    (noteText.includes("nachzahlung") &&
      (noteText.includes("miet") || categoryText === "miete" || categoryText === "miete garage"));

  if (!noteLooksBackPayment) return false;

  const combinedPaymentSignals = ["inkl", "inklusive", "incl", "zusammen", "plus", "zzgl", "und miete", "miete und"];
  return !combinedPaymentSignals.some((signal) => noteText.includes(signal));
}

export function getFinanceCategoryOptions(entryType: FinanceEntryType, additionalCategories: string[] = []): string[] {
  const base = FINANCE_CATEGORY_OPTIONS
    .filter((option) => option.type === "both" || option.type === entryType)
    .map((option) => option.value);

  const additional = additionalCategories
    .map((category) => canonicalizeFinanceCategory(category, entryType))
    .filter(Boolean);

  return Array.from(new Set([...base, ...additional])).sort((a, b) => a.localeCompare(b, "de"));
}
