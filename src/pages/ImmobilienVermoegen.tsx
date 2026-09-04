import { useCallback, useEffect, useRef, useMemo, useState, type ChangeEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  Eye,
  Euro,
  FileText,
  Home,
  Landmark,
  MapPin,
  PlusCircle,
  Save,
  ShieldCheck,
  Upload,
  Zap,
} from "lucide-react";

import { EmptyState, PageHeader, SectionPanel } from "@/components/ui/professional";
import { useAuth } from "@/auth/AuthProvider";
import { isAdminEmail } from "@/auth/accessControl";
import { portfolioGalleryItems, type PortfolioGalleryItem } from "@/data/portfolioGallery";
import { useAppData, type AppObject, type FinanceEntry, type PortfolioLoanRow } from "@/state/AppDataContext";
import { useBackendFinanceMaster } from "@/hooks/useBackendFinanceMaster";
import { buildRepairCapexSummary, type RepairCapexSummary } from "@/lib/repairCapex";
import {
  emptyPropertyExtra,
  fetchPropertyWealthProfiles,
  loadAllPropertyExtras,
  savePropertyExtra,
  savePropertyWealthProfile,
  type PropertyExtraInfo,
} from "@/services/propertyExtraService";
import { loadExposeLinks, uploadExpose } from "@/lib/uploadExpose";
import { yearlyCapexService } from "@/services/yearlyCapexService";
import {
  isVacancyEffectivelyActiveInRange,
  listVacancies,
  type UnitVacancy,
} from "@/services/vacancyService";
import { listTenantProfilesWithContracts, type TenantContract, type TenantProfileWithContracts } from "@/services/tenantService";
import type { MasterFinanceSnapshot } from "@/services/masterDataService";

type WealthDraft = Record<string, string>;

type WealthTemplate = {
  key: string;
  match: string[];
  defaults: WealthDraft;
};

type WealthCard = {
  id: string;
  row?: PortfolioLoanRow;
  draft: WealthDraft;
};

type ExposeInfo = {
  fileName: string;
  dataUrl: string;
  uploadedAt: string;
};

type ExposePreview = {
  card: WealthCard;
  extra: PropertyExtraInfo;
  finance: WealthFinance;
};

type WealthFinance = {
  income: number;
  expenses: number;
  rentIncome: number;
  netCashflow: number;
  nebenkosten: number;
  value: number;
  lastBalance: number;
  repaidPercent: number;
  grossYield: number;
  netYield: number;
};

type ModernizationSummaryByCardId = Record<string, RepairCapexSummary>;

type ParkingUnitStatus = "rented" | "vacant";

type ParkingUnit = {
  key: string;
  title: string;
  shortLabel: string;
  reference: string;
  status: ParkingUnitStatus;
  tenantName: string;
  monthlyRent: number;
  vacancy?: UnitVacancy;
};

type FieldConfig = {
  key: string;
  label: string;
  type?: "text" | "number" | "select" | "checkbox" | "date";
  options?: string[];
  placeholder?: string;
};

const STORAGE_KEY = "koenen:immobilienvermoegen:v2";
const EXPOSE_STORAGE_KEY = "koenen:portfolio:exposes:v1";
const WEALTH_UPDATED_EVENT = "koenen:immobilienvermoegen:updated";

const ROSENSTEIN_PARKING_UNITS: ParkingUnit[] = [
  {
    key: "p250",
    title: "TG-Stellplatz 1",
    shortLabel: "P250",
    reference: "P250 - E008440000121",
    status: "vacant",
    tenantName: "Nicht zugeordnet",
    monthlyRent: 0,
  },
  {
    key: "p253",
    title: "TG-Stellplatz 2",
    shortLabel: "P253",
    reference: "P253 - E008440000122",
    status: "vacant",
    tenantName: "Nicht zugeordnet",
    monthlyRent: 0,
  },
  {
    key: "p254",
    title: "TG-Stellplatz 3",
    shortLabel: "P254",
    reference: "P254 - E008440000123",
    status: "vacant",
    tenantName: "Nicht zugeordnet",
    monthlyRent: 0,
  },
];

const EMPTY_DRAFT: WealthDraft = {
  name: "",
  financingReason: "",
  propertyType: "",
  street: "",
  houseNumber: "",
  postalCode: "",
  city: "",
  state: "",
  inhabitants: "",
  surroundings: "",
  purchasePrice: "",
  purchaseDate: "",
  purchaseYear: "",
  buildingPurchasePrice: "",
  landPurchasePrice: "",
  parkingPurchasePrice: "",
  unitValueFileNumber: "",
  ownershipHusbandPercent: "",
  ownershipWifePercent: "",
  transferBenefitsDate: "",
  usageType: "",
  unitCount: "",
  totalArea: "",
  coldRentMonthly: "",
  landArea: "",
  convertedSpace: "",
  equipmentYear: "",
  constructionType: "",
  constructionSpecials: "",
  equipmentRating: "",
  floors: "",
  elevator: "",
  condition: "",
  attic: "",
  cellar: "",
  parkingSpaces: "",
  marketValue: "",
  landValue: "",
  acquisitionSpecials: "",
  estimatedMarketValue: "",
  heritableBuildingRight: "",
  energyClass: "",
  primaryEnergyDemand: "",
  primaryEnergyConsumption: "",
  co2Emissions: "",
  modernizations: "",
  lastModernizationYear: "",
  modernizationCosts: "",
  lender: "",
  ibanBic: "",
  loanNumber: "",
  landRegisterRank: "",
  subsidizedLoan: "",
  originalLoanAmount: "",
  currentMonthlyRate: "",
  agreedFutureRate: "",
  interestRate: "",
  interestBinding: "",
  fullRepaymentDate: "",
  release: "",
  shouldBeRedeemed: "",
  remainingDebt: "",
  expectedEndDate: "",
  borrowers: "",
  notes: "",
};

const WEALTH_TEMPLATES: WealthTemplate[] = [
  {
    key: "lilienthaler-str-54",
    match: ["lilienthaler"],
    defaults: {
      ...EMPTY_DRAFT,
      name: "Lilienthaler Str. 54",
      financingReason: "Bestandsimmobilie",
      propertyType: "Reihenmittelhaus",
      street: "Lilienthaler Str.",
      houseNumber: "54",
      postalCode: "28215",
      city: "Bremen",
      state: "Bremen",
      marketValue: "530000",
      estimatedMarketValue: "530000",
      currentMonthlyRate: "1100",
      purchasePrice: "145000",
      purchaseYear: "2007",
      landArea: "100",
      equipmentYear: "1956",
      constructionType: "Massivbauweise",
      floors: "3",
      elevator: "Nein",
      condition: "Gepflegt",
      attic: "Ausgebaut",
      cellar: "Voll unterkellert",
      lender: "Volksbank Stuttgart eG",
      interestRate: "1,67",
      interestBinding: "3 Jahre",
      borrowers: "Cetin Könen",
    },
  },
  {
    key: "elsasser-str-52",
    match: ["elsasser", "elsäßer"],
    defaults: {
      ...EMPTY_DRAFT,
      name: "Elsasser Str. 52",
      street: "Elsasser Str.",
      houseNumber: "52",
      postalCode: "28211",
      city: "Bremen",
      state: "Bremen",
      marketValue: "160000",
      estimatedMarketValue: "160000",
      currentMonthlyRate: "300",
    },
  },
  {
    key: "colmarer-str-45",
    match: ["colmarer"],
    defaults: {
      ...EMPTY_DRAFT,
      name: "Colmarer Str. 45",
      street: "Colmarer Str.",
      houseNumber: "45",
      postalCode: "28211",
      city: "Bremen",
      state: "Bremen",
      marketValue: "145000",
      estimatedMarketValue: "145000",
      currentMonthlyRate: "411",
    },
  },
  {
    key: "fuerther-str-74",
    match: ["fürther", "fuerther"],
    defaults: {
      ...EMPTY_DRAFT,
      name: "Fürther Str. 74",
      street: "Fürther Str.",
      houseNumber: "74",
      postalCode: "28215",
      city: "Bremen",
      state: "Bremen",
      marketValue: "140000",
      estimatedMarketValue: "140000",
      currentMonthlyRate: "439",
    },
  },
  {
    key: "hohenloher-str-78",
    match: ["hohenloher"],
    defaults: {
      ...EMPTY_DRAFT,
      name: "Hohenloher Str. 78",
      street: "Hohenloher Str.",
      houseNumber: "78",
      postalCode: "74243",
      city: "Brettach",
      state: "Baden-Württemberg",
      marketValue: "530000",
      estimatedMarketValue: "530000",
      currentMonthlyRate: "1690",
      purchasePrice: "400000",
      purchaseDate: "2025-02-20",
      purchaseYear: "2025",
      buildingPurchasePrice: "340000",
      landPurchasePrice: "45000",
      parkingPurchasePrice: "15000",
      notes: "Kaufpreis-Aufteilung: Gebäude 340.000 EUR, Grund und Boden 45.000 EUR, Stellplatz 15.000 EUR. Erwerbsnebenkosten separat in Buchhaltung dokumentiert.",
    },
  },
  {
    key: "rosensteinstr-25",
    match: ["rosenstein"],
    defaults: {
      ...EMPTY_DRAFT,
      name: "Rosensteinstr. 25",
      street: "Rosensteinstr.",
      houseNumber: "25",
      propertyType: "Tiefgaragestellplätze",
      usageType: "Vermietete TG-Stellplätze",
      unitCount: "3",
      marketValue: "60000",
      estimatedMarketValue: "60000",
      purchasePrice: "57000",
      purchaseDate: "2025-09-01",
      purchaseYear: "2025",
      originalLoanAmount: "60000",
      parkingSpaces: "P250 - E008440000121\nP253 - E008440000122\nP254 - E008440000123",
      notes: "Hauptobjekt für drei separat dokumentierte TG-Stellplätze. Kaufpreis je Stellplatz 19.000 EUR, zusammen 57.000 EUR; Darlehenssumme 60.000 EUR. Erwerbsnebenkosten aus Buchungen 632, 1289 und 1291 werden steuerlich als Anschaffungsnebenkosten dokumentiert und rechnerisch durch 3 geteilt. Der aktuelle Vermietungsstatus wird aus Mieterregister und Leerstandsverwaltung geladen.",
    },
  },
];

