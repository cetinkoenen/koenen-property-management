import { MIETE_NACHZAHLUNG_CATEGORY, canonicalizeFinanceCategory, normalizeFinanceCategoryText, type FinanceEntryType } from "./financeCategories";
import { isHohenloherMietbestandteilNk, MIETBESTANDTEIL_NK_CATEGORY } from "./financeEntryLabels";
import { isBusinessMealCategory } from "./businessMealTax";
import { isPortfolioGeneralEntry, isPortfolioExpenseCategory } from "./portfolioExpense";

export type TaxRuleDecision = {
  taxRelevant: boolean;
  relevance: "tax" | "check" | "private";
  group: string;
  hint: string;
  locked: boolean;
};

export type TaxRuleEntry = {
  entry_type?: string | null;
  amount?: number | null;
  category?: string | null;
  note?: string | null;
  object_id?: string | null;
  objekt_code?: string | null;
};

function normalize(value: string | null | undefined): string {
  return normalizeFinanceCategoryText(value);
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(normalize(needle)));
}

function isHohenloherSelfUsedObject(text: string): boolean {
  return includesAny(text, ["hohenloher", "hohenloher str 78", "brettach", "langenbrettach"]);
}

function isAcquisitionSideCost(text: string): boolean {
  return includesAny(text, [
    "notar",
    "grundbuch",
    "grundbuchamt",
    "grunderwerbsteuer",
    "grunderwerbssteuer",
    "erwerbsnebenkosten",
    "kaufnebenkosten",
    "eigentrumumschreibung",
    "eigentumsumschreibung",
    "eigentrumsumschreibung",
    "eigentumsueberschreibung",
    "eigentumsuebertragung",
    "makler",
    "kaufvertrag",
  ]);
}

export function canonicalCategoryForTax(entry: TaxRuleEntry, objectLabel?: string | null): string {
  const entryType = entry.entry_type === "income" || entry.entry_type === "expense" ? entry.entry_type as FinanceEntryType : null;
  if (isHohenloherMietbestandteilNk(entry, objectLabel)) return MIETBESTANDTEIL_NK_CATEGORY;
  return canonicalizeFinanceCategory(entry.category, entryType) || "";
}

export function isCreditRateEntry(entry: TaxRuleEntry, objectLabel?: string | null): boolean {
  if (entry.entry_type !== "expense") return false;
  const canonicalCategory = canonicalCategoryForTax(entry, objectLabel);
  const text = normalize(`${canonicalCategory} ${entry.category ?? ""} ${entry.note ?? ""}`);
  return canonicalCategory === "Kreditrate" || includesAny(text, ["kreditrate", "monatsrate", "darlehensrate", "zins tilgung", "zins und tilgung", "tilgung"]);
}

