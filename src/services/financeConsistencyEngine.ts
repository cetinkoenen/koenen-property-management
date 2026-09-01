import type { AppObject, FinanceEntry, LoanChartPoint, LoanDashboardRow, PortfolioLoanRow, YearlyFinanceSummaryRow } from "@/state/AppDataContext";
import { canonicalizeFinanceCategory, isPureRentBackPayment, normalizeFinanceCategoryText, type FinanceEntryType } from "@/lib/financeCategories";
import { isAllocatablePortfolioExpenseEntry, isPortfolioExpenseCategory, isPortfolioGeneralEntry, isPortfolioGeneralReference, PORTFOLIO_GENERAL_LABEL } from "@/lib/portfolioExpense";
import { classifyTaxRelevance } from "@/lib/taxClassification";
import { classifyNkRelevance } from "@/lib/nkClassification";
import { isAnlageVEligible, isRosensteinSharedExpense, isSection35aProfile, resolveEntryTaxProfile, TAX_OBJECT_PROFILES, type TaxReportObjectOption } from "@/services/taxReportEngine";

export type ConsistencySeverity = "ok" | "warning" | "critical";
export type ConsistencyCheck = {
  id: string;
  severity: ConsistencySeverity;
  area: "Buchungen" | "Miete" | "Steuer" | "Steuerbericht" | "Jahreswerte" | "Darlehen" | "Portfolio" | "Datenmodell";
  propertyId: string | null;
  propertyName: string;
  detail: string;
  repairHint: string;
  expectedValue?: number | null;
  actualValue?: number | null;
  delta?: number | null;
};

export type ConsistencyInput = {
  objects: AppObject[];
  entries: FinanceEntry[];
  yearlyFinanceSummaries: YearlyFinanceSummaryRow[];
  portfolioRows: PortfolioLoanRow[];
  loanRows: LoanDashboardRow[];
  loanChartByPropertyId: Record<string, LoanChartPoint[]>;
  year: number;
  today?: Date;
};

export type ConsistencySummary = {
  total: number;
  critical: number;
  warning: number;
  ok: number;
  score: number;
  checks: ConsistencyCheck[];
};

function money(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/straße|strasse/g, "str")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isTaxRelevant(entry: FinanceEntry): boolean | null {
  return typeof entry.tax_relevant === "boolean" ? entry.tax_relevant : null;
}

function entryLabel(entry: FinanceEntry, names: Record<string, string>): string {
  return entry.object_id ? names[String(entry.object_id)] ?? entry.objekt_code ?? "Unbekanntes Objekt" : entry.objekt_code ?? "Ohne Objekt";
}

function isValidIsoDate(value: string | null): boolean {
  if (!value) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function noteContains(entry: FinanceEntry, needles: string[]): boolean {
  const text = normalize(`${entry.category ?? ""} ${entry.note ?? ""}`);
  return needles.some((needle) => text.includes(normalize(needle)));
}

function isRentEntry(entry: FinanceEntry): boolean {
  if (entry.entry_type !== "income") return false;
  const canonicalCategory = canonicalizeFinanceCategory(entry.category, entry.entry_type as FinanceEntryType);
  if (isPureRentBackPayment(canonicalCategory, entry.note)) return false;
  const text = normalize(`${entry.category ?? ""} ${entry.note ?? ""}`);
  return text.includes("miet") || text.includes("garage") || text.includes("pacht");
}

function entryMonth(value: string | null): { year: number; month: number; day: number } | null {
  if (!value || value.length < 7) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = value.length >= 10 ? Number(value.slice(8, 10)) : 1;
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, month, day: Number.isFinite(day) ? day : 1 };
}

function explicitRentMonthFromNote(entry: FinanceEntry): { year: number; month: number } | null {
  const text = normalize(`${entry.category ?? ""} ${entry.note ?? ""}`);
  const yearMatch = text.match(/\b(20\d{2})\b/);
  if (!yearMatch) return null;

  const monthNames: Array<[number, string[]]> = [
    [1, ["januar", "jan"]],
    [2, ["februar", "feb"]],
    [3, ["maerz", "marz", "maer", "mar"]],
    [4, ["april", "apr"]],
    [5, ["mai"]],
    [6, ["juni", "jun"]],
    [7, ["juli", "jul"]],
    [8, ["august", "aug"]],
    [9, ["september", "sep"]],
    [10, ["oktober", "okt"]],
    [11, ["november", "nov"]],
    [12, ["dezember", "dez"]],
  ];

  for (const [month, names] of monthNames) {
    if (names.some((name) => new RegExp(`\\b${name}\\b`).test(text))) {
      return { year: Number(yearMatch[1]), month };
    }
  }

  return null;
}

