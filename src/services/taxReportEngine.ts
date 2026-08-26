import { canonicalCategoryForTax, isCreditRateEntry } from "../lib/taxClassification";
import { MIETE_NACHZAHLUNG_CATEGORY, normalizeFinanceCategoryText } from "../lib/financeCategories";
import { calculateBusinessMealDeductible, isBusinessMealCategory, parseBusinessMealDetails } from "../lib/businessMealTax";
import { isTelecommunicationCategory, parseTelecommunicationTaxDetails } from "../lib/telecommunicationTax";
import { isPortfolioExpenseCategory, isPortfolioGeneralEntry } from "../lib/portfolioExpense";
import { splitSection35aTripCosts } from "../lib/travelTax";
import { MILEAGE_RATE_EUR, type MileageTripRow } from "./mileageTripService";

export type TaxObjectUsage = "rented_residential" | "rented_parking" | "self_used_weg";

export type TaxObjectProfile = {
  key: string;
  label: string;
  reportLabel: string;
  usage: TaxObjectUsage;
  aliases: string[];
  buildingYear: number;
  acquisitionPrice: number;
  afaRate: number;
  bankAccountFlatFee: number;
  homeOfficePercentage: number;
};

export type TaxReportEntry = {
  id?: string | number | null;
  object_id?: string | null;
  objekt_code?: string | null;
  entry_type?: string | null;
  booking_date?: string | null;
  amount?: number | null;
  category?: string | null;
  note?: string | null;
  tax_relevant?: boolean | null;
  labor_amount?: number | null;
  material_amount?: number | null;
  travel_amount?: number | null;
  payment_method?: string | null;
  section35a_type?: string | null;
  maintenance_distribution_years?: number | null;
};

export type TaxReportLoanRow = {
  property_id?: string | null;
  property_name?: string | null;
  property_label?: string | null;
  interest_total?: number | null;
  principal_total?: number | null;
  interest?: number | null;
  principal?: number | null;
  year?: number | null;
};

export type TaxReportObjectOption = {
  id?: string | null;
  code?: string | null;
  label: string;
  aliases?: string[];
};

export type AnlageVReport = {
  profile: TaxObjectProfile;
  incomeLabel: string;
  income: number;
  buildingAfa: number;
  inventoryAfa: number;
  loanInterest: number;
  maintenance: number;
  maintenanceDistributionYears: number;
  runningCosts: number;
  administrationCosts: number;
  portfolioAdministrationShare: number;
  portfolioAdministrationRows: TaxReportEntry[];
  businessMealDeductible: number;
  businessMealRows: TaxReportEntry[];
  telecommunicationDeductible: number;
  telecommunicationRows: TaxReportEntry[];
  mileageCosts: number;
  mileageTravelCosts: number;
  mileageVmaCosts: number;
  mileageHotelCosts: number;
  mileageRows: MileageTripRow[];
  bankAccountFlatFee: number;
  net: number;
  warnings: string[];
  entries: TaxReportEntry[];
};

export type Section35aReport = {
  profile: TaxObjectProfile;
  householdServicesLabor: number;
  craftsmanLabor: number;
  acquisitionSideCostTotal: number;
  acquisitionSideCostRows: TaxReportEntry[];
  excludedCashPayments: TaxReportEntry[];
  homeOfficePercentage: number;
  homeOfficeDeductible: number;
  homeOfficeTripCosts: number;
  section35aTripCosts: number;
  craftsmanTripCosts: number;
  privateOr35aRemainder: number;
  warnings: string[];
  entries: TaxReportEntry[];
};

export type TaxAdvisorDashboard = {
  year: number;
  AnlageVReports: AnlageVReport[];
  section35aReport: Section35aReport;
  warnings: string[];
};

