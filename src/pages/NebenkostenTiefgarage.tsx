import { useEffect, useMemo, useState, type CSSProperties } from "react";
import brandLogo from "../assets/koenen-brand-logo.webp";
import { listNkRelevantEntries, type NkRelevantEntry } from "../services/nkRelevantService";
import { supabase } from "../lib/supabase";

type AllocationKey = "Einheiten" | "Verbrauch/Direkt" | "Direktbetrag";
type TgWorkflowStatus = "Offen" | "In Arbeit" | "In Prüfung" | "Freigegeben" | "Korrigiert";

type CostRow = {
  id: string;
  label: string;
  totalCost: number;
  key: AllocationKey;
  totalUnits: number | null;
  yourUnits: number | null;
  note: string;
  autoMode?: "annualHausgeld";
  sourceTotalCost?: number;
  reportAllocationLabel?: string;
};

type BillingYearData = {
  recordId: string;
  unitCode: string;
  year: number;
  finalized?: boolean;
  finalizedAt?: string;
  workflowStatus: TgWorkflowStatus;
  propertyLabel: string;
  unitLabel: string;
  periodFrom: string;
  periodTo: string;
  monthlyHausgeld: number;
  tenantPrepayments: number;
  landlordName: string;
  landlordAddress: string;
  landlordBankAccountHolder: string;
  landlordIban: string;
  landlordBic: string;
  landlordBankName: string;
  tenantName: string;
  tenantAddress: string;
  recipientSalutation: string;
  documentDate: string;
  totalUnits: number;
  yourUnits: number;
  footerNote: string;
  attachmentNotes: string;
  wegStatementPeriodFrom?: string;
  wegStatementPeriodTo?: string;
  wegStatementTotal?: number;
  wegOwnerPrepayments?: number;
  wegApportionableOffset?: number;
  wegNonApportionableOffset?: number;
  wegReserveOffset?: number;
  wegOwnerSettlement?: number;
  wegOwnerSettlementStatus?: "open" | "paid";
  wegOwnerSettlementPaidAt?: string;
  wegApportionableTotal?: number;
  wegNonApportionableTotal?: number;
  wegReserveTotal?: number;
  section35aLaborShare?: number;
  apportionableRows: CostRow[];
  nonApportionableRows: CostRow[];
};

type StoredPayload = {
  records: BillingYearData[];
};

type TgTenantContractRow = {
  id: string;
  object_code: string | null;
  unit_label: string | null;
  start_date: string | null;
  end_date: string | null;
  tenant_profiles?: {
    salutation: string | null;
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
    street: string | null;
    postal_code: string | null;
    city: string | null;
  } | null;
};

const STORAGE_KEY = "koenen:tiefgarage-nebenkosten:v1";
const BILLING_TABLE = "apartment_billing_workspaces";
const BILLING_OBJECT_ID = "rosenstein-str-25-tiefgarage";
const BILLING_SCOPE = "all";

const TG_WORKFLOW_STATUSES: TgWorkflowStatus[] = ["Offen", "In Arbeit", "In Prüfung", "Freigegeben", "Korrigiert"];

function normalizeWorkflowStatus(value: unknown, finalized = false): TgWorkflowStatus {
  const normalized = String(value ?? "").trim().toLocaleLowerCase("de-DE");
  if (normalized === "in arbeit") return "In Arbeit";
  if (normalized === "in prüfung" || normalized === "in pruefung") return "In Prüfung";
  if (normalized === "freigegeben") return "Freigegeben";
  if (normalized === "korrigiert") return "Korrigiert";
  return finalized ? "Freigegeben" : "Offen";
}