function effectiveRentMonth(entry: FinanceEntry): { year: number; month: number } | null {
  // Explicit labels such as "April 2026" or "Mai 2026" are more reliable
  // than a pure booking-date rule. This prevents payments booked after the 25th
  // but clearly labelled for the current month from being moved into the next month.
  const explicit = explicitRentMonthFromNote(entry);
  if (explicit) return explicit;

  const parsed = entryMonth(entry.booking_date);
  if (!parsed) return null;
  if (parsed.day < 25) return { year: parsed.year, month: parsed.month };
  return parsed.month === 12 ? { year: parsed.year + 1, month: 1 } : { year: parsed.year, month: parsed.month + 1 };
}

function propertyNameById(objects: AppObject[], portfolioRows: PortfolioLoanRow[], loanRows: LoanDashboardRow[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const object of objects) result[object.id] = object.label;
  for (const row of portfolioRows) {
    result[row.property_id] = result[row.property_id] ?? row.property_name;
    if (row.portfolio_property_id) result[row.portfolio_property_id] = result[row.portfolio_property_id] ?? row.property_name;
  }
  for (const row of loanRows) result[row.property_id] = result[row.property_id] ?? row.property_name;
  return result;
}

function knownPropertyIds(objects: AppObject[], portfolioRows: PortfolioLoanRow[], loanRows: LoanDashboardRow[]): Set<string> {
  return new Set([
    ...objects.flatMap((object) => [object.id, ...(object.aliases ?? [])]),
    ...portfolioRows.flatMap((row) => [row.property_id, row.portfolio_property_id ?? ""]),
    ...loanRows.map((row) => row.property_id),
  ].map((value) => String(value ?? "").trim()).filter(Boolean));
}

function addCheck(checks: ConsistencyCheck[], check: ConsistencyCheck) {
  checks.push(check);
}

function entryYearFromDate(entry: FinanceEntry): number | null {
  const value = String(entry.booking_date ?? "");
  const year = Number(value.slice(0, 4));
  return Number.isFinite(year) && year > 1900 ? year : null;
}

function appObjectsToTaxOptions(objects: AppObject[]): TaxReportObjectOption[] {
  return objects.map((object) => ({
    id: object.id,
    code: object.code,
    label: object.label,
    aliases: object.aliases,
    livingAreaM2: object.livingAreaM2,
  }));
}

function isExpense(entry: FinanceEntry): boolean {
  return entry.entry_type === "expense";
}

function amountAbs(entry: FinanceEntry): number {
  return Math.abs(money(entry.amount));
}