export const TAX_OBJECT_PROFILES: TaxObjectProfile[] = [
  {
    key: "lilienthaler",
    label: "Lilienthaler Str. 54",
    reportLabel: "Lilienthaler Str. 54",
    usage: "rented_residential",
    aliases: ["lilienthaler", "lilienthaler str", "lilienthaler str. 54", "28215 bremen"],
    buildingYear: 1956,
    acquisitionPrice: 145000,
    afaRate: 0.02,
    bankAccountFlatFee: 16,
    homeOfficePercentage: 0,
  },
  {
    key: "elsasser",
    label: "Elsasser Str. 52",
    reportLabel: "Elsasser Str. 52",
    usage: "rented_residential",
    aliases: ["elsasser", "elsaßer", "elsasser str", "elsasser str. 52", "28211 bremen"],
    buildingYear: 1956,
    acquisitionPrice: 160000,
    afaRate: 0.02,
    bankAccountFlatFee: 16,
    homeOfficePercentage: 0,
  },
  {
    key: "colmarer",
    label: "Colmarer Str. 45",
    reportLabel: "Colmarer Str. 45",
    usage: "rented_residential",
    aliases: ["colmarer", "colmarer str", "colmarer str. 45", "28211 bremen"],
    buildingYear: 1956,
    acquisitionPrice: 145000,
    afaRate: 0.02,
    bankAccountFlatFee: 16,
    homeOfficePercentage: 0,
  },
  {
    key: "fuerther",
    label: "Fürther Str. 74",
    reportLabel: "Fürther Str. 74",
    usage: "rented_residential",
    aliases: ["fürther", "fuerther", "further", "fuerther str", "fürther str. 74", "wg07", "28215 bremen"],
    buildingYear: 1956,
    acquisitionPrice: 140000,
    afaRate: 0.02,
    bankAccountFlatFee: 16,
    homeOfficePercentage: 0,
  },
  {
    key: "rosenstein",
    label: "Rosensteinstr. 25",
    reportLabel: "3 TG-Stellplätze in Stuttgart",
    usage: "rented_parking",
    aliases: ["rosenstein", "rosenstein str", "rosensteinstr", "rosensteinstr. 25", "p250", "p253", "p254", "e008440000121", "e008440000122", "e008440000123", "stuttgart"],
    buildingYear: 1960,
    acquisitionPrice: 61219.26,
    afaRate: 0.02,
    bankAccountFlatFee: 16,
    homeOfficePercentage: 0,
  },
  {
    key: "hohenloher",
    label: "Hohenloher Str. 78",
    reportLabel: "Hohenloher Str. 78",
    usage: "self_used_weg",
    aliases: ["hohenloher", "hohenloher str", "hohenloher str. 78", "74243 brettach", "brettach"],
    buildingYear: 2025,
    acquisitionPrice: 530000,
    afaRate: 0,
    bankAccountFlatFee: 0,
    homeOfficePercentage: 0,
  },
];

const RUNNING_COST_CATEGORIES = [
  "Grundsteuer",
  "Versicherung",
  "Abfallgebühr",
  "Wartung",
  "Schonsteinfeger",
  "Nebenkosten",
  "Betriebskosten",
  "Hausgeld",
  "Straßenreinigung",
  "Strassenreinigung",
  "Hausmeister",
  "Allgemeinstrom",
];

const ADMINISTRATION_CATEGORIES = [
  "Verwaltungskosten",
  "Kontoführungsgebühr",
  "Software",
  "Büro / Porto",
  "Porto",
  "Büro",
];

const MAINTENANCE_CATEGORIES = ["Reparatur", "Instandhaltung", "Handwerker", "Renovierung", "Wartung"];
const INVENTORY_CATEGORIES = ["Einbauküche", "Küche", "Inventar", "Möbel", "Moebel"];
const SECTION35A_HOUSEHOLD = ["haushaltsnah", "hausmeister", "reinigung", "winterdienst", "garten"];
const SECTION35A_CRAFT = ["handwerker", "reparatur", "wartung", "schornsteinfeger", "modernisierung"];
const ACQUISITION_SIDE_COST_KEYWORDS = [
  "anschaffungskosten",
  "anschaffungsnebenkosten",
  "notar",
  "grundbuch",
  "grundbuchamt",
  "grundbuchkosten",
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
  "maklerkosten",
  "kaufvertrag",
];

