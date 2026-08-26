export const NK_ABRECHNUNG_LABEL = "NK-Abr.";
export const NK_ABRECHNUNG_LONG_LABEL = "Nebenkostenabrechnung";

export type NkClassificationInput = {
  entry_type: "income" | "expense";
  category?: string | null;
  note?: string | null;
};

export type NkClassificationResult = {
  nkRelevant: boolean;
  reason: string;
};

const NK_EXPENSE_WORDS = [
  "grundsteuer",
  "wasser",
  "wasserversorgung",
  "abwasser",
  "entwaesserung",
  "entwässerung",
  "kanal",
  "heizung",
  "warmwasser",
  "brennstoff",
  "wartung heizung",
  "aufzug",
  "strassenreinigung",
  "straßenreinigung",
  "winterdienst",
  "muell",
  "müll",
  "reinigung",
  "gebaeudereinigung",
  "gebäudereinigung",
  "garten",
  "gartenpflege",
  "beleuchtung",
  "hausstrom",
  "allgemeinstrom",
  "schornstein",
  "versicherung",
  "gebaeudeversicherung",
  "gebäudeversicherung",
  "haftpflicht",
  "glas",
  "hauswart",
  "hausmeister",
  "kabel",
  "antenne",
  "wascheinrichtung",
  "rauchwarn",
  "dachrinnenreinigung",
  "betriebskosten",
  "nebenkosten",
  "kalo",
  "techem",
];

const NK_INCOME_WORDS = [
  "nebenkosten",
  "betriebskosten",
  "vorauszahlung",
  "abschlag",
  "nk",
  "erstattung",
  "guthaben",
  "rueckzahlung",
  "rückzahlung",
];

const NK_EXCLUDE_WORDS = [
  "ruecklage",
  "rücklage",
  "instandhaltungsruecklage",
  "instandhaltungsrücklage",
  "erhaltungsruecklage",
  "erhaltungsrücklage",
  "reparatur",
  "instandsetzung",
  "sanierung",
  "modernisierung",
  "verwaltung",
  "verwalter",
  "hausverwaltung",
  "steuerberater",
  "software",
  "bankgebuehr",
  "bankgebühr",
  "kontofuehrung",
  "kontoführung",
  "porto",
  "tilgung",
  "kreditrate",
  "darlehen",
];

export function normalizeNkText(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll("ß", "ss")
    .replace(/[ä]/g, "ae")
    .replace(/[ö]/g, "oe")
    .replace(/[ü]/g, "ue")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasAny(text: string, words: string[]): boolean {
  const tokens = new Set(text.split(" ").filter(Boolean));
  return words.some((word) => {
    const normalized = normalizeNkText(word);
    if (normalized.length <= 2) return tokens.has(normalized);
    return text.includes(normalized);
  });
}

export function inferNkRelevant(entry: NkClassificationInput): boolean {
  return classifyNkRelevance(entry).nkRelevant;
}

export function classifyNkRelevance(entry: NkClassificationInput): NkClassificationResult {
  const text = normalizeNkText(`${entry.category ?? ""} ${entry.note ?? ""}`);
  if (!text) {
    return {
      nkRelevant: false,
      reason: "Keine Kategorie oder Notiz erkennbar. Ohne Nebenkostenbezug bleibt NK-Abr. aus.",
    };
  }

  if (hasAny(text, NK_EXCLUDE_WORDS)) {
    return {
      nkRelevant: false,
      reason:
        "Diese Buchung wirkt nicht umlagefaehig fuer die Nebenkostenabrechnung (z. B. Verwaltung, Reparatur, Ruecklage oder Finanzierung).",
    };
  }

  if (entry.entry_type === "income" && hasAny(text, NK_INCOME_WORDS)) {
    return {
      nkRelevant: true,
      reason:
        "Diese Einnahme wirkt wie Nebenkosten-/Betriebskosten-Vorauszahlung, Erstattung oder Nachzahlung und gehoert in die NK-Abr.",
    };
  }

  if (entry.entry_type === "expense" && hasAny(text, NK_EXPENSE_WORDS)) {
    return {
      nkRelevant: true,
      reason:
        "Diese Ausgabe wirkt wie umlagefaehige Betriebs- oder Nebenkosten und gehoert in die NK-Abr.",
    };
  }

  return {
    nkRelevant: false,
    reason: "Keine typische Nebenkostenabrechnungs-Position erkannt. NK-Abr. bleibt aus.",
  };
}

export function buildNkMismatchMessage(rule: NkClassificationResult, currentValue: boolean): string {
  const recommendation = rule.nkRelevant ? "setzen" : "entfernen";
  const current = currentValue ? "gesetzt" : "nicht gesetzt";
  return `${NK_ABRECHNUNG_LABEL}-Pruefung: Das Kennzeichen ist aktuell ${current}. Empfehlung: ${NK_ABRECHNUNG_LABEL} ${recommendation}.\n\n${rule.reason}`;
}