function addSteuerberichtSourceChecks(
  checks: ConsistencyCheck[],
  input: ConsistencyInput,
  names: Record<string, string>,
) {
  const taxObjects = appObjectsToTaxOptions(input.objects);
  const yearEntries = input.entries.filter((entry) => entryYearFromDate(entry) === input.year);
  const stEntries = yearEntries.filter((entry) => entry.tax_relevant === true);
  const portfolioRows = yearEntries.filter((entry) => (
    isExpense(entry)
    && isAllocatablePortfolioExpenseEntry({ ...entry, category: canonicalizeFinanceCategory(entry.category, "expense") })
  ));
  const stPortfolioRows = portfolioRows.filter((entry) => entry.tax_relevant === true);
  const anlageVProfiles = TAX_OBJECT_PROFILES.filter(isAnlageVEligible);
  const rentedObjectCount = anlageVProfiles.length || 1;
  const portfolioTotal = round2(stPortfolioRows.reduce((sum, entry) => sum + amountAbs(entry), 0));
  const portfolioShare = round2(portfolioTotal / rentedObjectCount);
  const stTotal = round2(stEntries.reduce((sum, entry) => sum + amountAbs(entry), 0));

  if (yearEntries.length === 0) {
    addCheck(checks, {
      id: `tax-report-no-source-${input.year}`,
      severity: "critical",
      area: "Steuerbericht",
      propertyId: null,
      propertyName: "Alle Objekte",
      detail: `Für ${input.year} wurden keine Buchungen als Steuerbericht-Quelle geladen.`,
      repairHint: "Buchungen/Filter prüfen. Ohne Buchungen können Anlage V, §35a und Steuerberater-Paket nicht belastbar erstellt werden.",
    });
    return;
  }

  addCheck(checks, {
    id: `tax-report-source-total-${input.year}`,
    severity: "ok",
    area: "Steuerbericht",
    propertyId: null,
    propertyName: "Alle Objekte",
    detail: `${stEntries.length} als St bestätigte Buchungen mit ${stTotal.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € wurden als Steuer-Quellen erkannt.`,
    repairHint: "Diese Summe ist die Kontrollbasis für Steuer-Center, Anlage-V-Paket, §35a-Bericht und Steuerberater-Datenpaket.",
    actualValue: stTotal,
  });

  if (stPortfolioRows.length > 0) {
    addCheck(checks, {
      id: `tax-report-portfolio-share-${input.year}`,
      severity: "ok",
      area: "Steuerbericht",
      propertyId: null,
      propertyName: PORTFOLIO_GENERAL_LABEL,
      detail: `${stPortfolioRows.length} steuerrelevante Portfolio-Ausgaben (${portfolioTotal.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €) werden auf ${rentedObjectCount} Anlage-V-Objekte verteilt.`,
      repairHint: `Im Bericht erscheint der Anteil unter "Verwaltungskosten & Pauschalen": ${portfolioShare.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € je vermietetem Objekt. Hohenloher bleibt ausgeschlossen.`,
      expectedValue: portfolioShare,
      actualValue: portfolioTotal,
    });
  }

  for (const entry of portfolioRows.filter((row) => row.tax_relevant !== true)) {
    addCheck(checks, {
      id: `tax-report-portfolio-not-st-${entry.id ?? `${entry.booking_date ?? "unknown"}-${entry.category ?? "no-category"}-${entry.amount ?? "no-amount"}`}`,
      severity: "warning",
      area: "Steuerbericht",
      propertyId: null,
      propertyName: PORTFOLIO_GENERAL_LABEL,
      detail: `Portfolio-Ausgabe "${entry.category ?? "ohne Kategorie"}" vom ${entry.booking_date ?? "ohne Datum"} ist nicht als St bestätigt.`,
      repairHint: "Wenn diese Ausgabe steuerlich in Anlage V verteilt werden soll, St-Haken setzen. Andernfalls bleibt sie bewusst außerhalb des Steuerberichts.",
      actualValue: amountAbs(entry),
    });
  }

  for (const entry of stEntries) {
    const isPortfolio = isPortfolioGeneralEntry(entry);
    const profile = resolveEntryTaxProfile(entry, taxObjects);
    const propertyName = isPortfolio ? PORTFOLIO_GENERAL_LABEL : profile?.reportLabel ?? entryLabel(entry, names);

    if (isPortfolio) continue;

    if (!profile && !isRosensteinSharedExpense(entry, taxObjects)) {
      addCheck(checks, {
        id: `tax-report-unresolved-${entry.id ?? entry.booking_date ?? "unknown"}`,
        severity: "critical",
        area: "Steuerbericht",
        propertyId: entry.object_id ? String(entry.object_id) : null,
        propertyName,
        detail: `St-Buchung "${entry.category ?? "ohne Kategorie"}" vom ${entry.booking_date ?? "ohne Datum"} konnte keinem Steuer-Objektprofil zugeordnet werden.`,
        repairHint: "Objekt/Zuordnung korrigieren. Jede St-Buchung muss entweder einem der 7 Anlage-V-Steuerobjekte, Hohenloher §35a oder Allgemein/Portfolio-Ausgabe zugeordnet sein.",
        actualValue: amountAbs(entry),
      });
    } else if (isSection35aProfile(profile) && entry.entry_type === "income") {
      addCheck(checks, {
        id: `tax-report-hohenloher-income-${entry.id ?? entry.booking_date ?? "unknown"}`,
        severity: "warning",
        area: "Steuerbericht",
        propertyId: entry.object_id ? String(entry.object_id) : null,
        propertyName,
        detail: "Für Hohenloher Str. 78 ist eine Einnahme als St markiert.",
        repairHint: "Hohenloher ist selbstgenutzt/WEG und für Anlage V gesperrt. Einnahme prüfen und nur echte §35a-/Sonderfälle dokumentieren.",
        actualValue: amountAbs(entry),
      });
    }
  }

  for (const profile of anlageVProfiles) {
    const profileRows = yearEntries.filter((entry) => resolveEntryTaxProfile(entry, taxObjects)?.key === profile.key);
    const profileStRows = profileRows.filter((entry) => entry.tax_relevant === true);
    const income = round2(profileRows
      .filter((entry) => entry.entry_type === "income" && isRentEntry(entry))
      .reduce((sum, entry) => sum + amountAbs(entry), 0));
    const expenses = round2(profileStRows
      .filter((entry) => entry.entry_type === "expense")
      .reduce((sum, entry) => sum + amountAbs(entry), 0));

    if (profileRows.length === 0 && stPortfolioRows.length === 0) {
      addCheck(checks, {
        id: `tax-report-profile-empty-${profile.key}-${input.year}`,
        severity: "warning",
        area: "Steuerbericht",
        propertyId: null,
        propertyName: profile.reportLabel,
        detail: `Für ${profile.reportLabel} wurden im Jahr ${input.year} keine Buchungsquellen erkannt.`,
        repairHint: "Prüfen, ob Buchungen korrekt mit diesem Objekt verknüpft sind. Sonst bleibt der Objektbericht unvollständig.",
      });
      continue;
    }

    addCheck(checks, {
      id: `tax-report-profile-source-${profile.key}-${input.year}`,
      severity: "ok",
      area: "Steuerbericht",
      propertyId: null,
      propertyName: profile.reportLabel,
      detail: `Steuerquellen erkannt: ${profileRows.length} Objektbuchungen, Mieteinnahmen ${income.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €, St-Ausgaben ${expenses.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € plus Portfolio-Anteil ${portfolioShare.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €.` ,
      repairHint: "Diese Werte werden im Anlage-V-Paket objektbezogen verarbeitet; Portfolio-Ausgaben werden zusätzlich anteilig unter Verwaltungskosten & Pauschalen ausgewiesen.",
      expectedValue: portfolioShare,
      actualValue: round2(income + expenses + portfolioShare),
    });
  }
}