function normalize(value: unknown): string {
  return normalizeFinanceCategoryText(String(value ?? ""))
    .replaceAll("ß", "ss")
    .replace(/straße|strasse/g, "str")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function amount(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? roundCurrency(Math.abs(parsed)) : 0;
}

function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function sumCurrency<T>(rows: T[], selector: (row: T) => number): number {
  return roundCurrency(rows.reduce((sum, row) => sum + selector(row), 0));
}

function includesAny(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(normalize(needle)));
}

function entryText(entry: TaxReportEntry, objectLabel = "") {
  return normalize(`${entry.category ?? ""} ${entry.note ?? ""} ${entry.objekt_code ?? ""} ${entry.object_id ?? ""} ${objectLabel}`);
}

export function getTaxObjectProfileForLabel(value: string | null | undefined): TaxObjectProfile | null {
  const text = normalize(value);
  if (!text) return null;
  return TAX_OBJECT_PROFILES.find((profile) => {
    const candidates = [profile.label, profile.reportLabel, profile.key, ...profile.aliases].map(normalize);
    return candidates.some((candidate) => candidate && (text.includes(candidate) || candidate.includes(text)));
  }) ?? null;
}

export function resolveEntryTaxProfile(entry: TaxReportEntry, objects: TaxReportObjectOption[] = []): TaxObjectProfile | null {
  const object = objects.find((item) => {
    const ids = [item.id, item.code, item.label, ...(item.aliases ?? [])].map(normalize);
    const entryIds = [entry.object_id, entry.objekt_code, entry.note, entry.category].map(normalize);
    return ids.some((id) => id && entryIds.some((entryId) => entryId && (id.includes(entryId) || entryId.includes(id))));
  });
  return getTaxObjectProfileForLabel(`${object?.label ?? ""} ${object?.code ?? ""} ${object?.id ?? ""} ${object?.aliases?.join(" ") ?? ""} ${entry.objekt_code ?? ""} ${entry.note ?? ""}`);
}

export function isAnlageVEligible(profile: TaxObjectProfile | null): boolean {
  return profile?.usage === "rented_residential" || profile?.usage === "rented_parking";
}

export function isSection35aProfile(profile: TaxObjectProfile | null): boolean {
  return profile?.usage === "self_used_weg";
}

export function isCashPayment(entry: TaxReportEntry): boolean {
  const text = entryText(entry);
  return normalize(entry.payment_method).includes("bar") || text.includes("barzahlung") || text.includes("cash");
}

function isIncomeForAnlageV(entry: TaxReportEntry, profile: TaxObjectProfile) {
  if (entry.entry_type !== "income") return false;
  const category = canonicalCategoryForTax(entry, profile.label);
  const text = entryText(entry, profile.label);
  return (
    ["Miete", "Miete Garage", MIETE_NACHZAHLUNG_CATEGORY, "Mietbestandteil-NK"].includes(category) ||
    includesAny(text, ["miete", "garage", "stellplatz", "nebenkosten", "betriebskosten", "sonderzahlung", "nachzahlung"])
  );
}

function categoryMatches(entry: TaxReportEntry, categories: string[], profile: TaxObjectProfile) {
  const category = canonicalCategoryForTax(entry, profile.label);
  return includesAny(entryText(entry, profile.label), categories) || categories.map(normalize).includes(normalize(category));
}

function isAcquisitionSideCostEntry(entry: TaxReportEntry, profile: TaxObjectProfile) {
  return categoryMatches(entry, ACQUISITION_SIDE_COST_KEYWORDS, profile);
}

function getDistributionYears(entry: TaxReportEntry) {
  const years = Number(entry.maintenance_distribution_years ?? 1);
  if (!Number.isFinite(years)) return 1;
  return Math.min(5, Math.max(1, Math.round(years)));
}

function entryYear(entry: TaxReportEntry) {
  return Number(String(entry.booking_date ?? "").slice(0, 4));
}

function matchesProfileTrip(trip: MileageTripRow, profile: TaxObjectProfile) {
  return Boolean(getTaxObjectProfileForLabel(`${trip.property_label} ${trip.property_id} ${trip.portfolio_property_id} ${trip.investment_address}`)?.key === profile.key);
}

