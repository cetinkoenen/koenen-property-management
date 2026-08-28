import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Banknote,
  Building2,
  Calculator,
  ChevronDown,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  FileArchive,
  FileText,
  Image,
  Loader2,
  Mail,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
} from "lucide-react";

import { PageHeader, SectionPanel } from "@/components/ui/professional";
import logo from "@/assets/koenen-brand-logo.webp";
import { useAuth } from "@/auth/AuthProvider";
import { isAdminEmail } from "@/auth/accessControl";
import { useAppData, type PortfolioLoanRow } from "@/state/AppDataContext";
import { runInvestmentAiAnalysis, type InvestmentAiFile } from "@/services/investmentAiService";
import { fetchPropertyWealthProfiles } from "@/services/propertyExtraService";
import {
  archiveInvestmentRequest,
  listInvestmentRequests,
  saveInvestmentRequest,
  type InvestmentRequestFileMetadata,
  type InvestmentRequestPayload,
  type InvestmentRequestRow,
  type InvestmentRequestStatus,
} from "@/services/investmentRequestService";

type UploadedFile = InvestmentAiFile;

type AiStatus = "idle" | "running" | "ready" | "blocked";

type AiChapterStatus = {
  chapter: string;
  status: "Bereit" | "Prüfen" | "Offen";
  note: string;
};

type AiReport = {
  generatedAt: string;
  statusLabel: string;
  summary: string;
  risks: string[];
  nextSteps: string[];
  chapterStatus: AiChapterStatus[];
  bankFazit: string;
  profile?: Partial<InvestmentProfile>;
  financialScenarios?: FinancingScenario[];
  riskMatrix?: { field: string; rating: string; finding: string }[];
  openQuestions?: string[];
  documentFindings?: { document: string; status: string; finding: string }[];
};

type InvestmentProfile = {
  objectType: string;
  address: string;
  purchasePrice: number | null;
  buyerProvision: number | null;
  acquisitionCosts: number | null;
  livingArea: number | null;
  rooms: number | null;
  monthlyRent: number | null;
  monthlyHousegeld: number | null;
  annualRent: number | null;
  grossYieldPurchasePrice: number | null;
  grossYieldAcquisitionCosts: number | null;
  purchaseFactor: number | null;
  rentPerSqm: number | null;
  monthlySurplusBeforeFinancing: number | null;
  energyValue: string;
  energyClass: string;
  heating: string;
  investorScore: string;
  recommendation: string;
  bankKeyMessage: string;
  housegeldNote: string;
};

type FinancingScenario = {
  label: string;
  loanAmount: number;
  monthlyRate: number;
  cashflowAfterRate: number | null;
};

type DocumentCoverage = "direct" | "package" | "missing";

type RequiredDocument = {
  label: string;
  examples: string;
  keywords: string[];
};

type InvestmentPerson = {
  id: string;
  name: string;
  income: string;
  expenses: string;
  assets: string;
  liabilities: string;
};

type InvestmentChecklistItem = {
  id: number;
  category: string;
  text: string;
  checked: boolean;
};

type InvestmentSection = "financing" | "wealth" | "persons" | "checklist" | "export";

type WealthDraft = Record<string, string>;

type InvestmentWealthCard = {
  id: string;
  name: string;
  address: string;
  marketValue: number;
  remainingDebt: number;
  monthlyRate: number;
  isRosenstein: boolean;
  sourceLabel: string;
};

const requiredDocuments: RequiredDocument[] = [
  {
    label: "Exposé / Objektbeschreibung",
    examples: "Adresse, Wohnfläche, Kaufpreis, Miete, Bilder",
    keywords: ["expose", "exposé", "objekt", "verkauf", "angebot", "investment", "analyse"],
  },
  {
    label: "Grundrisse / Bauzeichnungen",
    examples: "Wohnungsgrundriss, Aufteilungsplan, Schnitt, Lageplan",
    keywords: ["grundriss", "zeichnung", "plan", "lageplan", "aufteil"],
  },
  {
    label: "Teilungserklärung / WEG-Unterlagen",
    examples: "Teilungserklärung, Gemeinschaftsordnung, Protokolle",
    keywords: ["teilung", "weg", "protokoll", "gemeinschaft"],
  },
  {
    label: "Energieausweis",
    examples: "Bedarfsausweis oder Verbrauchsausweis",
    keywords: ["energie", "verbrauchsausweis", "bedarfsausweis"],
  },
  {
    label: "Mietvertrag / Mieterliste",
    examples: "Mietvertrag, Miethöhe, Laufzeit, Nebenkosten",
    keywords: ["miet", "vertrag", "mieter"],
  },
  {
    label: "Wirtschaftsplan / Hausgeld",
    examples: "Hausgeld, Rücklage, umlagefähige Kosten",
    keywords: ["wirtschaftsplan", "hausgeld", "rücklage", "ruecklage"],
  },
  {
    label: "Finanzierungsdaten",
    examples: "Eigenkapital, Zins, Tilgung, Kaufnebenkosten",
    keywords: ["finanz", "zins", "tilgung", "darlehen", "bank", "investment", "analyse"],
  },
];

const reportChapters = [
  "Executive Summary und Objektübersicht",
  "Standort- und Marktanalyse",
  "Objektbilder, Grundrisse und Bauzeichnungen",
  "Dokumentenprüfung: Teilungserklärung, Energieausweis, Mietvertrag",
  "Wirtschaftsplan und Hausgeldanalyse",
  "Rendite-, Cashflow- und Finanzierungsanalyse",
  "WEG-Analyse und Risikoanalyse",
  "Kaufempfehlung und Bankfazit",
];

const checklistTemplates: InvestmentChecklistItem[] = [
  { id: 1, category: "Objektunterlagen", text: "Teilungserklärung inklusive aller Nachträge eingesehen", checked: false },
  { id: 2, category: "Objektunterlagen", text: "Wirtschaftsplan / Hausgeldunterlagen geprüft", checked: false },
  { id: 3, category: "Objektunterlagen", text: "Grundsteuerbescheid und laufende Kosten abgeglichen", checked: false },
  { id: 4, category: "Bonität", text: "Letzte 3 Gehaltsnachweise bereitgelegt", checked: false },
  { id: 5, category: "Bonität", text: "Aktuelle Schufa-Auskunft eingeholt", checked: false },
  { id: 6, category: "Sonderprüfung", text: "WEG-Protokolle, Sanierungen und Sonderumlagenrisiken analysiert", checked: false },
];

const initialPersons: InvestmentPerson[] = [
  { id: "cetin", name: "Cetin Könen", income: "", expenses: "", assets: "", liabilities: "" },
  { id: "nihal", name: "Nihal Könen", income: "", expenses: "", assets: "", liabilities: "" },
];

const investmentSections: { id: InvestmentSection; label: string }[] = [
  { id: "financing", label: "Finanzierungsanalyse" },
  { id: "wealth", label: "Immobilienvermögen" },
  { id: "persons", label: "Personenprofile" },
  { id: "checklist", label: "Checkliste" },
  { id: "export", label: "Export" },
];

const WEALTH_UPDATED_EVENT = "koenen:immobilienvermoegen:updated";

const wealthDefaults: Array<{
  id: string;
  match: string[];
  name: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  marketValue: number;
  remainingDebt: number;
  monthlyRate: number;
  isRosenstein?: boolean;
}> = [
  { id: "lilienthaler-str-54", match: ["lilienthaler"], name: "Lilienthaler Str. 54", street: "Lilienthaler Str.", houseNumber: "54", postalCode: "28215", city: "Bremen", marketValue: 530000, remainingDebt: 41667, monthlyRate: 1100 },
  { id: "elsasser-str-52", match: ["elsasser", "elsäßer"], name: "Elsasser Str. 52", street: "Elsasser Str.", houseNumber: "52", postalCode: "28211", city: "Bremen", marketValue: 160000, remainingDebt: 78168, monthlyRate: 300 },
  { id: "colmarer-str-45", match: ["colmarer"], name: "Colmarer Str. 45", street: "Colmarer Str.", houseNumber: "45", postalCode: "28211", city: "Bremen", marketValue: 145000, remainingDebt: 105616, monthlyRate: 411 },
  { id: "fuerther-str-74", match: ["fürther", "fuerther"], name: "Fürther Str. 74", street: "Fürther Str.", houseNumber: "74", postalCode: "28215", city: "Bremen", marketValue: 140000, remainingDebt: 125063, monthlyRate: 439 },
  { id: "hohenloher-str-78", match: ["hohenloher"], name: "Hohenloher Str. 78", street: "Hohenloher Str.", houseNumber: "78", postalCode: "74243", city: "Brettach", marketValue: 530000, remainingDebt: 400000, monthlyRate: 1690 },
  { id: "rosensteinstr-25", match: ["rosenstein"], name: "Rosensteinstr. 25", street: "Rosensteinstr.", houseNumber: "25", postalCode: "", city: "", marketValue: 0, remainingDebt: 0, monthlyRate: 170, isRosenstein: true },
];