const SECTION_FIELDS: Array<{ title: string; description: string; icon: typeof Home; fields: FieldConfig[] }> = [
  {
    title: "Sektion 1: Vorhaben & Adresse",
    description: "Stammdaten und Kostenbasis der Immobilie.",
    icon: MapPin,
    fields: [
      { key: "financingReason", label: "Finanzierungsgrund", type: "select", options: ["", "Kauf", "Bestandsimmobilie", "Anschlussfinanzierung", "Modernisierung"] },
      { key: "propertyType", label: "Immobilientyp", type: "select", options: ["", "Wohnung", "Garage", "Reihenmittelhaus", "Mehrfamilienhaus", "Gewerbe", "Sonstiges"] },
      { key: "name", label: "Immobilienbezeichnung" },
      { key: "street", label: "Straße" },
      { key: "houseNumber", label: "Hausnummer" },
      { key: "postalCode", label: "PLZ" },
      { key: "city", label: "Ort" },
      { key: "state", label: "Bundesland" },
      { key: "inhabitants", label: "Anzahl Einwohner im Ort", type: "select", options: ["", "unter 10.000", "10.000 - 50.000", "50.000 - 250.000", "über 250.000"] },
      { key: "surroundings", label: "Umgebung", type: "select", options: ["", "Wohngebiet", "Mischgebiet", "Innenstadt", "Gewerbegebiet", "Randlage"] },
      { key: "purchasePrice", label: "Ursprünglich bezahlter Kaufpreis / Baukosten (€)", type: "number" },
      { key: "purchaseDate", label: "Kaufdatum", type: "date" },
      { key: "purchaseYear", label: "Jahr des Kaufs / der Fertigstellung", type: "number" },
      { key: "buildingPurchasePrice", label: "Kaufpreis Anteil Gebäude (€)", type: "number" },
      { key: "landPurchasePrice", label: "Kaufpreis Anteil Grund/Boden (€)", type: "number" },
      { key: "parkingPurchasePrice", label: "Kaufpreis Anteil Stellplatz (€)", type: "number" },
      { key: "unitValueFileNumber", label: "Einheitswert-Aktenzeichen" },
      { key: "ownershipHusbandPercent", label: "Eigentumsquote Ehemann (%)", type: "number" },
      { key: "ownershipWifePercent", label: "Eigentumsquote Ehefrau (%)", type: "number" },
      { key: "transferBenefitsDate", label: "Übergang Nutzen und Lasten", type: "date" },
    ],
  },
  {
    title: "Sektion 2: Beschreibung",
    description: "Flächen, Nutzung und Ausstattung.",
    icon: Building2,
    fields: [
      { key: "usageType", label: "Nutzungstyp", type: "select", options: ["", "Wohnwirtschaftlich vermietet", "Eigennutzung", "Leerstand", "Gewerblich", "Garage/Stellplatz"] },
      { key: "unitCount", label: "Anzahl der Einheiten", type: "number" },
      { key: "totalArea", label: "Gesamtfläche aller Einheiten (m²)", type: "number" },
      { key: "coldRentMonthly", label: "Monatliche Netto-Kaltmiete", type: "number" },
      { key: "landArea", label: "Grundstücksfläche (m²)", type: "number" },
      { key: "convertedSpace", label: "Umbauter Raum (m³)", type: "number" },
      { key: "equipmentYear", label: "Ausstattung & Baujahr (YYYY)", type: "number" },
      { key: "constructionType", label: "Bauweise", type: "select", options: ["", "Massivbauweise", "Fertigbauweise", "Sonstiges"] },
      { key: "constructionSpecials", label: "Besonderheiten der Bauart", type: "select", options: ["", "Keine", "Denkmalschutz", "Sondernutzung", "Erweiterungspotenzial"] },
      { key: "equipmentRating", label: "Beurteilung der Ausstattung", type: "select", options: ["", "Gut", "Marktüblich", "Einfach", "Gehoben"] },
      { key: "floors", label: "Anzahl Vollgeschosse", type: "number" },
      { key: "elevator", label: "Aufzug vorhanden?", type: "checkbox" },
      { key: "condition", label: "Zustand", type: "select", options: ["", "Gepflegt", "Renovierungsbedürftig", "Modernisiert", "Neuwertig"] },
      { key: "attic", label: "Dachgeschoss", type: "select", options: ["", "Ausgebaut", "Nicht ausgebaut", "Kein Dachgeschoss"] },
      { key: "cellar", label: "Keller", type: "select", options: ["", "Voll unterkellert", "Teilunterkellert", "Kein Keller"] },
      { key: "parkingSpaces", label: "Stellplätze", placeholder: "z. B. 1 Garage, 2 TG" },
    ],
  },
  {
    title: "Sektion 3: Bewertung",
    description: "Wertansätze und Erwerbsbesonderheiten.",
    icon: Euro,
    fields: [
      { key: "marketValue", label: "Marktwert (€)", type: "number" },
      { key: "landValue", label: "Bodenrichtwert", type: "number" },
      { key: "acquisitionSpecials", label: "Besonderheiten beim Erwerb", type: "select", options: ["", "Keine", "Erbschaft", "Schenkung", "Sonderpreis", "Privatkauf"] },
      { key: "estimatedMarketValue", label: "Geschätzter Marktwert (€)", type: "number" },
      { key: "heritableBuildingRight", label: "Erbbaurecht?", type: "checkbox" },
    ],
  },
  {
    title: "Sektion 4: Energie und Modernisierungen",
    description: "Energiekennzahlen und Modernisierungshistorie.",
    icon: Zap,
    fields: [
      { key: "energyClass", label: "Energieeffizienzklasse", type: "select", options: ["", "A+", "A", "B", "C", "D", "E", "F", "G", "H"] },
      { key: "primaryEnergyDemand", label: "Primärenergiebedarf" },
      { key: "primaryEnergyConsumption", label: "Primärenergieverbrauch" },
      { key: "co2Emissions", label: "CO2-Emissionen" },
      { key: "modernizations", label: "Bereits durchgeführte Modernisierungen" },
      { key: "lastModernizationYear", label: "Jahr der letzten Modernisierung", type: "number" },
      { key: "modernizationCosts", label: "Kosten Gesamt-Modernisierung", type: "number" },
    ],
  },
  {
    title: "Sektion 5: Bestehende Darlehen",
    description: "Finanzierungsdaten, Raten und Restschuld.",
    icon: Landmark,
    fields: [
      { key: "lender", label: "Aktueller Darlehensgeber" },
      { key: "ibanBic", label: "BLZ, BIC & Darlehensnummer" },
      { key: "loanNumber", label: "Darlehensnummer" },
      { key: "landRegisterRank", label: "Rangstelle im Grundbuch" },
      { key: "subsidizedLoan", label: "Förderdarlehen?", type: "checkbox" },
      { key: "originalLoanAmount", label: "Ursprüngliche Darlehenssumme", type: "number" },
      { key: "currentMonthlyRate", label: "Aktuelle Monatsrate", type: "number" },
      { key: "agreedFutureRate", label: "Vereinbarte zukünftige Monatsrate", type: "number" },
      { key: "interestRate", label: "Sollzins (%)" },
      { key: "interestBinding", label: "Sollzinsbindung" },
      { key: "fullRepaymentDate", label: "Datum der Vollauszahlung", type: "date" },
      { key: "release", label: "Ablösung" },
      { key: "shouldBeRedeemed", label: "Soll das Darlehen abgelöst werden?", type: "checkbox" },
      { key: "remainingDebt", label: "Restschuld (€) · Quelle Darlehen", type: "number" },
      { key: "expectedEndDate", label: "Voraussichtliches Ende der Laufzeit", type: "date" },
      { key: "borrowers", label: "Darlehensnehmer*in" },
    ],
  },
];

const FIELD_BY_KEY = new Map<string, FieldConfig>(SECTION_FIELDS.flatMap((section) => section.fields.map((field) => [field.key, field])));

const DETAIL_TEMPLATE_SECTIONS: Array<{
  id: string;
  title: string;
  subtitle: string;
  pageLabel: string;
  icon: typeof Home;
  columns: Array<{ title: string; description?: string; fields: string[]; action?: "parking" | "modernization" | "borrower" }>;
}> = [
  {
    id: "vorhaben",
    title: "Vorhaben & Adresse",
    subtitle: "Stammdaten, Kontaktadresse und Kostenbasis nach Vorlage Seite 2.",
    pageLabel: "Vorlage S. 2",
    icon: MapPin,
    columns: [
      { title: "Vorhaben", fields: ["financingReason", "propertyType", "name"] },
      { title: "Adresse und Kontaktdaten", fields: ["street", "houseNumber", "postalCode", "city", "state", "inhabitants", "surroundings"] },
      { title: "Kostenaufstellung", fields: ["purchasePrice", "purchaseDate", "purchaseYear", "buildingPurchasePrice", "landPurchasePrice", "parkingPurchasePrice", "unitValueFileNumber", "ownershipHusbandPercent", "ownershipWifePercent", "transferBenefitsDate"] },
    ],
  },
  {
    id: "beschreibung",
    title: "Beschreibung",
    subtitle: "Flächen, Nutzung, Ausstattung und Stellplätze nach Vorlage Seite 3.",
    pageLabel: "Vorlage S. 3",
    icon: Building2,
    columns: [
      { title: "Flächen und Nutzung", fields: ["usageType", "unitCount", "totalArea", "coldRentMonthly", "landArea", "convertedSpace"] },
      { title: "Ausstattung", fields: ["equipmentYear", "constructionType", "constructionSpecials", "equipmentRating", "floors", "elevator", "condition", "attic", "cellar"] },
      { title: "Stellplätze", description: "Parkplätze, Garagen oder Tiefgaragenstellplätze separat dokumentieren.", fields: ["parkingSpaces"], action: "parking" },
    ],
  },
  {
    id: "bewertung",
    title: "Bewertung",
    subtitle: "Marktwert, Bodenrichtwert und Erwerbsbesonderheiten nach Vorlage Seite 4.",
    pageLabel: "Vorlage S. 4",
    icon: Euro,
    columns: [
      { title: "Wertansätze", fields: ["marketValue", "landValue", "estimatedMarketValue"] },
      { title: "Erwerb", fields: ["acquisitionSpecials", "heritableBuildingRight"] },
    ],
  },
  {
    id: "energie",
    title: "Energie und Modernisierungen",
    subtitle: "Energiekennzahlen und Modernisierungshistorie nach Vorlage Seite 5.",
    pageLabel: "Vorlage S. 5",
    icon: Zap,
    columns: [
      { title: "Energie", fields: ["energyClass", "primaryEnergyDemand", "primaryEnergyConsumption", "co2Emissions"] },
      { title: "Bereits durchgeführte Modernisierungen", fields: ["modernizations", "lastModernizationYear", "modernizationCosts"], action: "modernization" },
    ],
  },
  {
    id: "darlehen",
    title: "Bestehende Darlehen",
    subtitle: "Darlehensgeber, Konditionen, Ablösung und Darlehensnehmer nach Vorlage Seite 6.",
    pageLabel: "Vorlage S. 6",
    icon: Landmark,
    columns: [
      { title: "Darlehen 1", fields: ["lender", "ibanBic", "loanNumber", "landRegisterRank", "subsidizedLoan"] },
      { title: "Konditionen", fields: ["originalLoanAmount", "currentMonthlyRate", "agreedFutureRate", "interestRate", "interestBinding", "fullRepaymentDate"] },
      { title: "Ablösung", fields: ["release", "shouldBeRedeemed", "remainingDebt", "expectedEndDate", "borrowers"], action: "borrower" },
    ],
  },
];