function loanInterestForProfile(loans: TaxReportLoanRow[], profile: TaxObjectProfile, year: number) {
  return sumCurrency(
    loans
    .filter((loan) => !loan.year || Number(loan.year) === year)
      .filter((loan) => getTaxObjectProfileForLabel(`${loan.property_name ?? ""} ${loan.property_label ?? ""} ${loan.property_id ?? ""}`)?.key === profile.key),
    (loan) => amount(loan.interest ?? loan.interest_total),
  );
}

function laborAmount(entry: TaxReportEntry) {
  const explicit = amount(entry.labor_amount);
  if (explicit > 0) return explicit + amount(entry.travel_amount);
  const material = amount(entry.material_amount);
  const total = amount(entry.amount);
  return Math.max(0, total - material);
}

function tripTotalAmount(trip: MileageTripRow) {
  const explicit = amount(trip.reisekosten_betrag);
  return explicit > 0 ? explicit : amount(trip.berechneter_betrag);
}

function tripTravelAmount(trip: MileageTripRow) {
  const explicit = amount(trip.fahrtkosten_betrag);
  return explicit > 0 ? explicit : amount(trip.berechneter_betrag);
}

function isCraftsmanTrip(trip: MileageTripRow) {
  return includesAny(normalize(`${trip.grund} ${trip.property_label} ${trip.start_adresse} ${trip.zieladresse}`), ["handwerker", "reparatur", "wartung", "schornsteinfeger", "instandhaltung"]);
}

