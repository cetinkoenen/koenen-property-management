import { classifyNkRelevance } from "../lib/nkClassification";
import { canonicalCategoryForTax, classifyTaxRelevance } from "../lib/taxClassification";
import type { AppObject, FinanceEntry } from "../state/AppDataContext";
import { parseLocaleNumber } from "../utils/numberParser";
import { masterNamesMatch } from "./masterDataService";
import type { ReportModule, ReportRecord, ReportSources } from "./reportCenterEngine";
import { detectRosensteinTaxUnit, isRosensteinLabel, type RosensteinTaxUnitCode } from "../lib/rosensteinTaxUnit";

export type TaxPreflightSeverity = "blocker" | "review" | "info";

export type TaxPreflightIssue = {
  id: string;
  severity: TaxPreflightSeverity;
  objectLabel: string;
  title: string;
  detail: string;
  bookingId?: string;
};

export type TaxPreflightResult = {
  issues: TaxPreflightIssue[];
  entries: FinanceEntry[];
  duplicateCount: number;
  blockers: number;
  reviewCount: number;
  calculatedValues: number;
  ready: boolean;
};

const text = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = parseLocaleNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
};
const normalize = (value: unknown) => text(value)
  .toLocaleLowerCase("de-DE")
  .replaceAll("ß", "ss")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();
const overlaps = (row: ReportRecord, from: string, to: string) => (
  (!row.start_date || text(row.start_date).slice(0, 10) <= to)
  && (!row.end_date || text(row.end_date).slice(0, 10) >= from)
);
const isParking = (value: unknown) => /garage|stellplatz|tiefgarage|\btg\b|\bp\d{2,}\b/i.test(text(value));
const isOwnerOccupied = (value: unknown) => /hohenloher/i.test(text(value));

function propertyAliases(object: AppObject, sources: ReportSources): Set<string> {
  const aliases = new Set([object.id, object.code, object.label, ...(object.aliases ?? [])].filter(Boolean).map(text));
  for (const row of sources.portfolio_properties ?? []) {
    const values = [row.id, row.core_property_id, row.name, row.property_name, row.address].filter(Boolean).map(text);
    if (values.some((value) => aliases.has(value) || masterNamesMatch(value, object.label))) values.forEach((value) => aliases.add(value));
  }
  for (const row of [...(sources.property_id_aliases ?? []), ...(sources.object_bridge ?? [])]) {
    const values = [row.object_id, row.property_id, row.legacy_property_id, row.objekt_code, row.property_name].filter(Boolean).map(text);
    if (values.some((value) => aliases.has(value) || masterNamesMatch(value, object.label))) values.forEach((value) => aliases.add(value));
  }
  return aliases;
}

function exactDuplicateKey(entry: FinanceEntry): string {
  return [
    text(entry.booking_date).slice(0, 10),
    normalize(entry.object_id),
    normalize(entry.objekt_code),
    normalize(entry.entry_type),
    Math.abs(Number(entry.amount ?? 0)).toFixed(2),
    normalize(entry.category),
    normalize(entry.note),
  ].join("|");
}

/**
 * Read-only preflight for tax exports. It never guesses or rewrites accounting
 * records. Only byte-for-byte equivalent accounting facts are suppressed as
 * duplicate imports; every ambiguous case remains visible for review.
 */
