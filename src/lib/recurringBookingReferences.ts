import { canonicalizeFinanceCategory, type FinanceEntryType } from "./financeCategories";
import { canonicalUnitLabel } from "./canonicalUnitLabel";

export type RecurringBookingReferenceInput = {
  kind: FinanceEntryType;
  category: string | null | undefined;
  objectLabel: string | null | undefined;
  objectCode?: string | null;
};

/**
 * Einheitliche Vorlagen für wiederkehrende Buchungstexte.
 *
 * Die Vorlage wird ausschließlich als Vorschlag angezeigt. Erst wenn die
 * Nutzerin oder der Nutzer das Kontrollkästchen aktiviert, wird sie als Notiz
 * übernommen. Dadurch bleiben manuell eingegebene Verwendungszwecke erhalten.
 */
export function getRecurringBookingReference(input: RecurringBookingReferenceInput): string | null {
  const objectLabel = String(input.objectLabel ?? "").trim();
  if (!objectLabel || objectLabel === "Nicht zugeordnet / Portfolio") return null;

  const category = canonicalizeFinanceCategory(input.category, input.kind);
  const object = objectLabel.replace(/\s+/g, " ");

  if (input.kind === "expense" && category === "Kreditrate") {
    const normalizedObject = object.toLocaleLowerCase("de-DE");
    if (normalizedObject.includes("colmarer")) return "Darlehensvertrag 650 2083277 88";
    if (normalizedObject.includes("lilienthaler")) return "Darlehensvertrag Lux Credit Ref. Nr. 287-3229732";
    if (normalizedObject.includes("fürther")) return "Darlehensvertrag 2441991360";
    if (normalizedObject.includes("elsasser")) return "Darlehensvertrag Lux Credit Ref. Nr. 287-3286114";
    if (normalizedObject.includes("rosenstein")) return "Darlehensvertrag 80730-2";
    if (normalizedObject.includes("hohenloher")) return "Darlehensvertrag 80767-1";
    return null;
  }

  // Verwaltungskosten werden nicht mit einem generischen Text ergänzt.
  // Die Hausverwaltungsreferenz ist je Objekt verbindlich und wird exakt
  // so übernommen, wie sie für die Überweisung bzw. den Beleg benötigt wird.
  if (input.kind === "expense" && category === "Verwaltungskosten") {
    const normalizedObject = object.toLocaleLowerCase("de-DE");
    if (normalizedObject.includes("colmarer")) return "MREF 64500-2300";
    if (normalizedObject.includes("elsasser")) return "Eigent. 00085-1000302";
    if (normalizedObject.includes("fürther")) return "MREF 11107-01 00700";
    if (normalizedObject.includes("hohenloher")) return "Objekt 195";
    return null;
  }

  if (input.kind === "income" && category === "Miete Garage") {
    const unit = canonicalUnitLabel({ objectLabel: object, objectCode: input.objectCode, rentType: "Garage" }) ?? "Garage";
    return `Miete · ${object} · ${unit}`;
  }

  const templates: Record<string, string> = {
    Miete: "Miete",
    "Miete Nachzahlung": "Miete Nachzahlung",
    "Mietbestandteil-NK": "Nebenkostenvorauszahlung",
    "NK-Nachzahlung": "Nebenkostenabrechnung · Nachzahlung",
    Kaution: "Kaution",
    Grundsteuer: "Grundsteuer",
    Versicherung: "Versicherung",
    Allgemeinstrom: "Allgemeinstrom",
    Instandhaltungsrücklage: "Instandhaltungsrücklage",
  };

  const prefix = templates[category];
  return prefix ? `${prefix} · ${object}` : null;
}