function buildAnlageVReport(profile: TaxObjectProfile, entries: TaxReportEntry[], loans: TaxReportLoanRow[], trips: MileageTripRow[], objects: TaxReportObjectOption[], year: number): AnlageVReport {
  const profileEntries = entries.filter((entry) => entryYear(entry) === year && resolveEntryTaxProfile(entry, objects)?.key === profile.key);
  const rentedObjectCount = TAX_OBJECT_PROFILES.filter(isAnlageVEligible).length;
  const portfolioAdministrationRows = entries.filter((entry) => (
    entryYear(entry) === year
    && entry.entry_type === "expense"
    && isPortfolioGeneralEntry(entry)
    && isPortfolioExpenseCategory(canonicalCategoryForTax(entry, profile.label))
  ));
  const portfolioAdministrationShare = sumCurrency(portfolioAdministrationRows, (entry) => amount(entry.amount) / rentedObjectCount);
  const telecommunicationRows = entries.filter((entry) => entryYear(entry) === year && entry.entry_type === "expense" && isTelecommunicationCategory(canonicalCategoryForTax(entry)));
  const telecommunicationDeductible = sumCurrency(telecommunicationRows, (entry) => {
    const details = parseTelecommunicationTaxDetails({ ...entry, rentedObjectCount });
    return details?.allocatedPerRentedObject ?? 0;
  });
  const income = sumCurrency(profileEntries.filter((entry) => isIncomeForAnlageV(entry, profile)), (entry) => amount(entry.amount));
  const buildingAfa = profile.buildingYear <= 2021 ? roundCurrency(profile.acquisitionPrice * profile.afaRate) : 0;
  const inventoryAfa = sumCurrency(
    profileEntries.filter((entry) => entry.entry_type === "expense" && categoryMatches(entry, INVENTORY_CATEGORIES, profile)),
    (entry) => {
      const value = amount(entry.amount);
      return value <= 800 ? value : value / 10;
    },
  );
  const loanInterest = loanInterestForProfile(loans, profile, year);
  const maintenanceRows = profileEntries.filter((entry) => entry.entry_type === "expense" && categoryMatches(entry, MAINTENANCE_CATEGORIES, profile));
  const maintenance = sumCurrency(maintenanceRows, (entry) => amount(entry.amount) / getDistributionYears(entry));
  const runningCosts = sumCurrency(
    profileEntries.filter((entry) => entry.entry_type === "expense" && categoryMatches(entry, RUNNING_COST_CATEGORIES, profile)),
    (entry) => amount(entry.amount),
  );
  const administrationCostsFromEntries = sumCurrency(
    profileEntries.filter((entry) => entry.entry_type === "expense" && categoryMatches(entry, ADMINISTRATION_CATEGORIES, profile)),
    (entry) => amount(entry.amount),
  );
  const businessMealRows = profileEntries.filter((entry) => entry.entry_type === "expense" && isBusinessMealCategory(canonicalCategoryForTax(entry, profile.label)));
  const businessMealDeductible = sumCurrency(businessMealRows, (entry) => calculateBusinessMealDeductible(amount(entry.amount)));
  const mileageRows = trips.filter((trip) => trip.steuerjahr === year && matchesProfileTrip(trip, profile));
  const mileageTravelCosts = sumCurrency(mileageRows, tripTravelAmount);
  const mileageVmaCosts = sumCurrency(mileageRows, (trip) => amount(trip.vma_betrag));
  const mileageHotelCosts = sumCurrency(mileageRows, (trip) => amount(trip.hotelkosten_brutto));
  const mileageCosts = sumCurrency(mileageRows, tripTotalAmount);
  const administrationCosts = roundCurrency(administrationCostsFromEntries + portfolioAdministrationShare + businessMealDeductible + telecommunicationDeductible + mileageCosts + profile.bankAccountFlatFee);
  const net = roundCurrency(income - buildingAfa - inventoryAfa - loanInterest - maintenance - runningCosts - administrationCosts);
  const warnings = [
    profile.acquisitionPrice <= 0 ? "AfA-Grundlage fehlt oder ist 0 EUR. Bitte Anschaffungspreis pruefen." : "",
    maintenanceRows.some((entry) => getDistributionYears(entry) > 1) ? "Erhaltungsaufwand wird teilweise ueber mehrere Jahre verteilt." : "",
    businessMealRows.some((entry) => {
      const details = parseBusinessMealDetails({ ...entry, objectLabel: profile.label });
      return !details?.persons || !details.occasion;
    }) ? "Mindestens ein Bewirtungsbeleg hat fehlende Personen- oder Anlass-Dokumentation." : "",
  ].filter(Boolean);

  return {
    profile,
    incomeLabel: profile.usage === "rented_parking"
      ? "Einnahmen aus Vermietung anderer Immobilien / Stellplätze ohne Wohnraum"
      : "Einnahmen aus Wohnraumvermietung",
    income,
    buildingAfa,
    inventoryAfa,
    loanInterest,
    maintenance,
    maintenanceDistributionYears: Math.max(1, ...maintenanceRows.map(getDistributionYears)),
    runningCosts,
    administrationCosts,
    portfolioAdministrationShare,
    portfolioAdministrationRows,
    businessMealDeductible,
    businessMealRows,
    telecommunicationDeductible,
    telecommunicationRows,
    mileageCosts,
    mileageTravelCosts,
    mileageVmaCosts,
    mileageHotelCosts,
    mileageRows,
    bankAccountFlatFee: profile.bankAccountFlatFee,
    net,
    warnings,
    entries: profileEntries,
  };
}