export function buildTaxReportPreflight(input: {
  objects: AppObject[];
  entries: FinanceEntry[];
  sources: ReportSources;
  from: string;
  to: string;
  objectId?: string;
  rosensteinUnit?: RosensteinTaxUnitCode;
}): TaxPreflightResult {
  const aliasesById = new Map(input.objects.map((object) => [object.id, propertyAliases(object, input.sources)]));
  const objectFor = (row: ReportRecord | FinanceEntry): AppObject | undefined => input.objects.find((object) => {
    const aliases = aliasesById.get(object.id) ?? new Set<string>();
    const ids = [row.object_id, row.objekt_code, (row as ReportRecord).property_id, (row as ReportRecord).object_code, (row as ReportRecord).portfolio_property_id]
      .filter(Boolean).map(text);
    if (ids.some((id) => aliases.has(id))) return true;
    const names = [(row as ReportRecord).object_label, (row as ReportRecord).property_label, (row as ReportRecord).property_name, (row as ReportRecord).address]
      .filter(Boolean);
    return names.some((name) => masterNamesMatch(name, object.label));
  });
  const inScope = (entry: FinanceEntry) => {
    const date = text(entry.booking_date).slice(0, 10);
    if (date < input.from || date > input.to) return false;
    const object = objectFor(entry);
    if (input.objectId && object?.id !== input.objectId) return false;
    if (!input.rosensteinUnit) return true;
    const directUnit = detectRosensteinTaxUnit(entry.objekt_code, entry.category, entry.note);
    if (directUnit) return directUnit === input.rosensteinUnit;
    return entry.entry_type === "expense" && isRosensteinLabel(object?.label);
  };
  const issues: TaxPreflightIssue[] = [];
  let calculatedValues = 0;

  const seen = new Map<string, FinanceEntry>();
  const entries: FinanceEntry[] = [];
  let duplicateCount = 0;
  for (const entry of input.entries.filter(inScope).sort((left, right) => text(left.id).localeCompare(text(right.id), "de", { numeric: true }))) {
    const key = exactDuplicateKey(entry);
    const canonical = seen.get(key);
    if (canonical) {
      duplicateCount += 1;
      issues.push({
        id: `duplicate-${entry.id ?? duplicateCount}`,
        severity: "review",
        objectLabel: objectFor(entry)?.label ?? "Nicht zugeordnet",
        title: "Exakte Buchungsdublette im Steuerexport unterdrückt",
        detail: `Buchung ${entry.id ?? "ohne ID"} entspricht vollständig der Buchung ${canonical.id ?? "ohne ID"}. Sie wird im Report nicht ein zweites Mal summiert; der Datenbankdatensatz bleibt zur Prüfung erhalten.`,
        bookingId: text(entry.id),
      });
      continue;
    }
    seen.set(key, entry);
    entries.push(entry);
  }

  const people = input.sources.tenant_profiles ?? [];
  const tenantName = (contract: ReportRecord) => {
    const person = people.find((row) => row.id === contract.tenant_id);
    return person ? text(person.company_name) || [person.first_name, person.last_name].filter(Boolean).join(" ") : "";
  };
  const contracts = (input.sources.tenant_contracts ?? []).filter((contract) => (
    contract.is_deleted !== true
    && contract.status !== "vacant"
    && contract.status !== "planned"
    && overlaps(contract, input.from, input.to)
    && (!input.objectId || objectFor(contract)?.id === input.objectId)
    && (!input.rosensteinUnit || detectRosensteinTaxUnit(contract.unit_label, contract.object_code, contract.objekt_code) === input.rosensteinUnit)
  ));
  const rentalPeriods = (input.sources.portfolio_property_rentals ?? []).filter((rental) => (
    overlaps(rental,input.from,input.to)
    && (!input.objectId || objectFor(rental)?.id === input.objectId)
    && (!input.rosensteinUnit || detectRosensteinTaxUnit(
      rental.unit_label,
      (input.sources.portfolio_units ?? []).find((unit) => unit.id === rental.unit_id)?.name,
    ) === input.rosensteinUnit)
  ));
  const rentSources = [
    ...contracts,
    ...rentalPeriods.filter((rental) => !contracts.some((contract) => (
      objectFor(contract)?.id === objectFor(rental)?.id
      && text(contract.start_date).slice(0,10) === text(rental.start_date).slice(0,10)
      && text(contract.end_date).slice(0,10) === text(rental.end_date).slice(0,10)
      && numberOrNull(contract.total_rent) === numberOrNull(rental.gesamt_mietkosten ?? rental.rent_monthly)
    ))),
  ];
  const units = input.sources.portfolio_units ?? [];
  const adjustments = input.sources.rent_adjustments ?? [];
  const extraRows = input.sources.property_extra ?? [];

  for (const rental of rentalPeriods) {
    const object = objectFor(rental);
    if (!object) continue;
    const cold = numberOrNull(rental.kaltmiete_laut_mietvertrag);
    const operating = numberOrNull(rental.nebenkosten);
    const totalRent = numberOrNull(rental.gesamt_mietkosten ?? rental.rent_monthly);
    const start = text(rental.start_date).slice(0,10);
    const end = text(rental.end_date).slice(0,10);
    if (end && start && end < start) {
      issues.push({ id:`rental-dates-${rental.id}`, severity:'blocker', objectLabel:object.label, title:'Ungültiger Vermietungszeitraum', detail:`Beginn ${start} liegt nach dem Ende ${end}.` });
    }
    if (cold === null || operating === null || totalRent === null || Math.abs(cold + operating - totalRent) > 0.02) {
      issues.push({ id:`rental-sum-${rental.id}`, severity:'blocker', objectLabel:object.label, title:'Mietbestandteile sind nicht vollständig oder widersprüchlich', detail:`Zeitraum ${start || 'ohne Beginn'}: Kaltmiete, Nebenkosten und Warmmiete müssen vollständig sein; Kalt + NK muss der Warmmiete entsprechen.` });
    }
    const unitKey = text(rental.unit_id || rental.unit_label || 'Gesamte Immobilie');
    const overlap = rentalPeriods.find(candidate => candidate !== rental
      && objectFor(candidate)?.id === object.id
      && text(candidate.unit_id || candidate.unit_label || 'Gesamte Immobilie') === unitKey
      && text(candidate.id).localeCompare(text(rental.id)) > 0
      && overlaps(candidate,start || input.from,end || input.to));
    if (overlap) {
      issues.push({ id:`rental-overlap-${rental.id}-${overlap.id}`, severity:'blocker', objectLabel:object.label, title:'Überlappende Vermietungszeiträume', detail:`Dieselbe Einheit ist in den Zeiträumen ab ${start} und ab ${text(overlap.start_date).slice(0,10)} gleichzeitig belegt. Die zentrale Mietquelle muss vor dem Steuerexport bereinigt werden.` });
    }
  }

  for (const contract of rentSources) {
    const object = objectFor(contract);
    if (!object || isOwnerOccupied(object.label)) continue;
    const tenant = tenantName(contract) || "Mieter nicht gepflegt";
    const unitLabel = text(contract.unit_label) || "Gesamte Immobilie";
    const parking = isParking(`${object.label} ${unitLabel}`);
    const matchingAdjustments = adjustments
      .filter((row) => objectFor(row)?.id === object.id && (!row.tenant_name || masterNamesMatch(row.tenant_name, tenant)))
      .filter((row) => text(row.effective_date).slice(0, 10) <= input.to && (!row.effective_end_date || text(row.effective_end_date).slice(0, 10) >= input.from))
      .sort((left, right) => text(right.effective_date).localeCompare(text(left.effective_date)));
    const latest = matchingAdjustments[0];
    const cold = numberOrNull(contract.cold_rent ?? contract.kaltmiete_laut_mietvertrag) ?? numberOrNull(latest?.new_cold_rent);
    const operating = numberOrNull(contract.operating_costs ?? contract.nebenkosten) ?? numberOrNull(latest?.new_operating_costs);
    const unit = units.find((row) => objectFor(row)?.id === object.id && (row.id === contract.unit_id || row.name === contract.unit_label));
    const profile = Object.assign({}, ...extraRows.filter((row) => aliasesById.get(object.id)?.has(text(row.property_id))).map((row) => row.wealth_profile ?? {}));
    const area = numberOrNull(unit?.area_sqm) ?? numberOrNull(object.livingAreaM2) ?? numberOrNull((profile as ReportRecord).livingArea) ?? numberOrNull((profile as ReportRecord).totalArea);

    if (cold === null || cold <= 0) {
      issues.push({ id: `cold-${contract.id}`, severity: "blocker", objectLabel: object.label, title: "Kaltmiete fehlt", detail: `${unitLabel} · ${tenant}: Weder Mietvertrag noch Mietanpassung enthält eine belastbare Kaltmiete.` });
    } else if (numberOrNull(contract.cold_rent ?? contract.kaltmiete_laut_mietvertrag) === null && latest) {
      calculatedValues += 1;
      issues.push({ id: `cold-history-${contract.id}`, severity: "info", objectLabel: object.label, title: "Kaltmiete aus historischer Mietanpassung übernommen", detail: `${unitLabel} · ${tenant}: ${cold.toFixed(2)} EUR ab ${text(latest.effective_date).slice(0, 10)}. Der Vertragswert wurde nicht überschrieben.` });
    }
    if (operating === null) {
      issues.push({ id: `nk-${contract.id}`, severity: "blocker", objectLabel: object.label, title: "Nebenkostenvorauszahlung fehlt", detail: `${unitLabel} · ${tenant}: Kein Wert im Mietvertrag oder in einer gültigen Mietanpassung. Ein echter Wert 0,00 EUR ist zulässig, ein leeres Feld nicht.` });
    }
    if (!parking && (area === null || area <= 0)) {
      issues.push({ id: `area-${contract.id}`, severity: "blocker", objectLabel: object.label, title: "Wohnfläche und €/m² fehlen", detail: `${unitLabel} · ${tenant}: Die Wohnfläche fehlt in Einheit und Immobilienvermögen; €/m² kann deshalb nicht berechnet werden.` });
    } else if (!parking && cold && area) {
      calculatedValues += 1;
      issues.push({ id: `sqm-${contract.id}`, severity: "info", objectLabel: object.label, title: "€/m² automatisch berechnet", detail: `${unitLabel} · ${tenant}: ${(cold / area).toFixed(2)} EUR/m² aus Kaltmiete ${cold.toFixed(2)} EUR und ${area.toFixed(2)} m².` });
    }
  }

  for (const entry of entries) {
    const object = objectFor(entry);
    const objectLabel = object?.label ?? "Nicht zugeordnet";
    const category = canonicalCategoryForTax(entry, objectLabel);
    const rentIncome = entry.entry_type === "income" && /miete|stellplatz|garage|nebenkosten|betriebskosten/i.test(`${category} ${entry.note ?? ""}`);
    if (rentIncome && !object) {
      const normalizedNote = normalize(entry.note);
      const candidates = rentSources.filter((contract) => {
        const name = normalize(tenantName(contract));
        const surname = name.split(" ").at(-1) ?? "";
        const expected = numberOrNull(contract.total_rent ?? contract.gesamt_mietkosten ?? contract.rent_monthly);
        return (name.length > 4 && normalizedNote.includes(name))
          || (surname.length > 4 && normalizedNote.includes(surname))
          || (expected !== null && Math.abs(expected - Math.abs(entry.amount)) <= 0.02);
      });
      const candidateObjects = [...new Set(candidates.map((candidate) => objectFor(candidate)?.label).filter(Boolean))];
      issues.push({
        id: `unassigned-${entry.id}`,
        severity: "blocker",
        objectLabel,
        title: "Mieteingang nicht zugeordnet",
        detail: candidateObjects.length === 1
          ? `Eindeutiger Vorschlag: ${candidateObjects[0]}. Bitte die Buchung ${entry.id ?? ""} bestätigen und speichern; der Report nimmt keine verdeckte Datenänderung vor.`
          : `Kein eindeutiger Treffer über Verwendungszweck, Mietername und Betrag. Buchung ${entry.id ?? ""} muss vor dem Export zugeordnet werden.`,
        bookingId: text(entry.id),
      });
    }

    const taxRule = classifyTaxRelevance(entry, objectLabel);
    const nkRule = classifyNkRelevance({ entry_type: entry.entry_type === "expense" ? "expense" : "income", category: entry.category, note: entry.note, objectLabel });
    if (taxRule.locked && entry.tax_relevant === true) {
      issues.push({ id: `tax-locked-${entry.id}`, severity: "blocker", objectLabel, title: "Steuerkennzeichen widerspricht einer Sperrregel", detail: `${entry.booking_date ?? ""} · ${category || "Ohne Kategorie"}: ${taxRule.hint}`, bookingId: text(entry.id) });
    } else if (!taxRule.locked && taxRule.relevance === "tax" && entry.tax_relevant !== true) {
      issues.push({ id: `tax-flag-${entry.id}`, severity: "review", objectLabel, title: "Steuerkennzeichen prüfen", detail: `${entry.booking_date ?? ""} · ${category || "Ohne Kategorie"}: ${taxRule.hint}`, bookingId: text(entry.id) });
    }
    if (entry.entry_type === "expense" && entry.nk_relevant === true && !nkRule.nkRelevant) {
      issues.push({ id: `nk-flag-${entry.id}`, severity: "blocker", objectLabel, title: "Umlagekennzeichen widerspricht der BetrKV-Regel", detail: `${entry.booking_date ?? ""} · ${category || "Ohne Kategorie"}: ${nkRule.reason}`, bookingId: text(entry.id) });
    }
  }

  const severityOrder: Record<TaxPreflightSeverity, number> = { blocker: 0, review: 1, info: 2 };
  issues.sort((left, right) => severityOrder[left.severity] - severityOrder[right.severity] || left.objectLabel.localeCompare(right.objectLabel, "de") || left.title.localeCompare(right.title, "de"));
  const blockers = issues.filter((issue) => issue.severity === "blocker").length;
  const reviewCount = issues.filter((issue) => issue.severity === "review").length;
  return { issues, entries, duplicateCount, blockers, reviewCount, calculatedValues, ready: blockers === 0 };
}