function normalize(value: string) {
  return value
    .toLowerCase()
    .replaceAll("ß", "ss")
    .replace(/[ä]/g, "a")
    .replace(/[ö]/g, "o")
    .replace(/[ü]/g, "u")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactReference(value: string | null | undefined) {
  return normalize(String(value ?? "")).replace(/\s+/g, "");
}

function parkingCode(value: string | null | undefined): string | null {
  return compactReference(value).match(/p25[034]/)?.[0] ?? null;
}

function formatCurrency(value: string | number | null | undefined): string {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(/\./g, "").replace(",", "."));
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number.isFinite(parsed) ? parsed : 0);
}

function formatCurrencyExact(value: string | number | null | undefined): string {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(/\./g, "").replace(",", "."));
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(parsed) ? parsed : 0);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("de-DE", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format((value || 0) / 100);
}

function parseAmount(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAmountForDraft(value: number): string {
  return value > 0 ? value.toFixed(2) : "";
}

function buildModernizationAutoBlock(summary: RepairCapexSummary): string {
  if (summary.lines.length === 0) return "";
  return ["Automatisch aus Reparatur-/Capex-Buchungen:", ...summary.lines].join("\n");
}

function removeModernizationAutoBlock(value: string): string {
  return value.replace(/Automatisch aus Reparatur-\/Capex-Buchungen:[\s\S]*$/m, "").trim();
}

function mergeModernizationDraft(draft: WealthDraft, summary?: RepairCapexSummary): WealthDraft {
  if (!summary || summary.entries.length === 0) return draft;

  const manualModernizations = removeModernizationAutoBlock(String(draft.modernizations ?? ""));
  const autoModernizations = buildModernizationAutoBlock(summary);

  return {
    ...draft,
    modernizations: [manualModernizations, autoModernizations].filter(Boolean).join("\n\n"),
    lastModernizationYear: summary.latestYear ? String(summary.latestYear) : draft.lastModernizationYear,
    modernizationCosts: formatAmountForDraft(summary.totalAmount) || draft.modernizationCosts,
  };
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function currentYear() {
  return new Date().getFullYear();
}

function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function safeRatio(value: number, base: number) {
  if (!base) return 0;
  return (value / base) * 100;
}

function isRosensteinCard(card: WealthCard) {
  return normalize(`${card.draft.name} ${card.row?.property_name ?? ""}`).includes("rosenstein");
}

function vacancyMatchesWealthCard(vacancy: UnitVacancy, card: WealthCard): boolean {
  const row = card.row;
  const vacancyLabel = normalize([vacancy.property_id, vacancy.object_code, vacancy.object_label].filter(Boolean).join(" "));
  const cardLabel = normalize([card.id, card.draft.name, row?.property_id, row?.portfolio_property_id, row?.property_name].filter(Boolean).join(" "));

  return Boolean(
    (row?.property_id && vacancy.property_id === row.property_id) ||
      (row?.portfolio_property_id && vacancy.property_id === row.portfolio_property_id) ||
      (vacancyLabel && cardLabel && (vacancyLabel.includes(cardLabel) || cardLabel.includes(vacancyLabel))) ||
      (isRosensteinCard(card) && vacancyLabel.includes("rosenstein")),
  );
}

function vacancyMatchesParkingUnit(vacancy: UnitVacancy, card: WealthCard, unit: ParkingUnit): boolean {
  if (!vacancyMatchesWealthCard(vacancy, card)) return false;

  const vacancyParkingCode = parkingCode([vacancy.unit_label, vacancy.object_code, vacancy.object_label].filter(Boolean).join(" "));
  const unitParkingCode = parkingCode(`${unit.shortLabel} ${unit.reference}`);

  if (vacancyParkingCode || unitParkingCode) {
    return Boolean(vacancyParkingCode && unitParkingCode && vacancyParkingCode === unitParkingCode);
  }

  const vacancyUnit = compactReference(vacancy.unit_label);
  if (!vacancyUnit) return true;

  const unitLabel = compactReference(`${unit.shortLabel} ${unit.title} ${unit.reference}`);
  return Boolean(unitLabel && (unitLabel.includes(vacancyUnit) || vacancyUnit.includes(unitLabel)));
}

function contractMatchesWealthCard(contract: TenantContract, card: WealthCard, objects: AppObject[]): boolean {
  const row = card.row;
  const cardLabel = normalize(`${card.draft.name} ${row?.property_name ?? ""}`);
  const matchingObjects = objects.filter((object) => {
    const objectLabel = normalize(object.label);
    return Boolean(
      (row?.property_id && (object.id === row.property_id || object.aliases?.includes(row.property_id))) ||
      (row?.portfolio_property_id && (object.id === row.portfolio_property_id || object.aliases?.includes(row.portfolio_property_id))) ||
      (objectLabel && cardLabel && (objectLabel.includes(cardLabel) || cardLabel.includes(objectLabel))),
    );
  });
  const identifiers = new Set(
    [
      card.id,
      row?.property_id,
      row?.portfolio_property_id,
      ...matchingObjects.flatMap((object) => [object.id, object.code, ...(object.aliases ?? [])]),
    ]
      .flatMap((value) => (value ? [normalize(value)] : [])),
  );

  if ([contract.property_id, contract.object_code].some((value) => Boolean(value && identifiers.has(normalize(value))))) return true;
  const contractLabel = normalize(`${contract.object_code ?? ""} ${contract.unit_label ?? ""}`);
  return Boolean(contractLabel && cardLabel && contractLabel.includes("rosenstein") && cardLabel.includes("rosenstein"));
}

function contractMatchesParkingUnit(contract: TenantContract, unit: ParkingUnit): boolean {
  const contractLabel = compactReference(`${contract.unit_label ?? ""} ${contract.rent_type ?? ""} ${contract.notes ?? ""}`);
  const unitCodes = [unit.shortLabel, unit.reference, unit.reference.split(" - ")[1] ?? ""]
    .map(compactReference)
    .filter(Boolean);
  return unitCodes.some((code) => contractLabel.includes(code));
}

function isContractActiveOn(contract: TenantContract, date: string): boolean {
  if (contract.status === "vacant") return false;
  if (contract.start_date && contract.start_date > date) return false;
  if (contract.end_date && contract.end_date < date) return false;
  // Ein geplanter Leerstand setzt den Datensatz technisch bereits auf "ended".
  // Bis zum hinterlegten Vertragsende bleibt der Mietvertrag jedoch fachlich aktiv.
  if (contract.status === "ended" && !contract.end_date) return false;
  return true;
}

function tenantDisplayName(profile: TenantProfileWithContracts): string {
  return profile.company_name || [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() || profile.tenant_number || "Mieter nicht benannt";
}

function contractMonthlyRent(contract: TenantContract): number {
  const total = toNumber(contract.total_rent);
  return total > 0 ? total : toNumber(contract.cold_rent) + toNumber(contract.operating_costs);
}

function buildRosensteinParkingUnits(
  card: WealthCard,
  vacancies: UnitVacancy[],
  tenants: TenantProfileWithContracts[],
  objects: AppObject[],
  entries: FinanceEntry[],
  year: number,
): ParkingUnit[] {
  const today = todayIso();

  return ROSENSTEIN_PARKING_UNITS.map((unit) => {
    const vacancy = vacancies.find(
      (candidate) =>
        vacancyMatchesParkingUnit(candidate, card, unit) &&
        isVacancyEffectivelyActiveInRange(candidate, today, today),
    );

    const tenantContract = tenants.flatMap((tenant) =>
      (tenant.tenant_contracts ?? []).map((contract) => ({ tenant, contract })),
    ).find(({ contract }) =>
      contractMatchesWealthCard(contract, card, objects) &&
      contractMatchesParkingUnit(contract, unit) &&
      isContractActiveOn(contract, today),
    );
    const payment = getRosensteinUnitPayment(entries, unit, year);

    if (!vacancy && tenantContract) {
      return {
        ...unit,
        status: "rented",
        tenantName: tenantDisplayName(tenantContract.tenant),
        monthlyRent: contractMonthlyRent(tenantContract.contract) || payment.lastAmount,
      };
    }

    return {
      ...unit,
      status: "vacant",
      tenantName: vacancy ? "Leerstand" : "Kein aktiver Mietvertrag",
      monthlyRent: payment.lastAmount,
      vacancy,
    };
  });
}

function getPropertyImage(name: string): PortfolioGalleryItem | undefined {
  const normalized = normalize(name);
  return portfolioGalleryItems.find((item) => item.matchTerms.some((term) => normalized.includes(normalize(term))));
}

function getEntryYear(entry: FinanceEntry) {
  const raw = entry.booking_date ?? "";
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.getFullYear();
  const fallback = raw.match(/\b(20\d{2})\b/);
  return fallback ? Number(fallback[1]) : null;
}

function getEntryLabel(entry: FinanceEntry) {
  return normalize([entry.object_id, entry.objekt_code, entry.category, entry.note].filter(Boolean).join(" "));
}

function entryMatchesParkingUnit(entry: FinanceEntry, unit: ParkingUnit) {
  const label = getEntryLabel(entry);
  const compactReference = normalize(unit.reference.replace(/\s+/g, ""));
  return (
    label.includes(normalize(unit.shortLabel)) ||
    label.includes(normalize(unit.reference)) ||
    label.includes(compactReference) ||
    label.includes(normalize(unit.reference.split("-").at(-1) ?? ""))
  );
}

function isRentEntry(entry: FinanceEntry) {
  return entry.entry_type === "income" && ["miete", "miete garage", "mietbestandteil nk"].includes(normalize(entry.category ?? ""));
}

function getRosensteinUnitPayment(entries: FinanceEntry[], unit: ParkingUnit, year: number) {
  const unitEntries = entries.filter((entry) => isRentEntry(entry) && getEntryYear(entry) === year && entryMatchesParkingUnit(entry, unit));
  const total = unitEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const lastEntry = unitEntries
    .filter((entry) => entry.booking_date)
    .sort((left, right) => String(right.booking_date).localeCompare(String(left.booking_date)))[0];
  return { total, lastBookingDate: lastEntry?.booking_date ?? null, lastAmount: lastEntry?.amount ?? 0 };
}

function loadExposes(): Record<string, ExposeInfo> {
  try {
    const raw = window.localStorage.getItem(EXPOSE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ExposeInfo>) : {};
  } catch {
    return {};
  }
}

function loadStoredDrafts(): Record<string, WealthDraft> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, WealthDraft>) : {};
  } catch {
    return {};
  }
}

function findTemplate(rowName: string): WealthTemplate | undefined {
  const normalized = normalize(rowName);
  return WEALTH_TEMPLATES.find((template) => template.match.some((term) => normalized.includes(normalize(term))));
}