function buildSection35aReport(entries: TaxReportEntry[], trips: MileageTripRow[], objects: TaxReportObjectOption[], year: number): Section35aReport {
  const profile = TAX_OBJECT_PROFILES.find((item) => item.key === "hohenloher")!;
  const profileEntries = entries.filter((entry) => entryYear(entry) === year && resolveEntryTaxProfile(entry, objects)?.key === profile.key);
  const expenseEntries = profileEntries.filter((entry) => entry.entry_type === "expense" && !isCreditRateEntry(entry, profile.label));
  const acquisitionSideCostRows = expenseEntries.filter((entry) => isAcquisitionSideCostEntry(entry, profile));
  const acquisitionSideCostTotal = sumCurrency(acquisitionSideCostRows, (entry) => amount(entry.amount));
  const eligibleEntries = expenseEntries.filter((entry) => !isCashPayment(entry));
  const householdServicesLabor = sumCurrency(
    eligibleEntries.filter((entry) => normalize(entry.section35a_type).includes("haushaltsnah") || categoryMatches(entry, SECTION35A_HOUSEHOLD, profile)),
    laborAmount,
  );
  const craftsmanLaborFromEntries = sumCurrency(
    eligibleEntries.filter((entry) => normalize(entry.section35a_type).includes("handwerker") || categoryMatches(entry, SECTION35A_CRAFT, profile)),
    laborAmount,
  );
  const profileTrips = trips.filter((trip) => trip.steuerjahr === year && matchesProfileTrip(trip, profile));
  const craftsmanTripCosts = sumCurrency(
    profileTrips.filter((trip) => trip.verkehrsmittel === "car" && isCraftsmanTrip(trip)),
    tripTravelAmount,
  );
  const splitTripCosts = splitSection35aTripCosts(craftsmanTripCosts, profile.homeOfficePercentage);
  const craftsmanLabor = roundCurrency(craftsmanLaborFromEntries + splitTripCosts.section35aAmount);
  const homeOfficeBase = sumCurrency(
    eligibleEntries.filter((entry) => categoryMatches(entry, RUNNING_COST_CATEGORIES, profile)),
    (entry) => amount(entry.amount),
  );
  const homeOfficeEntryDeductible = roundCurrency(homeOfficeBase * (profile.homeOfficePercentage / 100));
  const homeOfficeDeductible = roundCurrency(homeOfficeEntryDeductible + splitTripCosts.homeOfficeAmount);
  const privateOr35aRemainder = roundCurrency(Math.max(0, homeOfficeBase - homeOfficeEntryDeductible) + splitTripCosts.section35aAmount);
  const excludedCashPayments = expenseEntries.filter(isCashPayment);
  const warnings = [
    excludedCashPayments.length ? `${excludedCashPayments.length} Barzahlung(en) wurden fuer §35a ausgeschlossen.` : "",
    craftsmanTripCosts > 0 && profile.homeOfficePercentage <= 0
      ? `Reine Handwerker-Fahrtkosten aus Fahrtenbuch wurden §35a Handwerkerleistungen zugeordnet: ${formatTaxCurrency(splitTripCosts.section35aAmount)}.`
      : "",
    craftsmanTripCosts > 0 && profile.homeOfficePercentage > 0
      ? `Handwerker-Fahrtkosten wurden aufgeteilt: ${formatTaxCurrency(splitTripCosts.homeOfficeAmount)} Homeoffice, ${formatTaxCurrency(splitTripCosts.section35aAmount)} §35a.`
      : "",
    acquisitionSideCostRows.some((entry) => entry.tax_relevant !== false)
      ? `Erwerbsnebenkosten fuer Hohenloher dokumentiert: ${formatTaxCurrency(acquisitionSideCostTotal)}. Bitte steuerlich als Anschaffungskosten/AfA-Basis oder Sonderfall pruefen.`
      : "",
    "Hohenloher Str. 78 ist als Selbstgenutzt / WEG fuer Anlage V gesperrt.",
  ].filter(Boolean);
  return {
    profile,
    householdServicesLabor,
    craftsmanLabor,
    acquisitionSideCostTotal,
    acquisitionSideCostRows,
    excludedCashPayments,
    homeOfficePercentage: profile.homeOfficePercentage,
    homeOfficeDeductible,
    homeOfficeTripCosts: splitTripCosts.homeOfficeAmount,
    section35aTripCosts: splitTripCosts.section35aAmount,
    craftsmanTripCosts,
    privateOr35aRemainder,
    warnings,
    entries: profileEntries,
  };
}

export function buildTaxAdvisorDashboard(params: {
  year: number;
  entries: TaxReportEntry[];
  loans?: TaxReportLoanRow[];
  mileageTrips?: MileageTripRow[];
  objects?: TaxReportObjectOption[];
}): TaxAdvisorDashboard {
  const entries = params.entries ?? [];
  const loans = params.loans ?? [];
  const mileageTrips = params.mileageTrips ?? [];
  const objects = params.objects ?? [];
  const AnlageVReports = TAX_OBJECT_PROFILES
    .filter(isAnlageVEligible)
    .map((profile) => buildAnlageVReport(profile, entries, loans, mileageTrips, objects, params.year));
  const section35aReport = buildSection35aReport(entries, mileageTrips, objects, params.year);
  const warnings = [
    ...AnlageVReports.flatMap((report) => report.warnings.map((warning) => `${report.profile.reportLabel}: ${warning}`)),
    ...section35aReport.warnings.map((warning) => `${section35aReport.profile.reportLabel}: ${warning}`),
  ];
  return { year: params.year, AnlageVReports, section35aReport, warnings };
}