export function taxPreflightModule(result: TaxPreflightResult): ReportModule {
  const label = (severity: TaxPreflightSeverity) => severity === "blocker" ? "BLOCKIERT" : severity === "review" ? "PRÜFEN" : "BERECHNET";
  return {
    id: "validation",
    title: "Datenprüfung vor Steuerexport",
    metrics: [
      { label: "Exportstatus", value: result.ready ? "FREIGABEFÄHIG" : "GESPERRT", hint: result.ready ? "Keine blockierenden Datenfehler" : "Blockierende Punkte zuerst korrigieren" },
      { label: "Blocker", value: String(result.blockers) },
      { label: "Prüffälle", value: String(result.reviewCount) },
      { label: "Dublettenschutz", value: String(result.duplicateCount), hint: "Exakte Dubletten nicht doppelt summiert" },
      { label: "Berechnete Werte", value: String(result.calculatedValues), hint: "Nachvollziehbar aus Stammdaten/Historie" },
    ],
    paragraphs: [
      "Die Vorprüfung arbeitet ausschließlich auf den zentralen Mietverträgen, Mietanpassungen, Immobilien-Stammdaten und finance_entry. Sie ändert keine unsicheren Werte verdeckt.",
      "Automatisch berücksichtigt werden nur eindeutige Berechnungen und der Schutz vor exakten Importdublettten. Unsichere Zuordnungen bleiben bis zur Bestätigung gesperrt.",
    ],
    tables: [{
      title: "Prüfprotokoll",
      headers: ["Status", "Objekt", "Prüfung", "Ergebnis / nächster Schritt"],
      rows: result.issues.length
        ? result.issues.map((issue) => [label(issue.severity), issue.objectLabel, issue.title, issue.detail])
        : [["OK", "Alle", "Vorprüfung abgeschlossen", "Keine Abweichung gefunden."]],
    }],
  };
}