export function classifyTaxRelevance(entry: TaxRuleEntry, objectLabel?: string | null): TaxRuleDecision {
  const entryType = entry.entry_type === "expense" ? "expense" : "income";
  const canonicalCategory = canonicalCategoryForTax({ ...entry, entry_type: entryType }, objectLabel);
  const text = normalize(`${canonicalCategory} ${entry.category ?? ""} ${entry.note ?? ""} ${entry.objekt_code ?? ""} ${objectLabel ?? ""}`);
  const isHohenloher = isHohenloherSelfUsedObject(text);

  if (entryType === "income") {
    if (isHohenloher) {
      return {
        taxRelevant: false,
        relevance: "private",
        group: "Selbstgenutzt / WEG (keine Anlage V)",
        hint: "Hohenloher Str. 78 ist selbstgenutzt/WEG und fuer Anlage V gesperrt. Einnahmen werden nicht als Vermietungseinnahmen in Anlage V gerechnet.",
        locked: true,
      };
    }

    if (canonicalCategory === "Kaution" && !includesAny(text, ["einbehalten", "schadenersatz", "verrechnung"])) {
      return {
        taxRelevant: false,
        relevance: "check",
        group: "Kaution prüfen",
        hint: "Kaution ist nur steuerlich zu prüfen, wenn sie einbehalten oder verrechnet wurde.",
        locked: false,
      };
    }

    if (
      ["Miete", "Miete Garage", MIETE_NACHZAHLUNG_CATEGORY, MIETBESTANDTEIL_NK_CATEGORY].includes(canonicalCategory) ||
      includesAny(text, ["warmmiete", "kaltmiete", "nebenkosten", "betriebskosten", "garage", "stellplatz", "sonderzahlung", "nachzahlung"])
    ) {
      return {
        taxRelevant: true,
        relevance: "tax",
        group:
          canonicalCategory === MIETE_NACHZAHLUNG_CATEGORY
            ? "Miete Nachzahlung / Sonderzahlung (Einnahme)"
            : canonicalCategory === "Miete Garage" || includesAny(text, ["garage", "stellplatz"])
              ? "Miete Garage (Einnahme)"
              : "Miete / Warmmiete (Einnahme)",
        hint: "Warmmiete, Nebenkostenvorauszahlung, Garagenmiete und steuerrelevante Miet-Nachzahlungen werden fuer Anlage V als Einnahme gewertet.",
        locked: false,
      };
    }

    return {
      taxRelevant: true,
      relevance: "tax",
      group: "Miete / Warmmiete (Einnahme)",
      hint: "Einnahmen aus Vermietung werden fuer Anlage V als steuerrelevant behandelt.",
      locked: false,
    };
  }

  if (isCreditRateEntry({ ...entry, entry_type: entryType }, objectLabel)) {
    return {
      taxRelevant: false,
      relevance: "private",
      group: "Kreditrate (nicht direkt Anlage V)",
      hint: "Laufende Kreditrate enthaelt Zins und Tilgung zusammen. Nicht als St markieren; Jahreswerte kommen ueber Darlehen, nur Zinsanteil steuerrelevant.",
      locked: true,
    };
  }

  if (isAcquisitionSideCost(text)) {
    return {
      taxRelevant: false,
      relevance: "check",
      group: "Erwerbsnebenkosten / Anschaffungskosten prüfen",
      hint: "Notar, Grundbuch, Grunderwerbsteuer, Makler und Kaufnebenkosten sind steuerlich relevant zu dokumentieren, aber nicht als laufende Werbungskosten zu behandeln. Sie gehören in der Regel zur Anschaffungskosten-/AfA-Basis und müssen separat geprüft werden.",
      locked: true,
    };
  }

  if (isHohenloher && includesAny(text, ["haushaltsnah", "hausmeister", "reinigung", "winterdienst", "garten"])) {
    return {
      taxRelevant: true,
      relevance: "tax",
      group: "§35a haushaltsnahe Dienstleistungen",
      hint: "Hohenloher Str. 78 bleibt fuer Anlage V gesperrt; reine Arbeits-/Fahrtkosten koennen im §35a-Bereich geprueft werden.",
      locked: false,
    };
  }

  if (isHohenloher && includesAny(text, ["handwerker", "reparatur", "wartung", "schornsteinfeger", "modernisierung", "instandhaltung"])) {
    return {
      taxRelevant: true,
      relevance: "tax",
      group: "§35a Handwerkerleistungen",
      hint: "Hohenloher Str. 78 bleibt fuer Anlage V gesperrt; nur Arbeitslohn und Fahrtkosten sind im §35a-Bereich anzusetzen, Materialkosten nicht.",
      locked: false,
    };
  }

  if (isHohenloher) {
    return {
      taxRelevant: false,
      relevance: "check",
      group: "Selbstgenutzt / WEG steuerlich prüfen",
      hint: "Hohenloher Str. 78 ist keine Anlage-V-Immobilie. Ausgabe bitte fuer §35a, Erwerbsnebenkosten, Homeoffice oder private Lebensfuehrung gezielt pruefen.",
      locked: false,
    };
  }

  if (isBusinessMealCategory(canonicalCategory)) {
    return {
      taxRelevant: true,
      relevance: "tax",
      group: "Bewirtungskosten (70% Werbungskosten)",
      hint: "Bewirtungskosten werden fuer Anlage V mit 70% angesetzt; 30% bleiben privat. Personen, Anlass und Ziel-Immobilie muessen dokumentiert sein.",
      locked: false,
    };
  }

  if (canonicalCategory === "Handy & Internet") {
    return {
      taxRelevant: true,
      relevance: "tax",
      group: "Handy & Internet (20% gedeckelt)",
      hint: "Telefon-/Internetkosten werden mit 20% je Vertrag, maximal 20 EUR, berechnet und auf die vermieteten Objekte verteilt.",
      locked: false,
    };
  }

  if (isPortfolioGeneralEntry(entry) && isPortfolioExpenseCategory(canonicalCategory)) {
    return {
      taxRelevant: true,
      relevance: "tax",
      group: "Allgemein / Portfolio-Ausgabe (anteilige Verwaltungskosten)",
      hint: "Übergreifende Kosten werden im Steuerbericht anteilig auf die 5 vermieteten Anlage-V-Objekte verteilt. Hohenloher Str. 78 bleibt ausgeschlossen.",
      locked: false,
    };
  }

  const fullExpenseGroups: Record<string, string> = {
    Reparatur: "Reparatur / Instandhaltung (Werbungskosten)",
    Grundsteuer: "Grundsteuer (Werbungskosten)",
    "Abfallgebühr": "Abfallgebühr (Werbungskosten)",
    Schonsteinfeger: "Schonsteinfeger (Werbungskosten)",
    Versicherung: "Versicherung (Werbungskosten)",
    Wartung: "Wartung (Werbungskosten)",
    Kontoführungsgebühr: "Kontoführungsgebühr (Werbungskosten)",
    Verwaltungskosten: "Verwaltungskosten (Werbungskosten)",
    Fahrtkosten: "Fahrtkosten (Werbungskosten)",
    Software: "Software (Werbungskosten)",
    Steuerberater: "Steuerberater (Werbungskosten)",
    "Büro / Porto": "Büro / Porto (Werbungskosten)",
  };

  if (fullExpenseGroups[canonicalCategory]) {
    return {
      taxRelevant: true,
      relevance: "tax",
      group: fullExpenseGroups[canonicalCategory],
      hint: "Laufende objektbezogene Ausgabe wird als Werbungskosten fuer Anlage V vorbereitet.",
      locked: false,
    };
  }

  if (includesAny(text, ["leerstand"])) {
    return {
      taxRelevant: false,
      relevance: "check",
      group: "Leerstandskosten prüfen",
      hint: "Kosten bei Leerstand nur bei nachgewiesener Vermietungsabsicht als steuerrelevant bestaetigen.",
      locked: false,
    };
  }

  if (canonicalCategory === "Allgemein" || !canonicalCategory) {
    return {
      taxRelevant: false,
      relevance: "check",
      group: "Allgemein / Sonstige Kosten prüfen",
      hint: "Unklare Ausgabe gezielt pruefen und bei objektbezogener Werbungskosten-Qualitaet als St bestaetigen.",
      locked: false,
    };
  }

  return {
    taxRelevant: true,
    relevance: "tax",
    group: `${canonicalCategory} (Werbungskosten)`,
    hint: "Ausgabe wird nach Kategorie als objektbezogene Werbungskosten vorbereitet.",
    locked: false,
  };
}