export function formatTaxCurrency(value: number): string {
  return value.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export function buildAnlageVReportLines(report: AnlageVReport): string[] {
  return [
    `Objekt: ${report.profile.reportLabel}`,
    `Status: ${report.profile.usage === "rented_parking" ? "Vermietet - isolierte Stellplaetze" : "Vermietet - Wohnung"}`,
    `Baujahr: ${report.profile.buildingYear}`,
    `AfA-Satz: ${(report.profile.afaRate * 100).toLocaleString("de-DE")} %`,
    "",
    `Feld 1 - ${report.incomeLabel}: ${formatTaxCurrency(report.income)}`,
    `Feld 2 - Gebaeude-/Teileigentum-AfA: ${formatTaxCurrency(report.buildingAfa)}`,
    `Feld 3 - Einbaukuechen & Inventar-AfA: ${formatTaxCurrency(report.inventoryAfa)}`,
    `Feld 4 - Schuldzinsen: ${formatTaxCurrency(report.loanInterest)}`,
    `Feld 5 - Erhaltungsaufwand: ${formatTaxCurrency(report.maintenance)}`,
    `Feld 6 - Laufende Betriebs- & Nebenkosten: ${formatTaxCurrency(report.runningCosts)}`,
    `Feld 7 - Verwaltungskosten & Pauschalen: ${formatTaxCurrency(report.administrationCosts)}`,
    `  davon Portfolio-Ausgaben anteilig: ${formatTaxCurrency(report.portfolioAdministrationShare)}`,
    `  davon Bewirtungskosten (70% Anteil): ${formatTaxCurrency(report.businessMealDeductible)}`,
    `  davon Telekommunikation (20% gedeckelt, anteilig): ${formatTaxCurrency(report.telecommunicationDeductible)}`,
    `  davon Reisekosten gesamt: ${formatTaxCurrency(report.mileageCosts)}`,
    `    Fahrt/Taxi/Bahn (${MILEAGE_RATE_EUR.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}/km bei eigenem Auto): ${formatTaxCurrency(report.mileageTravelCosts)}`,
    `    Verpflegungsmehraufwand: ${formatTaxCurrency(report.mileageVmaCosts)}`,
    `    Hotelkosten: ${formatTaxCurrency(report.mileageHotelCosts)}`,
    `  Kontoführungsgebühr-Pauschale: ${formatTaxCurrency(report.bankAccountFlatFee)}`,
    ...(report.mileageRows.length
      ? [
          "",
          "Reisekosten-Dokumentation:",
          ...report.mileageRows.map((trip) => {
            const transport = trip.verkehrsmittel === "public_transport" ? "Bahn/OePNV" : "Eigenes Auto";
            return `- ${trip.datum} | ${transport} | ${trip.grund} | ${trip.start_adresse} -> ${trip.zieladresse} | Fahrt: ${formatTaxCurrency(tripTravelAmount(trip))} | VMA: ${formatTaxCurrency(amount(trip.vma_betrag))} | Hotel: ${formatTaxCurrency(amount(trip.hotelkosten_brutto))} | Gesamt: ${formatTaxCurrency(tripTotalAmount(trip))}`;
          }),
        ]
      : []),
    ...(report.telecommunicationRows.length
      ? [
          "",
          "Telekommunikations-Dokumentation:",
          ...report.telecommunicationRows.map((entry) => {
            const details = parseTelecommunicationTaxDetails({ ...entry, rentedObjectCount: TAX_OBJECT_PROFILES.filter(isAnlageVEligible).length });
            const total = details?.totalAmount ?? amount(entry.amount);
            const allocated = details?.allocatedPerRentedObject ?? 0;
            return `- ${entry.booking_date ?? "-"} | Anteilige Telefon-/Internetkosten Eheleute (20% gedeckelt) - Gesamtbeleg: ${formatTaxCurrency(total)} - Objektanteil: ${formatTaxCurrency(allocated)}`;
          }),
        ]
      : []),
    ...(report.portfolioAdministrationRows.length
      ? [
          "",
          "Portfolio-Ausgaben-Dokumentation:",
          ...report.portfolioAdministrationRows.map((entry) => `- ${entry.booking_date ?? "-"} | ${entry.category ?? "-"} | Gesamt: ${formatTaxCurrency(amount(entry.amount))} | Objektanteil: ${formatTaxCurrency(amount(entry.amount) / TAX_OBJECT_PROFILES.filter(isAnlageVEligible).length)} | ${entry.note ?? ""}`),
        ]
      : []),
    ...(report.businessMealRows.length
      ? [
          "",
          "Bewirtungskosten-Dokumentation:",
          ...report.businessMealRows.map((entry) => {
            const details = parseBusinessMealDetails({ ...entry, objectLabel: report.profile.label });
            return `- ${entry.booking_date ?? "-"} | Geschaeftliche Bewirtung (70% von ${formatTaxCurrency(details?.totalAmount ?? amount(entry.amount))}) - Anlass: ${details?.occasion || "-"} - Personen: ${details?.persons || "-"} - absetzbar: ${formatTaxCurrency(details?.deductibleAmount ?? calculateBusinessMealDeductible(amount(entry.amount)))}`;
          }),
        ]
      : []),
    "",
    `Vorlaeufiges steuerliches Ergebnis: ${formatTaxCurrency(report.net)}`,
    ...(report.warnings.length ? ["", "Pruefhinweise:", ...report.warnings.map((warning) => `- ${warning}`)] : []),
  ];
}

export function buildSection35aReportLines(report: Section35aReport): string[] {
  return [
    `Objekt: ${report.profile.reportLabel}`,
    "Status: Selbstgenutzt / WEG - fuer Anlage V gesperrt",
    "",
    `Summe haushaltsnahe Dienstleistungen (Arbeitslohn): ${formatTaxCurrency(report.householdServicesLabor)}`,
    `Summe Handwerkerleistungen (Arbeitslohn): ${formatTaxCurrency(report.craftsmanLabor)}`,
    `Homeoffice-Anteil: ${report.homeOfficePercentage.toLocaleString("de-DE")} %`,
    `Beruflich abziehbarer Homeoffice-Anteil: ${formatTaxCurrency(report.homeOfficeDeductible)}`,
    `Davon Handwerker-Fahrtkosten im Homeoffice-Anteil: ${formatTaxCurrency(report.homeOfficeTripCosts)}`,
    `Handwerker-Fahrtkosten in §35a: ${formatTaxCurrency(report.section35aTripCosts)}`,
    `Erwerbsnebenkosten / Anschaffungskosten pruefen: ${formatTaxCurrency(report.acquisitionSideCostTotal)}`,
    `Privat / regulaere §35a-Pruefung: ${formatTaxCurrency(report.privateOr35aRemainder)}`,
    "",
    "Schutz-Sperre: Hohenloher Str. 78 wird nicht in Anlage-V-Berichten gerechnet.",
    ...(report.acquisitionSideCostRows.length
      ? [
          "",
          "Erwerbsnebenkosten-Dokumentation:",
          ...report.acquisitionSideCostRows.map((entry) => `- ${entry.booking_date ?? "-"} | ${entry.category ?? "-"} | ${formatTaxCurrency(amount(entry.amount))} | ${entry.note ?? ""}`),
        ]
      : []),
    ...(report.excludedCashPayments.length
      ? ["", "Ausgeschlossene Barzahlungen:", ...report.excludedCashPayments.map((entry) => `- ${entry.booking_date ?? "-"} | ${entry.category ?? "-"} | ${formatTaxCurrency(amount(entry.amount))}`)]
      : []),
    ...(report.warnings.length ? ["", "Pruefhinweise:", ...report.warnings.map((warning) => `- ${warning}`)] : []),
  ];
}