const formatFileSize = (bytes: number) => {
  if (!bytes) return "0 KB";
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const formatEuro = (value: number | null) => {
  if (value === null || Number.isNaN(value)) return "offen";
  return `${Math.round(value).toLocaleString("de-DE")} EUR`;
};

const formatEuroMonthly = (value: number | null) => {
  if (value === null || Number.isNaN(value)) return "offen";
  return `${Math.round(value).toLocaleString("de-DE")} EUR/Monat`;
};

const formatSignedEuroMonthly = (value: number | null) => {
  if (value === null || Number.isNaN(value)) return "offen";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${Math.round(value).toLocaleString("de-DE")} EUR/Monat`;
};

const formatPercent = (value: number | null) => {
  if (value === null || Number.isNaN(value)) return "offen";
  return `${value.toFixed(2).replace(".", ",")} %`;
};

const parseGermanNumber = (value: string) => {
  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const pickNumber = (value: string, fallback: number | null) => parseGermanNumber(value) ?? fallback;

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replaceAll("ß", "ss")
    .replace(/[ä]/g, "a")
    .replace(/[ö]/g, "o")
    .replace(/[ü]/g, "u")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseMoney(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrencyExact(value: number | null | undefined) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value ?? 0);
}

function findWealthRow(rows: PortfolioLoanRow[], match: string[], usedIds: Set<string>) {
  return rows.find((row) => {
    if (usedIds.has(row.property_id)) return false;
    const rowName = normalizeText(row.property_name);
    return match.some((term) => rowName.includes(normalizeText(term)));
  });
}

function buildInvestmentWealthCards(rows: PortfolioLoanRow[], storedDrafts: Record<string, WealthDraft>): InvestmentWealthCard[] {
  const usedIds = new Set<string>();
  return wealthDefaults.map((item) => {
    const row = findWealthRow(rows, item.match, usedIds);
    if (row) usedIds.add(row.property_id);
    const draft = {
      ...(storedDrafts[item.id] ?? {}),
      ...(row?.portfolio_property_id ? storedDrafts[row.portfolio_property_id] : undefined),
      ...(row?.property_id ? storedDrafts[row.property_id] : undefined),
    };
    const streetLine = [draft.street ?? item.street, draft.houseNumber ?? item.houseNumber].filter(Boolean).join(" ").trim();
    const cityLine = [draft.postalCode ?? item.postalCode, draft.city ?? item.city].filter(Boolean).join(" ").trim();

    return {
      id: item.id,
      name: draft.name || item.name || row?.property_name || "Unbenannte Immobilie",
      address: [streetLine, cityLine].filter(Boolean).join(", ") || "Adresse offen",
      marketValue: parseMoney(draft.marketValue || draft.estimatedMarketValue) || item.marketValue,
      remainingDebt: parseMoney(draft.remainingDebt) || (row?.last_balance ?? item.remainingDebt),
      monthlyRate: parseMoney(draft.currentMonthlyRate) || item.monthlyRate,
      isRosenstein: Boolean(item.isRosenstein),
      sourceLabel: "Quelle: Immobilien Vermögen Seite",
    };
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function slugifyFileName(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "investment-bericht"
  );
}

function matchesDocument(file: UploadedFile, document: RequiredDocument) {
  const text = `${file.name} ${file.type}`.toLowerCase();
  return document.keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function isZipPackage(file: UploadedFile) {
  const text = `${file.name} ${file.type}`.toLowerCase();
  return text.endsWith(".zip") || text.includes("zip") || text.includes("compressed");
}

function coverageWeight(coverage: DocumentCoverage) {
  if (coverage === "direct") return 1;
  if (coverage === "package") return 0.6;
  return 0;
}

function buildInvestmentProfile(input: {
  objectName: string;
  purchasePrice: string;
  buyerProvision: string;
  livingArea: string;
  rooms: string;
  targetRent: string;
  monthlyHousegeld: string;
  interestRate: string;
  amortizationRate: string;
}) {
  const purchasePriceValue = pickNumber(input.purchasePrice, null);
  const provisionValue = pickNumber(input.buyerProvision, null);
  const livingAreaValue = pickNumber(input.livingArea, null);
  const roomsValue = pickNumber(input.rooms, null);
  const rentValue = pickNumber(input.targetRent, null);
  const housegeldValue = pickNumber(input.monthlyHousegeld, null);

  const estimatedClosingCosts = purchasePriceValue === null ? null : purchasePriceValue * 0.07;
  const acquisitionCosts =
    purchasePriceValue === null
      ? null
      : purchasePriceValue + (provisionValue ?? 0) + (estimatedClosingCosts ?? 0);
  const annualRent = rentValue === null ? null : rentValue * 12;
  const grossYieldPurchasePrice =
    annualRent !== null && purchasePriceValue ? (annualRent / purchasePriceValue) * 100 : null;
  const grossYieldAcquisitionCosts =
    annualRent !== null && acquisitionCosts ? (annualRent / acquisitionCosts) * 100 : null;
  const purchaseFactor = annualRent !== null && annualRent > 0 && purchasePriceValue ? purchasePriceValue / annualRent : null;
  const rentPerSqm = rentValue !== null && livingAreaValue ? rentValue / livingAreaValue : null;
  const nonRecoverableMonthly = housegeldValue === null ? null : housegeldValue * 0.35;
  const reserveMonthly = housegeldValue === null ? null : housegeldValue * 0.18;
  const monthlySurplusBeforeFinancing =
    rentValue === null || nonRecoverableMonthly === null || reserveMonthly === null
      ? null
      : rentValue - nonRecoverableMonthly - reserveMonthly;

  return {
    objectType: "Immobilieninvestment",
    address: input.objectName || "Neue Investition",
    purchasePrice: purchasePriceValue,
    buyerProvision: provisionValue,
    acquisitionCosts,
    livingArea: livingAreaValue,
    rooms: roomsValue,
    monthlyRent: rentValue,
    monthlyHousegeld: housegeldValue,
    annualRent,
    grossYieldPurchasePrice,
    grossYieldAcquisitionCosts,
    purchaseFactor,
    rentPerSqm,
    monthlySurplusBeforeFinancing,
    energyValue: "offen",
    energyClass: "offen",
    heating: "offen",
    investorScore: readinessLabel(grossYieldPurchasePrice, monthlySurplusBeforeFinancing),
    recommendation:
      "Vorläufig prüfen. Verbindliche Empfehlung erst nach vollständiger Dokumenten-, Technik-, WEG- und Finanzierungsprüfung.",
    bankKeyMessage:
      "Die Bank sollte Unterlagen, Beleihbarkeit, nachhaltige Miete, Hausgeld, Rücklagenstand, technische Risiken und Kapitaldienstfähigkeit konservativ prüfen.",
    housegeldNote:
      "Hausgeld, nicht umlagefähige Kosten, Rücklage und Zahlungsstand müssen anhand Wirtschaftsplan und Einzelabrechnung geprüft werden.",
  } satisfies InvestmentProfile;
}

function readinessLabel(yieldValue: number | null, surplus: number | null) {
  if (yieldValue !== null && yieldValue >= 4.5 && (surplus ?? 0) >= 0) return "7,0 / 10";
  if (yieldValue !== null && yieldValue >= 3.5) return "6,5 / 10";
  return "offen";
}

function createFileId(file: File) {
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${file.name}-${file.size}-${file.lastModified}-${randomPart}`;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function addMonthsIsoDate(months: number) {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

function toDateInputValue(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

export default function InvestmentBericht() {
  const appData = useAppData();
  const { user } = useAuth();
  const canManageInvestmentRequests = isAdminEmail(user?.email);
  const [wealthDrafts, setWealthDrafts] = useState<Record<string, WealthDraft>>({});
  const [investmentRequests, setInvestmentRequests] = useState<InvestmentRequestRow[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestSaveState, setRequestSaveState] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [objectName, setObjectName] = useState("Neue Investition");
  const [requestAddress, setRequestAddress] = useState("");
  const [requestDate, setRequestDate] = useState(() => todayIsoDate());
  const [requestStatus, setRequestStatus] = useState<InvestmentRequestStatus>("draft");
  const [requestExpiresAt, setRequestExpiresAt] = useState(() => addMonthsIsoDate(6));
  const [unitDescription, setUnitDescription] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [buyerProvision, setBuyerProvision] = useState("");
  const [equity, setEquity] = useState("");
  const [targetRent, setTargetRent] = useState("");
  const [apartmentRent, setApartmentRent] = useState("");
  const [parkingRent, setParkingRent] = useState("");
  const [nkPrepayment, setNkPrepayment] = useState("");
  const [livingArea, setLivingArea] = useState("");
  const [rooms, setRooms] = useState("");
  const [monthlyHousegeld, setMonthlyHousegeld] = useState("");
  const [interestRate, setInterestRate] = useState("4,62");
  const [amortizationRate, setAmortizationRate] = useState("1,00");
  const [monthlyBankRate, setMonthlyBankRate] = useState("");
  const [personalTaxRate, setPersonalTaxRate] = useState("44,30");
  const [plannedRentIncreaseRate, setPlannedRentIncreaseRate] = useState("2,00");
  const [additionalMaintenance, setAdditionalMaintenance] = useState("30");
  const [nonDeductibleHousegeld, setNonDeductibleHousegeld] = useState("40");
  const [location, setLocation] = useState("");
  const [activeSection, setActiveSection] = useState<InvestmentSection>("financing");
  const [calculationOpen, setCalculationOpen] = useState(false);
  const [persons, setPersons] = useState<InvestmentPerson[]>(initialPersons);
  const [checklist, setChecklist] = useState<InvestmentChecklistItem[]>(checklistTemplates);
  const [copyStatus, setCopyStatus] = useState("");
  const [aiStatus, setAiStatus] = useState<AiStatus>("idle");
  const [aiReport, setAiReport] = useState<AiReport | null>(null);
  const [aiError, setAiError] = useState("");

  const selectedRequest = useMemo(
    () => investmentRequests.find((request) => request.id === selectedRequestId) ?? null,
    [investmentRequests, selectedRequestId],
  );

  const requestFileMetadata = useMemo<InvestmentRequestFileMetadata[]>(
    () =>
      files.map((file) => ({
        id: file.id,
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.file.lastModified,
      })),
    [files],
  );

  function buildRequestPayload(): InvestmentRequestPayload {
    return {
      unitDescription,
      purchasePrice,
      loanAmount,
      buyerProvision,
      equity,
      targetRent,
      apartmentRent,
      parkingRent,
      nkPrepayment,
      livingArea,
      rooms,
      monthlyHousegeld,
      interestRate,
      amortizationRate,
      monthlyBankRate,
      personalTaxRate,
      plannedRentIncreaseRate,
      additionalMaintenance,
      nonDeductibleHousegeld,
      persons,
      checklist,
    };
  }

  function resetInvestmentRequestForm() {
    setSelectedRequestId("");
    setRequestSaveState("Neue Anfrage bereit. Nach dem Eintragen speichern.");
    setObjectName("Neue Investition");
    setRequestAddress("");
    setRequestDate(todayIsoDate());
    setRequestStatus("draft");
    setRequestExpiresAt(addMonthsIsoDate(6));
    setLocation("");
    setUnitDescription("");
    setPurchasePrice("");
    setLoanAmount("");
    setBuyerProvision("");
    setEquity("");
    setTargetRent("");
    setApartmentRent("");
    setParkingRent("");
    setNkPrepayment("");
    setLivingArea("");
    setRooms("");
    setMonthlyHousegeld("");
    setInterestRate("4,62");
    setAmortizationRate("1,00");
    setMonthlyBankRate("");
    setPersonalTaxRate("44,30");
    setPlannedRentIncreaseRate("2,00");
    setAdditionalMaintenance("30");
    setNonDeductibleHousegeld("40");
    setPersons(initialPersons);
    setChecklist(checklistTemplates);
    setFiles([]);
    setAiStatus("idle");
    setAiReport(null);
    setAiError("");
  }

  function applyInvestmentRequest(request: InvestmentRequestRow) {
    const payload = request.payload ?? {};
    setSelectedRequestId(request.id);
    setRequestSaveState("");
    setObjectName(request.object_name || request.title || "Neue Investition");
    setRequestAddress(request.address ?? "");
    setRequestDate(request.request_date || todayIsoDate());
    setRequestStatus(request.status);
    setRequestExpiresAt(toDateInputValue(request.expires_at));
    setLocation(request.location ?? "");
    setUnitDescription(payload.unitDescription ?? "");
    setPurchasePrice(payload.purchasePrice ?? "");
    setLoanAmount(payload.loanAmount ?? "");
    setBuyerProvision(payload.buyerProvision ?? "");
    setEquity(payload.equity ?? "");
    setTargetRent(payload.targetRent ?? "");
    setApartmentRent(payload.apartmentRent ?? "");
    setParkingRent(payload.parkingRent ?? "");
    setNkPrepayment(payload.nkPrepayment ?? "");
    setLivingArea(payload.livingArea ?? "");
    setRooms(payload.rooms ?? "");
    setMonthlyHousegeld(payload.monthlyHousegeld ?? "");
    setInterestRate(payload.interestRate ?? "4,62");
    setAmortizationRate(payload.amortizationRate ?? "1,00");
    setMonthlyBankRate(payload.monthlyBankRate ?? "");
    setPersonalTaxRate(payload.personalTaxRate ?? "44,30");
    setPlannedRentIncreaseRate(payload.plannedRentIncreaseRate ?? "2,00");
    setAdditionalMaintenance(payload.additionalMaintenance ?? "30");
    setNonDeductibleHousegeld(payload.nonDeductibleHousegeld ?? "40");
    setPersons(Array.isArray(payload.persons) ? (payload.persons as InvestmentPerson[]) : initialPersons);
    setChecklist(Array.isArray(payload.checklist) ? (payload.checklist as InvestmentChecklistItem[]) : checklistTemplates);
    setFiles([]);
    setAiReport(request.ai_report ? (request.ai_report as unknown as AiReport) : null);
    setAiStatus(request.ai_report ? "ready" : "idle");
    setAiError("");
  }

  async function refreshInvestmentRequests(nextSelectedId?: string) {
    setRequestsLoading(true);
    try {
      const rows = await listInvestmentRequests();
      setInvestmentRequests(rows);
      if (nextSelectedId) {
        const nextRequest = rows.find((request) => request.id === nextSelectedId);
        if (nextRequest) applyInvestmentRequest(nextRequest);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Investment-Anfragen konnten nicht geladen werden.";
      setRequestSaveState(message);
    } finally {
      setRequestsLoading(false);
    }
  }

  async function saveCurrentInvestmentRequest(statusOverride?: InvestmentRequestStatus, reportOverride?: AiReport | null) {
    if (!canManageInvestmentRequests) {
      setRequestSaveState("Nur-Lesen-Zugang: Investment-Anfragen können angesehen, aber nicht gespeichert werden.");
      return;
    }
    setRequestSaveState("Investment-Anfrage wird gespeichert...");
    try {
      const reportToSave = reportOverride ?? aiReport;
      const saved = await saveInvestmentRequest({
        id: selectedRequestId || undefined,
        title: objectName || "Neue Investition",
        objectName,
        requestDate,
        address: requestAddress,
        location,
        status: statusOverride ?? requestStatus,
        expiresAt: requestExpiresAt || null,
        payload: buildRequestPayload(),
        aiReport: reportToSave ? (reportToSave as unknown as Record<string, unknown>) : null,
        fileMetadata: requestFileMetadata,
      });
      setSelectedRequestId(saved.id);
      setRequestStatus(saved.status);
      setRequestSaveState(`Gespeichert am ${new Date(saved.updated_at).toLocaleString("de-DE")}.`);
      await refreshInvestmentRequests(saved.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Investment-Anfrage konnte nicht gespeichert werden.";
      setRequestSaveState(message);
    }
  }

  async function archiveCurrentInvestmentRequest() {
    if (!selectedRequestId) return;
    if (!canManageInvestmentRequests) {
      setRequestSaveState("Nur-Lesen-Zugang: Archivieren ist dem Admin vorbehalten.");
      return;
    }
    setRequestSaveState("Investment-Anfrage wird archiviert...");
    try {
      const archived = await archiveInvestmentRequest(selectedRequestId);
      setRequestStatus(archived.status);
      setRequestSaveState("Investment-Anfrage wurde archiviert.");
      await refreshInvestmentRequests(archived.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Investment-Anfrage konnte nicht archiviert werden.";
      setRequestSaveState(message);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const propertyIds = appData.portfolioRows.map((row) => row.property_id).filter(Boolean);
    const refresh = async () => {
      const profiles = await fetchPropertyWealthProfiles(propertyIds);
      if (!cancelled) setWealthDrafts(profiles);
    };
    void refresh();
    window.addEventListener(WEALTH_UPDATED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(WEALTH_UPDATED_EVENT, refresh);
    };
  }, [appData.portfolioRows]);

  useEffect(() => {
    let cancelled = false;
    const initialLoad = window.setTimeout(() => {
      void (async () => {
        setRequestsLoading(true);
        try {
          const rows = await listInvestmentRequests();
          if (!cancelled) setInvestmentRequests(rows);
        } catch (error) {
          if (!cancelled) {
            const message = error instanceof Error ? error.message : "Investment-Anfragen konnten nicht geladen werden.";
            setRequestSaveState(message);
          }
        } finally {
          if (!cancelled) setRequestsLoading(false);
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(initialLoad);
    };
  }, []);

  const hasZipPackage = useMemo(() => files.some(isZipPackage), [files]);

  const coveredDocuments = useMemo(
    () =>
      requiredDocuments.map((document) => {
        const directMatch = files.some((file) => matchesDocument(file, document));
        const coverage: DocumentCoverage = directMatch ? "direct" : hasZipPackage ? "package" : "missing";
        return {
          ...document,
          covered: coverage !== "missing",
          coverage,
        };
      }),
    [files, hasZipPackage],
  );

  const readiness = Math.round(
    (coveredDocuments.reduce((sum, document) => sum + coverageWeight(document.coverage), 0) /
      coveredDocuments.length) *
      100,
  );

  const investmentCalculation = useMemo(() => {
    const purchase = pickNumber(purchasePrice, null);
    const provisionInput = pickNumber(buyerProvision, null);
    const loan = pickNumber(loanAmount, purchase);
    const interest = pickNumber(interestRate, 4.52) ?? 4.52;
    const amortization = pickNumber(amortizationRate, 1) ?? 1;
    const fixedRate = pickNumber(monthlyBankRate, null);
    const taxRate = pickNumber(personalTaxRate, 44.3) ?? 44.3;
    const apartment = pickNumber(apartmentRent, null);
    const parking = pickNumber(parkingRent, null);
    const target = pickNumber(targetRent, null);
    const coldRent = (apartment ?? 0) + (parking ?? 0) || target || 0;
    const nkAdvance = pickNumber(nkPrepayment, 0) ?? 0;
    const warmIncome = coldRent + nkAdvance;
    const housegeld = pickNumber(monthlyHousegeld, 0) ?? 0;
    const calculatedRate = loan ? (loan * ((interest + amortization) / 100)) / 12 : 0;
    const bankRate = fixedRate ?? calculatedRate;
    const plannedRentIncrease = pickNumber(plannedRentIncreaseRate, 2) ?? 2;
    const maintenance = pickNumber(additionalMaintenance, 30) ?? 30;
    const nonDeductible = pickNumber(nonDeductibleHousegeld, 40) ?? 40;
    const transferTax = purchase ? purchase * 0.05 : 0;
    const notary = purchase ? purchase * 0.02 : 0;
    const broker = provisionInput ?? (purchase ? purchase * 0.0357 : 0);
    const equityForPurchase = purchase !== null && loan !== null ? purchase - loan : 0;
    const requiredEquity = transferTax + notary + broker;
    const totalEquity = equityForPurchase + requiredEquity;
    const rentLossRisk = coldRent * 0.02;
    const monthlyInterest = loan ? (loan * (interest / 100)) / 12 : 0;
    const monthlyPrincipal = Math.max(bankRate - monthlyInterest, 0);
    const depreciation = purchase ? (purchase * 0.8) / 50 / 12 : 0;
    const cashflowBeforeTax = warmIncome - bankRate - housegeld - rentLossRisk - maintenance;
    const taxableResult = coldRent - monthlyInterest - depreciation - nonDeductible;
    const taxRefund = taxableResult < 0 ? -taxableResult * (taxRate / 100) : 0;
    const realCashflowAfterTax = cashflowBeforeTax + taxRefund;
    const monthlyWealthBuild = monthlyPrincipal;
    const tenYearPaidPrincipal = monthlyPrincipal * 120;
    const tenYearRemainingLoan = (loan ?? 0) - tenYearPaidPrincipal;
    const tenthYearColdRent = coldRent * ((1 + plannedRentIncrease / 100) ** 10);
    const tenthYearCashflowBeforeTax = tenthYearColdRent - (tenthYearColdRent * 0.02) - maintenance - bankRate - housegeld;
    const tenYearValueGain = purchase ? purchase * (1.02 ** 10) - purchase : 0;
    const equityReturnPa = totalEquity > 0 ? ((tenYearPaidPrincipal + tenYearValueGain) / 10 / totalEquity) * 100 : null;

    return {
      purchase,
      loan,
      interest,
      amortization,
      bankRate,
      taxRate,
      coldRent,
      nkAdvance,
      monthlyIncome: coldRent,
      warmIncome,
      housegeld,
      plannedRentIncrease,
      maintenance,
      nonDeductible,
      transferTax,
      notary,
      broker,
      equityForPurchase,
      requiredEquity,
      totalEquity,
      rentLossRisk,
      monthlyInterest,
      monthlyPrincipal,
      depreciation,
      cashflowBeforeTax,
      taxableResult,
      taxRefund,
      realCashflowAfterTax,
      monthlyWealthBuild,
      tenYearPaidPrincipal,
      tenYearRemainingLoan,
      tenthYearColdRent,
      tenthYearCashflowBeforeTax,
      tenYearValueGain,
      equityReturnPa,
    };
  }, [additionalMaintenance, amortizationRate, apartmentRent, buyerProvision, interestRate, loanAmount, monthlyBankRate, monthlyHousegeld, nkPrepayment, nonDeductibleHousegeld, parkingRent, personalTaxRate, plannedRentIncreaseRate, purchasePrice, targetRent]);

  const investmentWealthCards = useMemo(
    () => buildInvestmentWealthCards(appData.portfolioRows, wealthDrafts),
    [appData.portfolioRows, wealthDrafts],
  );

  const investmentWealthTotals = useMemo(
    () =>
      investmentWealthCards.reduce(
        (totals, card) => ({
          marketValue: totals.marketValue + card.marketValue,
          remainingDebt: totals.remainingDebt + card.remainingDebt,
          monthlyRate: totals.monthlyRate + card.monthlyRate,
        }),
        { marketValue: 0, remainingDebt: 0, monthlyRate: 0 },
      ),
    [investmentWealthCards],
  );

  const checklistProgress = Math.round((checklist.filter((item) => item.checked).length / checklist.length) * 100);
  const canExportReport = Boolean(objectName.trim() && (purchasePrice.trim() || investmentCalculation.purchase));

  const investmentProfile = useMemo(
    () =>
      buildInvestmentProfile({
        objectName: requestAddress || objectName,
        purchasePrice,
        buyerProvision,
        livingArea,
        rooms,
        targetRent: String(investmentCalculation.monthlyIncome || targetRent),
        monthlyHousegeld,
        interestRate,
        amortizationRate,
      }),
    [amortizationRate, buyerProvision, interestRate, investmentCalculation.monthlyIncome, livingArea, monthlyHousegeld, objectName, purchasePrice, requestAddress, rooms, targetRent],
  );

  const financingScenarios = useMemo<FinancingScenario[]>(() => {
    const interest = (pickNumber(interestRate, 3.5) ?? 3.5) / 100;
    const amortization = (pickNumber(amortizationRate, 2) ?? 2) / 100;
    const annuity = interest + amortization;
    const purchase = investmentProfile.purchasePrice;
    const scenarios = [
      { label: "80 % des Kaufpreises", loanAmount: purchase === null ? null : purchase * 0.8 },
      { label: "90 % des Kaufpreises", loanAmount: purchase === null ? null : purchase * 0.9 },
      { label: "100 % des Kaufpreises", loanAmount: purchase },
      {
        label: "Kaufpreis + Provision",
        loanAmount:
          purchase === null ? null : purchase + (investmentProfile.buyerProvision ?? 0),
      },
    ];
    return scenarios.map((scenario) => {
      const loanAmount = scenario.loanAmount ?? 0;
      const monthlyRate = loanAmount > 0 ? (loanAmount * annuity) / 12 : 0;
      return {
        label: scenario.label,
        loanAmount,
        monthlyRate,
        cashflowAfterRate:
          investmentProfile.monthlySurplusBeforeFinancing === null
            ? null
            : investmentProfile.monthlySurplusBeforeFinancing - monthlyRate,
      };
    });
  }, [amortizationRate, interestRate, investmentProfile]);

  const mailBody = encodeURIComponent(
    `Hallo,\n\nanbei/folgend bereite ich eine erste Finanzierungsprüfung für ${objectName || "eine neue Investition"} vor.\n\nBitte prüfen Sie auf Basis des Investmentberichts grob die mögliche Finanzierung, Beleihung, Eigenkapitalanforderung und Konditionsindikation.\n\nUnterlagen und Bericht werden separat übermittelt.\n\nViele Grüße`,
  );

  const manualReport = useMemo<AiReport>(() => {
    const checkedItems = checklist.filter((item) => item.checked);
    const openItems = checklist.filter((item) => !item.checked);
    return {
      generatedAt: new Date().toLocaleString("de-DE"),
      statusLabel: canExportReport ? "Bankfähiger Entwurf aus Eingabedaten" : "Entwurf - Kerndaten fehlen",
      summary:
        canExportReport
          ? `Für ${objectName || "das neue Kaufinteresse"} wurden Stammdaten, Finanzierungsannahmen, Kalkulation und Checkliste zu einem Bank-Entwurf zusammengeführt. Der reale Cashflow nach Steuern liegt indikativ bei ${formatSignedEuroMonthly(investmentCalculation.realCashflowAfterTax)}.`
          : "Bitte mindestens Objekt/Adresse und Kaufpreis eintragen, damit ein sinnvoller Bank-Entwurf erstellt werden kann.",
      risks: [
        ...openItems.slice(0, 6).map((item) => `${item.category}: ${item.text}`),
        "Bankkonditionen, Beleihungswert und persönliche Bonität sind verbindlich durch Bank/Finanzberater zu prüfen.",
      ],
      nextSteps: [
        "PDF-Export erzeugen und zusammen mit Exposé, Grundriss, Wirtschaftsplan, Energieausweis und Mietunterlagen weitergeben.",
        "Finanzierungsrahmen, Eigenkapitalbedarf, Beleihungsauslauf und Konditionsindikation prüfen lassen.",
        "Offene Checklistenpunkte vor Kaufentscheidung schließen.",
      ],
      chapterStatus: reportChapters.map((chapter, index) => ({
        chapter,
        status: index === 5 || checkedItems.length >= 3 ? "Bereit" : "Prüfen",
        note:
          index === 5
            ? "Live-Kalkulation aus Kaufpreis, Darlehen, Zins, Rate, Miete, Hausgeld, Risiko und Steuerannahme vorhanden."
            : checkedItems.length
              ? `${checkedItems.length} von ${checklist.length} Prüfpunkten erledigt.`
              : "Manuelle Prüfung und Unterlagenstatus ergänzen.",
      })),
      bankFazit:
        investmentCalculation.realCashflowAfterTax >= 0
          ? "Vorläufig bankseitig prüfenswert. Cashflow, Beleihungsauslauf, Eigenkapitalbedarf und Unterlagenqualität wirken als erste Grundlage plausibel, müssen aber bankseitig validiert werden."
          : "Vorläufig prüfenswert mit Cashflow-Hinweis. Der kalkulierte reale Cashflow ist negativ; Bank und Berater sollten Tragfähigkeit, Eigenkapital, Zinsbindung und Risikopuffer konservativ prüfen.",
      profile: {
        monthlyRent: investmentCalculation.monthlyIncome || null,
        monthlyHousegeld: investmentCalculation.housegeld || null,
        monthlySurplusBeforeFinancing: investmentCalculation.monthlyIncome - investmentCalculation.housegeld || null,
        recommendation:
          investmentCalculation.realCashflowAfterTax >= 0
            ? "Weiterprüfen / Finanzierungsgespräch vorbereiten"
            : "Weiterprüfen mit Fokus auf Cashflow, Eigenkapital und Konditionen",
        bankKeyMessage: "Dieser Bericht basiert auf den manuell eingetragenen Daten, der Live-Kalkulation und dem Checklistenstatus.",
      },
      financialScenarios: financingScenarios,
      riskMatrix: [
        { field: "Cashflow nach Steuern", rating: investmentCalculation.realCashflowAfterTax >= 0 ? "Stabil" : "Belastet", finding: formatSignedEuroMonthly(investmentCalculation.realCashflowAfterTax) },
        { field: "Eigenkapitalbedarf", rating: "Berechnet", finding: formatEuro(investmentCalculation.requiredEquity) },
        { field: "Vermögensaufbau", rating: "Berechnet", finding: formatEuroMonthly(investmentCalculation.monthlyWealthBuild) },
        { field: "Checkliste", rating: `${checklistProgress}%`, finding: `${checkedItems.length} von ${checklist.length} Punkten erledigt.` },
      ],
      openQuestions: openItems.map((item) => item.text),
      documentFindings: coveredDocuments.map((document) => ({
        document: document.label,
        status: document.coverage === "direct" ? "vorhanden" : document.coverage === "package" ? "im Paket prüfen" : "offen",
        finding: document.examples,
      })),
    };
  }, [canExportReport, checklist, checklistProgress, coveredDocuments, financingScenarios, investmentCalculation, objectName]);

  const effectiveReport = aiReport ?? manualReport;

  const aiReportText = useMemo(() => {
    if (!effectiveReport) return "";
    return [
      `${effectiveReport.statusLabel} - ${objectName || "Neue Investition"}`,
      `Erstellt: ${effectiveReport.generatedAt}`,
      "",
      "Executive Summary",
      effectiveReport.summary,
      "",
      "Kapitelstatus",
      ...effectiveReport.chapterStatus.map((item, index) => `${index + 1}. ${item.chapter}: ${item.status} - ${item.note}`),
      "",
      "Risiken / offene Prüfpositionen",
      ...effectiveReport.risks.map((risk) => `- ${risk}`),
      "",
      "Nächste Schritte",
      ...effectiveReport.nextSteps.map((step) => `- ${step}`),
      "",
      "Bankfazit",
      effectiveReport.bankFazit,
    ].join("\n");
  }, [effectiveReport, objectName]);

  async function copyAiReport() {
    if (!aiReportText) return;
    try {
      await navigator.clipboard.writeText(aiReportText);
      setCopyStatus("KI-Erstbewertung kopiert");
    } catch {
      setCopyStatus("Kopieren nicht möglich");
    }
  }

  const reportDocumentHtml = useMemo(() => {
    if (!effectiveReport) return "";
    const profile = { ...investmentProfile, ...(effectiveReport.profile ?? {}) } as InvestmentProfile;
    const scenarios = effectiveReport.financialScenarios?.length ? effectiveReport.financialScenarios : financingScenarios;
    const safeObjectName = escapeHtml(objectName || "Neue Investition");
    const safeLocation = escapeHtml(location || "noch offen");
    const safePurchasePrice = escapeHtml(purchasePrice || "noch offen");
    const safeEquity = escapeHtml(equity || "noch offen");
    const safeTargetRent = escapeHtml(targetRent || "noch offen");
    const fileRows = files.length
      ? files
          .map(
            (file) =>
              `<tr><td>${escapeHtml(file.name)}</td><td>${escapeHtml(formatFileSize(file.size))}</td><td>${escapeHtml(file.type || "Datei")}</td></tr>`,
          )
          .join("")
      : `<tr><td colspan="3">Keine Unterlagen gelistet.</td></tr>`;
    const chapterRows = effectiveReport.chapterStatus
      .map(
        (item, index) =>
          `<tr><td>${index + 1}</td><td>${escapeHtml(item.chapter)}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.note)}</td></tr>`,
      )
      .join("");
    const riskItems = effectiveReport.risks.map((risk) => `<li>${escapeHtml(risk)}</li>`).join("");
    const stepItems = effectiveReport.nextSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("");
    const calculationRows = [
      ["Kaufpreis der Immobilie", formatEuro(investmentCalculation.purchase)],
      ["Bankdarlehen", formatEuro(investmentCalculation.loan)],
      ["Sollzins p.a.", `${investmentCalculation.interest.toFixed(2).replace(".", ",")} %`],
      ["Tilgung p.a.", `${investmentCalculation.amortization.toFixed(2).replace(".", ",")} %`],
      ["Monatliche Bankrate", formatEuroMonthly(investmentCalculation.bankRate)],
      ["Persönlicher Steuersatz", `${investmentCalculation.taxRate.toFixed(2).replace(".", ",")} %`],
      ["Grunderwerbsteuer 5,0 %", formatEuro(investmentCalculation.transferTax)],
      ["Notar & Grundbuch 2,0 %", formatEuro(investmentCalculation.notary)],
      ["Maklerprovision", formatEuro(investmentCalculation.broker)],
      ["Benötigtes Eigenkapital", formatEuro(investmentCalculation.requiredEquity)],
      ["Einnahmen Kaltmiete + Stellplatz", formatEuroMonthly(investmentCalculation.monthlyIncome)],
      ["Nebenkostenvorauszahlung", formatEuroMonthly(investmentCalculation.nkAdvance)],
      ["Gesamteinnahmen warm", formatEuroMonthly(investmentCalculation.warmIncome)],
      ["Ausgaben Hausgeld + Rate", formatEuroMonthly(-(investmentCalculation.housegeld + investmentCalculation.bankRate))],
      ["Mietausfallwagnis 2 %", formatEuroMonthly(-investmentCalculation.rentLossRisk)],
      ["Zusätzliche Instandhaltung", formatEuroMonthly(-investmentCalculation.maintenance)],
      ["Gebäudeabschreibung AfA", formatEuroMonthly(investmentCalculation.depreciation)],
      ["Steuerliches Ergebnis", formatSignedEuroMonthly(investmentCalculation.taxableResult)],
      ["Steuererstattung Leverage", formatEuroMonthly(investmentCalculation.taxRefund)],
      ["Realer Cashflow nach Steuern", formatSignedEuroMonthly(investmentCalculation.realCashflowAfterTax)],
      ["Monatlicher Vermögensaufbau", formatEuroMonthly(investmentCalculation.monthlyWealthBuild)],
      ["Gezahlte Tilgung nach 10 Jahren", formatEuro(investmentCalculation.tenYearPaidPrincipal)],
      ["Restschuld nach 10 Jahren", formatEuro(investmentCalculation.tenYearRemainingLoan)],
      ["Kaltmiete im 10. Jahr", formatEuroMonthly(investmentCalculation.tenthYearColdRent)],
      ["Cashflow vor Steuern im 10. Jahr", formatSignedEuroMonthly(investmentCalculation.tenthYearCashflowBeforeTax)],
      ["Wertsteigerung nach 10 Jahren", formatEuro(investmentCalculation.tenYearValueGain)],
      ["Eigenkapitalrendite p.a.", formatPercent(investmentCalculation.equityReturnPa)],
    ]
      .map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(String(value))}</td></tr>`)
      .join("");
    const personRows = persons
      .map((person) => `<tr><td>${escapeHtml(person.name || "Person")}</td><td>${escapeHtml(person.income || "offen")}</td><td>${escapeHtml(person.expenses || "offen")}</td><td>${escapeHtml(person.assets || "offen")}</td><td>${escapeHtml(person.liabilities || "offen")}</td></tr>`)
      .join("");
    const checklistRows = checklist
      .map((item) => `<tr><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.text)}</td><td>${item.checked ? "erledigt" : "offen"}</td></tr>`)
      .join("");
    const wealthRows = investmentWealthCards
      .map((card) => {
        const equityPosition = card.marketValue - card.remainingDebt;
        const note = card.isRosenstein
          ? "Drei Tiefgaragenstellplätze. Der aktuelle Vermietungs- und Leerstandsstatus wird ausschließlich in Immobilienvermögen geführt."
          : "Bestandsimmobilie aus Immobilien Vermögen mit Marktwert, Restschuld und Monatsrate.";
        return `<tr><td>${escapeHtml(card.name)}</td><td>${escapeHtml(card.address)}</td><td>${escapeHtml(formatCurrencyExact(card.marketValue))}</td><td>${escapeHtml(formatCurrencyExact(card.remainingDebt))}</td><td>${escapeHtml(formatCurrencyExact(card.monthlyRate))}</td><td>${escapeHtml(formatCurrencyExact(equityPosition))}</td><td>${escapeHtml(note)}</td></tr>`;
      })
      .join("");
    const wealthSummaryRows = [
      ["Objekte", String(investmentWealthCards.length)],
      ["Marktwert gesamt", formatCurrencyExact(investmentWealthTotals.marketValue)],
      ["Restschuld gesamt", formatCurrencyExact(investmentWealthTotals.remainingDebt)],
      ["Freies Vermögen indikativ", formatCurrencyExact(investmentWealthTotals.marketValue - investmentWealthTotals.remainingDebt)],
      ["Monatliche Raten / Soll TG", formatCurrencyExact(investmentWealthTotals.monthlyRate)],
    ]
      .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
      .join("");
    const keyFactRows = [
      ["Objektart", profile.objectType],
      ["Anschrift / Objekt", profile.address],
      ["Einheiten", unitDescription || "offen"],
      ["Kaufpreis", formatEuro(profile.purchasePrice)],
      ["Käuferprovision", formatEuro(profile.buyerProvision)],
      ["Geschätzte Gesamterwerbskosten", formatEuro(profile.acquisitionCosts)],
      [
        "Wohnfläche / Zimmer",
        `${profile.livingArea ? `${profile.livingArea.toLocaleString("de-DE")} m²` : "offen"} / ${profile.rooms ?? "offen"}`,
      ],
      ["Vermietungsstatus", profile.monthlyRent ? "vermietet / Miete angesetzt" : "zu prüfen"],
      ["Kaltmiete", formatEuroMonthly(profile.monthlyRent)],
      ["Hausgeld", formatEuroMonthly(profile.monthlyHousegeld)],
      ["Bruttomietrendite Kaufpreis", formatPercent(profile.grossYieldPurchasePrice)],
      ["Energie", `${profile.energyValue}, Klasse ${profile.energyClass}, ${profile.heating}`],
      ["Vorläufige Investorenbewertung", profile.investorScore],
    ]
      .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(String(value))}</td></tr>`)
      .join("");
    const profitabilityRows = [
      ["Jahreskaltmiete", formatEuro(profile.annualRent), "nachgewiesene oder eingegebene Kaltmiete"],
      [
        "Kaufpreisfaktor",
        profile.purchaseFactor === null ? "offen" : `${profile.purchaseFactor.toFixed(2).replace(".", ",")}-fache Jahreskaltmiete`,
        "Kaufpreis geteilt durch Jahreskaltmiete",
      ],
      ["Bruttomietrendite Kaufpreis", formatPercent(profile.grossYieldPurchasePrice), "Jahreskaltmiete / Kaufpreis"],
      ["Bruttomietrendite Gesamterwerbskosten", formatPercent(profile.grossYieldAcquisitionCosts), "Jahreskaltmiete / geschätzte Gesamtkosten"],
      [
        "Miete je m²",
        profile.rentPerSqm === null ? "offen" : `${profile.rentPerSqm.toFixed(2).replace(".", ",")} EUR/m²`,
        "monatliche Kaltmiete je Wohnfläche",
      ],
      [
        "Cashflow vor Finanzierung",
        formatEuroMonthly(profile.monthlySurplusBeforeFinancing),
        "vereinfachte Schätzung nach nicht umlagefähigen Kosten und Rücklage",
      ],
    ]
      .map(([label, value, note]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(String(value))}</td><td>${escapeHtml(note)}</td></tr>`)
      .join("");
    const financingRows = scenarios
      .map(
        (scenario) =>
          `<tr><td>${escapeHtml(scenario.label)}</td><td>${formatEuro(scenario.loanAmount)}</td><td>${formatEuroMonthly(scenario.monthlyRate)}</td><td>${formatEuroMonthly(scenario.cashflowAfterRate)}</td></tr>`,
      )
      .join("");
    const documentFindings = effectiveReport.documentFindings?.length
      ? effectiveReport.documentFindings
      : coveredDocuments.map((document) => ({
          document: document.label,
          status:
            document.coverage === "direct"
              ? "vorhanden"
              : document.coverage === "package"
                ? "im Paket prüfen"
                : "fehlt/offen",
          finding: document.examples,
        }));
    const documentRows = documentFindings
      .map((document) => `<tr><td>${escapeHtml(document.document)}</td><td>${escapeHtml(document.status)}</td><td>${escapeHtml(document.finding)}</td></tr>`)
      .join("");
    const riskMatrix = effectiveReport.riskMatrix?.length
      ? effectiveReport.riskMatrix
      : [
          { field: "WEG-Verwaltung", rating: "Prüfen", finding: "Verwaltungsqualität, Protokolle, Rücklagenstand und Hausgeldrückstände prüfen." },
          { field: "Dach / Fassade / Gemeinschaftseigentum", rating: "Prüfen", finding: "Beschlüsse, Angebote und Instandhaltungsrücklage prüfen." },
          { field: "Aufzug / technische Anlagen", rating: "Prüfen", finding: "Wartung, Reparaturen und Sonderumlagenrisiko prüfen." },
          { field: "Heizung / Energie", rating: "Prüfen", finding: `${profile.heating}; Energiekennwert ${profile.energyValue}.` },
          { field: "Vermietung", rating: profile.monthlyRent ? "Prüfen" : "Offen", finding: "Mietvertrag, Zahlungsnachweise, Nebenkostenstruktur und Mieterhöhung prüfen." },
          { field: "Finanzierung", rating: "Prüfen", finding: "Kapitaldienstfähigkeit hängt von Zinssatz, Tilgung, Eigenkapital und persönlicher Bonität ab." },
        ];
    const riskMatrixRows = riskMatrix
      .map((item) => `<tr><td>${escapeHtml(item.field)}</td><td>${escapeHtml(item.rating)}</td><td>${escapeHtml(item.finding)}</td></tr>`)
      .join("");
    const questions = effectiveReport.openQuestions?.length
      ? effectiveReport.openQuestions
      : [
          "Welches konkrete Wohnungs- und Teileigentum wird verkauft (Einheitsnummer, Miteigentumsanteil, Stellplatznummer)?",
          "Wie hoch sind aktueller Hausgeldvorschuss, Rücklagenstand und etwaige Hausgeldrückstände?",
          "Welche Bestandteile der Mietzahlung sind Kaltmiete, Betriebskostenvorauszahlung und Stellplatzmiete?",
          "Bestehen konkrete Beschlüsse oder Angebote für Dach, Heizung, Aufzug, Fassade oder sonstige Instandhaltung?",
          "Sind Mietzahlungen, Mieterhöhung und Mietvertrag vollständig nachgewiesen?",
          "Welche Finanzierungsstruktur ist gewünscht und wie hoch ist das tatsächlich verfügbare Eigenkapital?",
        ];
    const openQuestions = questions
      .map((question) => `<li>${escapeHtml(question)}</li>`)
      .join("");

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Investmentbericht ${safeObjectName}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; line-height: 1.45; }
    .cover { border: 1px solid #dbe3ef; border-radius: 18px; padding: 28px; margin-bottom: 28px; }
    .logo { width: 88px; height: 88px; object-fit: cover; border-radius: 16px; border: 1px solid #dbe3ef; }
    .eyebrow { color: #2563eb; font-size: 11px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; margin-top: 22px; }
    h1 { font-size: 30px; margin: 8px 0 12px; }
    h2 { font-size: 20px; margin: 26px 0 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
    h3 { font-size: 15px; margin: 14px 0 6px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 18px; }
    .box { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; background: #f8fafc; }
    .label { color: #64748b; font-size: 10px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }
    .value { margin-top: 4px; font-weight: 800; }
    table { border-collapse: collapse; width: 100%; margin-top: 10px; }
    th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; vertical-align: top; font-size: 12px; }
    th { background: #f1f5f9; color: #334155; }
    .status { display: inline-block; border-radius: 999px; background: #ecfdf5; color: #047857; padding: 4px 10px; font-weight: 800; }
	    .warning { background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 12px; }
	    .positive { color: #047857; font-weight: 800; }
	    .negative { color: #be123c; font-weight: 800; }
	    .footer { margin-top: 34px; color: #64748b; font-size: 11px; }
  </style>
</head>
<body>
  <section class="cover">
    <img class="logo" src="${logo}" alt="Koenen Investment Logo" />
    <div class="eyebrow">Koenen Investment- und Finanzierungsanalyse</div>
    <h1>${safeObjectName}</h1>
    <p><span class="status">${escapeHtml(effectiveReport.statusLabel)}</span></p>
    <p>${escapeHtml(effectiveReport.summary)}</p>
    <div class="meta">
      <div class="box"><div class="label">Standort</div><div class="value">${safeLocation}</div></div>
      <div class="box"><div class="label">Kaufpreis</div><div class="value">${safePurchasePrice}</div></div>
      <div class="box"><div class="label">Eigenkapital</div><div class="value">${safeEquity}</div></div>
      <div class="box"><div class="label">Soll-/Zielmiete</div><div class="value">${safeTargetRent}</div></div>
      <div class="box"><div class="label">Berichtsdatum</div><div class="value">${escapeHtml(effectiveReport.generatedAt)}</div></div>
      <div class="box"><div class="label">Berichtsreife</div><div class="value">${readiness}%</div></div>
    </div>
  </section>

	  <h2>1. Executive Summary und Objektübersicht</h2>
	  <p><strong>Vorläufiges Ergebnis:</strong> ${escapeHtml(profile.recommendation)}</p>
	  <p>${escapeHtml(profile.bankKeyMessage)}</p>
	  <table>
	    <tbody>${keyFactRows}</tbody>
	  </table>

	  <h2>Immobilienvermögen Bestand</h2>
	  <p><strong>Quelle: Immobilien Vermögen Seite.</strong> Die folgende Übersicht dokumentiert die Bestandsimmobilien als Vermögens- und Sicherheitenlage für die Bank-/Finanzierungsprüfung.</p>
	  <table>
	    <tbody>${wealthSummaryRows}</tbody>
	  </table>
	  <table>
	    <thead><tr><th>Immobilie</th><th>Adresse</th><th>Marktwert</th><th>Restschuld</th><th>mtl. Rate / Soll</th><th>Vermögensposition</th><th>Hinweis</th></tr></thead>
	    <tbody>${wealthRows}</tbody>
	  </table>

	  <h2>2. Standort- und Marktanalyse</h2>
  <p>Standort: <strong>${safeLocation}</strong>. Für die bankseitige Erstprüfung sind Mikrolage, Nachfrage, Vergleichsmieten, Leerstandsrisiko und Wiederverwertbarkeit maßgeblich.</p>
  <p>Bei Innenstadt- oder zentrumsnahen Lagen spricht die Vermietbarkeit grundsätzlich für das Objekt. Einschränkungen durch Sondernutzung, Seniorenbindung, WEG-Regelungen oder Stellplatzzuordnung müssen marktseitig bewertet werden.</p>

  <h2>3. Objektbilder, Grundrisse und Bauzeichnungen</h2>
  <p>Vorliegende Dateien werden nachfolgend dokumentiert. Bilder, Grundrisse, Aufteilungspläne, Lageplan und Bauzeichnungen sind im finalen Bericht einzeln zuzuordnen.</p>
  <p>Für die Bank ist entscheidend, dass Wohnung, Abstellraum, Sondernutzungsrechte und Stellplatz eindeutig mit Teilungserklärung, Aufteilungsplan und Kaufvertragsentwurf übereinstimmen.</p>

  <h2>4. Dokumentenprüfung: Teilungserklärung, Energieausweis, Mietvertrag</h2>
  <table>
    <thead><tr><th>Unterlage</th><th>Status</th><th>Prüfziel</th></tr></thead>
    <tbody>${documentRows}</tbody>
  </table>
  <h3>Hochgeladene / ausgewählte Unterlagen</h3>
  <table>
    <thead><tr><th>Datei</th><th>Größe</th><th>Typ</th></tr></thead>
    <tbody>${fileRows}</tbody>
  </table>

  <h2>5. Wirtschaftsplan und Hausgeldanalyse</h2>
  <p>${escapeHtml(profile.housegeldNote)}</p>
  <p>Für die Kreditprüfung sind umlagefähige Kosten, nicht umlagefähige Kosten, Zuführung zur Erhaltungsrücklage und mögliche Hausgeldrückstände getrennt zu betrachten.</p>

  <h2>6. Rendite-, Cashflow- und Finanzierungsanalyse</h2>
  <h3>Miet- und Ertragsanalyse</h3>
  <table>
    <thead><tr><th>Position</th><th>Wert</th><th>Hinweis</th></tr></thead>
    <tbody>${profitabilityRows}</tbody>
  </table>
	  <h3>Vorläufige Finanzierungsrechnung</h3>
	  <p>Die folgenden Szenarien dienen der ersten Orientierung. Angenommen werden ${escapeHtml(interestRate || "3,50")} % Sollzins und ${escapeHtml(amortizationRate || "2,00")} % anfängliche Tilgung. Persönliche Bonität, Zusatzsicherheiten, Steuern, Mietausfall und Sondereigentumsreparaturen sind nicht eingerechnet.</p>
	  <h3>Koenen Investment- und Finanzierungsanalyse</h3>
	  <table>
	    <thead><tr><th>Position</th><th>Wert</th></tr></thead>
	    <tbody>${calculationRows}</tbody>
	  </table>
	  <table>
	    <thead><tr><th>Szenario</th><th>Darlehen</th><th>Rate/Monat</th><th>Cashflow nach Rate</th></tr></thead>
	    <tbody>${financingRows}</tbody>
	  </table>
  <div class="meta">
    <div class="box"><div class="label">Kaufpreis</div><div class="value">${safePurchasePrice}</div></div>
    <div class="box"><div class="label">Eigenkapital</div><div class="value">${safeEquity}</div></div>
    <div class="box"><div class="label">Soll-/Zielmiete</div><div class="value">${safeTargetRent}</div></div>
    <div class="box"><div class="label">Bewertungsstand</div><div class="value">${readiness}%</div></div>
  </div>

  <h2>7. WEG-Analyse und Risikoanalyse</h2>
  <table>
    <thead><tr><th>Prüffeld</th><th>Bewertung</th><th>Feststellung</th></tr></thead>
    <tbody>${riskMatrixRows}</tbody>
  </table>
  <div class="warning">
    <h3>Risiken / offene Prüfpositionen</h3>
    <ul>${riskItems}</ul>
  </div>

  <h2>8. Kaufempfehlung und Bankfazit</h2>
  <p><strong>${escapeHtml(profile.recommendation)}</strong></p>
  <p>${escapeHtml(effectiveReport.bankFazit)}</p>
  <p>Gesamturteil: Das Objekt ist für eine langfristige Bestandshaltung prüfenswert, wenn Hausgeld, Rücklage, Mietvertrag, Zahlungsstand, WEG-Risiken und Finanzierungsstruktur zufriedenstellend geklärt werden.</p>
	  <h3>Nächste Schritte</h3>
	  <ul>${stepItems}</ul>
	  <h3>Offene Fragen vor verbindlicher Kaufentscheidung</h3>
	  <ul>${openQuestions}</ul>

	  <h2>Finanzierungsvorbereitung: Personenprofile</h2>
	  <table>
	    <thead><tr><th>Person</th><th>Einnahmen</th><th>Ausgaben</th><th>Vermögen</th><th>Verbindlichkeiten</th></tr></thead>
	    <tbody>${personRows}</tbody>
	  </table>

	  <h2>Finanzierungsvorbereitung: Checkliste</h2>
	  <p>Fortschritt: ${checklistProgress}%</p>
	  <table>
	    <thead><tr><th>Kategorie</th><th>Prüfpunkt</th><th>Status</th></tr></thead>
	    <tbody>${checklistRows}</tbody>
	  </table>

  <h2>Kapitelstatus</h2>
  <table>
    <thead><tr><th>#</th><th>Kapitel</th><th>Status</th><th>Hinweis</th></tr></thead>
    <tbody>${chapterRows}</tbody>
  </table>

  <p class="footer">Automatisch erstellt mit Koenen Investment. Dieser Bericht ist eine strukturierte Erstbewertung und ersetzt keine rechtliche, technische oder steuerliche Detailprüfung.</p>
</body>
</html>`;
  }, [
	    effectiveReport,
	    amortizationRate,
	    checklist,
	    checklistProgress,
	    coveredDocuments,
	    equity,
	    files,
	    financingScenarios,
		    interestRate,
		    investmentWealthCards,
		    investmentWealthTotals,
		    investmentProfile,
		    investmentCalculation,
	    location,
	    objectName,
	    persons,
	    purchasePrice,
	    readiness,
	    targetRent,
	    unitDescription,
	  ]);

  function downloadWordReport() {
    if (!reportDocumentHtml) return;
    const blob = new Blob(["\ufeff", reportDocumentHtml], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slugifyFileName(objectName)}-investmentbericht.doc`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function createPdfReport() {
    if (!reportDocumentHtml) return;
    const reportWindow = window.open("", "_blank", "width=980,height=1200");
    if (!reportWindow) {
      setCopyStatus("PDF-Fenster konnte nicht geöffnet werden");
      return;
    }
    reportWindow.document.open();
    reportWindow.document.write(reportDocumentHtml);
    reportWindow.document.close();
    reportWindow.setTimeout(() => {
      reportWindow.focus();
      reportWindow.print();
    }, 300);
  }

  function updatePerson(id: string, field: keyof InvestmentPerson, value: string) {
    setPersons((current) => current.map((person) => (person.id === id ? { ...person, [field]: value } : person)));
  }

  function addPerson() {
    const id = `person-${Date.now()}`;
    setPersons((current) => [
      ...current,
      { id, name: "Weitere Person", income: "", expenses: "", assets: "", liabilities: "" },
    ]);
  }

  function toggleChecklistItem(id: number) {
    setChecklist((current) => current.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)));
  }

  function removeFile(fileId: string) {
    setFiles((current) => current.filter((file) => file.id !== fileId));
    setAiStatus("idle");
    setAiReport(null);
    setAiError("");
  }

  function clearFiles() {
    setFiles([]);
    setAiStatus("idle");
    setAiReport(null);
    setAiError("");
  }

  async function startAiEvaluation() {
    if (!files.length) {
      setAiStatus("blocked");
      setAiError("Bitte zuerst Unterlagen auswählen. Ohne Dokumente kann die KI keine fachliche Investmentbewertung erstellen.");
      setAiReport({
        generatedAt: new Date().toLocaleString("de-DE"),
        statusLabel: "Unterlagen fehlen",
        summary:
          "Für eine KI-Erstbewertung müssen zuerst Exposé, ZIP/PDF-Unterlagen oder Finanzierungsdaten ausgewählt werden.",
        risks: ["Keine Unterlagen ausgewählt. Eine belastbare Bewertung ist aktuell nicht möglich."],
        nextSteps: ["Unterlagen hochladen", "Objektstammdaten prüfen", "KI-Bewertung erneut starten"],
        chapterStatus: reportChapters.map((chapter) => ({
          chapter,
          status: "Offen",
          note: "Noch keine Unterlagen vorhanden.",
        })),
        bankFazit: "Noch kein Bankfazit möglich, weil keine Unterlagenbasis vorhanden ist.",
      });
      return;
    }

    setAiStatus("running");
    setCopyStatus("");
    setAiError("");

    try {
      const report = await runInvestmentAiAnalysis({
        objectName,
        location: location || requestAddress,
        purchasePrice,
        buyerProvision,
        equity,
        targetRent,
        livingArea,
        rooms,
        monthlyHousegeld,
        interestRate,
        amortizationRate,
        files,
      });

      const nextReport: AiReport = {
        generatedAt: report.generatedAt ?? new Date().toLocaleString("de-DE"),
        statusLabel: report.statusLabel,
        summary: report.summary,
        risks: report.risks,
        nextSteps: report.nextSteps,
        chapterStatus: report.chapterStatus,
        bankFazit: report.bankFazit,
        profile: report.profile,
        financialScenarios: report.financialScenarios,
        riskMatrix: report.riskMatrix,
        openQuestions: report.openQuestions,
        documentFindings: report.documentFindings,
      };
      setAiReport(nextReport);
      setAiStatus("ready");
      void saveCurrentInvestmentRequest("in_review", nextReport);
    } catch (error) {
      const message = error instanceof Error ? error.message : "KI-Bewertung konnte nicht gestartet werden.";
      setAiStatus("blocked");
      setAiError(message);
      setAiReport(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Investment"
        title="Investment-Bericht"
        description="KI-gestützter Arbeitsbereich für neue Immobilienkäufe: Unterlagen hochladen, Inhalte analysieren, Kapitel 1-8 erstellen und Bank-/Finanzberaterpaket vorbereiten."
        meta={[
          { label: "Output", value: "DOCX/PDF-Bericht Kapitel 1-8" },
          { label: "Ziel", value: "Bank- und Finanzierungsprüfung" },
        ]}
      >
        <button
          type="button"
          onClick={startAiEvaluation}
          disabled={aiStatus === "running"}
          className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {aiStatus === "running" ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
          KI-Bewertung starten
        </button>
      </PageHeader>

      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Investment-Anfragen</p>
            <h2 className="mt-2 text-xl font-black text-slate-950">Gespeicherte Anfrage bearbeiten</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
              Lege eine Investment-Anfrage als Entwurf an, speichere Datum, Adresse, Kalkulation, Checkliste und KI-Ergebnis in Supabase und öffne sie später wieder zur Bearbeitung.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={resetInvestmentRequestForm}
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-800 shadow-sm transition hover:bg-slate-50"
            >
              Neue Anfrage
            </button>
            <button
              type="button"
              onClick={() => void saveCurrentInvestmentRequest()}
              disabled={!canManageInvestmentRequests}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#356778] px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-[#285464] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
            >
              <CheckCircle2 size={17} />
              Anfrage speichern
            </button>
            <button
              type="button"
              onClick={() => void archiveCurrentInvestmentRequest()}
              disabled={!canManageInvestmentRequests || !selectedRequestId || requestStatus === "archived"}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileArchive size={17} />
              Archivieren
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[1.2fr_0.9fr_0.7fr_0.7fr_0.7fr]">
          <label className="grid gap-2 text-sm font-black text-slate-700">
            Gespeicherte Anfrage
            <select
              value={selectedRequestId}
              onChange={(event) => {
                const request = investmentRequests.find((entry) => entry.id === event.target.value);
                if (request) applyInvestmentRequest(request);
                else resetInvestmentRequestForm();
              }}
              className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-950 outline-none focus:border-slate-400"
            >
              <option value="">{requestsLoading ? "Anfragen werden geladen..." : "Neue / nicht gespeicherte Anfrage"}</option>
              {investmentRequests.map((request) => (
                <option key={request.id} value={request.id}>
                  {request.title} - {new Date(request.request_date).toLocaleDateString("de-DE")} ({request.status === "archived" ? "Archiv" : "Aktiv"})
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-black text-slate-700">
            Name
            <input
              value={objectName}
              onChange={(event) => setObjectName(event.target.value)}
              placeholder="z.B. Hasengasse 3"
              className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-950 outline-none focus:border-slate-400"
            />
          </label>
          <label className="grid gap-2 text-sm font-black text-slate-700">
            Datum
            <input
              type="date"
              value={requestDate}
              onChange={(event) => setRequestDate(event.target.value)}
              className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-950 outline-none focus:border-slate-400"
            />
          </label>
          <label className="grid gap-2 text-sm font-black text-slate-700">
            Aufbewahren bis
            <input
              type="date"
              value={requestExpiresAt}
              onChange={(event) => setRequestExpiresAt(event.target.value)}
              className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-950 outline-none focus:border-slate-400"
            />
          </label>
          <label className="grid gap-2 text-sm font-black text-slate-700">
            Status
            <select
              value={requestStatus}
              onChange={(event) => setRequestStatus(event.target.value as InvestmentRequestStatus)}
              className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-950 outline-none focus:border-slate-400"
            >
              <option value="draft">Entwurf</option>
              <option value="in_review">In Prüfung</option>
              <option value="bank_sent">An Bank gesendet</option>
              <option value="archived">Archiviert</option>
            </select>
          </label>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_0.7fr]">
          <label className="grid gap-2 text-sm font-black text-slate-700">
            Adresse
            <input
              value={requestAddress}
              onChange={(event) => setRequestAddress(event.target.value)}
              placeholder="Straße, Hausnummer, PLZ, Ort"
              className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-950 outline-none focus:border-slate-400"
            />
          </label>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Datenbankstatus</p>
            <p className="mt-1 text-sm font-bold leading-6 text-slate-700">
              {selectedRequest
                ? `Gespeichert: ${new Date(selectedRequest.updated_at).toLocaleString("de-DE")}`
                : "Noch nicht gespeichert"}
              {requestFileMetadata.length ? ` · ${requestFileMetadata.length} Unterlage(n) vorgemerkt` : ""}
            </p>
            {requestSaveState ? <p className="mt-1 text-sm font-black text-[#356778]">{requestSaveState}</p> : null}
            {!canManageInvestmentRequests ? (
              <p className="mt-1 text-sm font-black text-slate-500">Nur Admins können Investment-Anfragen speichern oder archivieren.</p>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid gap-3 rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-5">
        {investmentSections.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => setActiveSection(section.id)}
            className={`min-h-12 rounded-2xl px-4 py-3 text-sm font-black transition ${
              activeSection === section.id
                ? "bg-[#356778] text-white shadow-sm"
                : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
            }`}
          >
            {section.label}
          </button>
        ))}
      </div>

      {activeSection === "wealth" ? (
      <>
      <section className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Bestand Marktwert</p>
            <div className="mt-3 text-2xl font-black text-slate-950">{formatCurrencyExact(investmentWealthTotals.marketValue)}</div>
            <p className="mt-2 text-xs font-bold leading-5 text-slate-500">Quelle: Immobilien Vermögen Seite</p>
          </div>
          <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">Freies Vermögen</p>
            <div className="mt-3 text-2xl font-black text-emerald-800">
              {formatCurrencyExact(investmentWealthTotals.marketValue - investmentWealthTotals.remainingDebt)}
            </div>
            <p className="mt-2 text-xs font-bold leading-5 text-emerald-800">Marktwert minus Restschuld</p>
          </div>
          <div className="rounded-[22px] border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-indigo-700">Monatsraten</p>
            <div className="mt-3 text-2xl font-black text-indigo-900">{formatCurrencyExact(investmentWealthTotals.monthlyRate)}</div>
            <p className="mt-2 text-xs font-bold leading-5 text-indigo-800">Darlehen plus TG-Sollwerte</p>
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Neues Kaufinteresse</p>
              <h2 className="mt-2 text-xl font-black text-slate-950">{objectName || "Neue Investition"}</h2>
              <p className="mt-1 text-sm font-bold text-slate-600">{location || "Standort noch offen"}</p>
            </div>
            <span className={`inline-flex w-fit rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${
              canExportReport ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            }`}>
              {canExportReport ? "Export bereit" : "Daten ergänzen"}
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Kaufpreis</p>
              <p className="mt-2 text-lg font-black text-slate-950">{formatEuro(investmentCalculation.purchase)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Cashflow nach Steuer</p>
              <p className={`mt-2 text-lg font-black ${investmentCalculation.realCashflowAfterTax >= 0 ? "text-emerald-800" : "text-rose-800"}`}>
                {formatSignedEuroMonthly(investmentCalculation.realCashflowAfterTax)}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Vermögensaufbau</p>
              <p className="mt-2 text-lg font-black text-slate-950">{formatEuroMonthly(investmentCalculation.monthlyWealthBuild)}</p>
            </div>
          </div>
        </div>
      </section>
      <SectionPanel
        eyebrow="Quelle: Immobilien Vermögen Seite"
        title="Immobilienbestand als Vermögensnachweis"
        description="Diese Übersicht übernimmt automatisch die aktuellen Daten aus Immobilienvermögen. Änderungen an Marktwert, Restschuld, Rate oder Stammdaten werden hier als Vermögensnachweis für Bank und Finanzierungsprüfung weiterverwendet."
      >
        <div className="mb-4 flex flex-col gap-3 rounded-[18px] border border-teal-100 bg-teal-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-teal-700">Single Source</p>
            <p className="mt-1 text-sm font-bold leading-6 text-teal-900">
              Pflege nur unter Immobilienvermögen. Dieser Investment-Bereich ist der lesende Vermögensnachweis.
            </p>
          </div>
          <Link
            to="/immobilienvermoegen"
            className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#356778] px-4 py-2 text-sm font-black text-white no-underline shadow-sm"
          >
            Immobilienvermögen öffnen
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {investmentWealthCards.map((card) => (
            <Link
              key={card.id}
              to={`/immobilienvermoegen/${encodeURIComponent(card.id)}`}
              className="group grid min-h-[178px] overflow-hidden rounded-[18px] border border-slate-200 bg-white text-slate-950 no-underline shadow-[0_12px_28px_rgba(51,65,85,0.07)] transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-[0_18px_42px_rgba(51,65,85,0.10)] sm:grid-cols-[116px_1fr]"
            >
              <div className="flex min-h-[96px] items-center justify-center bg-orange-100 text-orange-600">
                <Building2 size={38} strokeWidth={1.9} />
              </div>
              <div className="grid gap-4 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-lg font-black text-slate-950">{card.name}</h2>
                    <p className="mt-1 text-sm font-bold leading-6 text-slate-500">{card.address}</p>
                    {card.isRosenstein ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-blue-700">3 TG-Stellplätze</span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-600">Status aus Immobilienvermögen</span>
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
                    <b>{formatCurrencyExact(card.marketValue)}</b>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-bold text-slate-500">Restschuld</span>
                    <b>{formatCurrencyExact(card.remainingDebt)}</b>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-bold text-slate-500">{card.isRosenstein ? "Soll TG mtl." : "mtl. Rate"}</span>
                    <b>{formatCurrencyExact(card.monthlyRate)}</b>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm font-black text-[#255f6f]">
                  <ShieldCheck size={17} /> Detailmaske öffnen
                </div>
              </div>
            </Link>
          ))}
        </div>
      </SectionPanel>
      </>
      ) : null}

      {activeSection === "financing" ? (
      <>
      <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[22px] border border-slate-200 bg-slate-50">
              <img src={logo} alt="Koenen Investment Logo" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Deckblatt</p>
              <h2 className="mt-2 text-2xl font-black text-slate-950">Koenen Investment- und Finanzierungsanalyse</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                Das Deckblatt enthält Logo, Objektadresse, Kaufpreis, Bearbeitungsdatum, Berichtsstatus und Empfängergruppe. Die fachliche Analyse wird über das geschützte KI-Backend aus den hochgeladenen Unterlagen erstellt.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Name der Investition
              <input value={objectName} onChange={(event) => setObjectName(event.target.value)} className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-950 outline-none focus:border-slate-400" />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Standort
              <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="z.B. Innenstadt, Stadtteil, PLZ" className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-950 outline-none focus:border-slate-400" />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Einheiten
              <input value={unitDescription} onChange={(event) => setUnitDescription(event.target.value)} placeholder="z.B. Wohnung + Stellplatz" className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-950 outline-none focus:border-slate-400" />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Kaufpreis
              <input value={purchasePrice} onChange={(event) => setPurchasePrice(event.target.value)} placeholder="z.B. 305.000 EUR" className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-950 outline-none focus:border-slate-400" />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Bankdarlehen
              <input value={loanAmount} onChange={(event) => setLoanAmount(event.target.value)} placeholder="z.B. 135.000 EUR" className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-950 outline-none focus:border-slate-400" />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Käuferprovision
              <input value={buyerProvision} onChange={(event) => setBuyerProvision(event.target.value)} placeholder="z.B. 5.000 EUR" className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-950 outline-none focus:border-slate-400" />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Eigenkapital
              <input value={equity} onChange={(event) => setEquity(event.target.value)} placeholder="z.B. 60.000 EUR" className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-950 outline-none focus:border-slate-400" />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Kaltmiete / Zielmiete
              <input value={targetRent} onChange={(event) => setTargetRent(event.target.value)} placeholder="z.B. 1.250 EUR kalt monatlich" className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-950 outline-none focus:border-slate-400" />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Kaltmiete Wohnung
              <input value={apartmentRent} onChange={(event) => setApartmentRent(event.target.value)} placeholder="z.B. 480 EUR" className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-950 outline-none focus:border-slate-400" />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Kaltmiete Stellplatz
              <input value={parkingRent} onChange={(event) => setParkingRent(event.target.value)} placeholder="z.B. 60 EUR" className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-950 outline-none focus:border-slate-400" />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Nebenkostenvorauszahlung
              <input value={nkPrepayment} onChange={(event) => setNkPrepayment(event.target.value)} placeholder="z.B. 240 EUR" className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-950 outline-none focus:border-slate-400" />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Wohnfläche
              <input value={livingArea} onChange={(event) => setLivingArea(event.target.value)} placeholder="z.B. 41 m²" className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-950 outline-none focus:border-slate-400" />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Zimmer
              <input value={rooms} onChange={(event) => setRooms(event.target.value)} placeholder="z.B. 2" className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-950 outline-none focus:border-slate-400" />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Hausgeld monatlich
              <input value={monthlyHousegeld} onChange={(event) => setMonthlyHousegeld(event.target.value)} placeholder="z.B. 260 EUR" className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-950 outline-none focus:border-slate-400" />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Sollzins
              <input value={interestRate} onChange={(event) => setInterestRate(event.target.value)} placeholder="z.B. 3,50 %" className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-950 outline-none focus:border-slate-400" />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Tilgung
              <input value={amortizationRate} onChange={(event) => setAmortizationRate(event.target.value)} placeholder="z.B. 2,00 %" className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-950 outline-none focus:border-slate-400" />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Monatliche Bankrate
              <input value={monthlyBankRate} onChange={(event) => setMonthlyBankRate(event.target.value)} placeholder="z.B. 621 EUR" className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-950 outline-none focus:border-slate-400" />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Persönlicher Steuersatz
              <input value={personalTaxRate} onChange={(event) => setPersonalTaxRate(event.target.value)} placeholder="z.B. 44,30 %" className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-950 outline-none focus:border-slate-400" />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Mietsteigerung p.a.
              <input value={plannedRentIncreaseRate} onChange={(event) => setPlannedRentIncreaseRate(event.target.value)} placeholder="z.B. 2,00 %" className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-950 outline-none focus:border-slate-400" />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Instandhaltung pauschal
              <input value={additionalMaintenance} onChange={(event) => setAdditionalMaintenance(event.target.value)} placeholder="z.B. 30 EUR" className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-950 outline-none focus:border-slate-400" />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Nicht umlagefähiges Hausgeld
              <input value={nonDeductibleHousegeld} onChange={(event) => setNonDeductibleHousegeld(event.target.value)} placeholder="z.B. 40 EUR" className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-950 outline-none focus:border-slate-400" />
            </label>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Berichtsreife</p>
            <div className="mt-3 text-3xl font-black text-emerald-900">{readiness}%</div>
            <p className="mt-2 text-sm font-bold leading-6 text-emerald-800">
              Dokumentenabdeckung auf Basis der Dateinamen. ZIP-Pakete zählen als vorhandene, aber noch zu prüfende Unterlagenbasis.
            </p>
            <button
              type="button"
              onClick={startAiEvaluation}
              disabled={aiStatus === "running"}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 py-2 text-sm font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {aiStatus === "running" ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}
              KI-Bewertung starten
            </button>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Bankpaket</p>
            <div className="mt-3 grid gap-2 text-sm font-bold text-slate-700">
              <div className="flex items-center gap-2"><ShieldCheck size={17} /> konservative Annahmen</div>
              <div className="flex items-center gap-2"><Banknote size={17} /> Finanzierungssicht</div>
              <div className="flex items-center gap-2"><Mail size={17} /> Berater-Versand vorbereiten</div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setCalculationOpen((open) => !open)}
          className="flex w-full flex-col gap-3 px-5 py-5 text-left sm:flex-row sm:items-center sm:justify-between md:px-6"
          aria-expanded={calculationOpen}
        >
          <span className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <Calculator size={20} />
            </span>
            <span>
              <span className="block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Koenen Investment- und Finanzierungsanalyse</span>
              <span className="mt-1 block text-lg font-black text-slate-950">Realer Cashflow, Nebenkosten, Steuer und Vermögensaufbau</span>
            </span>
          </span>
          <ChevronDown className={`shrink-0 text-slate-500 transition ${calculationOpen ? "rotate-180" : ""}`} size={22} />
        </button>

        {calculationOpen ? (
          <div className="border-t border-slate-200 p-5 md:p-6">
            <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
              <div className="grid gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Realer Cashflow nach Steuern</p>
                  <p className={`mt-3 text-3xl font-black ${investmentCalculation.realCashflowAfterTax >= 0 ? "text-emerald-800" : "text-rose-800"}`}>
                    {formatSignedEuroMonthly(investmentCalculation.realCashflowAfterTax)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Eigenkapitalbedarf</p>
                    <p className="mt-2 text-lg font-black text-slate-950">{formatEuro(investmentCalculation.requiredEquity)}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Monatlicher Aufbau</p>
                    <p className="mt-2 text-lg font-black text-slate-950">{formatEuroMonthly(investmentCalculation.monthlyWealthBuild)}</p>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="grid grid-cols-[1.1fr_0.9fr] bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                  <span>Position</span>
                  <span className="text-right">Wert</span>
                </div>
                {[
                  ["Kaufpreis", formatEuro(investmentCalculation.purchase)],
                  ["Bankdarlehen", formatEuro(investmentCalculation.loan)],
                  ["Sollzins", formatPercent(investmentCalculation.interest)],
                  ["Tilgung", formatPercent(investmentCalculation.amortization)],
                  ["Monatliche Bankrate", formatEuroMonthly(investmentCalculation.bankRate)],
                  ["Persönlicher Steuersatz", formatPercent(investmentCalculation.taxRate)],
                  ["Grunderwerbsteuer 5 %", formatEuro(investmentCalculation.transferTax)],
                  ["Notar 2 %", formatEuro(investmentCalculation.notary)],
                  ["Makler / Käuferprovision", formatEuro(investmentCalculation.broker)],
                  ["Kaltmiete Wohnung + Stellplatz", formatEuroMonthly(investmentCalculation.monthlyIncome)],
                  ["Nebenkostenvorauszahlung", formatEuroMonthly(investmentCalculation.nkAdvance)],
                  ["Gesamteinnahmen warm", formatEuroMonthly(investmentCalculation.warmIncome)],
                  ["Hausgeld / Mietvoranschlag", formatEuroMonthly(investmentCalculation.housegeld)],
                  ["Mietausfallwagnis 2 %", formatEuroMonthly(investmentCalculation.rentLossRisk)],
                  ["Zusätzliche Instandhaltung", formatEuroMonthly(investmentCalculation.maintenance)],
                  ["Gebäudeabschreibung AfA", formatEuroMonthly(investmentCalculation.depreciation)],
                  ["Steuerliches Ergebnis", formatSignedEuroMonthly(investmentCalculation.taxableResult)],
                  ["Steuererstattung indikativ", formatEuroMonthly(investmentCalculation.taxRefund)],
                  ["Restschuld nach 10 Jahren", formatEuro(investmentCalculation.tenYearRemainingLoan)],
                  ["EK-Rendite p.a. nach 10 Jahren", formatPercent(investmentCalculation.equityReturnPa)],
                ].map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[1.1fr_0.9fr] border-t border-slate-100 px-4 py-3 text-sm">
                    <span className="font-bold text-slate-600">{label}</span>
                    <span className="text-right font-black text-slate-950">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </section>
      </>
      ) : null}

      {activeSection === "checklist" ? (
      <>
      <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <SectionPanel
          eyebrow="Unterlagen"
          title="Dokumente hochladen"
          description="Wähle Exposé, PDF-Unterlagen, Bilder, Grundrisse und Finanzierungsdaten aus. Erst beim Klick auf KI-Bewertung werden die Dateien an das geschützte KI-Backend übertragen."
        >
          <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-[22px] border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-slate-400 hover:bg-white">
            <Upload size={28} className="text-slate-700" />
            <span className="mt-3 text-base font-black text-slate-950">Unterlagen auswählen</span>
            <span className="mt-1 text-sm font-semibold text-slate-600">PDF, DOCX, XLSX, JPG, PNG oder ZIP</span>
            <input
              type="file"
              multiple
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip"
              onChange={(event) => {
                const selected = Array.from(event.target.files ?? []).map((file) => ({
                  id: createFileId(file),
                  name: file.name,
                  size: file.size,
                  type: file.type,
                  file,
                }));
                setFiles((current) => [...current, ...selected]);
                setAiStatus("idle");
                setAiReport(null);
                setAiError("");
                event.target.value = "";
              }}
            />
          </label>

          {files.length ? (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={clearFiles}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-black text-rose-700"
              >
                <Trash2 size={15} />
                Alle Dateien löschen
              </button>
            </div>
          ) : null}

          <div className="mt-5 grid gap-3">
            {files.length ? files.map((file) => (
              <div key={file.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <FileText size={18} className="shrink-0 text-slate-500" />
                  <span className="truncate text-sm font-black text-slate-900">{file.name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs font-black text-slate-500">{formatFileSize(file.size)}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(file.id)}
                    aria-label={`${file.name} löschen`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-100 bg-rose-50 text-rose-700 transition hover:bg-rose-100"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-bold text-slate-600">
                Noch keine Unterlagen ausgewählt.
              </div>
            )}
          </div>
        </SectionPanel>

        <SectionPanel
          eyebrow="Checkliste"
          title="Dokumentenprüfung"
          description="Die Checkliste zeigt, welche Quellen für einen bankfähigen Erstbericht typischerweise notwendig sind."
        >
          <div className="grid gap-3">
            {coveredDocuments.map((document) => (
              <div key={document.label} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <CheckCircle2 className={
                  document.coverage === "direct"
                    ? "mt-0.5 shrink-0 text-emerald-600"
                    : document.coverage === "package"
                      ? "mt-0.5 shrink-0 text-amber-500"
                      : "mt-0.5 shrink-0 text-slate-300"
                } size={20} />
                <div>
                  <div className="text-sm font-black text-slate-950">{document.label}</div>
                  <div className="mt-1 text-xs font-semibold leading-5 text-slate-600">{document.examples}</div>
                  {document.coverage === "package" ? (
                    <div className="mt-2 inline-flex rounded-full bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-amber-700">
                      Im ZIP-Paket prüfen
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </SectionPanel>
      </section>
      </>
      ) : null}

      {activeSection === "persons" || activeSection === "checklist" ? (
      <section className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        {activeSection === "persons" ? (
        <SectionPanel
          eyebrow="Finanzierung"
          title="Personenprofile"
          description="Diese Daten werden im Bankbericht als Vorbereitung für die erste Finanzierungsprüfung dokumentiert."
        >
          <div className="grid gap-4">
            {persons.map((person) => (
              <div key={person.id} className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <label className="grid gap-2 text-sm font-black text-slate-700">
                  Person
                  <input value={person.name} onChange={(event) => updatePerson(person.id, "name", event.target.value)} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 font-semibold text-slate-950 outline-none focus:border-slate-400" />
                </label>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                    Einnahmen
                    <input value={person.income} onChange={(event) => updatePerson(person.id, "income", event.target.value)} placeholder="monatlich / jährlich" className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold normal-case tracking-normal text-slate-950 outline-none focus:border-slate-400" />
                  </label>
                  <label className="grid gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                    Ausgaben
                    <input value={person.expenses} onChange={(event) => updatePerson(person.id, "expenses", event.target.value)} placeholder="Fixkosten, Raten" className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold normal-case tracking-normal text-slate-950 outline-none focus:border-slate-400" />
                  </label>
                  <label className="grid gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                    Vermögen
                    <input value={person.assets} onChange={(event) => updatePerson(person.id, "assets", event.target.value)} placeholder="Guthaben, Bestand" className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold normal-case tracking-normal text-slate-950 outline-none focus:border-slate-400" />
                  </label>
                  <label className="grid gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                    Verbindlichkeiten
                    <input value={person.liabilities} onChange={(event) => updatePerson(person.id, "liabilities", event.target.value)} placeholder="Darlehen, sonstige Pflichten" className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold normal-case tracking-normal text-slate-950 outline-none focus:border-slate-400" />
                  </label>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addPerson}
            className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-950 shadow-sm"
          >
            <UserPlus size={17} />
            Weitere Person hinzufügen
          </button>
        </SectionPanel>
        ) : null}

        {activeSection === "checklist" ? (
        <SectionPanel
          eyebrow="Checkliste"
          title="Finanzierungsvorbereitung"
          description="Interaktive Prüfpunkte für den Bankexport. Abgehakte Punkte erscheinen im Bericht als erledigt."
        >
          <div className="mb-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-indigo-700">Fortschritt</p>
            <div className="mt-2 flex items-end justify-between gap-4">
              <span className="text-3xl font-black text-indigo-900">{checklistProgress}%</span>
              <span className="text-sm font-bold text-indigo-800">{checklist.filter((item) => item.checked).length} von {checklist.length} erledigt</span>
            </div>
          </div>
          <div className="grid gap-3">
            {checklist.map((item) => (
              <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => toggleChecklistItem(item.id)}
                  className="mt-1 h-5 w-5 rounded border-slate-300 text-slate-950"
                />
                <span>
                  <span className="block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{item.category}</span>
                  <span className="mt-1 block text-sm font-bold leading-5 text-slate-800">{item.text}</span>
                </span>
              </label>
            ))}
          </div>
        </SectionPanel>
        ) : null}
      </section>
      ) : null}

      {activeSection === "export" ? (
      <>
      <SectionPanel
        eyebrow="KI-Erstbewertung"
        title="Direkte Bewertung in der App"
        description="Mit einem Klick erstellt die App eine strukturierte Vorbewertung ohne zusätzliches ChatGPT-Fenster. Die Analyse kommt aus dem geschützten Supabase-KI-Backend."
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={startAiEvaluation}
            disabled={aiStatus === "running"}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {aiStatus === "running" ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            KI-Bewertung starten
          </button>
          {aiReportText ? (
            <button
              type="button"
              onClick={() => void copyAiReport()}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-950 shadow-sm"
            >
              <Copy size={18} />
              Ergebnis kopieren
            </button>
          ) : null}
          {aiReport ? (
            <>
              <button
                type="button"
                onClick={downloadWordReport}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-950 shadow-sm"
              >
                <Download size={18} />
                Word herunterladen
              </button>
              <button
                type="button"
                onClick={createPdfReport}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white shadow-sm"
              >
                <FileText size={18} />
                PDF erstellen
              </button>
            </>
          ) : null}
          {copyStatus ? <span className="self-center text-sm font-black text-emerald-700">{copyStatus}</span> : null}
        </div>

        {aiStatus === "running" ? (
          <div className="mt-5 rounded-[22px] border border-blue-100 bg-blue-50 p-5 text-sm font-bold text-blue-800">
            Unterlagen werden an das KI-Backend übertragen und inhaltlich bewertet...
          </div>
        ) : null}

        {aiError ? (
          <div className="mt-5 rounded-[22px] border border-rose-200 bg-rose-50 p-5 text-sm font-bold leading-6 text-rose-800">
            {aiError}
          </div>
        ) : null}

        {aiReport ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{aiReport.statusLabel}</p>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">{aiReport.summary}</p>
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Bankfazit</div>
                <p className="mt-2 text-sm font-black leading-6 text-slate-950">{aiReport.bankFazit}</p>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-5">
                <div className="text-xs font-black uppercase tracking-[0.14em] text-amber-700">Risiken / offene Punkte</div>
                <ul className="mt-3 grid gap-2 text-sm font-semibold leading-6 text-amber-900">
                  {aiReport.risks.map((risk) => <li key={risk}>- {risk}</li>)}
                </ul>
              </div>
              <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 p-5">
                <div className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">Nächste Schritte</div>
                <ul className="mt-3 grid gap-2 text-sm font-semibold leading-6 text-emerald-900">
                  {aiReport.nextSteps.map((step) => <li key={step}>- {step}</li>)}
                </ul>
              </div>
            </div>

            <div className="xl:col-span-2">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {aiReport.chapterStatus.map((item, index) => (
                  <div key={item.chapter} className="rounded-[20px] border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-950 text-xs font-black text-white">{index + 1}</span>
                      <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${
                        item.status === "Bereit"
                          ? "bg-emerald-50 text-emerald-700"
                          : item.status === "Prüfen"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-slate-100 text-slate-600"
                      }`}>
                        {item.status}
                      </span>
                    </div>
                    <h3 className="mt-4 text-sm font-black leading-5 text-slate-950">{item.chapter}</h3>
                    <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{item.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </SectionPanel>

      <SectionPanel
        eyebrow="DOCX"
        title="Berichtskapitel"
        description="Diese Kapitelstruktur wird als Zielstruktur für den KI-Bericht verwendet."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {reportChapters.map((chapter, index) => (
            <div key={chapter} className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-white">
                {index + 1}
              </div>
              <h3 className="mt-4 text-sm font-black leading-5 text-slate-950">{chapter}</h3>
            </div>
          ))}
        </div>
      </SectionPanel>

      <section className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <SectionPanel
          eyebrow="Export"
          title="Bericht herunterladen"
          description="Sobald Objekt und Kaufpreis eingetragen sind, kannst du den Bank-Entwurf als Word-Datei herunterladen oder über den Browser als PDF speichern. Die KI-Bewertung kann den Bericht zusätzlich fachlich vertiefen."
        >
          <div className="grid gap-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-3 text-sm font-black text-slate-950"><Download size={18} /> Word-Bericht</div>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                Erstellt ein Word-kompatibles Dokument mit Deckblatt, Kapitel 1-8, Risiken, nächsten Schritten und Bankfazit.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-3 text-sm font-black text-slate-950"><FileText size={18} /> PDF-Bericht</div>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                Öffnet die druckoptimierte Berichtsversion. Im Druckdialog kannst du “Als PDF sichern” auswählen.
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={downloadWordReport}
              disabled={!canExportReport}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={18} />
              Word herunterladen
            </button>
            <button
              type="button"
              onClick={createPdfReport}
              disabled={!canExportReport}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-950 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileText size={18} />
              PDF erstellen
            </button>
          </div>
          {!canExportReport ? (
            <p className="mt-4 text-sm font-bold text-slate-500">Bitte mindestens Objekt/Adresse und Kaufpreis eintragen, dann wird der Bankexport aktiviert.</p>
          ) : null}
        </SectionPanel>

        <SectionPanel
          eyebrow="Weitergabe"
          title="Bank und Finanzberater"
          description="Nach Erstellung des DOCX/PDF-Berichts kannst du ihn zusammen mit Unterlagen an Bank oder Finanzberater senden."
        >
          <div className="grid gap-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-3 text-sm font-black text-slate-950"><FileArchive size={18} /> Beraterpaket</div>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Bericht, Exposé, Grundriss, Mietvertrag, Wirtschaftsplan, Energieausweis und Finanzierungsannahmen bündeln.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-3 text-sm font-black text-slate-950"><ClipboardCheck size={18} /> Offene Punkte</div>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Fehlende Unterlagen, rechtliche Risiken und Annahmen im Bericht als Prüfliste aufführen.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-3 text-sm font-black text-slate-950"><Image size={18} /> Visuals</div>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Objektbilder, Lage, Grundrisse und Bauzeichnungen in Kapitel 3 aufnehmen.</p>
            </div>
          </div>
          <a
            href={`mailto:?subject=${encodeURIComponent(`Finanzierungsprüfung ${objectName || "Immobilieninvestment"}`)}&body=${mailBody}`}
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-950 no-underline shadow-sm"
          >
            <Mail size={18} />
            E-Mail an Bank/Finanzberater vorbereiten
          </a>
        </SectionPanel>
      </section>
      </>
      ) : null}
    </div>
  );
}