function withoutEmptyValues(draft: WealthDraft | undefined): WealthDraft {
  return Object.fromEntries(
    Object.entries(draft ?? {}).filter(([, value]) => String(value ?? "").trim() !== ""),
  ) as WealthDraft;
}

function mergeDraft(row: PortfolioLoanRow | undefined, template: WealthTemplate, stored: Record<string, WealthDraft>): WealthDraft {
  const liveFallback: WealthDraft = row ? { name: template.defaults.name || row.property_name } : {};

  return {
    ...template.defaults,
    ...liveFallback,
    ...withoutEmptyValues(stored[template.key]),
    ...(row?.portfolio_property_id ? withoutEmptyValues(stored[row.portfolio_property_id]) : {}),
    ...(row?.property_id ? withoutEmptyValues(stored[row.property_id]) : {}),
    // Restschuld wird niemals aus Vorlage oder localStorage übernommen.
    remainingDebt: "",
  };
}

function buildCards(rows: PortfolioLoanRow[], stored: Record<string, WealthDraft>): WealthCard[] {
  const usedRowIds = new Set<string>();

  const cards = WEALTH_TEMPLATES.map((template) => {
    const row = rows.find((candidate) => {
      if (usedRowIds.has(candidate.property_id)) return false;
      return findTemplate(candidate.property_name)?.key === template.key;
    });
    if (row) usedRowIds.add(row.property_id);
    return { id: template.key, row, draft: mergeDraft(row, template, stored) };
  });

  rows.forEach((row) => {
    if (usedRowIds.has(row.property_id)) return;
    const id = row.portfolio_property_id ?? row.property_id;
    cards.push({
      id,
      row,
      draft: {
        ...EMPTY_DRAFT,
        ...(stored[id] ?? {}),
        ...(stored[row.property_id] ?? {}),
        name: stored[row.property_id]?.name || stored[id]?.name || row.property_name,
        remainingDebt: "",
      },
    });
  });

  return cards;
}