function workflowStatusTheme(status: TgWorkflowStatus) {
  if (status === "In Arbeit") return { background: "#dbeafe", color: "#1d4ed8", border: "#93c5fd" };
  if (status === "In Prüfung") return { background: "#fef3c7", color: "#92400e", border: "#fcd34d" };
  if (status === "Freigegeben") return { background: "#dcfce7", color: "#166534", border: "#86efac" };
  if (status === "Korrigiert") return { background: "#f3e8ff", color: "#7e22ce", border: "#d8b4fe" };
  return { background: "#f1f5f9", color: "#475569", border: "#cbd5e1" };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const pageStyles: Record<string, CSSProperties> = {
  page: {
    maxWidth: 1320,
    margin: "0 auto",
    padding: 24,
  },
  hero: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.6fr) minmax(320px, 0.9fr)",
    gap: 20,
    alignItems: "stretch",
    marginBottom: 24,
  },
  heroCard: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 24,
    padding: 28,
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
  },
  heroTitle: {
    margin: 0,
    fontSize: 30,
    fontWeight: 900,
    color: "#0f172a",
    lineHeight: 1.05,
  },
  heroText: {
    margin: "14px 0 0",
    fontSize: 16,
    lineHeight: 1.6,
    color: "#475569",
  },
  subtleList: {
    margin: "18px 0 0",
    paddingLeft: 18,
    color: "#334155",
    lineHeight: 1.7,
    fontSize: 14,
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },
  summaryCard: {
    borderRadius: 18,
    border: "1px solid #dbe3f0",
    background: "#f8fafc",
    padding: 16,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  summaryValue: {
    marginTop: 8,
    fontSize: 22,
    fontWeight: 900,
    color: "#0f172a",
  },
  section: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 24,
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
    marginBottom: 24,
    overflow: "hidden",
  },
  sectionHeader: {
    padding: "20px 24px",
    borderBottom: "1px solid #e5e7eb",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  sectionTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 900,
    color: "#111827",
  },
  sectionBody: {
    padding: 24,
  },
  inputGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
  },
  inputCard: {
    border: "1px solid #e5e7eb",
    borderRadius: 18,
    padding: 16,
    background: "#f8fafc",
  },
  label: {
    display: "block",
    fontSize: 12,
    fontWeight: 800,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: 8,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    padding: "11px 12px",
    background: "#ffffff",
    color: "#111827",
    fontSize: 14,
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    minHeight: 104,
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    padding: "11px 12px",
    background: "#ffffff",
    color: "#111827",
    fontSize: 14,
    resize: "vertical",
    fontFamily: "inherit",
  },
  button: {
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    padding: "10px 14px",
    background: "#ffffff",
    color: "#111827",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 800,
  },
  primaryButton: {
    border: "1px solid #c7d2fe",
    borderRadius: 12,
    padding: "10px 14px",
    background: "#eef2ff",
    color: "#3730a3",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 800,
  },
  accentButton: {
    border: "1px solid #fecaca",
    borderRadius: 12,
    padding: "10px 14px",
    background: "#fff1f2",
    color: "#b91c1c",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 800,
  },
  recordGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
    gap: 14,
  },
  recordButton: {
    minWidth: 0,
    minHeight: 142,
    border: "1px solid #dbe3ec",
    borderRadius: 18,
    padding: 18,
    background: "#ffffff",
    color: "#0f172a",
    cursor: "pointer",
    textAlign: "left",
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
  },
  activeRecordButton: {
    border: "2px solid #4f46e5",
    padding: 17,
    background: "linear-gradient(145deg, #eef2ff 0%, #ffffff 72%)",
    boxShadow: "0 8px 20px rgba(79, 70, 229, 0.10)",
  },
  recordButtonTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 14,
  },
  recordUnit: {
    fontSize: 21,
    lineHeight: 1.2,
    fontWeight: 900,
  },
  recordYear: {
    marginTop: 4,
    fontSize: 13,
    color: "#64748b",
    fontWeight: 700,
  },
  statusBadge: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "4px 7px",
    fontSize: 9,
    lineHeight: 1,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.035em",
    whiteSpace: "nowrap",
  },
  managementGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 16,
  },
  managementPanel: {
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    padding: 18,
    background: "#f8fafc",
  },
  managementFields: {
    display: "grid",
    gridTemplateColumns: "minmax(105px, 0.7fr) minmax(120px, 1fr)",
    gap: 10,
    marginTop: 14,
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 980,
  },
  th: {
    textAlign: "left",
    padding: "12px 10px",
    fontSize: 12,
    fontWeight: 900,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    borderBottom: "1px solid #e5e7eb",
    background: "#f8fafc",
    verticalAlign: "top",
  },
  td: {
    padding: "12px 10px",
    borderBottom: "1px solid #e5e7eb",
    verticalAlign: "top",
  },
  amountCell: {
    fontWeight: 800,
    color: "#0f172a",
    whiteSpace: "nowrap",
  },
  mutedText: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 1.5,
  },
  onePager: {
    maxWidth: 900,
    margin: "0 auto",
    border: "1px solid #dbe3f0",
    borderRadius: 18,
    padding: 36,
    background: "#ffffff",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)",
  },
  onePagerTitle: {
    margin: 0,
    fontSize: 24,
    fontWeight: 900,
    color: "#0f172a",
  },
  onePagerSubTitle: {
    margin: "10px 0 0",
    fontSize: 15,
    color: "#475569",
    lineHeight: 1.6,
  },
  onePagerMeta: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 24,
    marginTop: 20,
    marginBottom: 22,
  },
  onePagerBox: {
    border: "none",
    borderRadius: 0,
    padding: 0,
    background: "transparent",
  },
  onePagerTable: {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: 14,
  },
  onePagerFooter: {
    marginTop: 28,
    borderTop: "1px solid #e5e7eb",
    paddingTop: 18,
    fontSize: 14,
    lineHeight: 1.7,
    color: "#334155",
  },
};

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatDate(value: string) {
  if (!value) return "—";

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function monthsInclusive(periodFrom: string, periodTo: string) {
  if (!periodFrom || !periodTo) return 12;

  const from = new Date(`${periodFrom}T00:00:00`);
  const to = new Date(`${periodTo}T00:00:00`);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return 12;

  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1;
}

function daysInclusive(periodFrom: string, periodTo: string) {
  if (!periodFrom || !periodTo) return 0;
  const from = new Date(`${periodFrom}T00:00:00Z`);
  const to = new Date(`${periodTo}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return 0;
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

function todayIsoDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

const PARKING_REFERENCES: Record<string, string> = {
  P250: "E008440000121",
  P253: "E008440000122",
  P254: "E008440000123",
};

function normalizeUnitCode(value: unknown): string {
  const match = String(value ?? "").toUpperCase().match(/P(?:250|253|254)/);
  return match?.[0] ?? "P250";
}

function contractMatchesBillingPeriod(
  contract: TgTenantContractRow,
  unitCode: string,
  periodFrom: string,
  periodTo: string,
): boolean {
  if (!contract.start_date || contract.start_date > periodTo) return false;
  if (contract.end_date && contract.end_date < periodFrom) return false;
  const reference = PARKING_REFERENCES[unitCode] ?? "";
  const contractUnit = `${contract.unit_label ?? ""} ${contract.object_code ?? ""}`.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const aliases: Record<string, string[]> = {
    P250: ["P250", "E008440000121", "GARAGE1", "STELLPLATZ1"],
    P253: ["P253", "E008440000122", "GARAGE2", "STELLPLATZ2"],
    P254: ["P254", "E008440000123", "GARAGE3", "STELLPLATZ3"],
  };
  return (aliases[unitCode] ?? [unitCode, reference]).filter(Boolean).some((alias) => contractUnit.includes(alias));
}

function tenantFieldsFromContract(contract: TgTenantContractRow) {
  const tenant = contract.tenant_profiles;
  if (!tenant) return null;
  const tenantName = tenant.company_name?.trim() || [tenant.first_name, tenant.last_name].filter(Boolean).join(" ").trim();
  if (!tenantName) return null;
  const tenantAddress = [tenant.street, [tenant.postal_code, tenant.city].filter(Boolean).join(" ")]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join("\n");
  const salutation = String(tenant.salutation ?? "").trim().toLocaleLowerCase("de-DE");
  const lastName = String(tenant.last_name ?? "").trim();
  const recipientSalutation = tenant.company_name?.trim()
    ? "Sehr geehrte Damen und Herren,"
    : salutation === "herr" && lastName
      ? `Sehr geehrter Herr ${lastName},`
      : salutation === "frau" && lastName
        ? `Sehr geehrte Frau ${lastName},`
        : lastName
          ? `Guten Tag Herr/Frau ${lastName},`
          : "Sehr geehrte Damen und Herren,";
  return { tenantName, tenantAddress, recipientSalutation };
}

function unitCodeFromRecord(record: Partial<BillingYearData>): string {
  return normalizeUnitCode(`${record.unitCode ?? ""} ${record.unitLabel ?? ""} ${record.propertyLabel ?? ""}`);
}

function buildDefaultYear(year: number, requestedUnitCode = "P250"): BillingYearData {
  const unitCode = normalizeUnitCode(requestedUnitCode);
  const reference = PARKING_REFERENCES[unitCode] ?? "";
  return {
    recordId: `${unitCode.toLowerCase()}-${year}`,
    unitCode,
    year,
    finalized: false,
    finalizedAt: "",
    workflowStatus: "Offen",
    propertyLabel: `Rosenstein Str. 25 · ${unitCode}${reference ? ` · ${reference}` : ""}`,
    unitLabel: `Tiefgaragenstellplatz ${unitCode}`,
    periodFrom: year === 2025 ? `${year}-11-14` : `${year}-01-01`,
    periodTo: `${year}-12-31`,
    monthlyHausgeld: 0,
    tenantPrepayments: 0,
    landlordName: "Nihal Könen",
    landlordAddress: "Hohenloher Str. 78/1\n74243 Langenbrettach",
    landlordBankAccountHolder: "Nihal Könen",
    landlordIban: "",
    landlordBic: "",
    landlordBankName: "",
    tenantName: "",
    tenantAddress: "",
    recipientSalutation: "Sehr geehrte Damen und Herren,",
    documentDate: todayIsoDate(),
    totalUnits: 1,
    yourUnits: 1,
    footerNote:
      "Bitte prüfen Sie die Werte vor dem Versand. Diese Seite ist als kompakter Onepager für den Mieter gedacht.",
    attachmentNotes: "",
    wegStatementPeriodFrom: "",
    wegStatementPeriodTo: "",
    wegStatementTotal: 0,
    wegOwnerPrepayments: 0,
    wegApportionableOffset: 0,
    wegNonApportionableOffset: 0,
    wegReserveOffset: 0,
    wegOwnerSettlement: 0,
    wegOwnerSettlementStatus: "open",
    wegOwnerSettlementPaidAt: "",
    wegApportionableTotal: 0,
    wegNonApportionableTotal: 0,
    wegReserveTotal: 0,
    section35aLaborShare: 0,
    apportionableRows: [
      {
        id: `${unitCode.toLowerCase()}-${year}-hausgeld`,
        label: "Hausgeld / TG (Jahressumme)",
        totalCost: 0,
        key: "Einheiten",
        totalUnits: null,
        yourUnits: null,
        note: "Wird automatisch aus dem monatlichen Hausgeld berechnet.",
        autoMode: "annualHausgeld",
      },
      {
        id: `${unitCode.toLowerCase()}-${year}-strom`,
        label: "Strom / Beleuchtung",
        totalCost: 0,
        key: "Einheiten",
        totalUnits: null,
        yourUnits: null,
        note: "Optional",
      },
      {
        id: `${unitCode.toLowerCase()}-${year}-sonstiges`,
        label: "Reinigung / Sonstiges",
        totalCost: 0,
        key: "Einheiten",
        totalUnits: null,
        yourUnits: null,
        note: "Optional",
      },
    ],
    nonApportionableRows: [
      {
        id: `${unitCode.toLowerCase()}-${year}-ruecklage`,
        label: "Rücklage / Instandhaltung",
        totalCost: 0,
        key: "Direktbetrag",
        totalUnits: null,
        yourUnits: null,
        note: "Nur interne Übersicht",
      },
      {
        id: `${unitCode.toLowerCase()}-${year}-verwaltung`,
        label: "Verwaltung",
        totalCost: 0,
        key: "Direktbetrag",
        totalUnits: null,
        yourUnits: null,
        note: "Nur interne Übersicht",
      },
    ],
  };
}

function loadLegacyStoredYears(): BillingYearData[] {
  if (typeof window === "undefined") {
    return [buildDefaultYear(new Date().getFullYear())];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [buildDefaultYear(new Date().getFullYear())];

    const parsed = JSON.parse(raw) as StoredPayload;
    if (!parsed || !Array.isArray(parsed.records) || parsed.records.length === 0) {
      return [buildDefaultYear(new Date().getFullYear())];
    }

    return normalizeBillingRecords(parsed.records);
  } catch (error) {
    console.error("Nebenkosten-TG localStorage konnte nicht gelesen werden", error);
    return [buildDefaultYear(new Date().getFullYear())];
  }
}

function normalizeStoredYears(value: unknown): BillingYearData[] {
  const parsed = value as Partial<StoredPayload> | null;
  if (!parsed || !Array.isArray(parsed.records) || parsed.records.length === 0) return [];
  return normalizeBillingRecords(parsed.records);
}

function normalizeBillingRecords(records: Array<Partial<BillingYearData>>): BillingYearData[] {
  return records
    .map((record) => {
      const year = toNumber(record.year, new Date().getFullYear());
      const unitCode = unitCodeFromRecord(record);
      return {
        ...buildDefaultYear(year, unitCode),
        ...record,
        recordId: String(record.recordId ?? `${unitCode.toLowerCase()}-${year}`),
        unitCode,
        workflowStatus: normalizeWorkflowStatus(record.workflowStatus, Boolean(record.finalized)),
      };
    })
    .sort((a, b) => a.year - b.year || a.unitCode.localeCompare(b.unitCode));
}

function deriveRowTotalCost(row: CostRow, yearData: BillingYearData) {
  if (row.autoMode === "annualHausgeld") {
    return roundMoney(yearData.monthlyHausgeld * monthsInclusive(yearData.periodFrom, yearData.periodTo));
  }

  return roundMoney(toNumber(row.totalCost));
}

function deriveRowShare(row: CostRow, yearData: BillingYearData) {
  const totalCost = deriveRowTotalCost(row, yearData);

  if (row.key === "Direktbetrag" || row.key === "Verbrauch/Direkt") {
    return totalCost;
  }

  const totalUnits = row.totalUnits ?? yearData.totalUnits;
  const yourUnits = row.yourUnits ?? yearData.yourUnits;

  if (!totalUnits || totalUnits <= 0) return 0;
  return roundMoney((totalCost / totalUnits) * yourUnits);
}

function BillingRecordButton(props: {
  active: boolean;
  record: BillingYearData;
  onClick: () => void;
}) {
  const statusText = normalizeWorkflowStatus(props.record.workflowStatus, Boolean(props.record.finalized));
  const statusTheme = workflowStatusTheme(statusText);

  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.active}
      aria-label={`${props.record.unitCode}, Abrechnungsjahr ${props.record.year}, ${statusText}`}
      style={{
        ...pageStyles.recordButton,
        ...(props.active ? pageStyles.activeRecordButton : null),
      }}
    >
      <span style={pageStyles.recordButtonTop}>
        <span style={{ fontSize: 10, fontWeight: 900, color: props.active ? "#4338ca" : "#64748b", letterSpacing: "0.08em" }}>
          STELLPLATZ
        </span>
        {props.active ? (
          <span style={{ ...pageStyles.statusBadge, background: "#eef2ff", color: "#4338ca", border: "1px solid #c7d2fe" }}>
            Aktiv
          </span>
        ) : null}
      </span>
      <span style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span>
          <span style={{ display: "block", ...pageStyles.recordUnit }}>{props.record.unitCode}</span>
          <span style={{ display: "block", ...pageStyles.recordYear }}>Abrechnung {props.record.year}</span>
        </span>
        <span
          style={{
            ...pageStyles.statusBadge,
            background: statusTheme.background,
            color: statusTheme.color,
            border: `1px solid ${statusTheme.border}`,
          }}
        >
          {statusText}
        </span>
      </span>
    </button>
  );
}

function RowEditor(props: {
  row: CostRow;
  yearData: BillingYearData;
  onChange: (nextRow: CostRow) => void;
  onDelete: () => void;
}) {
  const rowTotal = deriveRowTotalCost(props.row, props.yearData);
  const share = deriveRowShare(props.row, props.yearData);

  return (
    <tr>
      <td style={pageStyles.td}>
        <input
          style={pageStyles.input}
          value={props.row.label}
          onChange={(event) => props.onChange({ ...props.row, label: event.target.value })}
          placeholder="Kostenart"
        />
        {props.row.note ? <div style={{ ...pageStyles.mutedText, marginTop: 8 }}>{props.row.note}</div> : null}
      </td>
      <td style={pageStyles.td}>
        <input
          style={pageStyles.input}
          type="number"
          step="0.01"
          value={props.row.autoMode === "annualHausgeld" ? rowTotal : props.row.totalCost}
          disabled={props.row.autoMode === "annualHausgeld"}
          onChange={(event) =>
            props.onChange({
              ...props.row,
              totalCost: toNumber(event.target.value),
            })
          }
        />
        <input
          style={{ ...pageStyles.input, marginTop: 8 }}
          type="number"
          step="0.01"
          value={props.row.sourceTotalCost ?? ""}
          onChange={(event) => {
            const raw = event.target.value;
            props.onChange({
              ...props.row,
              sourceTotalCost: raw === "" ? undefined : toNumber(raw),
            });
          }}
          placeholder="WEG-Gesamtkosten (Bericht)"
          aria-label={`WEG-Gesamtkosten für ${props.row.label}`}
        />
      </td>
      <td style={pageStyles.td}>
        <select
          style={pageStyles.input}
          value={props.row.key}
          onChange={(event) =>
            props.onChange({
              ...props.row,
              key: event.target.value as AllocationKey,
            })
          }
        >
          <option value="Einheiten">Einheiten</option>
          <option value="Verbrauch/Direkt">Verbrauch/Direkt</option>
          <option value="Direktbetrag">Direktbetrag</option>
        </select>
        <input
          style={{ ...pageStyles.input, marginTop: 8 }}
          value={props.row.reportAllocationLabel ?? ""}
          onChange={(event) => props.onChange({ ...props.row, reportAllocationLabel: event.target.value })}
          placeholder="Umlageschlüssel im Bericht"
          aria-label={`Umlageschlüssel im Bericht für ${props.row.label}`}
        />
      </td>
      <td style={pageStyles.td}>
        <input
          style={pageStyles.input}
          type="number"
          step="0.01"
          value={props.row.totalUnits ?? ""}
          onChange={(event) => {
            const raw = event.target.value;
            props.onChange({
              ...props.row,
              totalUnits: raw === "" ? null : toNumber(raw),
            });
          }}
          placeholder={`Standard: ${props.yearData.totalUnits}`}
        />
      </td>
      <td style={pageStyles.td}>
        <input
          style={pageStyles.input}
          type="number"
          step="0.01"
          value={props.row.yourUnits ?? ""}
          onChange={(event) => {
            const raw = event.target.value;
            props.onChange({
              ...props.row,
              yourUnits: raw === "" ? null : toNumber(raw),
            });
          }}
          placeholder={`Standard: ${props.yearData.yourUnits}`}
        />
      </td>
      <td style={{ ...pageStyles.td, ...pageStyles.amountCell }}>{formatCurrency(share)}</td>
      <td style={pageStyles.td}>
        <button type="button" style={pageStyles.button} onClick={props.onDelete}>
          Entfernen
        </button>
      </td>
    </tr>
  );
}

function SummaryValue(props: { label: string; value: string; tone?: "default" | "positive" | "danger" }) {
  const toneStyles: Record<string, CSSProperties> = {
    default: { color: "#0f172a" },
    positive: { color: "#166534" },
    danger: { color: "#b91c1c" },
  };

  return (
    <div style={pageStyles.summaryCard}>
      <div style={pageStyles.summaryLabel}>{props.label}</div>
      <div style={{ ...pageStyles.summaryValue, ...(toneStyles[props.tone ?? "default"] ?? null) }}>
        {props.value}
      </div>
    </div>
  );
}

export default function NebenkostenTiefgarage() {
  const initialRecord = useMemo(() => buildDefaultYear(new Date().getFullYear()), []);
  const [records, setRecords] = useState<BillingYearData[]>(() => [initialRecord]);
  const [activeRecordId, setActiveRecordId] = useState<string>(initialRecord.recordId);
  const [newYearInput, setNewYearInput] = useState<string>(String(new Date().getFullYear()));
  const [newUnitInput, setNewUnitInput] = useState<string>("P250");
  const [nkEntries, setNkEntries] = useState<NkRelevantEntry[]>([]);
  const [nkLoading, setNkLoading] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const activeRecord = useMemo(() => {
    return records.find((record) => record.recordId === activeRecordId) ?? records[0] ?? initialRecord;
  }, [records, activeRecordId, initialRecord]);

  useEffect(() => {
    let alive = true;

    async function loadStoredYears() {
      const { data, error } = await supabase
        .from(BILLING_TABLE)
        .select("data")
        .eq("object_id", BILLING_OBJECT_ID)
        .eq("year", BILLING_SCOPE)
        .maybeSingle();
      if (!alive) return;

      if (error) {
        setStorageError(`Zentrale Tiefgaragenabrechnung konnte nicht geladen werden: ${error.message}`);
        setStorageReady(false);
        return;
      }

      const remoteRecords = normalizeStoredYears(data?.data);
      if (remoteRecords.length) {
        setRecords(remoteRecords);
        setActiveRecordId(remoteRecords[0].recordId);
        setStorageReady(true);
        return;
      }

      const legacyRecords = loadLegacyStoredYears();
      const { error: migrationError } = await supabase.from(BILLING_TABLE).upsert({
        object_id: BILLING_OBJECT_ID,
        year: BILLING_SCOPE,
        data: { records: legacyRecords } satisfies StoredPayload,
      }, { onConflict: "object_id,year" });
      if (!alive) return;
      if (migrationError) {
        setStorageError(`Lokale Altdaten konnten nicht zentral übernommen werden: ${migrationError.message}`);
        setStorageReady(false);
        return;
      }
      setRecords(legacyRecords);
      setActiveRecordId(legacyRecords[0]?.recordId ?? initialRecord.recordId);
      try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* Altspeicher kann blockiert sein. */ }
      setStorageReady(true);
    }

    void loadStoredYears();
    return () => {
      alive = false;
    };
  }, [initialRecord.recordId]);

  useEffect(() => {
    if (!storageReady) return;
    const timeout = window.setTimeout(async () => {
      const { error } = await supabase.from(BILLING_TABLE).upsert({
        object_id: BILLING_OBJECT_ID,
        year: BILLING_SCOPE,
        data: { records } satisfies StoredPayload,
      }, { onConflict: "object_id,year" });
      setStorageError(error ? `Zentrale Speicherung fehlgeschlagen: ${error.message}` : "");
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [records, storageReady]);

  useEffect(() => {
    if (!storageReady || !activeRecord.periodFrom || !activeRecord.periodTo) return;
    let cancelled = false;
    const recordId = activeRecord.recordId;
    const unitCode = activeRecord.unitCode;
    const periodFrom = activeRecord.periodFrom;
    const periodTo = activeRecord.periodTo;

    async function syncTenantFromBillingPeriod() {
      const { data, error } = await supabase
        .from("tenant_contracts")
        .select("id,object_code,unit_label,start_date,end_date,tenant_profiles(salutation,first_name,last_name,company_name,street,postal_code,city)")
        .eq("is_deleted", false)
        .lte("start_date", periodTo)
        .order("start_date", { ascending: false, nullsFirst: false });
      if (cancelled || error) return;

      const periodContract = ((data ?? []) as unknown as TgTenantContractRow[])
        .filter((contract) => contractMatchesBillingPeriod(contract, unitCode, periodFrom, periodTo))
        .sort((left, right) => String(right.start_date ?? "").localeCompare(String(left.start_date ?? "")))[0];
      const tenantFields = periodContract ? tenantFieldsFromContract(periodContract) : null;
      if (!tenantFields) return;

      setRecords((current) => current.map((record) => {
        if (record.recordId !== recordId) return record;
        if (
          record.tenantName === tenantFields.tenantName
          && record.tenantAddress === tenantFields.tenantAddress
          && record.recipientSalutation === tenantFields.recipientSalutation
        ) return record;
        return { ...record, ...tenantFields };
      }));
    }

    void syncTenantFromBillingPeriod();
    return () => {
      cancelled = true;
    };
  }, [storageReady, activeRecord.recordId, activeRecord.unitCode, activeRecord.periodFrom, activeRecord.periodTo]);

  useEffect(() => {
    let alive = true;
    async function loadNk() {
      setNkLoading(true);
      try {
        const rows = await listNkRelevantEntries(activeRecord.year);
        if (alive) setNkEntries(rows);
      } catch {
        if (alive) setNkEntries([]);
      } finally {
        if (alive) setNkLoading(false);
      }
    }
    void loadNk();
    return () => {
      alive = false;
    };
  }, [activeRecord.year]);

  const monthCount = monthsInclusive(activeRecord.periodFrom, activeRecord.periodTo);
  const annualHausgeld = roundMoney(activeRecord.monthlyHausgeld * monthCount);

  const apportionableRows = useMemo(
    () =>
      activeRecord.apportionableRows.map((row) => ({
        ...row,
        totalCost: deriveRowTotalCost(row, activeRecord),
      })),
    [activeRecord],
  );

  const apportionableTotal = useMemo(
    () => roundMoney(activeRecord.apportionableRows.reduce((sum, row) => sum + deriveRowShare(row, activeRecord), 0)),
    [activeRecord],
  );

  const nonApportionableTotal = useMemo(
    () => roundMoney(activeRecord.nonApportionableRows.reduce((sum, row) => sum + deriveRowShare(row, activeRecord), 0)),
    [activeRecord],
  );

  const settlementBalance = roundMoney(apportionableTotal - activeRecord.tenantPrepayments);
  const billingDayCount = daysInclusive(activeRecord.periodFrom, activeRecord.periodTo);
  const wegOpenSettlement = activeRecord.wegOwnerSettlementStatus === "paid" ? 0 : toNumber(activeRecord.wegOwnerSettlement);
  const wegOffsetBreakdownTotal = roundMoney(
    toNumber(activeRecord.wegApportionableOffset)
      + toNumber(activeRecord.wegNonApportionableOffset)
      + toNumber(activeRecord.wegReserveOffset),
  );
  const wegEffectiveOffsets = wegOffsetBreakdownTotal > 0
    ? wegOffsetBreakdownTotal
    : toNumber(activeRecord.wegOwnerPrepayments);
  const wegCalculatedSettlement = roundMoney(toNumber(activeRecord.wegStatementTotal) - wegEffectiveOffsets);

  function updateActiveRecord(patch: Partial<BillingYearData>) {
    setRecords((current) =>
      current.map((record) => {
        if (record.recordId !== activeRecord.recordId) return record;

        const currentStatus = normalizeWorkflowStatus(record.workflowStatus, Boolean(record.finalized));
        let nextStatus = patch.workflowStatus ?? currentStatus;
        if (!patch.workflowStatus && currentStatus === "Offen") nextStatus = "In Arbeit";
        if (!patch.workflowStatus && currentStatus === "Freigegeben") nextStatus = "Korrigiert";
        const isReleased = nextStatus === "Freigegeben" || nextStatus === "Korrigiert";

        return {
          ...record,
          ...patch,
          workflowStatus: nextStatus,
          finalized: patch.finalized ?? isReleased,
          finalizedAt: patch.finalizedAt ?? (isReleased ? record.finalizedAt || new Date().toISOString() : ""),
        };
      }),
    );
  }

  function updateWorkflowStatus(workflowStatus: TgWorkflowStatus) {
    const isReleased = workflowStatus === "Freigegeben" || workflowStatus === "Korrigiert";
    updateActiveRecord({
      workflowStatus,
      finalized: isReleased,
      finalizedAt: isReleased ? activeRecord.finalizedAt || new Date().toISOString() : "",
    });
  }

  function updateRow(section: "apportionableRows" | "nonApportionableRows", rowId: string, nextRow: CostRow) {
    updateActiveRecord({
      [section]: activeRecord[section].map((row) => (row.id === rowId ? nextRow : row)),
    } as Partial<BillingYearData>);
  }

  function deleteRow(section: "apportionableRows" | "nonApportionableRows", rowId: string) {
    updateActiveRecord({
      [section]: activeRecord[section].filter((row) => row.id !== rowId),
    } as Partial<BillingYearData>);
  }

  function addRow(section: "apportionableRows" | "nonApportionableRows") {
    const nextRow: CostRow = {
      id: createId(),
      label: "Neue Kostenart",
      totalCost: 0,
      key: section === "apportionableRows" ? "Einheiten" : "Direktbetrag",
      totalUnits: null,
      yourUnits: null,
      note: "",
    };

    updateActiveRecord({
      [section]: [...activeRecord[section], nextRow],
    } as Partial<BillingYearData>);
  }

  function importNkEntriesToTg() {
    const grouped = new Map<string, number>();
    for (const entry of nkEntries) {
      if (entry.entry_type !== "expense") continue;
      const label = entry.category?.trim() || "NK-Buchung";
      grouped.set(label, roundMoney((grouped.get(label) ?? 0) + Math.abs(entry.amount)));
    }

    const rows: CostRow[] = Array.from(grouped.entries()).map(([label, amount]) => ({
      id: createId(),
      label,
      totalCost: amount,
      key: "Einheiten",
      totalUnits: activeRecord.totalUnits || null,
      yourUnits: activeRecord.yourUnits || null,
      note: "Automatisch aus markierten NK-Buchungen übernommen.",
    }));

    if (!rows.length) return;
    updateActiveRecord({ apportionableRows: [...activeRecord.apportionableRows, ...rows] });
  }

  function createNewYear() {
    const nextYear = Math.trunc(toNumber(newYearInput, Number.NaN));
    if (!Number.isFinite(nextYear)) {
      window.alert("Bitte ein gültiges Jahr eingeben.");
      return;
    }

    const targetUnitCode = normalizeUnitCode(newUnitInput);
    const existing = records.find((record) => record.year === nextYear && record.unitCode === targetUnitCode);
    if (existing) {
      setActiveRecordId(existing.recordId);
      return;
    }

    const nextRecord = { ...buildDefaultYear(nextYear, targetUnitCode), workflowStatus: "In Arbeit" as TgWorkflowStatus };
    const nextRecords = [...records, nextRecord].sort((a, b) => a.year - b.year || a.unitCode.localeCompare(b.unitCode));
    setRecords(nextRecords);
    setActiveRecordId(nextRecord.recordId);
  }

  function resetActiveYear() {
    const shouldReset = window.confirm(`Möchtest du die Daten für ${activeRecord.year} wirklich zurücksetzen?`);
    if (!shouldReset) return;

    updateActiveRecord(buildDefaultYear(activeRecord.year, activeRecord.unitCode));
  }

  function openPrintPreview() {
    openTgRecordPdf(activeRecord);
  }

  function createTgOnepagerHtml(record: BillingYearData) {
    const apportionable = roundMoney(record.apportionableRows.reduce((sum, row) => sum + deriveRowShare(row, record), 0));
    const balance = roundMoney(apportionable - record.tenantPrepayments);
    const dayCount = daysInclusive(record.periodFrom, record.periodTo);
    const resultLabel = balance >= 0 ? "Nachforderung" : "Guthaben";
    const rows = record.apportionableRows.map((row) => {
      const totalUnits = row.totalUnits ?? record.totalUnits;
      const yourUnits = row.yourUnits ?? record.yourUnits;
      const allocation = row.reportAllocationLabel?.trim()
        || (row.key === "Einheiten" ? `${yourUnits} / ${totalUnits} Einheiten` : row.key);
      const sourceTotal = Number.isFinite(row.sourceTotalCost) ? formatCurrency(toNumber(row.sourceTotalCost)) : "—";
      return `<tr><td>${escapeHtml(row.label)}</td><td class="money">${escapeHtml(sourceTotal)}</td><td>${escapeHtml(allocation)}</td><td class="money strong">${escapeHtml(formatCurrency(deriveRowShare(row, record)))}</td></tr>`;
    }).join("");
    const safeLandlordAddress = escapeHtml(record.landlordAddress || "").replace(/\r?\n/g, "<br/>");
    const safeTenantAddress = escapeHtml(record.tenantAddress || "").replace(/\r?\n/g, "<br/>");
    const safeAttachmentNotes = escapeHtml(record.attachmentNotes || "").replace(/\r?\n/g, "<br/>");
    const attachmentsSection = safeAttachmentNotes
      ? `<section class="attachments"><div class="section-label">Anlagen und Nachweise</div><div class="attachments-text">${safeAttachmentNotes}</div></section>`
      : "";
    const bankDetails = balance >= 0 && record.landlordIban.trim()
      ? `<section class="bank"><div class="section-label">Bankverbindung für die Überweisung</div><div class="bank-grid"><span>Kontoinhaber</span><strong>${escapeHtml(record.landlordBankAccountHolder || record.landlordName)}</strong><span>IBAN</span><strong>${escapeHtml(record.landlordIban)}</strong>${record.landlordBic.trim() ? `<span>BIC</span><strong>${escapeHtml(record.landlordBic)}</strong>` : ""}${record.landlordBankName.trim() ? `<span>Bank</span><strong>${escapeHtml(record.landlordBankName)}</strong>` : ""}</div></section>`
      : "";
    const settlementText = balance >= 0
      ? `Es ergibt sich eine <strong>Nachforderung in Höhe von ${escapeHtml(formatCurrency(Math.abs(balance)))}</strong>. Bitte überweisen Sie diesen Betrag innerhalb von 30 Tagen ${record.landlordIban.trim() ? "auf das unten angegebene Bankkonto" : "auf das Ihnen bekannte Bankkonto"}.`
      : `Es ergibt sich ein <strong>Guthaben zu Ihren Gunsten in Höhe von ${escapeHtml(formatCurrency(Math.abs(balance)))}</strong>. Der Betrag wird in den nächsten Tagen auf das bekannte Bankkonto überwiesen oder mit der nächsten Mietzahlung verrechnet.`;
    const salutation = record.recipientSalutation.trim() || "Sehr geehrte Damen und Herren,";
    const documentDate = record.documentDate || todayIsoDate();
    return `<!doctype html><html lang="de"><head><meta charset="utf-8"/><title>Nebenkostenabrechnung ${escapeHtml(record.year)} ${escapeHtml(record.unitCode)}</title><style>
@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{margin:0;background:#eef2f7;color:#172033;font-family:Arial,Helvetica,sans-serif;font-size:10.4pt;line-height:1.42}.page{width:190mm;min-height:277mm;margin:12px auto;background:#fff;padding:11mm 12mm;box-shadow:0 8px 28px rgba(15,23,42,.12)}.header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;border-bottom:2px solid #0f3347;padding-bottom:6mm}.brand-logo{width:52mm;max-height:22mm;object-fit:contain;object-position:left top}.date{text-align:right;color:#475569;padding-top:2mm}.address-grid{display:grid;grid-template-columns:1fr 1fr;gap:12mm;margin:7mm 0 6mm}.address{min-height:25mm}.section-label{font-size:8pt;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#60758a;margin-bottom:2mm}.subject{border-left:4px solid #b88a32;padding:1mm 0 1mm 4mm;margin:0 0 5mm}.subject h1{font-size:17pt;line-height:1.18;margin:0 0 2mm;color:#0b2636}.subject p{margin:0;color:#425466}.intro{margin:0 0 4mm}.intro p{margin:0 0 2.5mm}h2{font-size:11.5pt;color:#0f3347;margin:4mm 0 2mm}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9.2pt}th{background:#0f3347;color:#fff;padding:2.4mm 2mm;text-align:left;font-size:8pt;letter-spacing:.02em}td{padding:2.25mm 2mm;border-bottom:1px solid #dbe3ea;vertical-align:top;overflow-wrap:anywhere}.money{text-align:right;white-space:nowrap}.strong{font-weight:800}.result{margin:4mm 0;padding:3.5mm 4mm;border-radius:3mm;border:1px solid ${balance >= 0 ? "#f1c9c3" : "#b9dfc7"};background:${balance >= 0 ? "#fff7f5" : "#f2fbf5"};color:${balance >= 0 ? "#8d261f" : "#17603a"}}.result-grid{display:grid;grid-template-columns:1fr auto;gap:1.2mm 8mm}.result-grid strong{text-align:right}.message{margin:4mm 0}.bank,.attachments{margin-top:4mm;border:1px solid #dbe3ea;border-radius:3mm;background:#f7f9fb;padding:3mm 4mm;break-inside:avoid}.bank-grid{display:grid;grid-template-columns:30mm 1fr;gap:1mm 4mm;font-size:9pt}.attachments-text{color:#334155;line-height:1.45}.closing{margin-top:5mm}.signature{height:10mm;border-bottom:1px solid #9aa9b7;width:52mm;margin:4mm 0 1mm}.legal{margin-top:4mm;color:#526579;font-size:8.7pt}@media print{body{background:#fff}.page{margin:0;width:auto;min-height:auto;padding:0;box-shadow:none}.no-print{display:none}}
</style></head><body><main class="page"><header class="header"><img class="brand-logo" src="${brandLogo}" alt="Koenen Property Management"/><div class="date">${escapeHtml(formatDate(documentDate))}</div></header><section class="address-grid"><div class="address"><div class="section-label">Absender</div><strong>${escapeHtml(record.landlordName || "—")}</strong><br/>${safeLandlordAddress}</div><div class="address"><div class="section-label">Empfänger</div><strong>${escapeHtml(record.tenantName || "—")}</strong><br/>${safeTenantAddress}</div></section><section class="subject"><h1>Nebenkostenabrechnung für das Abrechnungsjahr ${escapeHtml(record.year)}</h1><p><strong>Objekt / Stellplatz:</strong> ${escapeHtml(record.propertyLabel)} · ${escapeHtml(record.unitLabel || record.unitCode)} &nbsp;·&nbsp; <strong>Zeitraum:</strong> ${escapeHtml(formatDate(record.periodFrom))} bis ${escapeHtml(formatDate(record.periodTo))}${dayCount ? ` (${dayCount} Tage)` : ""}</p></section><section class="intro"><p>${escapeHtml(salutation)}</p><p>hiermit erhalten Sie die Nebenkostenabrechnung für den oben genannten Zeitraum. Die Berechnung erfolgt für den Zeitraum vom ${escapeHtml(formatDate(record.periodFrom))} bis ${escapeHtml(formatDate(record.periodTo))}${dayCount ? ` zeitanteilig für ${dayCount} Tage` : ""}.</p><p>Die Abrechnung basiert auf der Hausgeldabrechnung der Hausverwaltung und gliedert sich wie folgt:</p></section><h2>1. Aufstellung der umlagefähigen Betriebskosten</h2><table><colgroup><col style="width:29%"><col style="width:22%"><col style="width:29%"><col style="width:20%"></colgroup><thead><tr><th>Kostenart</th><th class="money">Gesamtkosten WEG</th><th>Umlageschlüssel</th><th class="money">Ihr Anteil</th></tr></thead><tbody>${rows}<tr><td colspan="3" class="strong">Summe umlagefähige Kosten</td><td class="money strong">${escapeHtml(formatCurrency(apportionable))}</td></tr></tbody></table><h2>2. Berechnung des Abrechnungsergebnisses</h2><section class="result"><div class="result-grid"><span>Ihre anteiligen Gesamtkosten</span><strong>${escapeHtml(formatCurrency(apportionable))}</strong><span>Abzüglich geleisteter Vorauszahlungen</span><strong>− ${escapeHtml(formatCurrency(record.tenantPrepayments))}</strong><span>${escapeHtml(resultLabel)}</span><strong>${escapeHtml(formatCurrency(Math.abs(balance)))}</strong></div></section><p class="message">${settlementText}</p><p class="legal">Bei Fragen zu dieser Abrechnung können Sie sich gerne an mich wenden. Einsicht in die zugrunde liegenden Belege der Hausverwaltung wird Ihnen auf Wunsch gewährt.</p>${bankDetails}${attachmentsSection}<section class="closing"><p>Mit freundlichen Grüßen</p><div class="signature"></div><strong>${escapeHtml(record.landlordName || "")}</strong></section></main></body></html>`;
  }

  function openTgRecordPdf(record: BillingYearData) {
    const printWindow = window.open("", "_blank", "width=960,height=1200");
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.write(createTgOnepagerHtml(record));
    printWindow.document.write(`<script>window.onload=function(){setTimeout(function(){window.print();},250)};</script>`);
    printWindow.document.close();
  }

  function downloadTgArchiveHtml(record: BillingYearData) {
    const filename = `NK-Tiefgarage-Archiv-${record.year}-${record.propertyLabel}-${record.unitLabel}`.replace(/[^a-zA-Z0-9._-]+/g, "_") + ".html";
    const blob = new Blob([createTgOnepagerHtml(record)], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function finalizeActiveRecord() {
    const ok = window.confirm("Diese TG-Nebenkostenabrechnung abschließen und ins Archiv übernehmen?");
    if (!ok) return;
    updateActiveRecord({
      workflowStatus: "Freigegeben",
      finalized: true,
      finalizedAt: new Date().toISOString(),
    });
  }

  return (
    <div style={pageStyles.page}>
      <div style={pageStyles.hero}>
        <section style={pageStyles.heroCard}>
          <h1 style={pageStyles.heroTitle}>Nebenkostenabrechnungen für Tiefgaragenstellplätze</h1>
          <p style={pageStyles.heroText}>
            Diese Seite ist auf Basis deiner XLS-Vorlage aufgebaut: pro Jahr können alle Eingaben gepflegt werden,
            die Umlage wird automatisch berechnet und am Ende entsteht ein kompakter Onepager für den Mieter.
          </p>
          <ul style={pageStyles.subtleList}>
            <li>Jahresbezogene Datensätze zentral in Supabase pflegen.</li>
            <li>Umlagefähige und nicht umlagefähige Kosten getrennt erfassen.</li>
            <li>Onepager für Mieter als Druck/PDF direkt aus der Seite öffnen.</li>
          </ul>
        </section>

        <aside style={pageStyles.heroCard}>
          <div style={pageStyles.summaryGrid}>
            <SummaryValue label="Aktives Jahr" value={String(activeRecord.year)} />
            <SummaryValue label="Aktiver Stellplatz" value={activeRecord.unitCode} />
            <SummaryValue label="Monate im Zeitraum" value={String(monthCount)} />
            <SummaryValue label="Jahres-Hausgeld" value={formatCurrency(annualHausgeld)} />
            <SummaryValue label="Mieter-Vorauszahlungen" value={formatCurrency(activeRecord.tenantPrepayments)} />
            <SummaryValue label="Umlagefähig" value={formatCurrency(apportionableTotal)} />
            <SummaryValue
              label={settlementBalance >= 0 ? "Nachzahlung" : "Guthaben"}
              value={formatCurrency(Math.abs(settlementBalance))}
              tone={settlementBalance >= 0 ? "danger" : "positive"}
            />
          </div>
        </aside>
      </div>

      {storageError ? (
        <div style={{ ...pageStyles.section, borderColor: "#fecaca", background: "#fff1f2", color: "#9f1239", fontWeight: 800 }}>
          {storageError}
        </div>
      ) : null}

      <section style={pageStyles.section}>
        <div style={pageStyles.sectionHeader}>
          <div>
            <h2 style={pageStyles.sectionTitle}>Abrechnungen verwalten</h2>
            <div style={pageStyles.mutedText}>
              Stellplatz und Jahr eindeutig auswählen, neue Abrechnungen anlegen oder den aktiven Entwurf zurücksetzen.
            </div>
          </div>
          <span style={{ ...pageStyles.statusBadge, background: "#eef2ff", color: "#4338ca" }}>
            Aktiv: {activeRecord.unitCode} · {activeRecord.year}
          </span>
        </div>
        <div style={pageStyles.sectionBody}>
          <div style={{ ...pageStyles.label, marginBottom: 10 }}>Vorhandene Abrechnungen</div>
          <div style={pageStyles.recordGrid}>
            {records.map((record) => (
              <BillingRecordButton
                key={record.recordId}
                record={record}
                active={record.recordId === activeRecord.recordId}
                onClick={() => setActiveRecordId(record.recordId)}
              />
            ))}
          </div>

          <div style={{ ...pageStyles.managementGrid, marginTop: 20 }}>
            <div style={pageStyles.managementPanel}>
              <div style={{ fontSize: 15, fontWeight: 900, color: "#0f172a" }}>Neue Abrechnung anlegen</div>
              <div style={{ ...pageStyles.mutedText, marginTop: 4 }}>
                Erzeugt einen getrennten Datensatz für den gewählten Stellplatz und das Abrechnungsjahr.
              </div>
              <div style={pageStyles.managementFields}>
                <div>
                  <label style={pageStyles.label} htmlFor="tg-new-unit">Stellplatz</label>
                  <select
                    id="tg-new-unit"
                    aria-label="Stellplatz für neue Abrechnung"
                    style={pageStyles.input}
                    value={newUnitInput}
                    onChange={(event) => setNewUnitInput(event.target.value)}
                  >
                    <option value="P250">P250</option>
                    <option value="P253">P253</option>
                    <option value="P254">P254</option>
                  </select>
                </div>
                <div>
                  <label style={pageStyles.label} htmlFor="tg-new-year">Abrechnungsjahr</label>
                  <input
                    id="tg-new-year"
                    inputMode="numeric"
                    style={pageStyles.input}
                    value={newYearInput}
                    onChange={(event) => setNewYearInput(event.target.value)}
                    placeholder="z. B. 2026"
                  />
                </div>
              </div>
              <button type="button" style={{ ...pageStyles.primaryButton, width: "100%", marginTop: 12 }} onClick={createNewYear}>
                Neue Abrechnung anlegen
              </button>
            </div>

            <div style={pageStyles.managementPanel}>
              <div style={{ fontSize: 15, fontWeight: 900, color: "#0f172a" }}>Aktive Abrechnung</div>
              <div style={{ marginTop: 12, fontSize: 22, fontWeight: 950, color: "#0f172a" }}>
                {activeRecord.unitCode} · {activeRecord.year}
              </div>
              <div style={{ ...pageStyles.mutedText, marginTop: 4 }}>
                Status und Bearbeitungsstand gelten ausschließlich für diesen Stellplatz und dieses Abrechnungsjahr.
              </div>
              <label style={{ ...pageStyles.label, display: "block", marginTop: 14 }} htmlFor="tg-workflow-status">Bearbeitungsstatus</label>
              <select
                id="tg-workflow-status"
                aria-label="Bearbeitungsstatus der aktiven Tiefgaragenabrechnung"
                style={{
                  ...pageStyles.input,
                  marginTop: 6,
                  fontWeight: 900,
                  background: workflowStatusTheme(activeRecord.workflowStatus).background,
                  color: workflowStatusTheme(activeRecord.workflowStatus).color,
                  borderColor: workflowStatusTheme(activeRecord.workflowStatus).border,
                }}
                value={activeRecord.workflowStatus}
                onChange={(event) => updateWorkflowStatus(event.target.value as TgWorkflowStatus)}
              >
                {TG_WORKFLOW_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
              <button type="button" style={{ ...pageStyles.accentButton, width: "100%", marginTop: 18 }} onClick={resetActiveYear}>
                Aktive Abrechnung zurücksetzen
              </button>
            </div>
          </div>
        </div>
      </section>

      <section style={pageStyles.section}>
        <div style={pageStyles.sectionHeader}>
          <div>
            <h2 style={pageStyles.sectionTitle}>Anlagen und Nachweise</h2>
            <div style={pageStyles.mutedText}>
              Dokumentieren Sie hier alle Unterlagen, die zusammen mit dieser Nebenkostenabrechnung an den Mieter versendet werden.
              Der Text wird stellplatz- und jahresbezogen gespeichert und erscheint im Onepager sowie im PDF.
            </div>
          </div>
        </div>
        <div style={pageStyles.sectionBody}>
          <label style={pageStyles.label} htmlFor="tg-attachment-notes">Mitgesendete Dokumente / ergänzende Nachweise</label>
          <textarea
            id="tg-attachment-notes"
            style={{ ...pageStyles.textarea, minHeight: 140 }}
            value={activeRecord.attachmentNotes}
            onChange={(event) => updateActiveRecord({ attachmentNotes: event.target.value })}
            placeholder={"z. B.\n– WEG-Jahresabrechnung 2025\n– Einzelabrechnung Tiefgaragenstellplatz\n– Beleg Grundsteuer\n– Nachweis Tiefgaragenstrom"}
          />
          <div style={{ ...pageStyles.mutedText, marginTop: 8 }}>
            Pro Zeile kann ein Dokument oder Hinweis aufgeführt werden. Das Feld ist optional.
          </div>
        </div>
      </section>

      <section style={pageStyles.section}>
        <div style={pageStyles.sectionHeader}>
          <div>
            <h2 style={pageStyles.sectionTitle}>WEG-Eigentümerabrechnung</h2>
            <div style={pageStyles.mutedText}>
              Getrennte Eigentümer-Sicht. Diese Werte werden nicht in den Mieter-Onepager übernommen und verhindern eine Vermischung von WEG-Forderung und Mieterabrechnung.
            </div>
          </div>
          <div style={{ fontWeight: 900, color: wegOpenSettlement > 0 ? "#b91c1c" : "#166534" }}>
            {wegOpenSettlement > 0
              ? `Nachforderung: ${formatCurrency(wegOpenSettlement)}`
              : wegOpenSettlement < 0
                ? `Guthaben: ${formatCurrency(Math.abs(wegOpenSettlement))}`
                : "Kein offener WEG-Saldo"}
          </div>
        </div>
        <div style={pageStyles.sectionBody}>
          <div style={pageStyles.inputGrid}>
            <div style={pageStyles.inputCard}>
              <label style={pageStyles.label}>WEG-Zeitraum von</label>
              <input type="date" style={pageStyles.input} value={activeRecord.wegStatementPeriodFrom ?? ""} onChange={(event) => updateActiveRecord({ wegStatementPeriodFrom: event.target.value })} />
            </div>
            <div style={pageStyles.inputCard}>
              <label style={pageStyles.label}>WEG-Zeitraum bis</label>
              <input type="date" style={pageStyles.input} value={activeRecord.wegStatementPeriodTo ?? ""} onChange={(event) => updateActiveRecord({ wegStatementPeriodTo: event.target.value })} />
            </div>
            {[
              ["Umlagefähig laut WEG", "wegApportionableTotal"],
              ["Nicht umlagefähig laut WEG", "wegNonApportionableTotal"],
              ["Rücklagen laut WEG", "wegReserveTotal"],
              ["Gesamtkosten laut WEG", "wegStatementTotal"],
              ["WEG-Saldo (+ Nachforderung / − Guthaben)", "wegOwnerSettlement"],
              ["§ 35a Arbeitskostenanteil (Info)", "section35aLaborShare"],
            ].map(([label, key]) => (
              <div key={key} style={pageStyles.inputCard}>
                <label style={pageStyles.label}>{label}</label>
                <input
                  type="number"
                  step="0.01"
                  style={pageStyles.input}
                  value={toNumber(activeRecord[key as keyof BillingYearData])}
                  onChange={(event) => updateActiveRecord({ [key]: toNumber(event.target.value) })}
                />
              </div>
            ))}
            <div style={pageStyles.inputCard}>
              <label style={pageStyles.label}>Verrechnung BK umlagefähig</label>
              <input
                type="number"
                step="0.01"
                style={pageStyles.input}
                value={toNumber(activeRecord.wegApportionableOffset)}
                onChange={(event) => {
                  const nextValue = toNumber(event.target.value);
                  updateActiveRecord({
                    wegApportionableOffset: nextValue,
                    wegOwnerPrepayments: roundMoney(
                      nextValue
                        + toNumber(activeRecord.wegNonApportionableOffset)
                        + toNumber(activeRecord.wegReserveOffset),
                    ),
                  });
                }}
              />
            </div>
            <div style={pageStyles.inputCard}>
              <label style={pageStyles.label}>Verrechnung nicht umlagefähige Betriebskosten</label>
              <input
                type="number"
                step="0.01"
                style={pageStyles.input}
                value={toNumber(activeRecord.wegNonApportionableOffset)}
                onChange={(event) => {
                  const nextValue = toNumber(event.target.value);
                  updateActiveRecord({
                    wegNonApportionableOffset: nextValue,
                    wegOwnerPrepayments: roundMoney(
                      toNumber(activeRecord.wegApportionableOffset)
                        + nextValue
                        + toNumber(activeRecord.wegReserveOffset),
                    ),
                  });
                }}
              />
            </div>
            <div style={pageStyles.inputCard}>
              <label style={pageStyles.label}>Verrechnung Rücklage</label>
              <input
                type="number"
                step="0.01"
                style={pageStyles.input}
                value={toNumber(activeRecord.wegReserveOffset)}
                onChange={(event) => {
                  const nextValue = toNumber(event.target.value);
                  updateActiveRecord({
                    wegReserveOffset: nextValue,
                    wegOwnerPrepayments: roundMoney(
                      toNumber(activeRecord.wegApportionableOffset)
                        + toNumber(activeRecord.wegNonApportionableOffset)
                        + nextValue,
                    ),
                  });
                }}
              />
            </div>
            <div style={pageStyles.inputCard}>
              <label style={pageStyles.label}>WEG-Verrechnungen gesamt</label>
              <input type="number" step="0.01" style={{ ...pageStyles.input, background: "#f1f5f9" }} value={wegEffectiveOffsets} readOnly />
            </div>
            <div style={pageStyles.inputCard}>
              <label style={pageStyles.label}>Status WEG-Saldo</label>
              <select style={pageStyles.input} value={activeRecord.wegOwnerSettlementStatus ?? "open"} onChange={(event) => updateActiveRecord({ wegOwnerSettlementStatus: event.target.value as "open" | "paid" })}>
                <option value="open">Offen – noch nicht gebucht/verrechnet</option>
                <option value="paid">Erledigt – Zahlung/Gutschrift prüfen</option>
              </select>
            </div>
            <div style={pageStyles.inputCard}>
              <label style={pageStyles.label}>Zahlungsdatum</label>
              <input type="date" style={pageStyles.input} value={activeRecord.wegOwnerSettlementPaidAt ?? ""} onChange={(event) => updateActiveRecord({ wegOwnerSettlementPaidAt: event.target.value })} />
            </div>
          </div>
          <div style={{ marginTop: 16, border: "1px solid #fde68a", background: "#fffbeb", borderRadius: 16, padding: 16, color: "#78350f", lineHeight: 1.65 }}>
            <strong>{wegCalculatedSettlement < 0 ? "Steuerliche Erfassung erst nach tatsächlicher Gutschrift oder Verrechnung:" : "Steuerbuchung erst nach tatsächlicher Zahlung:"}</strong> 1,11 € Grundsteuer (St/NK), 4,33 € Allgemeinstrom (St/NK), 0,23 € Verwaltungskosten (St, nicht NK) und 0,04 € Instandhaltungsrücklage (nicht St, nicht NK). Der §-35a-Anteil von 0,77 € ist nur eine Zusatzinformation und keine weitere Ausgabe.
          </div>
          <div style={{ marginTop: 16, border: "1px solid #cbd5e1", background: "#f8fafc", borderRadius: 16, padding: 16 }}>
            <div style={{ fontWeight: 900, color: "#0f172a", marginBottom: 12 }}>Nachvollziehbare WEG-Verrechnung</div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "8px 18px", color: "#475569" }}>
              <span>Umlagefähige Kosten</span><strong style={pageStyles.amountCell}>{formatCurrency(toNumber(activeRecord.wegApportionableTotal))}</strong>
              <span>Nicht umlagefähige Kosten</span><strong style={pageStyles.amountCell}>{formatCurrency(toNumber(activeRecord.wegNonApportionableTotal))}</strong>
              <span>Zuführung Rücklagen</span><strong style={pageStyles.amountCell}>{formatCurrency(toNumber(activeRecord.wegReserveTotal))}</strong>
              <span style={{ borderTop: "1px solid #cbd5e1", paddingTop: 8 }}>Gesamtsumme der Kosten</span><strong style={{ ...pageStyles.amountCell, borderTop: "1px solid #cbd5e1", paddingTop: 8 }}>{formatCurrency(toNumber(activeRecord.wegStatementTotal))}</strong>
              <span>Abzüglich Verrechnung BK umlagefähig</span><strong style={pageStyles.amountCell}>− {formatCurrency(toNumber(activeRecord.wegApportionableOffset))}</strong>
              <span>Abzüglich Verrechnung Betriebskosten</span><strong style={pageStyles.amountCell}>− {formatCurrency(toNumber(activeRecord.wegNonApportionableOffset))}</strong>
              <span>Abzüglich Verrechnung Rücklage</span><strong style={pageStyles.amountCell}>− {formatCurrency(toNumber(activeRecord.wegReserveOffset))}</strong>
              <span style={{ borderTop: "1px solid #cbd5e1", paddingTop: 8, fontWeight: 900, color: "#0f172a" }}>
                {wegCalculatedSettlement >= 0 ? "Verbleibende WEG-Nachforderung" : "Verbleibendes WEG-Guthaben"}
              </span>
              <strong style={{ ...pageStyles.amountCell, borderTop: "1px solid #cbd5e1", paddingTop: 8, color: wegCalculatedSettlement > 0 ? "#b91c1c" : "#166534" }}>
                {formatCurrency(Math.abs(wegCalculatedSettlement))}
              </strong>
            </div>
            {Math.abs(wegCalculatedSettlement - toNumber(activeRecord.wegOwnerSettlement)) > 0.009 ? (
              <div style={{ marginTop: 12, borderRadius: 12, background: "#fff1f2", color: "#9f1239", padding: 12, fontWeight: 800 }}>
                Prüfen: Die gespeicherte WEG-Nachforderung weicht um {formatCurrency(Math.abs(wegCalculatedSettlement - toNumber(activeRecord.wegOwnerSettlement)))} von der Kalkulation ab.
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section style={pageStyles.section}>
        <div style={pageStyles.sectionHeader}>
          <div>
            <h2 style={pageStyles.sectionTitle}>NK-Automatik aus Buchhaltung</h2>
            <div style={pageStyles.mutedText}>
              {nkLoading
                ? "Lade markierte NK-Buchungen..."
                : `${nkEntries.length} markierte Buchungen im Jahr ${activeRecord.year} · Ausgaben ${formatCurrency(nkEntries.filter((entry) => entry.entry_type === "expense").reduce((sum, entry) => sum + Math.abs(entry.amount), 0))}`}
            </div>
          </div>
          <button type="button" style={pageStyles.primaryButton} onClick={importNkEntriesToTg} disabled={nkEntries.length === 0}>
            NK-Buchungen übernehmen
          </button>
        </div>
      </section>

      <section style={pageStyles.section}>
        <div style={pageStyles.sectionHeader}>
          <div>
            <h2 style={pageStyles.sectionTitle}>Archiv abgeschlossener TG-Abrechnungen</h2>
            <div style={pageStyles.mutedText}>Freigegebene oder korrigierte Tiefgaragenabrechnungen werden hier nach Jahr archiviert und können erneut als PDF geöffnet werden.</div>
          </div>
          <button type="button" style={pageStyles.primaryButton} onClick={finalizeActiveRecord}>
            Aktive Abrechnung abschließen
          </button>
        </div>
        <div style={pageStyles.sectionBody}>
          {records.filter((record) => record.finalized).length === 0 ? (
            <div style={{ border: "1px dashed #cbd5e1", borderRadius: 18, padding: 18, color: "#64748b", background: "#fff" }}>
              Noch keine abgeschlossene TG-Abrechnung im Archiv. Nach dem Abschluss erscheint die Abrechnung hier automatisch.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
              {records.filter((record) => record.finalized).map((record) => {
                const apportionable = roundMoney(record.apportionableRows.reduce((sum, row) => sum + deriveRowShare(row, record), 0));
                const balance = roundMoney(apportionable - record.tenantPrepayments);
                return (
                  <div key={`archive-${record.recordId}`} style={{ border: "1px solid #bbf7d0", background: "#f0fdf4", borderRadius: 20, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <div>
                        <div style={{ display: "inline-block", borderRadius: 999, background: "#dcfce7", color: "#166534", padding: "5px 10px", fontSize: 12, fontWeight: 900 }}>Freigegeben</div>
                        <div style={{ marginTop: 10, fontWeight: 900, color: "#0f172a" }}>{record.propertyLabel}</div>
                        <div style={pageStyles.mutedText}>{record.unitLabel} · {record.year}</div>
                      </div>
                      <div style={{ textAlign: "right", fontWeight: 900 }}>{formatCurrency(apportionable)}</div>
                    </div>
                    <div style={{ marginTop: 12, color: balance >= 0 ? "#b91c1c" : "#166534", fontWeight: 900 }}>
                      {balance >= 0 ? "Nachzahlung" : "Guthaben"}: {formatCurrency(Math.abs(balance))}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                      <button type="button" style={pageStyles.button} onClick={() => openTgRecordPdf(record)}>PDF öffnen</button>
                      <button type="button" style={pageStyles.button} onClick={() => downloadTgArchiveHtml(record)}>Archivdatei</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section style={pageStyles.section}>
        <div style={pageStyles.sectionHeader}>
          <div>
            <h2 style={pageStyles.sectionTitle}>Kopf- und Stammdaten</h2>
            <div style={pageStyles.mutedText}>Eingabemaske nach deiner Excel-Vorlage für Vermieter, Mieter, Zeitraum und Einheiten.</div>
          </div>
        </div>
        <div style={pageStyles.sectionBody}>
          <div style={pageStyles.inputGrid}>
            <div style={pageStyles.inputCard}>
              <label style={pageStyles.label}>Objekt / Abrechnung</label>
              <input
                style={pageStyles.input}
                value={activeRecord.propertyLabel}
                onChange={(event) => updateActiveRecord({ propertyLabel: event.target.value })}
                placeholder="z. B. TG Stellplatz Rosensteinstraße 25"
              />
            </div>
            <div style={pageStyles.inputCard}>
              <label style={pageStyles.label}>Einheit / Stellplatz</label>
              <input
                style={pageStyles.input}
                value={activeRecord.unitLabel}
                onChange={(event) => updateActiveRecord({ unitLabel: event.target.value })}
                placeholder="z. B. Stellplatz Nr. 12"
              />
            </div>
            <div style={pageStyles.inputCard}>
              <label style={pageStyles.label}>Abrechnungszeitraum von</label>
              <input
                type="date"
                style={pageStyles.input}
                value={activeRecord.periodFrom}
                onChange={(event) => updateActiveRecord({ periodFrom: event.target.value })}
              />
            </div>
            <div style={pageStyles.inputCard}>
              <label style={pageStyles.label}>Abrechnungszeitraum bis</label>
              <input
                type="date"
                style={pageStyles.input}
                value={activeRecord.periodTo}
                onChange={(event) => updateActiveRecord({ periodTo: event.target.value })}
              />
            </div>
            <div style={pageStyles.inputCard}>
              <label style={pageStyles.label}>Monatliches Hausgeld</label>
              <input
                type="number"
                step="0.01"
                style={pageStyles.input}
                value={activeRecord.monthlyHausgeld}
                onChange={(event) => updateActiveRecord({ monthlyHausgeld: toNumber(event.target.value) })}
              />
            </div>
            <div style={pageStyles.inputCard}>
              <label style={pageStyles.label}>Vorauszahlungen Mieter (Jahr)</label>
              <input
                type="number"
                step="0.01"
                style={pageStyles.input}
                value={activeRecord.tenantPrepayments}
                onChange={(event) => updateActiveRecord({ tenantPrepayments: toNumber(event.target.value) })}
              />
            </div>
            <div style={pageStyles.inputCard}>
              <label style={pageStyles.label}>Gesamt Einheiten</label>
              <input
                type="number"
                step="0.01"
                style={pageStyles.input}
                value={activeRecord.totalUnits}
                onChange={(event) => updateActiveRecord({ totalUnits: toNumber(event.target.value, 1) })}
              />
            </div>
            <div style={pageStyles.inputCard}>
              <label style={pageStyles.label}>Ihre / Mieter-Einheiten</label>
              <input
                type="number"
                step="0.01"
                style={pageStyles.input}
                value={activeRecord.yourUnits}
                onChange={(event) => updateActiveRecord({ yourUnits: toNumber(event.target.value, 1) })}
              />
            </div>
            <div style={pageStyles.inputCard}>
              <label style={pageStyles.label}>Vermieter</label>
              <input
                style={pageStyles.input}
                value={activeRecord.landlordName}
                onChange={(event) => updateActiveRecord({ landlordName: event.target.value })}
              />
            </div>
            <div style={pageStyles.inputCard}>
              <label style={pageStyles.label}>Mieter</label>
              <input
                style={pageStyles.input}
                value={activeRecord.tenantName}
                onChange={(event) => updateActiveRecord({ tenantName: event.target.value })}
              />
            </div>
            <div style={{ ...pageStyles.inputCard, gridColumn: "span 2" }}>
              <label style={pageStyles.label}>Adresse Vermieter</label>
              <textarea
                style={pageStyles.textarea}
                value={activeRecord.landlordAddress}
                onChange={(event) => updateActiveRecord({ landlordAddress: event.target.value })}
              />
            </div>
            <div style={{ ...pageStyles.inputCard, gridColumn: "span 2" }}>
              <label style={pageStyles.label}>Adresse Mieter</label>
              <textarea
                style={pageStyles.textarea}
                value={activeRecord.tenantAddress}
                onChange={(event) => updateActiveRecord({ tenantAddress: event.target.value })}
              />
            </div>
            <div style={pageStyles.inputCard}>
              <label style={pageStyles.label}>Briefdatum</label>
              <input
                type="date"
                style={pageStyles.input}
                value={activeRecord.documentDate}
                onChange={(event) => updateActiveRecord({ documentDate: event.target.value })}
              />
            </div>
            <div style={pageStyles.inputCard}>
              <label style={pageStyles.label}>Briefanrede</label>
              <input
                style={pageStyles.input}
                value={activeRecord.recipientSalutation}
                onChange={(event) => updateActiveRecord({ recipientSalutation: event.target.value })}
                placeholder="z. B. Sehr geehrte Frau Frommer,"
              />
            </div>
            <div style={pageStyles.inputCard}>
              <label style={pageStyles.label}>Kontoinhaber</label>
              <input
                style={pageStyles.input}
                value={activeRecord.landlordBankAccountHolder}
                onChange={(event) => updateActiveRecord({ landlordBankAccountHolder: event.target.value })}
              />
            </div>
            <div style={pageStyles.inputCard}>
              <label style={pageStyles.label}>IBAN Vermieter</label>
              <input
                style={pageStyles.input}
                value={activeRecord.landlordIban}
                onChange={(event) => updateActiveRecord({ landlordIban: event.target.value })}
                placeholder="IBAN optional"
              />
            </div>
            <div style={pageStyles.inputCard}>
              <label style={pageStyles.label}>BIC Vermieter</label>
              <input
                style={pageStyles.input}
                value={activeRecord.landlordBic}
                onChange={(event) => updateActiveRecord({ landlordBic: event.target.value })}
                placeholder="BIC optional"
              />
            </div>
            <div style={pageStyles.inputCard}>
              <label style={pageStyles.label}>Bank Vermieter</label>
              <input
                style={pageStyles.input}
                value={activeRecord.landlordBankName}
                onChange={(event) => updateActiveRecord({ landlordBankName: event.target.value })}
                placeholder="Bankname optional"
              />
            </div>
          </div>
        </div>
      </section>

      <section style={pageStyles.section}>
        <div style={pageStyles.sectionHeader}>
          <div>
            <h2 style={pageStyles.sectionTitle}>Umlagefähige Kosten</h2>
            <div style={pageStyles.mutedText}>Die Tabelle rechnet deinen Anteil automatisch aus. Leer gelassene Einheiten greifen auf die Stammdaten oben zurück.</div>
          </div>
          <button type="button" style={pageStyles.primaryButton} onClick={() => addRow("apportionableRows")}>
            Kostenart hinzufügen
          </button>
        </div>
        <div style={pageStyles.sectionBody}>
          <div style={pageStyles.tableWrap}>
            <table style={pageStyles.table}>
              <thead>
                <tr>
                  <th style={{ ...pageStyles.th, width: "24%" }}>Kostenart</th>
                  <th style={{ ...pageStyles.th, width: "14%" }}>Gesamtkosten</th>
                  <th style={{ ...pageStyles.th, width: "14%" }}>Schlüssel</th>
                  <th style={{ ...pageStyles.th, width: "14%" }}>Gesamt-Einheiten</th>
                  <th style={{ ...pageStyles.th, width: "14%" }}>Ihre Einheiten</th>
                  <th style={{ ...pageStyles.th, width: "14%" }}>Ihr Anteil</th>
                  <th style={{ ...pageStyles.th, width: "6%" }} />
                </tr>
              </thead>
              <tbody>
                {activeRecord.apportionableRows.map((row) => (
                  <RowEditor
                    key={row.id}
                    row={row}
                    yearData={activeRecord}
                    onChange={(nextRow) => updateRow("apportionableRows", row.id, nextRow)}
                    onDelete={() => deleteRow("apportionableRows", row.id)}
                  />
                ))}
                <tr>
                  <td style={{ ...pageStyles.td, fontWeight: 900 }}>Summe umlagefähig</td>
                  <td style={pageStyles.td} />
                  <td style={pageStyles.td} />
                  <td style={pageStyles.td} />
                  <td style={pageStyles.td} />
                  <td style={{ ...pageStyles.td, ...pageStyles.amountCell }}>{formatCurrency(apportionableTotal)}</td>
                  <td style={pageStyles.td} />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section style={pageStyles.section}>
        <div style={pageStyles.sectionHeader}>
          <div>
            <h2 style={pageStyles.sectionTitle}>Nicht umlagefähige Kosten</h2>
            <div style={pageStyles.mutedText}>
              Interne Eigentümer-Sicht. Rücklagen werden in der WEG-Verrechnung separat ausgewiesen; diese Positionen erscheinen nicht im Mieter-Onepager.
            </div>
          </div>
          <button type="button" style={pageStyles.button} onClick={() => addRow("nonApportionableRows")}>
            Interne Kostenart hinzufügen
          </button>
        </div>
        <div style={pageStyles.sectionBody}>
          <div style={pageStyles.tableWrap}>
            <table style={pageStyles.table}>
              <thead>
                <tr>
                  <th style={{ ...pageStyles.th, width: "24%" }}>Kostenart</th>
                  <th style={{ ...pageStyles.th, width: "14%" }}>Gesamtkosten</th>
                  <th style={{ ...pageStyles.th, width: "14%" }}>Schlüssel</th>
                  <th style={{ ...pageStyles.th, width: "14%" }}>Gesamt-Einheiten</th>
                  <th style={{ ...pageStyles.th, width: "14%" }}>Ihre Einheiten</th>
                  <th style={{ ...pageStyles.th, width: "14%" }}>Betrag</th>
                  <th style={{ ...pageStyles.th, width: "6%" }} />
                </tr>
              </thead>
              <tbody>
                {activeRecord.nonApportionableRows.map((row) => (
                  <RowEditor
                    key={row.id}
                    row={row}
                    yearData={activeRecord}
                    onChange={(nextRow) => updateRow("nonApportionableRows", row.id, nextRow)}
                    onDelete={() => deleteRow("nonApportionableRows", row.id)}
                  />
                ))}
                <tr>
                  <td style={{ ...pageStyles.td, fontWeight: 900 }}>Summe intern</td>
                  <td style={pageStyles.td} />
                  <td style={pageStyles.td} />
                  <td style={pageStyles.td} />
                  <td style={pageStyles.td} />
                  <td style={{ ...pageStyles.td, ...pageStyles.amountCell }}>{formatCurrency(nonApportionableTotal)}</td>
                  <td style={pageStyles.td} />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section style={pageStyles.section}>
        <div style={pageStyles.sectionHeader}>
          <div>
            <h2 style={pageStyles.sectionTitle}>Onepager für Mieter</h2>
            <div style={pageStyles.mutedText}>Nur die umlagefähigen Kosten und das Ergebnis werden für den Weiterleitungs-Onepager dargestellt.</div>
          </div>
          <button type="button" style={pageStyles.primaryButton} onClick={openPrintPreview}>
            Onepager drucken / als PDF speichern
          </button>
        </div>
        <div style={pageStyles.sectionBody}>
          <div id="tg-onepager-preview" style={pageStyles.onePager}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, paddingBottom: 20, borderBottom: "2px solid #0f3347" }}>
              <img src={brandLogo} alt="Koenen Property Management" style={{ width: 210, maxHeight: 82, objectFit: "contain", objectPosition: "left top" }} />
              <div style={{ color: "#64748b", fontSize: 13 }}>{formatDate(activeRecord.documentDate || todayIsoDate())}</div>
            </div>

            <div style={pageStyles.onePagerMeta}>
              <div style={pageStyles.onePagerBox}>
                <div style={pageStyles.summaryLabel}>Absender</div>
                <div style={{ marginTop: 8, whiteSpace: "pre-wrap", lineHeight: 1.6, color: "#0f172a" }}>
                  <strong>{activeRecord.landlordName || "—"}</strong>
                  {activeRecord.landlordAddress ? `\n${activeRecord.landlordAddress}` : ""}
                </div>
              </div>
              <div style={pageStyles.onePagerBox}>
                <div style={pageStyles.summaryLabel}>Empfänger</div>
                <div style={{ marginTop: 8, whiteSpace: "pre-wrap", lineHeight: 1.6, color: "#0f172a" }}>
                  <strong>{activeRecord.tenantName || "—"}</strong>
                  {activeRecord.tenantAddress ? `\n${activeRecord.tenantAddress}` : ""}
                </div>
              </div>
            </div>

            <div style={{ borderLeft: "4px solid #b88a32", padding: "4px 0 4px 16px", marginBottom: 20 }}>
              <h2 style={pageStyles.onePagerTitle}>Nebenkostenabrechnung für das Abrechnungsjahr {activeRecord.year}</h2>
              <p style={{ ...pageStyles.onePagerSubTitle, marginTop: 6 }}>
                <strong>Objekt / Stellplatz:</strong> {activeRecord.propertyLabel} · {activeRecord.unitLabel || activeRecord.unitCode} · <strong>Zeitraum:</strong> {formatDate(activeRecord.periodFrom)} bis {formatDate(activeRecord.periodTo)}{billingDayCount ? ` (${billingDayCount} Tage)` : ""}
              </p>
            </div>

            <div style={{ color: "#334155", fontSize: 14, lineHeight: 1.65, marginBottom: 20 }}>
              <p>{activeRecord.recipientSalutation || "Sehr geehrte Damen und Herren,"}</p>
              <p>
                hiermit erhalten Sie die Nebenkostenabrechnung für den oben genannten Zeitraum. Die Berechnung erfolgt
                {billingDayCount ? ` zeitanteilig für ${billingDayCount} Tage` : " für den angegebenen Zeitraum"}.
              </p>
              <p>Die Abrechnung basiert auf der Hausgeldabrechnung der Hausverwaltung und gliedert sich wie folgt:</p>
            </div>

            <h3 style={{ margin: "0 0 10px", color: "#0f3347", fontSize: 17 }}>1. Aufstellung der umlagefähigen Betriebskosten</h3>
            <table style={{ ...pageStyles.onePagerTable, tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <th style={{ ...pageStyles.th, width: "29%", background: "#0f3347", color: "#fff" }}>Kostenart</th>
                  <th style={{ ...pageStyles.th, width: "22%", textAlign: "right", background: "#0f3347", color: "#fff" }}>Gesamtkosten WEG</th>
                  <th style={{ ...pageStyles.th, width: "29%", background: "#0f3347", color: "#fff" }}>Umlageschlüssel</th>
                  <th style={{ ...pageStyles.th, width: "20%", textAlign: "right", background: "#0f3347", color: "#fff" }}>Ihr Anteil</th>
                </tr>
              </thead>
              <tbody>
                {apportionableRows.map((row) => (
                  <tr key={row.id}>
                    <td style={pageStyles.td}>{row.label}</td>
                    <td style={{ ...pageStyles.td, textAlign: "right", ...pageStyles.amountCell }}>
                      {Number.isFinite(row.sourceTotalCost) ? formatCurrency(toNumber(row.sourceTotalCost)) : "—"}
                    </td>
                    <td style={pageStyles.td}>
                      {row.reportAllocationLabel?.trim()
                        || (row.key === "Einheiten"
                          ? `${row.yourUnits ?? activeRecord.yourUnits} / ${row.totalUnits ?? activeRecord.totalUnits} Einheiten`
                          : row.key)}
                    </td>
                    <td style={{ ...pageStyles.td, textAlign: "right", ...pageStyles.amountCell }}>
                      {formatCurrency(deriveRowShare(row, activeRecord))}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3} style={{ ...pageStyles.td, fontWeight: 900 }}>Summe umlagefähige Kosten</td>
                  <td style={{ ...pageStyles.td, textAlign: "right", ...pageStyles.amountCell }}>{formatCurrency(apportionableTotal)}</td>
                </tr>
              </tbody>
            </table>

            <h3 style={{ margin: "24px 0 10px", color: "#0f3347", fontSize: 17 }}>2. Berechnung des Abrechnungsergebnisses</h3>
            <div style={{ border: `1px solid ${settlementBalance >= 0 ? "#f1c9c3" : "#b9dfc7"}`, borderRadius: 12, padding: 16, background: settlementBalance >= 0 ? "#fff7f5" : "#f2fbf5", color: settlementBalance >= 0 ? "#8d261f" : "#17603a" }}>
              {[
                ["Ihre anteiligen Gesamtkosten", formatCurrency(apportionableTotal)],
                ["Abzüglich geleisteter Vorauszahlungen", `− ${formatCurrency(activeRecord.tenantPrepayments)}`],
                [settlementBalance >= 0 ? "Nachforderung" : "Guthaben", formatCurrency(Math.abs(settlementBalance))],
              ].map(([label, value]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 20, marginTop: label === "Ihre anteiligen Gesamtkosten" ? 0 : 6 }}>
                  <span>{label}</span><strong>{value}</strong>
                </div>
              ))}
            </div>

            <p style={{ margin: "18px 0", color: "#334155", lineHeight: 1.65 }}>
              {settlementBalance >= 0
                ? <>Es ergibt sich eine <strong>Nachforderung in Höhe von {formatCurrency(Math.abs(settlementBalance))}</strong>. Bitte überweisen Sie diesen Betrag innerhalb von 30 Tagen {activeRecord.landlordIban.trim() ? "auf das unten angegebene Bankkonto" : "auf das Ihnen bekannte Bankkonto"}.</>
                : <>Es ergibt sich ein <strong>Guthaben zu Ihren Gunsten in Höhe von {formatCurrency(Math.abs(settlementBalance))}</strong>. Der Betrag wird in den nächsten Tagen auf das bekannte Bankkonto überwiesen oder mit der nächsten Mietzahlung verrechnet.</>}
            </p>

            <p style={{ color: "#526579", fontSize: 13, lineHeight: 1.6 }}>
              Bei Fragen zu dieser Abrechnung können Sie sich gerne an mich wenden. Einsicht in die zugrunde liegenden Belege der Hausverwaltung wird Ihnen auf Wunsch gewährt.
            </p>

            {settlementBalance >= 0 && activeRecord.landlordIban.trim() ? (
              <div style={{ marginTop: 18, border: "1px solid #dbe3ea", borderRadius: 12, padding: 16, background: "#f7f9fb" }}>
                <div style={pageStyles.summaryLabel}>Bankverbindung für die Überweisung</div>
                <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "5px 14px", marginTop: 10, color: "#334155", fontSize: 13 }}>
                  <span>Kontoinhaber</span><strong>{activeRecord.landlordBankAccountHolder || activeRecord.landlordName}</strong>
                  <span>IBAN</span><strong>{activeRecord.landlordIban}</strong>
                  {activeRecord.landlordBic.trim() ? <><span>BIC</span><strong>{activeRecord.landlordBic}</strong></> : null}
                  {activeRecord.landlordBankName.trim() ? <><span>Bank</span><strong>{activeRecord.landlordBankName}</strong></> : null}
                </div>
              </div>
            ) : null}
            {activeRecord.attachmentNotes.trim() ? (
              <div style={{ marginTop: 18, border: "1px solid #dbe3f0", borderRadius: 12, padding: 16, background: "#f8fafc" }}>
                <div style={pageStyles.summaryLabel}>Anlagen und Nachweise</div>
                <div style={{ marginTop: 8, whiteSpace: "pre-wrap", lineHeight: 1.65, color: "#334155" }}>
                  {activeRecord.attachmentNotes}
                </div>
              </div>
            ) : null}
            <div style={{ marginTop: 24, color: "#334155", lineHeight: 1.6 }}>
              <p>Mit freundlichen Grüßen</p>
              <div style={{ height: 38, width: 210, borderBottom: "1px solid #94a3b8", margin: "12px 0 6px" }} />
              <strong>{activeRecord.landlordName}</strong>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