export function buildFinanceConsistencySummary(input: ConsistencyInput): ConsistencySummary {
  const today = input.today ?? new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  // Operational grace period: the payment calendar already distinguishes
  // receipts through day 10. A current-month absence must therefore not be
  // reported as a data error while an on-time/near-time receipt can still be
  // booked. Historical months remain strict.
  const currentMonthIsDueForConsistencyCheck = today.getDate() > 10;
  const names = propertyNameById(input.objects, input.portfolioRows, input.loanRows);
  const knownIds = knownPropertyIds(input.objects, input.portfolioRows, input.loanRows);
  const checks: ConsistencyCheck[] = [];

  const objectNameKeys = new Map<string, AppObject[]>();
  for (const object of input.objects) {
    const key = normalize(object.label);
    if (!key) continue;
    objectNameKeys.set(key, [...(objectNameKeys.get(key) ?? []), object]);
    if (!object.label || normalize(object.label).startsWith("objekt")) {
      addCheck(checks, {
        id: `object-name-${object.id}`,
        severity: "warning",
        area: "Datenmodell",
        propertyId: object.id,
        propertyName: object.label || object.code || "Unbenanntes Objekt",
        detail: "Ein Objekt hat keinen klaren Immobiliennamen.",
        repairHint: "Immobilienvermögen/Stammdaten prüfen und eine eindeutige Bezeichnung eintragen.",
      });
    }
    if (!object.code) {
      addCheck(checks, {
        id: `object-code-${object.id}`,
        severity: "warning",
        area: "Datenmodell",
        propertyId: object.id,
        propertyName: object.label,
        detail: "Ein Objekt hat keinen Objekt-Code.",
        repairHint: "Objekt-Code nachtragen, damit Buchungen, Mieteingang und Auswertungen stabil zugeordnet werden.",
      });
    }
  }

  for (const [key, group] of objectNameKeys.entries()) {
    if (group.length < 2) continue;
    addCheck(checks, {
      id: `duplicate-object-name-${key}`,
      severity: "warning",
      area: "Datenmodell",
      propertyId: group[0]?.id ?? null,
      propertyName: group[0]?.label ?? "Doppeltes Objekt",
      detail: `${group.length} Objektdatensätze haben denselben Namen.`,
      repairHint: "Prüfen, ob dies echte Einheiten sind oder technische Dubletten. Bei Einheiten eindeutige Einheit/Stellplatz ergänzen.",
      actualValue: group.length,
    });
  }

  const duplicateMap = new Map<string, FinanceEntry[]>();
  for (const entry of input.entries) {
    const key = [
      entry.object_id ?? "no-object",
      entry.booking_date ?? "no-date",
      entry.entry_type ?? "no-type",
      normalize(entry.category),
      normalize(entry.note),
      round2(money(entry.amount)).toFixed(2),
    ].join("|");
    duplicateMap.set(key, [...(duplicateMap.get(key) ?? []), entry]);
    const propertyName = entryLabel(entry, names);
    const amount = money(entry.amount);
    const entryType = entry.entry_type === "income" || entry.entry_type === "expense" ? entry.entry_type as FinanceEntryType : null;
    const canonicalCategory = canonicalizeFinanceCategory(entry.category, entryType);
    const isPortfolioGeneral = isPortfolioGeneralEntry(entry);

    if (entry.object_id && !knownIds.has(String(entry.object_id)) && !isPortfolioGeneralReference(entry.object_id)) {
      addCheck(checks, {
        id: `unlinked-${entry.id ?? key}`,
        severity: "warning",
        area: "Datenmodell",
        propertyId: String(entry.object_id),
        propertyName: entry.objekt_code ?? "Unbekanntes Objekt",
        detail: `Buchung vom ${entry.booking_date ?? "ohne Datum"} ist mit einer Objekt-ID verknüpft, die nicht in der Objekt-/Portfolio-Liste gefunden wurde.`,
        repairHint: "Objekt-ID, Objektcode und Portfolio-Verknüpfung prüfen. Danach Datenprüfung neu laden.",
      });
    }

    if (!entry.booking_date) {
      addCheck(checks, {
        id: `missing-date-${entry.id ?? key}`,
        severity: "warning",
        area: "Buchungen",
        propertyId: entry.object_id ? String(entry.object_id) : null,
        propertyName: entry.object_id ? names[String(entry.object_id)] ?? "Unbekanntes Objekt" : "Ohne Objekt",
        detail: "Eine Buchung hat kein Buchungsdatum.",
        repairHint: "Buchungsdatum nachtragen, weil Monats- und Jahreswerte sonst nicht sicher berechnet werden können.",
      });
    } else if (!isValidIsoDate(entry.booking_date)) {
      addCheck(checks, {
        id: `invalid-date-${entry.id ?? key}`,
        severity: "critical",
        area: "Buchungen",
        propertyId: entry.object_id ? String(entry.object_id) : null,
        propertyName,
        detail: `Buchungsdatum "${entry.booking_date}" ist kein gültiges ISO-Datum.`,
        repairHint: "Datum in der Buchung korrigieren. Erwartetes Format in der Datenbank: YYYY-MM-DD.",
      });
    }

    if (!entry.object_id && !entry.objekt_code && !isPortfolioGeneral) {
      addCheck(checks, {
        id: `missing-object-${entry.id ?? key}`,
        severity: "critical",
        area: "Buchungen",
        propertyId: null,
        propertyName: "Ohne Objekt",
        detail: `Buchung vom ${entry.booking_date ?? "ohne Datum"} hat keine Objektzuordnung.`,
        repairHint: "Objekt/Immobilie in der Buchung nachtragen, sonst können Mieteingang, Steuer und Reports die Buchung nicht sauber verwenden.",
      });
    }

    if (!entry.entry_type || !["income", "expense"].includes(entry.entry_type)) {
      addCheck(checks, {
        id: `missing-entry-type-${entry.id ?? key}`,
        severity: "critical",
        area: "Buchungen",
        propertyId: entry.object_id ? String(entry.object_id) : null,
        propertyName,
        detail: "Eine Buchung hat keinen gültigen Typ Einnahme/Ausgabe.",
        repairHint: "Buchung öffnen und Typ korrigieren, weil Summen sonst nicht belastbar sind.",
      });
    }

    if (!entry.category?.trim()) {
      addCheck(checks, {
        id: `missing-category-${entry.id ?? key}`,
        severity: "warning",
        area: "Buchungen",
        propertyId: entry.object_id ? String(entry.object_id) : null,
        propertyName,
        detail: `Buchung vom ${entry.booking_date ?? "ohne Datum"} hat keine Kategorie.`,
        repairHint: "Kategorie ergänzen. Die Kategorie ist die Grundlage für Steuer, Capex, NK, Mieteingang und Berichte.",
      });
    } else if (
      canonicalCategory
      && normalizeFinanceCategoryText(canonicalCategory) !== normalizeFinanceCategoryText(entry.category)
    ) {
      addCheck(checks, {
        id: `category-normalization-${entry.id ?? key}`,
        severity: "warning",
        area: "Buchungen",
        propertyId: entry.object_id ? String(entry.object_id) : null,
        propertyName: isPortfolioGeneral ? PORTFOLIO_GENERAL_LABEL : propertyName,
        detail: `Kategorie "${entry.category}" wird steuerlich als "${canonicalCategory}" interpretiert.`,
        repairHint: `Buchung öffnen und Kategorie auf "${canonicalCategory}" korrigieren, damit Buchungen, Steuerbericht und Filter dieselbe Bezeichnung verwenden.`,
      });
    }

    if (isPortfolioGeneral && !isPortfolioExpenseCategory(canonicalCategory)) {
      addCheck(checks, {
        id: `portfolio-general-category-${entry.id ?? key}`,
        severity: "warning",
        area: "Steuer",
        propertyId: null,
        propertyName: PORTFOLIO_GENERAL_LABEL,
        detail: `Portfolio-Ausgabe "${entry.category ?? "ohne Kategorie"}" gehört nicht zu den freigegebenen übergreifenden Kostenarten.`,
        repairHint: "Nur Software, Steuerberater, Büro/Porto, Handy & Internet, Kontoführungsgebühr, Verwaltungskosten, Steuer oder Allgemein als Portfolio-Ausgabe verwenden. Erwerbsnebenkosten/Anschaffungskosten bitte immer einem konkreten Objekt zuordnen.",
      });
    }

    if (amount === 0) {
      addCheck(checks, {
        id: `zero-amount-${entry.id ?? key}`,
        severity: "warning",
        area: "Buchungen",
        propertyId: entry.object_id ? String(entry.object_id) : null,
        propertyName,
        detail: `Buchung vom ${entry.booking_date ?? "ohne Datum"} hat den Betrag 0,00 €.`,
        repairHint: "Prüfen, ob dies eine echte Nullbuchung ist. Falls nicht, Betrag korrigieren.",
      });
    }

    const taxDecision = classifyTaxRelevance(entry, propertyName);
    const explicitTax = isTaxRelevant(entry);
    if (taxDecision.locked && explicitTax === true) {
      addCheck(checks, {
        id: `tax-locked-${entry.id ?? key}`,
        severity: "critical",
        area: "Steuer",
        propertyId: entry.object_id ? String(entry.object_id) : null,
        propertyName,
        detail: `Buchung "${entry.category ?? "ohne Kategorie"}" ist als St markiert, obwohl die Steuerregel sie sperrt.`,
        repairHint: taxDecision.hint,
      });
    } else if (taxDecision.taxRelevant && explicitTax !== true) {
      addCheck(checks, {
        id: `tax-missing-${entry.id ?? key}`,
        severity: "warning",
        area: "Steuer",
        propertyId: entry.object_id ? String(entry.object_id) : null,
        propertyName,
        detail: `Buchung "${entry.category ?? "ohne Kategorie"}" ist wahrscheinlich steuerrelevant, aber nicht als St bestätigt.`,
        repairHint: taxDecision.hint,
      });
    } else if (!taxDecision.taxRelevant && explicitTax === true) {
      addCheck(checks, {
        id: `tax-unexpected-${entry.id ?? key}`,
        severity: "warning",
        area: "Steuer",
        propertyId: entry.object_id ? String(entry.object_id) : null,
        propertyName,
        detail: `Buchung "${entry.category ?? "ohne Kategorie"}" ist als St markiert, obwohl die Regel eine Prüfung oder private Behandlung empfiehlt.`,
        repairHint: taxDecision.hint,
      });
    }


    if (entry.entry_type === "income" || entry.entry_type === "expense") {
      const nkDecision = classifyNkRelevance({
        entry_type: entry.entry_type,
        category: entry.category,
        note: entry.note,
        objectLabel: propertyName,
      });
      const explicitNk = typeof entry.nk_relevant === "boolean" ? entry.nk_relevant : null;
      if (explicitNk !== nkDecision.nkRelevant) {
        addCheck(checks, {
          id: `nk-mismatch-${entry.id ?? key}`,
          severity: "warning",
          area: "Buchungen",
          propertyId: entry.object_id ? String(entry.object_id) : null,
          propertyName,
          detail: `Buchung "${entry.category ?? "ohne Kategorie"}" hat NK-Abr. ${explicitNk === true ? "gesetzt" : "nicht gesetzt"}, erwartet wird ${nkDecision.nkRelevant ? "gesetzt" : "nicht gesetzt"}.`,
          repairHint: nkDecision.reason,
        });
      }
    }

    if (noteContains(entry, ["handy internet", "telefon internet", "telekommunikation"]) && !noteContains(entry, ["telekommunikation steuerlich", "ehepartner a", "ehepartner b", "festnetz"])) {
      addCheck(checks, {
        id: `telecom-details-${entry.id ?? key}`,
        severity: "warning",
        area: "Steuer",
        propertyId: entry.object_id ? String(entry.object_id) : null,
        propertyName,
        detail: "Handy-/Internet-Buchung hat keine erkennbare 3-Felder-Aufschlüsselung.",
        repairHint: "Buchung über den Stift öffnen und Mobilfunk A, Mobilfunk B sowie Festnetz/Internet nachtragen.",
      });
    }

    if (noteContains(entry, ["bewirtungskosten", "bewirtung"]) && !noteContains(entry, ["personen", "anlass", "thema"])) {
      addCheck(checks, {
        id: `meal-details-${entry.id ?? key}`,
        severity: "warning",
        area: "Steuer",
        propertyId: entry.object_id ? String(entry.object_id) : null,
        propertyName,
        detail: "Bewirtungskosten-Buchung hat keine vollständig erkennbare steuerliche Dokumentation.",
        repairHint: "Personen, Anlass/Thema und Ziel-Immobilie dokumentieren, damit der 70%-Ansatz nachvollziehbar ist.",
      });
    }
  }

  for (const [key, group] of duplicateMap.entries()) {
    if (group.length < 2) continue;
    const first = group[0];
    addCheck(checks, {
      id: `duplicate-${key}`,
      severity: "critical",
      area: "Buchungen",
      propertyId: first.object_id ? String(first.object_id) : null,
      propertyName: first.object_id ? names[String(first.object_id)] ?? first.objekt_code ?? "Unbekanntes Objekt" : first.objekt_code ?? "Ohne Objekt",
      detail: `${group.length} mögliche doppelte Buchungen: ${first.booking_date ?? "ohne Datum"}, ${first.category ?? "ohne Kategorie"}, ${round2(money(first.amount)).toLocaleString("de-DE")} €.` ,
      repairHint: "Buchungen manuell vergleichen und nur echte Dubletten löschen. Nicht automatisch löschen.",
      actualValue: group.length,
    });
  }

  const entriesByPropertyYear = new Map<string, { income: number; expense: number; rent: number }>();
  const rentByPropertyMonth = new Map<string, number>();
  for (const entry of input.entries) {
    if (!entry.object_id) continue;
    const id = String(entry.object_id);
    const ym = entryMonth(entry.booking_date);
    if (ym?.year === input.year) {
      const key = `${id}|${input.year}`;
      const existing = entriesByPropertyYear.get(key) ?? { income: 0, expense: 0, rent: 0 };
      if (entry.entry_type === "income") existing.income += money(entry.amount);
      if (entry.entry_type === "expense") existing.expense += money(entry.amount);
      if (isRentEntry(entry)) existing.rent += money(entry.amount);
      entriesByPropertyYear.set(key, existing);
    }

    if (isRentEntry(entry)) {
      const rentMonth = effectiveRentMonth(entry);
      if (rentMonth) {
        const rentKey = `${id}|${rentMonth.year}|${rentMonth.month}`;
        rentByPropertyMonth.set(rentKey, (rentByPropertyMonth.get(rentKey) ?? 0) + money(entry.amount));
      }
    }
  }

  for (const summary of input.yearlyFinanceSummaries.filter((row) => row.jahr === input.year)) {
    const id = String(summary.object_id ?? "");
    if (!id) continue;
    const calculated = entriesByPropertyYear.get(`${id}|${input.year}`);
    if (!calculated) continue;
    const dbNet = round2(money(summary.einnahmen) - money(summary.ausgaben));
    const entryNet = round2(calculated.income - calculated.expense);
    const delta = round2(entryNet - dbNet);
    if (Math.abs(delta) > 1) {
      addCheck(checks, {
        id: `yearly-delta-${id}-${input.year}`,
        severity: Math.abs(delta) > 100 ? "critical" : "warning",
        area: "Jahreswerte",
        propertyId: id,
        propertyName: names[id] ?? summary.objekt_code ?? "Unbekanntes Objekt",
        detail: `Jahres-Netto ${input.year} aus Buchungen weicht von der Jahres-View ab.`,
        repairHint: "Materialized Views/Finanz-Views refreshen und prüfen, ob alle Buchungen korrekt kategorisiert sind.",
        expectedValue: dbNet,
        actualValue: entryNet,
        delta,
      });
    }
  }

  const propertiesWithCurrentRent = new Set<string>();
  for (const entry of input.entries) {
    if (!entry.object_id || !isRentEntry(entry)) continue;
    const rentMonth = effectiveRentMonth(entry);
    if (rentMonth?.year === input.year) propertiesWithCurrentRent.add(String(entry.object_id));
  }

  if (input.year <= currentYear) {
    const maxMonth = input.year === currentYear
      ? currentMonth - (currentMonthIsDueForConsistencyCheck ? 0 : 1)
      : 12;
    for (const propertyId of propertiesWithCurrentRent) {
      for (let month = 1; month <= maxMonth; month += 1) {
        const value = rentByPropertyMonth.get(`${propertyId}|${input.year}|${month}`) ?? 0;
        if (value <= 0) {
          addCheck(checks, {
            id: `missing-rent-${propertyId}-${input.year}-${month}`,
            severity: month === currentMonth ? "warning" : "critical",
            area: "Miete",
            propertyId,
            propertyName: names[propertyId] ?? "Unbekanntes Objekt",
            detail: `Für ${String(month).padStart(2, "0")}/${input.year} wurde kein Mieteingang gefunden. Zukünftige Monate werden bewusst nicht rot markiert.`,
            repairHint: 'Mieteingang prüfen. Wenn die Notiz einen Monat nennt (z. B. "April 2026"), wird dieser Monat bevorzugt; sonst gilt die 25.-Regel.',
            actualValue: value,
          });
        }
      }
    }
  }

  for (const [propertyId, chart] of Object.entries(input.loanChartByPropertyId)) {
    const sorted = [...chart].sort((a, b) => a.year - b.year);
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      const delta = round2(current.balance - previous.balance);
      if (delta > 1) {
        addCheck(checks, {
          id: `loan-increase-${propertyId}-${current.year}`,
          severity: "warning",
          area: "Darlehen",
          propertyId,
          propertyName: names[propertyId] ?? "Unbekanntes Objekt",
          detail: `Restschuld steigt von ${previous.year} auf ${current.year}.`,
          repairHint: "Ledger-Zeilen prüfen. Falls Sonderfall/Neufinanzierung: bewusst akzeptieren, sonst Saldo korrigieren.",
          expectedValue: previous.balance,
          actualValue: current.balance,
          delta,
        });
      }
    }
  }

  for (const loan of input.loanRows) {
    if (!loan.property_id) continue;
    const balance = money(loan.last_balance);
    if (balance > 0 && loan.last_balance_year != null && loan.last_balance_year < input.year) {
      addCheck(checks, {
        id: `loan-year-stale-${loan.property_id}`,
        severity: "warning",
        area: "Darlehen",
        propertyId: loan.property_id,
        propertyName: loan.property_name,
        detail: `Darlehensstand ist nur bis ${loan.last_balance_year} gepflegt, geprüft wird aber ${input.year}.`,
        repairHint: "Darlehensübersicht für das aktuelle Steuer-/Auswertungsjahr ergänzen.",
        actualValue: loan.last_balance_year,
        expectedValue: input.year,
      });
    }
    if (balance < 0 || money(loan.interest_total) < 0 || money(loan.principal_total) < 0) {
      addCheck(checks, {
        id: `loan-negative-${loan.property_id}`,
        severity: "critical",
        area: "Darlehen",
        propertyId: loan.property_id,
        propertyName: loan.property_name,
        detail: "Darlehensdashboard enthält negative Restschuld/Zins-/Tilgungswerte.",
        repairHint: "Darlehens-Ledger prüfen. Negative Werte führen zu falschen Steuer- und Vermögensreports.",
      });
    }
  }

  for (const portfolio of input.portfolioRows) {
    if (!portfolio.portfolio_property_id) {
      addCheck(checks, {
        id: `portfolio-link-missing-${portfolio.property_id}`,
        severity: "warning",
        area: "Portfolio",
        propertyId: portfolio.property_id,
        propertyName: portfolio.property_name,
        detail: "Portfolio-Zeile hat keine portfolio_property_id/core-Verknüpfung.",
        repairHint: "Immobilienvermögen-Stammdaten prüfen. Ohne stabile Verknüpfung können Darlehen, Energie, Steuer und Reports auseinanderlaufen.",
      });
    }
    const loan = input.loanRows.find((row) => row.property_id === portfolio.property_id || row.property_id === portfolio.portfolio_property_id);
    if (!loan || loan.last_balance == null) continue;
    const delta = round2(money(portfolio.last_balance) - money(loan.last_balance));
    if (Math.abs(delta) > 1) {
      addCheck(checks, {
        id: `portfolio-loan-delta-${portfolio.property_id}`,
        severity: "critical",
        area: "Portfolio",
        propertyId: portfolio.property_id,
        propertyName: portfolio.property_name,
        detail: "Portfolio-Restschuld und Darlehensdashboard zeigen unterschiedliche Werte.",
        repairHint: "Materialized Views refreshen und prüfen, ob Portfolio-ID und Darlehens-ID auf dasselbe Objekt zeigen.",
        expectedValue: money(loan.last_balance),
        actualValue: money(portfolio.last_balance),
        delta,
      });
    }
  }

  addSteuerberichtSourceChecks(checks, input, names);

  const sortedChecks = checks.sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, ok: 2 } satisfies Record<ConsistencySeverity, number>;
    return severityOrder[a.severity] - severityOrder[b.severity] || a.area.localeCompare(b.area, "de") || a.propertyName.localeCompare(b.propertyName, "de");
  });

  const critical = sortedChecks.filter((check) => check.severity === "critical").length;
  const warning = sortedChecks.filter((check) => check.severity === "warning").length;
  const ok = sortedChecks.filter((check) => check.severity === "ok").length;
  const total = sortedChecks.length;
  const score = Math.max(0, Math.round(100 - critical * 12 - warning * 4));

  return { total, critical, warning, ok: total === 0 ? 1 : ok, score, checks: sortedChecks };
}