function DetailField({
  field,
  value,
  onChange,
  disabled = false,
}: {
  field: FieldConfig;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const commonClass = [
    "min-h-11 rounded-2xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-950 shadow-sm outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100",
    disabled ? "bg-slate-100 text-slate-500" : "bg-white",
  ].join(" ");

  if (field.type === "select") {
    return (
      <label className="grid gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
        {field.label}
        <select className={commonClass} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
          {(field.options ?? [""]).map((option) => (
            <option key={option || "empty"} value={option}>
              {option || "Bitte auswählen"}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className={["flex min-h-[68px] items-center gap-3 rounded-2xl border border-slate-200 px-3 py-2 text-sm font-black shadow-sm", disabled ? "bg-slate-100 text-slate-500" : "bg-white text-slate-700"].join(" ")}>
        <input
          type="checkbox"
          checked={value === "Ja"}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked ? "Ja" : "Nein")}
          className="h-5 w-5 accent-teal-700"
        />
        {field.label}
      </label>
    );
  }

  if (field.key === "modernizations") {
    return (
      <label className="grid gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
        {field.label}
        <textarea
          className={`${commonClass} min-h-36 resize-y leading-6`}
          value={value}
          disabled={disabled}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    );
  }

  return (
    <label className="grid gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
      {field.label}
      <input
        className={commonClass}
        type={field.type === "date" ? "date" : "text"}
        inputMode={field.type === "number" ? "decimal" : undefined}
        value={value}
        disabled={disabled}
        placeholder={field.placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SourceKpi({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "green" | "red" | "blue" }) {
  const toneClass = {
    neutral: "border-slate-200 bg-white text-slate-950",
    green: "border-emerald-100 bg-emerald-50 text-emerald-800",
    red: "border-rose-100 bg-rose-50 text-rose-800",
    blue: "border-blue-100 bg-blue-50 text-blue-800",
  }[tone];

  return (
    <div className={`rounded-[18px] border p-4 shadow-sm ${toneClass}`}>
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <b className="mt-3 block text-xl font-black">{value}</b>
    </div>
  );
}

function PropertyImageButton({
  image,
  label,
  className = "",
  onOpen,
}: {
  image?: PortfolioGalleryItem;
  label: string;
  className?: string;
  onOpen: (image: PortfolioGalleryItem) => void;
}) {
  return (
    <button
      type="button"
      disabled={!image}
      onClick={(event) => {
        event.stopPropagation();
        if (image) onOpen(image);
      }}
      className={[
        "group relative flex min-h-[120px] overflow-hidden rounded-[18px] border border-slate-200 bg-slate-100 text-left shadow-sm transition enabled:cursor-zoom-in enabled:hover:border-orange-200 enabled:hover:shadow-md disabled:cursor-default",
        className,
      ].join(" ")}
      aria-label={image ? `${image.title} vergrößern` : `Kein Objektbild für ${label} vorhanden`}
    >
      {image ? (
        <>
          <img src={image.imageUrl} alt={image.title} className="h-full min-h-[120px] w-full object-cover transition duration-300 group-enabled:group-hover:scale-[1.03]" />
          <span className="absolute inset-x-3 bottom-3 rounded-2xl bg-slate-950/72 px-3 py-2 text-xs font-black text-white backdrop-blur">
            Foto vergrößern
          </span>
        </>
      ) : (
        <span className="flex h-full min-h-[120px] w-full items-center justify-center text-xs font-black uppercase tracking-[0.14em] text-slate-400">
          Objektbild
        </span>
      )}
    </button>
  );
}

function PropertyImageModal({ image, onClose }: { image: PortfolioGalleryItem; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="relative w-full max-w-5xl overflow-hidden rounded-[24px] bg-white shadow-[0_28px_80px_rgba(0,0,0,0.32)]" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-2xl font-black text-slate-950 shadow-sm"
          aria-label="Foto schließen"
        >
          ×
        </button>
        <img src={image.imageUrl} alt={image.title} className="max-h-[78vh] w-full object-contain bg-slate-950" />
        <div className="border-t border-slate-200 bg-white px-5 py-4">
          <b className="block text-lg font-black text-slate-950">{image.title}</b>
          <span className="mt-1 block text-sm font-bold text-slate-500">{image.subtitle}</span>
        </div>
      </div>
    </div>
  );
}

function CashflowPanel({ finance, year, objectValue }: { finance: WealthFinance; year: number; objectValue: number }) {
  const maxBar = Math.max(finance.income, finance.expenses, objectValue, 1);
  return (
    <section className="rounded-[24px] border border-white/80 bg-white/90 p-5 shadow-[0_18px_44px_rgba(51,65,85,0.08)]">
      <div className="grid gap-6 lg:grid-cols-[1fr_1.25fr] lg:items-center">
        <div>
          <span className="inline-flex rounded-full bg-emerald-50 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#255f6f]">Cashflow & Rendite</span>
          <h2 className="mt-4 text-2xl font-black text-slate-950">{formatCurrencyExact(finance.netCashflow)} Netto-Cashflow im Jahr {year}</h2>
          <p className="mt-3 max-w-2xl text-sm font-bold leading-6 text-slate-500">
            Einnahmen und Ausgaben kommen aus Buchhaltung/Finanzmaster. Rendite nutzt den gepflegten Objektwert; ohne Wert wird ersatzweise die Restschuld verwendet.
          </p>
        </div>
        <div className="grid gap-3">
          {[
            ["Einnahmen", finance.income],
            ["Ausgaben", finance.expenses],
            ["Objektwerte", objectValue],
          ].map(([label, value]) => (
            <div key={label} className="grid grid-cols-[110px_1fr_130px] items-center gap-3 text-sm font-black text-slate-700 max-sm:grid-cols-1">
              <span>{label}</span>
              <i className="h-3 rounded-full bg-gradient-to-r from-[#315f6d] to-[#a5dccd]" style={{ width: `${Math.min(100, safeRatio(Number(value), maxBar))}%` }} />
              <b className="text-right text-slate-950 max-sm:text-left">{formatCurrencyExact(Number(value))}</b>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinanceOverview({ totals, year, objectValue, objectCount }: { totals: WealthFinance; year: number; objectValue: number; objectCount: number }) {
  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <SourceKpi label="Objekte" value={String(objectCount)} />
        <SourceKpi label={`Cashflow ${year}`} value={formatCurrencyExact(totals.netCashflow)} tone={totals.netCashflow >= 0 ? "green" : "red"} />
        <SourceKpi label="Brutto-Rendite" value={formatPercent(totals.grossYield)} />
        <SourceKpi label="Netto-Rendite" value={formatPercent(totals.netYield)} />
        <SourceKpi label="Restschuld Gesamt · Darlehen" value={formatCurrencyExact(totals.lastBalance)} />
        <SourceKpi label="Ø Rückzahlungsstand" value={formatPercent(totals.repaidPercent)} />
      </section>
      <CashflowPanel finance={totals} year={year} objectValue={objectValue} />
    </div>
  );
}

function PropertyEconomicOverview({ finance, year }: { finance: WealthFinance; year: number }) {
  const progress = Math.max(0, Math.min(100, finance.repaidPercent));
  const mainItems = [
    { label: "Restschuld · Darlehen", value: formatCurrencyExact(finance.lastBalance), tone: "neutral" },
    { label: `Cashflow ${year}`, value: formatCurrencyExact(finance.netCashflow), tone: finance.netCashflow >= 0 ? "green" : "red" },
    { label: "Netto-Rendite", value: formatPercent(finance.netYield), tone: "neutral" },
  ] as const;
  const detailItems = [
    { label: `Einnahmen ${year}`, value: formatCurrencyExact(finance.income), tone: "green" },
    { label: `Ausgaben ${year}`, value: formatCurrencyExact(finance.expenses), tone: "neutral" },
    { label: `Mieten ${year}`, value: formatCurrencyExact(finance.rentIncome), tone: "neutral" },
    { label: "NK aus Buchungen", value: formatCurrencyExact(finance.nebenkosten), tone: "neutral" },
    { label: "Brutto-Rendite", value: formatPercent(finance.grossYield), tone: "neutral" },
  ] as const;

  return (
    <section className="rounded-[22px] border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-0 overflow-hidden rounded-[22px] md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1.2fr]">
        {mainItems.map((item) => (
          <div key={item.label} className="border-b border-slate-200 p-5 md:border-r xl:border-b-0">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
            <b className={[
              "mt-3 block text-xl font-black sm:text-2xl",
              item.tone === "green" ? "text-emerald-700" : item.tone === "red" ? "text-rose-700" : "text-slate-950",
            ].join(" ")}>
              {item.value}
            </b>
          </div>
        ))}
        <div className="border-b border-slate-200 p-5 xl:border-b-0">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Rückzahlung</p>
          <div className="mt-3 flex items-center gap-4">
            <b className="min-w-[86px] text-xl font-black text-slate-950 sm:text-2xl">{formatPercent(finance.repaidPercent)}</b>
            <div className="h-2 flex-1 rounded-full bg-slate-200">
              <i className="block h-2 rounded-full bg-gradient-to-r from-[#315f6d] to-[#7c8cf6]" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </div>
      <div className="grid gap-2 border-t border-slate-100 bg-slate-50/70 p-3 sm:grid-cols-2 xl:grid-cols-5">
        {detailItems.map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="truncate text-[10px] font-black uppercase tracking-[0.14em] text-slate-500" title={item.label}>{item.label}</p>
            <b className={["mt-1 block truncate text-base font-black", item.tone === "green" ? "text-emerald-700" : "text-slate-950"].join(" ")} title={item.value}>
              {item.value}
            </b>
          </div>
        ))}
      </div>
    </section>
  );
}

function RosensteinUnitOverview({ entries, year, parkingUnits }: { entries: FinanceEntry[]; year: number; parkingUnits: ParkingUnit[] }) {
  const units = parkingUnits.map((unit) => ({
    ...unit,
    payment: getRosensteinUnitPayment(entries, unit, year),
  }));
  const rentedUnits = units.filter((unit) => unit.status === "rented");
  const vacantUnits = units.filter((unit) => unit.status === "vacant");
  const monthlyTarget = rentedUnits.reduce((sum, unit) => sum + unit.monthlyRent, 0);
  const yearlyPayments = units.reduce((sum, unit) => sum + unit.payment.total, 0);

  return (
    <article className="rounded-[18px] border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Einheitenstruktur</p>
          <h2 className="text-xl font-black text-slate-950">TG-Stellplätze Rosensteinstr. 25</h2>
          <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
            Das Vermögensobjekt bleibt eine Hauptakte; die drei Stellplätze werden darunter separat geführt.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <SourceKpi label="Einheiten" value={String(units.length)} />
          <SourceKpi label="Vermietet" value={String(rentedUnits.length)} tone="green" />
          <SourceKpi label="Leer" value={String(vacantUnits.length)} />
          <SourceKpi label="Soll mtl." value={formatCurrencyExact(monthlyTarget)} tone="blue" />
          <SourceKpi label={`Eingang ${year}`} value={formatCurrencyExact(yearlyPayments)} tone="green" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-left">
          <thead className="bg-slate-50">
            <tr>
              {["Einheit", "Status", "Mieter", "Sollmiete", `Mieteingang ${year}`, "Letzter Eingang"].map((label) => (
                <th key={label} className="px-5 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {units.map((unit) => (
              <tr key={unit.key} className="align-top">
                <td className="px-5 py-4">
                  <b className="block text-sm font-black text-slate-950">{unit.title}</b>
                  <span className="mt-1 block text-xs font-bold text-slate-500">{unit.reference}</span>
                </td>
                <td className="px-5 py-4">
                  <span
                    className={[
                      "inline-flex rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em]",
                      unit.status === "rented" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
                    ].join(" ")}
                  >
                    {unit.status === "rented" ? "Vermietet" : "Leerstand"}
                  </span>
                </td>
                <td className="px-5 py-4 text-sm font-bold text-slate-700">{unit.tenantName}</td>
                <td className="px-5 py-4 text-sm font-black text-slate-950">
                  {formatCurrencyExact(unit.monthlyRent)}
                  {unit.status === "vacant" ? (
                    <span className="mt-1 block text-xs font-bold text-slate-500">
                      {unit.vacancy?.start_date ? `Leerstand seit ${new Date(`${unit.vacancy.start_date}T00:00:00`).toLocaleDateString("de-DE")}` : "Zielmiete bei Neuvermietung"}
                    </span>
                  ) : null}
                </td>
                <td className="px-5 py-4 text-sm font-black text-emerald-700">{formatCurrencyExact(unit.payment.total)}</td>
                <td className="px-5 py-4 text-sm font-bold text-slate-600">{unit.payment.lastBookingDate ? new Date(unit.payment.lastBookingDate).toLocaleDateString("de-DE") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function RentDataField({
  label,
  value,
  disabled,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
      {label}
      <input
        className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-950 shadow-sm outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100 disabled:text-slate-500"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function StandardRentInfoPanel({
  extra,
  propertyId,
  isAdmin,
  extraDirty,
  extraStatus,
  onExtraChange,
  onExtraSave,
}: {
  extra: PropertyExtraInfo;
  propertyId: string;
  isAdmin: boolean;
  extraDirty?: boolean;
  extraStatus?: string;
  onExtraChange: (propertyId: string, field: keyof PropertyExtraInfo, value: string) => void;
  onExtraSave: (propertyId: string) => Promise<void>;
}) {
  const rentSummary = [
    { label: "Kaltmiete", value: extra.coldRent ? formatCurrencyExact(extra.coldRent) : "—" },
    { label: "Nebenkosten", value: extra.operatingCosts ? formatCurrencyExact(extra.operatingCosts) : "—" },
    { label: "Gesamtmiete", value: extra.totalRent ? formatCurrencyExact(extra.totalRent) : "—", highlight: true },
  ];

  return (
    <article className="overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Mietdaten</p>
        <h2 className="text-xl font-black text-slate-950">Mieteingang</h2>
        <p className="mt-1 text-sm font-bold leading-6 text-slate-500">Mieterinformationen und Mietkosten sind getrennt gepflegt.</p>
      </div>

      <div className="grid gap-4 bg-slate-50/70 p-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-base font-black text-slate-950">Mieterinformationen</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {[
              ["firstName", "Name", "Name"],
              ["lastName", "Nachname", "Nachname"],
              ["phone", "Telefon", "Telefon"],
              ["email", "E-Mail", "E-Mail"],
            ].map(([field, label, placeholder]) => (
              <RentDataField
                key={field}
                label={label}
                value={String(extra[field as keyof PropertyExtraInfo] ?? "")}
                disabled={!isAdmin}
                placeholder={placeholder}
                onChange={(value) => onExtraChange(propertyId, field as keyof PropertyExtraInfo, value)}
              />
            ))}
          </div>
        </section>

        <section className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-base font-black text-slate-950">Mietkosten</h3>
          <div className="mt-4 grid gap-3">
            {[
              ["coldRent", "Kaltmiete"],
              ["operatingCosts", "Betriebskosten / Nebenkosten"],
              ["totalRent", "Gesamtmiete"],
            ].map(([field, label]) => (
              <RentDataField
                key={field}
                label={label}
                value={String(extra[field as keyof PropertyExtraInfo] ?? "")}
                disabled={!isAdmin}
                placeholder="0,00"
                onChange={(value) => onExtraChange(propertyId, field as keyof PropertyExtraInfo, value)}
              />
            ))}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {rentSummary.map((item) => (
              <div key={item.label} className={["rounded-2xl border px-3 py-3", item.highlight ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"].join(" ")}>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
                <b className={["mt-1 block text-sm font-black", item.highlight ? "text-emerald-700" : "text-slate-950"].join(" ")}>{item.value}</b>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="flex flex-col gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center">
        <button
          type="button"
          disabled={!isAdmin}
          onClick={() => void onExtraSave(propertyId)}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-900 bg-white px-4 text-sm font-black text-slate-950 shadow-sm disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
        >
          {extraDirty ? "Mietdaten speichern" : "Speichern"}
        </button>
        {extraStatus ? <span className="text-sm font-bold text-slate-500">{extraStatus}</span> : null}
      </div>
    </article>
  );
}

function RosensteinRentInfoPanel({ entries, year, parkingUnits }: { entries: FinanceEntry[]; year: number; parkingUnits: ParkingUnit[] }) {
  const units = parkingUnits.map((unit) => ({
    ...unit,
    payment: getRosensteinUnitPayment(entries, unit, year),
  }));

  return (
    <article className="overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Mietdaten je Einheit</p>
        <h2 className="text-xl font-black text-slate-950">Mieteingang TG-Stellplätze</h2>
        <p className="mt-1 text-sm font-bold leading-6 text-slate-500">Jeder Stellplatz wird separat als eigene Mietakte dargestellt.</p>
      </div>
      <div className="grid gap-4 bg-slate-50/70 p-5 xl:grid-cols-3">
        {units.map((unit) => (
          <section key={unit.key} className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{unit.title}</p>
                <h3 className="mt-1 text-lg font-black text-slate-950">{unit.shortLabel}</h3>
                <p className="mt-1 text-xs font-bold text-slate-500">{unit.reference}</p>
              </div>
              <span
                className={[
                  "rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em]",
                  unit.status === "rented" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
                ].join(" ")}
              >
                {unit.status === "rented" ? "Vermietet" : "Leerstand"}
              </span>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Mieterinformationen</p>
              <b className="mt-2 block text-sm font-black text-slate-950">{unit.tenantName}</b>
              <p className="mt-1 text-xs font-bold text-slate-500">
                {unit.vacancy ? `Leerstand: ${unit.vacancy.start_date}${unit.vacancy.end_date ? ` bis ${unit.vacancy.end_date}` : " bis offen"}` : "Telefon — · E-Mail —"}
              </p>
            </div>

            <div className="mt-3 grid gap-2">
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm">
                <span className="font-bold text-slate-500">Kaltmiete</span>
                <b className="font-black text-slate-950">{formatCurrencyExact(unit.monthlyRent)}</b>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm">
                <span className="font-bold text-slate-500">Nebenkosten</span>
                <b className="font-black text-slate-950">{formatCurrencyExact(0)}</b>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
                <span className="font-black text-emerald-700">Gesamtmiete</span>
                <b className="font-black text-emerald-800">{formatCurrencyExact(unit.monthlyRent)}</b>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 px-3 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">Mieteingang {year}</p>
              <b className="mt-1 block text-lg font-black text-blue-950">{formatCurrencyExact(unit.payment.total)}</b>
              <p className="mt-1 text-xs font-bold text-blue-700">Letzter Eingang: {unit.payment.lastBookingDate ? new Date(unit.payment.lastBookingDate).toLocaleDateString("de-DE") : "—"}</p>
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

function DetailPage({
  card,
  extra,
  finance,
  entries,
  year,
  image,
  parkingUnits,
  uploadedExpose,
  onUpdate,
  onSave,
  onExtraChange,
  onExtraSave,
  onExposePreview,
  onExposeGenerate,
  onExposeUpload,
  onImageOpen,
  extraDirty,
  extraStatus,
  saveStatus,
  isAdmin,
}: {
  card: WealthCard;
  extra: PropertyExtraInfo;
  finance: WealthFinance;
  entries: FinanceEntry[];
  year: number;
  image?: PortfolioGalleryItem;
  parkingUnits: ParkingUnit[];
  uploadedExpose?: ExposeInfo;
  onUpdate: (id: string, key: string, value: string) => void;
  onSave: (id: string) => void;
  onExtraChange: (propertyId: string, field: keyof PropertyExtraInfo, value: string) => void;
  onExtraSave: (propertyId: string) => Promise<void>;
  onExposePreview: (card: WealthCard, extra: PropertyExtraInfo, finance: WealthFinance) => void;
  onExposeGenerate: (card: WealthCard, extra: PropertyExtraInfo, finance: WealthFinance) => void;
  onExposeUpload: (propertyId: string) => void;
  onImageOpen: (image: PortfolioGalleryItem) => void;
  extraDirty?: boolean;
  extraStatus?: string;
  saveStatus?: string;
  isAdmin: boolean;
}) {
  const navigate = useNavigate();
  const propertyId = card.row?.property_id ?? card.id;
  const appendValue = (key: string, value: string) => {
    const current = key === "modernizations" ? removeModernizationAutoBlock(card.draft[key] ?? "") : card.draft[key]?.trim();
    onUpdate(card.id, key, current ? `${current}\n${value}` : value);
  };
  const renderAction = (action?: "parking" | "modernization" | "borrower") => {
    if (!action) return null;
    const config = {
      parking: { key: "parkingSpaces", label: "PKW Stellplatz hinzufügen", value: "PKW Stellplatz" },
      modernization: { key: "modernizations", label: "Modernisierung hinzufügen", value: "Neue Modernisierung" },
      borrower: { key: "borrowers", label: "Person hinzufügen", value: "Neue Person" },
    }[action];

    return (
      <button
        type="button"
        disabled={!isAdmin}
        onClick={() => appendValue(config.key, config.value)}
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 text-sm font-black text-orange-700 shadow-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      >
        <PlusCircle size={17} /> {config.label}
      </button>
    );
  };

  return (
    <div className="space-y-5">
      <section className="rounded-[24px] border border-white/80 bg-white/90 p-5 shadow-[0_18px_44px_rgba(51,65,85,0.08)] backdrop-blur">
        <div className="mb-5 flex flex-col gap-3 border-b border-slate-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Immobilienvermögen</p>
            <h1 className="mt-2 text-xl font-black text-slate-950 sm:text-2xl">{card.draft.name || "Immobilie"}</h1>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {[card.draft.street && `${card.draft.street} ${card.draft.houseNumber}`.trim(), [card.draft.postalCode, card.draft.city].filter(Boolean).join(" ")]
                .filter(Boolean)
                .join(", ") || "Adresse offen"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/immobilienvermoegen")}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 shadow-sm"
          >
            <ArrowLeft size={17} /> Zur Übersicht
          </button>
        </div>

        <div className="space-y-5">
            <article className="grid gap-4 rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[280px_1fr]">
              <PropertyImageButton image={image} label={card.draft.name || "Immobilie"} className="min-h-[190px]" onOpen={onImageOpen} />
              <div className="flex flex-col justify-center">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Objektfoto</p>
                <h2 className="mt-2 text-xl font-black text-slate-950">{image?.title ?? card.draft.name ?? "Immobilie"}</h2>
                <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-slate-500">
                  Fotoquelle: Portfolio-Galerie. Ein Klick auf das Foto öffnet die vergrößerte Ansicht.
                </p>
              </div>
            </article>
            <PropertyEconomicOverview finance={finance} year={year} />
            {isRosensteinCard(card) ? <RosensteinUnitOverview entries={entries} year={year} parkingUnits={parkingUnits} /> : null}

            <article className="rounded-[18px] border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Objektakte</p>
                  <h2 className="text-xl font-black text-slate-950">Exposé</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => onExposePreview(card, extra, finance)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 shadow-sm">
                    <Eye size={17} /> Ansehen
                  </button>
                  <button type="button" onClick={() => onExposeGenerate(card, extra, finance)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 shadow-sm">
                    <FileText size={17} /> PDF erstellen
                  </button>
                  <button type="button" disabled={!isAdmin} onClick={() => onExposeUpload(propertyId)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#255f6f] px-4 text-sm font-black text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600">
                    <Upload size={17} /> PDF hochladen
                  </button>
                  {uploadedExpose ? (
                    <a href={uploadedExpose.dataUrl} download={uploadedExpose.fileName} className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-black text-slate-700 no-underline">
                      Download
                    </a>
                  ) : null}
                </div>
              </div>
              <p className="px-5 py-4 text-sm font-bold leading-6 text-slate-500">
                {uploadedExpose ? `Aktuell hinterlegt: ${uploadedExpose.fileName}` : "Noch kein PDF hochgeladen. Ein Exposé kann aus den aktuellen Immobilien- und Finanzdaten vorbereitet werden."}
              </p>
            </article>

            {isRosensteinCard(card) ? (
              <RosensteinRentInfoPanel entries={entries} year={year} parkingUnits={parkingUnits} />
            ) : (
              <StandardRentInfoPanel
                extra={extra}
                propertyId={propertyId}
                isAdmin={isAdmin}
                extraDirty={extraDirty}
                extraStatus={extraStatus}
                onExtraChange={onExtraChange}
                onExtraSave={onExtraSave}
              />
            )}

            {DETAIL_TEMPLATE_SECTIONS.map((section) => {
              const Icon = section.icon;
              return (
                <article key={section.id} id={section.id} className="rounded-[18px] border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                        <Icon size={19} />
                      </span>
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{section.pageLabel}</p>
                        <h2 className="text-xl font-black text-slate-950">{section.title}</h2>
                        <p className="mt-1 text-sm font-bold leading-6 text-slate-500">{section.subtitle}</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-5 bg-slate-50/70 p-5 lg:grid-cols-2 2xl:grid-cols-3">
                    {section.columns.map((column) => (
                      <div key={column.title} className="rounded-[16px] border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-base font-black text-slate-950">{column.title}</h3>
                          {isAdmin ? (
                            <span className="inline-flex min-h-7 items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-700">
                              Bearbeitbar
                            </span>
                          ) : null}
                        </div>
                        {column.description ? <p className="mt-1 text-sm font-bold leading-6 text-slate-500">{column.description}</p> : null}
                        <div className="mt-4 grid gap-3">
                          {column.fields.map((fieldKey) => {
                            const field = FIELD_BY_KEY.get(fieldKey);
                            if (!field) return null;
                            return (
                              <DetailField
                                key={field.key}
                                field={field}
                                value={field.key === "remainingDebt" ? String(finance.lastBalance) : card.draft[field.key] ?? ""}
                                disabled={!isAdmin || field.key === "remainingDebt"}
                                onChange={(value) => onUpdate(card.id, field.key, value)}
                              />
                            );
                          })}
                        </div>
                        {renderAction(column.action)}
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => onSave(card.id)}
                            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#255f6f] px-4 text-sm font-black text-white shadow-sm transition hover:bg-[#1d4f5d] focus:outline-none focus:ring-2 focus:ring-teal-200"
                            aria-label={`${column.title} speichern`}
                          >
                            <Save size={17} /> {column.title} speichern
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
      </section>

      <SectionPanel title="Notizen" description="Freier Bereich für manuelle Ergänzungen, Bankhinweise oder spätere Prüfnotizen.">
        <textarea
          className="min-h-32 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 shadow-sm outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
          value={card.draft.notes ?? ""}
          disabled={!isAdmin}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onUpdate(card.id, "notes", event.target.value)}
        />
      </SectionPanel>

      <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-[24px] border border-white/70 bg-white/90 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.12)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-bold text-slate-600">{!isAdmin ? "Nur-Lesen-Zugang: Die Detailmaske ist geschützt." : saveStatus ?? "Jede Eigenschaftsgruppe kann direkt oder gemeinsam gespeichert und danach erneut bearbeitet werden. Nur die Restschuld wird ausschließlich auf der Seite Darlehen gepflegt."}</p>
        <button
          type="button"
          onClick={() => onSave(card.id)}
          disabled={!isAdmin}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#255f6f] px-5 text-sm font-black text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
        >
          <Save size={18} /> Detailmaske speichern
        </button>
      </div>
    </div>
  );
}

function ExposeModal({ preview, uploaded, onClose }: { preview: ExposePreview; uploaded?: ExposeInfo; onClose: () => void }) {
  const name = preview.card.draft.name || preview.card.row?.property_name || "Immobilie";
  const address = [
    preview.card.draft.street && `${preview.card.draft.street} ${preview.card.draft.houseNumber}`.trim(),
    [preview.card.draft.postalCode, preview.card.draft.city].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-slate-950/45 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="my-6 w-full max-w-4xl rounded-[24px] bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Immobilien-Exposé</p>
            <h2 className="text-2xl font-black text-slate-950">{name}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => window.print()} className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800">Als PDF speichern / drucken</button>
            {uploaded ? <a href={uploaded.dataUrl} download={uploaded.fileName} className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-black text-slate-700 no-underline">Hochgeladenes PDF</a> : null}
            <button type="button" onClick={onClose} className="min-h-10 rounded-xl bg-slate-950 px-4 text-sm font-black text-white">Schließen</button>
          </div>
        </div>

        <div className="grid gap-5 py-5">
          <section className="rounded-[18px] border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-bold text-slate-500">{address || "Adresse offen"}</p>
            <h1 className="mt-2 text-3xl font-black text-slate-950">{name}</h1>
            <p className="mt-3 text-sm font-bold leading-6 text-slate-600">
              Exposé aus den zentralen Immobilien-, Finanz- und Mietdaten. Diese Vorschau ist bewusst prüfbar aufgebaut und kann als PDF gespeichert werden.
            </p>
          </section>

          <section className="grid gap-3 md:grid-cols-3">
            <SourceKpi label="Restschuld" value={formatCurrencyExact(preview.finance.lastBalance)} />
            <SourceKpi label="Cashflow" value={formatCurrencyExact(preview.finance.netCashflow)} tone={preview.finance.netCashflow >= 0 ? "green" : "red"} />
            <SourceKpi label="Netto-Rendite" value={formatPercent(preview.finance.netYield)} />
            <SourceKpi label="Kaltmiete" value={preview.extra.coldRent ? formatCurrencyExact(preview.extra.coldRent) : "–"} />
            <SourceKpi label="Nebenkosten" value={preview.extra.operatingCosts ? formatCurrencyExact(preview.extra.operatingCosts) : "–"} />
            <SourceKpi label="Gesamtmiete" value={preview.extra.totalRent ? formatCurrencyExact(preview.extra.totalRent) : "–"} />
          </section>

          <section className="rounded-[18px] border border-slate-200 bg-white p-5">
            <h3 className="text-lg font-black text-slate-950">Mieter / Kontakt</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <SourceKpi label="Name" value={preview.extra.firstName || "–"} />
              <SourceKpi label="Nachname" value={preview.extra.lastName || "–"} />
              <SourceKpi label="Telefon" value={preview.extra.phone || "–"} />
              <SourceKpi label="E-Mail" value={preview.extra.email || "–"} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function ImmobilienVermoegen() {
  const params = useParams<{ propertyId?: string }>();
  const appData = useAppData();
  const { user } = useAuth();
  const isAdmin = isAdminEmail(user?.email);
  const year = currentYear();
  const backendFinance = useBackendFinanceMaster(year);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const capexSyncSignatureRef = useRef("");
  const [legacyDrafts] = useState<Record<string, WealthDraft>>(loadStoredDrafts);
  const wealthProfilesLoadedRef = useRef(false);
  const [storedDrafts, setStoredDrafts] = useState<Record<string, WealthDraft>>(legacyDrafts);
  const [saveStatus, setSaveStatus] = useState<Record<string, string>>({});
  const [extraInfo, setExtraInfo] = useState<Record<string, PropertyExtraInfo>>({});
  const [dirtyExtras, setDirtyExtras] = useState<Record<string, boolean>>({});
  const [extraStatus, setExtraStatus] = useState<Record<string, string>>({});
  const [exposes, setExposes] = useState<Record<string, ExposeInfo>>(() => loadExposes());
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);
  const [exposePreview, setExposePreview] = useState<ExposePreview | null>(null);
  const [selectedImage, setSelectedImage] = useState<PortfolioGalleryItem | null>(null);
  const [vacancies, setVacancies] = useState<UnitVacancy[]>([]);
  const [tenantProfiles, setTenantProfiles] = useState<TenantProfileWithContracts[]>([]);

  const cards = useMemo(() => buildCards(appData.portfolioRows, storedDrafts), [appData.portfolioRows, storedDrafts]);
  const modernizationSummaries = useMemo<ModernizationSummaryByCardId>(() => {
    return cards.reduce<ModernizationSummaryByCardId>((acc, card) => {
      const propertyId = card.row?.property_id ?? card.id;
      const propertyEntries = card.row
        ? appData.getExpenseEntriesForProperty(propertyId)
        : appData.entries.filter((entry) => {
            const entryLabel = getEntryLabel(entry);
            const cardLabel = normalize(`${card.id} ${card.draft.name} ${card.row?.property_name ?? ""}`);
            return cardLabel && entryLabel.includes(cardLabel);
          });
      acc[card.id] = buildRepairCapexSummary(propertyEntries);
      return acc;
    }, {});
  }, [appData, cards]);

  const cardsWithAutoModernizations = useMemo<WealthCard[]>(() => {
    return cards.map((card) => ({
      ...card,
      draft: mergeModernizationDraft(card.draft, modernizationSummaries[card.id]),
    }));
  }, [cards, modernizationSummaries]);

  const selectedCard = useMemo(() => {
    if (!params.propertyId) return undefined;
    const routeId = decodeURIComponent(params.propertyId);
    return cardsWithAutoModernizations.find((card) => {
      const row = card.row;
      return card.id === routeId || row?.property_id === routeId || row?.portfolio_property_id === routeId;
    });
  }, [cardsWithAutoModernizations, params.propertyId]);

  useEffect(() => {
    if (!appData.portfolioRows.length || wealthProfilesLoadedRef.current) return;
    wealthProfilesLoadedRef.current = true;
    let cancelled = false;

    async function loadWealthProfiles() {
      const propertyIds = appData.portfolioRows.map((row) => row.property_id).filter(Boolean);
      const remote = await fetchPropertyWealthProfiles(propertyIds);
      const legacy = legacyDrafts;
      const next: Record<string, WealthDraft> = { ...legacy, ...remote };

      if (isAdmin) {
        for (const row of appData.portfolioRows) {
          if (remote[row.property_id] && Object.keys(remote[row.property_id]).length > 0) continue;
          const templateKey = findTemplate(row.property_name)?.key;
          const legacyProfile = legacy[row.property_id]
            ?? (row.portfolio_property_id ? legacy[row.portfolio_property_id] : undefined)
            ?? (templateKey ? legacy[templateKey] : undefined);
          if (!legacyProfile || Object.keys(withoutEmptyValues(legacyProfile)).length === 0) continue;
          const result = await savePropertyWealthProfile(row.property_id, legacyProfile);
          if (result.ok) next[row.property_id] = legacyProfile;
        }
      }

      if (cancelled) return;
      setStoredDrafts(next);
      if (isAdmin) {
        try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* Legacy-Speicher darf blockiert sein. */ }
      }
    }

    void loadWealthProfiles();
    return () => {
      cancelled = true;
    };
  }, [appData.portfolioRows, isAdmin, legacyDrafts]);

  useEffect(() => {
    let cancelled = false;
    async function loadRemoteExposes() {
      try {
        const links = await loadExposeLinks();
        if (cancelled) return;
        setExposes((legacy) => {
          const next = { ...legacy };
          for (const link of links) {
            const value = { fileName: link.fileName, dataUrl: link.signedUrl, uploadedAt: "" };
            next[link.portfolioPropertyId] = value;
            if (link.corePropertyId) next[link.corePropertyId] = value;
          }
          return next;
        });
      } catch (error) {
        console.warn("Exposés konnten nicht zentral geladen werden", error);
      }
    }
    void loadRemoteExposes();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const syncItems = cards
      .flatMap((card) => {
        const propertyId = card.row?.property_id;
        const summary = modernizationSummaries[card.id];
        if (!propertyId || !summary?.entries.length) return [];

        const amountByYear = new Map<number, number>();
        for (const entry of summary.entries) {
          const yearForEntry = getEntryYear(entry as FinanceEntry);
          if (!yearForEntry) continue;
          amountByYear.set(yearForEntry, (amountByYear.get(yearForEntry) ?? 0) + Math.abs(toNumber(entry.amount)));
        }

        return Array.from(amountByYear.entries()).map(([capexYear, amount]) => ({
          propertyId,
          year: capexYear,
          amount: Number(amount.toFixed(2)),
          note: summary.lines.filter((line) => line.startsWith(String(capexYear))).join("\n"),
        }));
      })
      .filter((item) => item.amount > 0);

    const signature = JSON.stringify(syncItems);
    if (!signature || signature === "[]") return;
    if (capexSyncSignatureRef.current === signature) return;
    capexSyncSignatureRef.current = signature;

    void Promise.all(
      syncItems.map((item) =>
        yearlyCapexService
          .upsertByPropertyIdAndYear({
            propertyId: item.propertyId,
            year: item.year,
            amount: item.amount,
            category: "Capex",
            note: item.note || "Automatisch aus Reparatur-Buchungen übernommen.",
          })
          .catch((error) => {
            console.warn("Repair-Capex-Sync konnte nicht gespeichert werden", error);
          }),
      ),
    );
  }, [cards, isAdmin, modernizationSummaries]);

  useEffect(() => {
    let cancelled = false;
    async function loadExtras() {
      const remote = await loadAllPropertyExtras();
      if (!cancelled) setExtraInfo(remote);
    }
    void loadExtras();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadTenantRows() {
      try {
        const rows = await listTenantProfilesWithContracts();
        if (!cancelled) setTenantProfiles(rows);
      } catch (error) {
        console.warn("Mietvertraege fuer Immobilienvermoegen konnten nicht geladen werden", error);
        if (!cancelled) setTenantProfiles([]);
      }
    }

    void loadTenantRows();
    window.addEventListener("koenen:tenant-changed", loadTenantRows);
    return () => {
      cancelled = true;
      window.removeEventListener("koenen:tenant-changed", loadTenantRows);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadVacancyRows() {
      try {
        const rows = await listVacancies();
        if (!cancelled) setVacancies(rows);
      } catch (error) {
        console.warn("Leerstandsstatus fuer Immobilienvermoegen konnte nicht geladen werden", error);
        if (!cancelled) setVacancies([]);
      }
    }

    void loadVacancyRows();
    window.addEventListener("koenen:vacancy-changed", loadVacancyRows);
    return () => {
      cancelled = true;
      window.removeEventListener("koenen:vacancy-changed", loadVacancyRows);
    };
  }, []);

  const findSnapshotForCard = useCallback((card: WealthCard): MasterFinanceSnapshot | undefined => {
    const row = card.row;
    const cardName = normalize(card.draft.name || row?.property_name || "");
    return backendFinance.snapshots.find((snapshot) => {
      const snapshotName = normalize(snapshot.propertyName);
      return (
        (row?.property_id && snapshot.propertyId === row.property_id) ||
        (row?.portfolio_property_id && snapshot.portfolioPropertyId === row.portfolio_property_id) ||
        (snapshotName && cardName && (cardName.includes(snapshotName) || snapshotName.includes(cardName) || cardName.includes(snapshotName.split(" ")[0])))
      );
    });
  }, [backendFinance.snapshots]);

  const getFinanceForCard = useCallback((card: WealthCard): WealthFinance => {
    const row = card.row;
    const propertyId = row?.property_id ?? card.id;
    const extra = extraInfo[propertyId] ?? emptyPropertyExtra;
    const snapshot = findSnapshotForCard(card);
    const summary = row ? appData.getYearlyFinanceSummary(row.property_id, year) : null;

    const income = snapshot?.income ?? toNumber(summary?.einnahmen);
    const expenses = snapshot?.expenses ?? toNumber(summary?.ausgaben);
    const rentIncome = snapshot?.rentIncome ?? toNumber(summary?.mieteingaenge);
    const nebenkosten = row ? appData.getNebenkostenExpenses(row.property_id, year).reduce((sum, entry) => sum + entry.amount, 0) : 0;
    const lastBalance = row?.last_balance ?? 0;
    const value = parseAmount(extra.marketValue) || parseAmount(card.draft.marketValue || card.draft.estimatedMarketValue) || lastBalance || 0;
    const netCashflow = income - expenses;

    return {
      income,
      expenses,
      rentIncome,
      netCashflow,
      nebenkosten,
      value,
      lastBalance,
      repaidPercent: row?.repaid_percent ?? 0,
      grossYield: safeRatio(income, value),
      netYield: safeRatio(netCashflow, value),
    };
  }, [appData, extraInfo, findSnapshotForCard, year]);

  const wealthTotals = useMemo(() => {
    return cards.reduce(
      (acc, card) => {
        const finance = getFinanceForCard(card);
        return {
          income: acc.income + finance.income,
          expenses: acc.expenses + finance.expenses,
          rentIncome: acc.rentIncome + finance.rentIncome,
          netCashflow: acc.netCashflow + finance.netCashflow,
          nebenkosten: acc.nebenkosten + finance.nebenkosten,
          value: acc.value + finance.value,
          lastBalance: acc.lastBalance + finance.lastBalance,
          repaidPercent: acc.repaidPercent + finance.repaidPercent,
          grossYield: 0,
          netYield: 0,
        };
      },
      { income: 0, expenses: 0, rentIncome: 0, netCashflow: 0, nebenkosten: 0, value: 0, lastBalance: 0, repaidPercent: 0, grossYield: 0, netYield: 0 },
    );
  }, [cards, getFinanceForCard]);

  const totals: WealthFinance = useMemo(() => ({
    ...wealthTotals,
    repaidPercent: cards.length ? wealthTotals.repaidPercent / cards.length : 0,
    grossYield: safeRatio(wealthTotals.income, wealthTotals.value),
    netYield: safeRatio(wealthTotals.netCashflow, wealthTotals.value),
  }), [cards.length, wealthTotals]);

  function updateDraft(id: string, key: string, value: string) {
    const card = cards.find((candidate) => candidate.id === id);
    // Das zentrale Supabase-Profil der Kernobjekt-ID hat beim Zusammenführen
    // Vorrang. Änderungen müssen deshalb direkt unter derselben ID landen,
    // sonst würde der zuvor gespeicherte Wert beim nächsten Rendern gewinnen.
    const storageId = card?.row?.property_id ?? id;
    setStoredDrafts((current) => {
      const next = {
        ...current,
        [storageId]: {
          ...(card?.draft ?? EMPTY_DRAFT),
          ...(current[storageId] ?? {}),
          [key]: value,
        },
      };
      return next;
    });
    setSaveStatus((current) => ({ ...current, [id]: "Ungespeicherte Änderung." }));
  }

  async function saveDraft(id: string) {
    const card = cards.find((candidate) => candidate.id === id);
    const propertyId = card?.row?.property_id;
    if (!propertyId) {
      setSaveStatus((current) => ({ ...current, [id]: "Speichern nicht möglich: Objekt-ID fehlt." }));
      return;
    }
    setSaveStatus((current) => ({ ...current, [id]: "Wird in Supabase gespeichert…" }));
    const result = await savePropertyWealthProfile(propertyId, card.draft);
    setSaveStatus((current) => ({ ...current, [id]: result.message }));
    if (result.ok) window.dispatchEvent(new Event(WEALTH_UPDATED_EVENT));
  }

  function updateExtra(propertyId: string, field: keyof PropertyExtraInfo, value: string) {
    setExtraInfo((prev) => ({ ...prev, [propertyId]: { ...(prev[propertyId] ?? emptyPropertyExtra), [field]: value, property_id: propertyId } }));
    setDirtyExtras((prev) => ({ ...prev, [propertyId]: true }));
    setExtraStatus((prev) => ({ ...prev, [propertyId]: "Ungespeicherte Änderung." }));
  }

  async function saveExtra(propertyId: string) {
    setExtraStatus((prev) => ({ ...prev, [propertyId]: "Speichert…" }));
    const result = await savePropertyExtra(propertyId, extraInfo[propertyId] ?? emptyPropertyExtra);
    setExtraStatus((prev) => ({ ...prev, [propertyId]: result.message }));
    setDirtyExtras((prev) => ({ ...prev, [propertyId]: !result.ok }));
  }

  function openUpload(propertyId: string) {
    setUploadTarget(propertyId);
    window.setTimeout(() => fileInputRef.current?.click(), 0);
  }

  async function handleExposeUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const propertyId = uploadTarget;
    event.target.value = "";
    if (!file || !propertyId) return;
    const card = cards.find((candidate) => candidate.row?.portfolio_property_id === propertyId || candidate.row?.property_id === propertyId);
    const statusKey = card?.id ?? propertyId;
    setSaveStatus((current) => ({ ...current, [statusKey]: "Exposé wird in Supabase hochgeladen…" }));
    try {
      const uploaded = await uploadExpose(propertyId, file);
      const value = { fileName: file.name, dataUrl: uploaded.signedUrl, uploadedAt: new Date().toISOString() };
      setExposes((current) => ({
        ...current,
        [propertyId]: value,
        ...(card?.row?.property_id ? { [card.row.property_id]: value } : {}),
      }));
      setSaveStatus((current) => ({ ...current, [statusKey]: "Exposé in Supabase gespeichert." }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unbekannter Fehler";
      setSaveStatus((current) => ({ ...current, [statusKey]: `Exposé-Upload fehlgeschlagen: ${message}` }));
    }
  }

  function previewExpose(card: WealthCard, extra: PropertyExtraInfo, finance: WealthFinance) {
    setExposePreview({ card, extra, finance });
  }

  function generateExpose(card: WealthCard, extra: PropertyExtraInfo, finance: WealthFinance) {
    setExposePreview({ card, extra, finance });
    window.setTimeout(() => window.print(), 120);
  }

  if (params.propertyId) {
    if (!selectedCard) {
      return <EmptyState title="Immobilie nicht gefunden" description="Die ausgewählte Vermögens-Detailmaske konnte nicht geladen werden." />;
    }
    const propertyId = selectedCard.row?.property_id ?? selectedCard.id;
    const extra = extraInfo[propertyId] ?? emptyPropertyExtra;
    const finance = getFinanceForCard(selectedCard);
    const image = getPropertyImage(selectedCard.draft.name || selectedCard.row?.property_name || "");
    const parkingUnits = isRosensteinCard(selectedCard) ? buildRosensteinParkingUnits(selectedCard, vacancies, tenantProfiles, appData.objects, appData.entries, year) : [];
    return (
      <>
        <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleExposeUpload} />
        <DetailPage
          card={selectedCard}
          extra={extra}
          finance={finance}
          entries={appData.entries}
          year={year}
          image={image}
          parkingUnits={parkingUnits}
          uploadedExpose={exposes[propertyId]}
          onUpdate={updateDraft}
          onSave={saveDraft}
          onExtraChange={updateExtra}
          onExtraSave={saveExtra}
          onExposePreview={previewExpose}
          onExposeGenerate={generateExpose}
          onExposeUpload={(corePropertyId) => openUpload(selectedCard.row?.portfolio_property_id ?? corePropertyId)}
          onImageOpen={setSelectedImage}
          extraDirty={dirtyExtras[propertyId]}
          extraStatus={extraStatus[propertyId]}
          saveStatus={saveStatus[selectedCard.id]}
          isAdmin={isAdmin}
        />
        {exposePreview ? <ExposeModal preview={exposePreview} uploaded={exposes[exposePreview.card.row?.property_id ?? exposePreview.card.id]} onClose={() => setExposePreview(null)} /> : null}
        {selectedImage ? <PropertyImageModal image={selectedImage} onClose={() => setSelectedImage(null)} /> : null}
      </>
    );
  }

  return (
    <div className="space-y-5">
      <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleExposeUpload} />
      <PageHeader
        eyebrow="Immobilienvermögen"
        title="Immobilienvermögen"
        description="Dynamische Vermögensübersicht als zentrale Immobilienquelle für Bestand, Vermögensnachweis, Investment-Bericht, Fotos, Exposé, Mieter- und Finanzdaten."
        meta={[
          { label: "Restschuld-Hauptquelle", value: "Darlehen · property_loan_ledger" },
          { label: "Objekte", value: cards.length },
        ]}
      >
        {isAdmin ? (
          <Link
            to="/immobilien/immobilie-anlegen"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#255f6f] px-5 text-sm font-black text-white no-underline shadow-sm"
          >
            <PlusCircle size={18} /> Immobilie hinzufügen
          </Link>
        ) : (
          <span className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-100 px-5 text-sm font-black text-slate-500 shadow-sm">
            <PlusCircle size={18} /> Nur Admin: Immobilie hinzufügen
          </span>
        )}
      </PageHeader>
      {selectedImage ? <PropertyImageModal image={selectedImage} onClose={() => setSelectedImage(null)} /> : null}

      <FinanceOverview totals={totals} year={year} objectValue={totals.value} objectCount={cards.length} />

      <section className="grid gap-4 md:grid-cols-2">
        {cards.map((card) => {
          const finance = getFinanceForCard(card);
          const isRosenstein = isRosensteinCard(card);
          const rosensteinUnits = isRosenstein ? buildRosensteinParkingUnits(card, vacancies, tenantProfiles, appData.objects, appData.entries, year) : [];
          const rentedCount = rosensteinUnits.filter((unit) => unit.status === "rented").length;
          const vacantUnits = rosensteinUnits.filter((unit) => unit.status === "vacant");
          const monthlyTarget = rosensteinUnits
            .filter((unit) => unit.status === "rented")
            .reduce((sum, unit) => sum + unit.monthlyRent, 0);
          const image = getPropertyImage(card.draft.name || card.row?.property_name || "");
          return (
            <article
              key={card.id}
              className="group grid min-h-[178px] overflow-hidden rounded-[18px] border border-slate-200 bg-white text-slate-950 no-underline shadow-[0_12px_28px_rgba(51,65,85,0.07)] transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-[0_18px_42px_rgba(51,65,85,0.10)] sm:grid-cols-[116px_1fr]"
            >
              <PropertyImageButton
                image={image}
                label={card.draft.name || card.row?.property_name || "Immobilie"}
                className="h-full min-h-[178px] rounded-none border-0 shadow-none"
                onOpen={setSelectedImage}
              />
              <div className="grid gap-4 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-lg font-black text-slate-950">{card.draft.name || "Unbenannte Immobilie"}</h2>
                    <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
                      {[card.draft.street && `${card.draft.street} ${card.draft.houseNumber}`.trim(), [card.draft.postalCode, card.draft.city].filter(Boolean).join(" ")]
                        .filter(Boolean)
                        .join(", ") || "Adresse offen"}
                    </p>
                    {isRosenstein ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-blue-700">3 TG-Stellplätze</span>
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-700">{rentedCount} vermietet</span>
                        {vacantUnits.length ? (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-600">
                            {vacantUnits.map((unit) => unit.shortLabel).join(", ")} leer
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-600">
                    Detail
                  </span>
                </div>

                <div className="grid gap-2 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-bold text-slate-500">Marktwert</span>
                    <b>{formatCurrencyExact(finance.value)}</b>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-bold text-slate-500">Restschuld · Darlehen</span>
                    <b>{formatCurrencyExact(finance.lastBalance)}</b>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-bold text-slate-500">{isRosenstein ? "Soll TG mtl." : "mtl. Rate"}</span>
                    <b>{isRosenstein ? formatCurrencyExact(monthlyTarget) : formatCurrency(card.draft.currentMonthlyRate)}</b>
                  </div>
                </div>

                <Link to={`/immobilienvermoegen/${encodeURIComponent(card.id)}`} className="flex items-center gap-2 text-sm font-black text-[#255f6f] no-underline">
                  <ShieldCheck size={17} /> Detailmaske öffnen
                </Link>
              </div>
            </article>
          );
        })}
        {isAdmin ? (
          <Link
            to="/immobilien/immobilie-anlegen"
            className="flex min-h-[178px] items-center justify-center gap-2 rounded-[18px] border-2 border-dashed border-slate-300 bg-white/70 p-5 text-sm font-black text-orange-700 no-underline shadow-sm transition hover:border-orange-300 hover:bg-orange-50"
          >
            <PlusCircle size={18} /> Immobilie hinzufügen
          </Link>
        ) : null}
      </section>
    </div>
  );
}
