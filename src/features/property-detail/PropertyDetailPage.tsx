import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useParams } from "react-router-dom";
import { buildBaseFinanceMetrics } from "@/services/financeService";
import { parseLocaleNumber, parseNullableLocaleNumber } from "@/utils/numberParser";
import {
  insertPropertyLoanLedgerRow,
  listPropertyLoanLedgerRows,
  updatePropertyLoanLedgerRow,
} from "@/services/propertyLoanLedgerService";
import { useResolvedPropertyContext } from "./useResolvedPropertyContext";
import { useIncome } from "./hooks/useIncome";
import { useLedger } from "./hooks/useLedger";
import { usePropertyDetail } from "./hooks/usePropertyDetail";
import type { PropertyIncome } from "@/types/propertyIncome";
import type {
  YearlyCapexEntry,
  YearlyIncomeEntry,
  YearlyLedgerEntry,
  YearlyFinanceMetrics,
} from "@/types/finance";

type PageMode = "detail" | "monate" | "auswertungen";

type PropertyDetailLike = {
  id?: string | number;
  property_id?: string | number | null;
  objekt_id?: string | number | null;
  legacyId?: string | number | null;
  name?: string;
  title?: string;
  city?: string;
  location?: string;
  address?: string;
  street?: string;
  purchasePrice?: number | string | null;
  purchase_price?: number | string | null;
  kaufpreis?: number | string | null;
  livingArea?: number | string | null;
  living_area?: number | string | null;
  wohnflaeche?: number | string | null;
  wohnfläche?: number | string | null;
  yearBuilt?: number | string | null;
  year_built?: number | string | null;
  baujahr?: number | string | null;
};

type EditableLedgerRow = {
  id: string;
  dbId: string | null;
  year: string;
  interestPayment: string;
  principalPayment: string;
  remainingBalance: string;
  source: string;
  isNew?: boolean;
};

function makeClientId() {
  return `row_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function toSafeNumber(value: unknown, fallback = 0): number {
  return parseLocaleNumber(value, fallback);
}


function toNullableNumber(value: unknown): number | null {
  return parseNullableLocaleNumber(value);
}



function isFuertherContext(value: string | null | undefined): boolean {
  const raw = String(value ?? "");
  const normalized = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/straße|strasse/g, "str");
  return normalized.includes("further") || normalized.includes("fuerther") || normalized.includes("further str") || normalized.includes("furth");
}

function cleanRemainingBalanceForProperty(value: unknown, propertyContext: string): number {
  const parsed = parseLocaleNumber(value, 0);
  if (!Number.isFinite(parsed)) return 0;

  // Historischer Datenfehler: Fürther Str. wurde durch falsches Entfernen des Dezimalpunkts
  // teilweise um Faktor 10 zu hoch angezeigt/gespeichert, z. B. 1250628.6 -> 12506286.
  if (isFuertherContext(propertyContext) && Math.abs(parsed) >= 1_000_000) {
    return parsed / 10;
  }

  return parsed;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unbekannter Fehler";
}

function formatCurrency(value: number | null | undefined): string {
  const safe = value ?? 0;

  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(safe);
}


function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";

  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatInteger(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";

  return new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 0,
  }).format(value);
}

function getRiskTone(riskLevel: "green" | "yellow" | "red" | undefined): string {
  if (riskLevel === "green") return "border-emerald-200 bg-emerald-50";
  if (riskLevel === "yellow") return "border-amber-200 bg-amber-50";
  if (riskLevel === "red") return "border-rose-200 bg-rose-50";
  return "border-slate-200 bg-slate-50";
}

function cleanDisplayName(value: unknown, fallback = "Objekt"): string {
  const cleaned = String(value ?? "")
    .replace(/\s*\(?\s*core[\W_]*shadow\s*\)?/gi, "")
    .replace(/\s*\(?\s*shadow\s*\)?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || fallback;
}

function normalizeProperty(input: unknown): PropertyDetailLike | null {
  if (!input || typeof input !== "object") return null;

  const row = input as Record<string, unknown>;

  return {
    id: row.id as string | number | undefined,
    property_id: (row.property_id ?? null) as string | number | null,
    objekt_id: (row.objekt_id ?? null) as string | number | null,
    legacyId: (row.legacyId ?? row.legacy_id ?? row.property_id ?? row.objekt_id ?? null) as
      | string
      | number
      | null,
    name: cleanDisplayName(row.name ?? row.objektname ?? row.object_name, ""),
    title: cleanDisplayName(row.title ?? row.bezeichnung, ""),
    city: cleanDisplayName(row.city ?? row.stadt, ""),
    location: cleanDisplayName(row.location ?? row.ort, ""),
    address: cleanDisplayName(row.address ?? row.adresse, ""),
    street: cleanDisplayName(row.street ?? row.strasse ?? row.straße, ""),
    purchasePrice: (row.purchasePrice ?? row.purchase_price ?? row.kaufpreis) as
      | number
      | string
      | null
      | undefined,
    purchase_price: (row.purchase_price ?? row.purchasePrice ?? row.kaufpreis) as
      | number
      | string
      | null
      | undefined,
    kaufpreis: row.kaufpreis as number | string | null | undefined,
    livingArea: (row.livingArea ??
      row.living_area ??
      row.wohnflaeche ??
      row["wohnfläche"]) as number | string | null | undefined,
    living_area: (row.living_area ??
      row.livingArea ??
      row.wohnflaeche ??
      row["wohnfläche"]) as number | string | null | undefined,
    wohnflaeche: row.wohnflaeche as number | string | null | undefined,
    wohnfläche: row["wohnfläche"] as number | string | null | undefined,
    yearBuilt: (row.yearBuilt ?? row.year_built ?? row.baujahr) as
      | number
      | string
      | null
      | undefined,
    year_built: (row.year_built ?? row.yearBuilt ?? row.baujahr) as
      | number
      | string
      | null
      | undefined,
    baujahr: row.baujahr as number | string | null | undefined,
  };
}

function Card(props: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      {(props.title || props.action) && (
        <div className="mb-4 flex items-center justify-between gap-4">
          {props.title ? (
            <h2 className="text-lg font-semibold text-slate-900">{props.title}</h2>
          ) : (
            <div />
          )}
          {props.action}
        </div>
      )}
      {props.children}
    </section>
  );
}

function StatCard(props: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${props.className ?? "border-slate-200 bg-slate-50"}`}>
      <div className="text-sm text-slate-600">{props.label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{props.value}</div>
    </div>
  );
}

function EmptyState(props: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <h3 className="text-lg font-semibold text-slate-900">{props.title}</h3>
      <p className="mt-2 text-sm text-slate-600">{props.description}</p>
    </div>
  );
}

function InfoRow(props: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-sm text-slate-500">{props.label}</div>
      <div className="mt-1 break-all font-semibold text-slate-900">{props.value}</div>
    </div>
  );
}

function DataTable(props: {
  columns: string[];
  rows: Array<Array<ReactNode>>;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {props.columns.map((column) => (
              <th key={column} className="px-4 py-3 text-left font-medium text-slate-600">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {props.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-3 align-top text-slate-800">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IncomeSection(props: {
  incomeData: {
    propertyIncome: PropertyIncome | null;
    yearlyIncome: YearlyIncomeEntry[];
    yearlyCapex: YearlyCapexEntry[];
  };
}) {
  const { incomeData } = props;

  return (
    <Card title="Income">
      {incomeData.yearlyIncome.length > 0 ? (
        <DataTable
          columns={["Jahr", "Miete", "Sonstige Einnahmen", "Gesamt", "Quelle"]}
          rows={incomeData.yearlyIncome.map((entry) => {
            const annualRent = toSafeNumber(entry.annualRent ?? entry.annual_rent);
            const otherIncome = toSafeNumber(entry.otherIncome ?? entry.other_income);
            const totalIncome = annualRent + otherIncome;

            return [
              String(entry.year),
              formatCurrency(annualRent),
              formatCurrency(otherIncome),
              formatCurrency(totalIncome),
              entry.source ?? "–",
            ];
          })}
        />
      ) : incomeData.propertyIncome ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Es gibt einen Datensatz in <span className="font-mono">property_income</span>, aber
            keine Einträge in <span className="font-mono">yearly_property_income</span>.
          </div>

          <DataTable
            columns={["Typ", "Miete p.a.", "Sonstige Einnahmen p.a.", "Gesamt p.a."]}
            rows={[
              [
                "property_income",
                formatCurrency(toSafeNumber(incomeData.propertyIncome.annualRent)),
                formatCurrency(toSafeNumber(incomeData.propertyIncome.otherIncome)),
                formatCurrency(
                  toSafeNumber(incomeData.propertyIncome.annualRent) +
                    toSafeNumber(incomeData.propertyIncome.otherIncome),
                ),
              ],
            ]}
          />
        </div>
      ) : (
        <EmptyState
          title="Keine Income-Daten"
          description="Es wurden weder property_income noch yearly_property_income-Einträge gefunden."
        />
      )}
    </Card>
  );
}

function CapexSection(props: {
  yearlyCapex: YearlyCapexEntry[];
}) {
  return (
    <Card title="Capex">
      {props.yearlyCapex.length === 0 ? (
        <EmptyState
          title="Keine Capex-Daten"
          description="Es wurden keine jährlichen Capex-Einträge gefunden."
        />
      ) : (
        <DataTable
          columns={["Jahr", "Betrag", "Kategorie", "Notiz", "Quelle"]}
          rows={props.yearlyCapex.map((entry) => [
            String(entry.year),
            formatCurrency(entry.amount),
            entry.category ?? "–",
            entry.note ?? "–",
            entry.source ?? "–",
          ])}
        />
      )}
    </Card>
  );
}

function LedgerReadOnlySection(props: {
  ledger: YearlyLedgerEntry[];
}) {
  return (
    <Card title="Darlehensübersicht">
      {props.ledger.length === 0 ? (
        <EmptyState
          title="Keine Ledger-Daten"
          description="Es wurden keine Finanzierungsdaten gefunden."
        />
      ) : (
        <DataTable
          columns={["Jahr", "Zinsen", "Tilgung", "Debt Service", "Restschuld", "Quelle"]}
          rows={props.ledger.map((entry) => {
            const interest = toSafeNumber(entry.interestPayment ?? entry.interest);
            const principal = toSafeNumber(entry.principalPayment ?? entry.principal);
            const remainingBalance = toSafeNumber(entry.remainingBalance ?? entry.balance);
            const debtService = interest + principal;

            return [
              String(entry.year),
              formatCurrency(interest),
              formatCurrency(principal),
              formatCurrency(debtService),
              formatCurrency(remainingBalance),
              entry.source ?? "–",
            ];
          })}
        />
      )}
    </Card>
  );
}

function FinanceSection(props: {
  yearlyMetrics: YearlyFinanceMetrics[];
}) {
  return (
    <Card title="Finance pro Jahr">
      {props.yearlyMetrics.length === 0 ? (
        <EmptyState
          title="Keine berechenbaren Finanzdaten"
          description="Für dieses Objekt konnten noch keine Jahresmetriken berechnet werden."
        />
      ) : (
        <DataTable
          columns={[
            "Jahr",
            "Income",
            "Capex",
            "Zinsen",
            "Tilgung",
            "Debt Service",
            "Cashflow",
            "DSCR",
          ]}
          rows={props.yearlyMetrics.map((entry) => [
            String(entry.year),
            formatCurrency(entry.income),
            formatCurrency(entry.capex),
            formatCurrency(entry.interest),
            formatCurrency(entry.principal),
            formatCurrency(entry.debtService),
            formatCurrency(entry.cashflow),
            formatNumber(entry.dscr),
          ])}
        />
      )}
    </Card>
  );
}

type DetailFocus = "all" | "darlehen" | "finance" | "income" | "capex";

export default function PropertyDetailPage(props: {
  mode?: PageMode;
  focus?: DetailFocus;
}) {
  const { propertyId } = useParams<{ propertyId: string }>();
  const location = useLocation();
  const safePropertyId = propertyId ?? "";

  const pageMode: PageMode =
    props.mode ??
    (location.pathname.endsWith("/monate")
      ? "monate"
      : location.pathname.endsWith("/auswertungen")
        ? "auswertungen"
        : "detail");


  const focus: DetailFocus = props.focus ?? "all";
  const showAllDetailSections = focus === "all";
  const showBasisData = showAllDetailSections;
  const showLoanEdit = showAllDetailSections || focus === "darlehen";
  const showFinance = showAllDetailSections || focus === "finance";
  const showIncome = showAllDetailSections || focus === "income";
  const showCapex = showAllDetailSections || focus === "capex";

  const {
    data: resolvedContext,
    loading: resolverLoading,
    error: resolverError,
  } = useResolvedPropertyContext(safePropertyId);

  const incomePropertyId = resolvedContext?.incomePropertyId ?? safePropertyId;
  const ledgerPropertyId = resolvedContext?.ledgerPropertyId ?? safePropertyId;

  const {
    data: propertyData,
    isLoading: propertyLoading,
    error: propertyError,
    reload: reloadProperty,
  } = usePropertyDetail(
    resolvedContext?.portfolioPropertyId ?? resolvedContext?.corePropertyId ?? safePropertyId,
  );

  const property = useMemo(() => normalizeProperty(propertyData), [propertyData]);

  const {
    propertyIncome,
    yearlyIncome,
    yearlyCapex,
    isLoading: incomeLoading,
    error: incomeError,
    reload: reloadIncome,
  } = useIncome(incomePropertyId);

  const {
    ledgerEntries,
    isLoading: ledgerLoading,
    error: ledgerError,
    reload: reloadLedger,
  } = useLedger(ledgerPropertyId);

  const [editableLedgerRows, setEditableLedgerRows] = useState<EditableLedgerRow[]>([]);
  const [editableLedgerLoading, setEditableLedgerLoading] = useState(false);
  const [editableLedgerError, setEditableLedgerError] = useState<string | null>(null);
  const [isSavingLedger, setIsSavingLedger] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const ledger = useMemo<YearlyLedgerEntry[]>(
    () => [...ledgerEntries].sort((a, b) => Number(a.year) - Number(b.year)),
    [ledgerEntries],
  );

  const incomeData = useMemo<{
    propertyIncome: PropertyIncome | null;
    yearlyIncome: YearlyIncomeEntry[];
    yearlyCapex: YearlyCapexEntry[];
  }>(
    () => ({
      propertyIncome,
      yearlyIncome: [...yearlyIncome].sort((a, b) => Number(a.year) - Number(b.year)),
      yearlyCapex: [...yearlyCapex].sort((a, b) => Number(a.year) - Number(b.year)),
    }),
    [propertyIncome, yearlyIncome, yearlyCapex],
  );

  const propertyContextText = [
    resolvedContext?.displayName,
    resolvedContext?.address,
    property?.name,
    property?.title,
    property?.address,
    property?.street,
  ].filter(Boolean).join(" ");

  useEffect(() => {
    let cancelled = false;

    async function loadEditableLedgerRows() {
      if (!ledgerPropertyId) {
        if (!cancelled) {
          setEditableLedgerRows([]);
          setEditableLedgerLoading(false);
          setEditableLedgerError(null);
        }
        return;
      }

      try {
        setEditableLedgerLoading(true);
        setEditableLedgerError(null);

        const data = await listPropertyLoanLedgerRows({ propertyIds: [ledgerPropertyId] });

        if (cancelled) return;

        const rows = data.map((row) => ({
              id: makeClientId(),
              dbId: row.id || null,
              year: String(row.year),
              interestPayment: String(row.interest),
              principalPayment: String(row.principal),
              remainingBalance: String(cleanRemainingBalanceForProperty(row.balance, propertyContextText)),
              source: row.source ?? "manual",
            }));

        setEditableLedgerRows(rows);
        setEditableLedgerLoading(false);
      } catch (error) {
        if (cancelled) return;
        setEditableLedgerRows([]);
        setEditableLedgerLoading(false);
        setEditableLedgerError(getErrorMessage(error));
      }
    }

    void loadEditableLedgerRows();

    return () => {
      cancelled = true;
    };
  }, [ledgerPropertyId, propertyContextText]);

  const derivedLedgerForFinance = useMemo<YearlyLedgerEntry[]>(() => {
    if (editableLedgerRows.length === 0) return ledger;

    return [...editableLedgerRows]
      .map((row) => ({
        year: Number(row.year),
        interestPayment: toSafeNumber(row.interestPayment),
        principalPayment: toSafeNumber(row.principalPayment),
        remainingBalance: cleanRemainingBalanceForProperty(row.remainingBalance, propertyContextText),
        source: row.source || "manual",
      }))
      .filter((row) => Number.isFinite(Number(row.year)))
      .sort((a, b) => Number(a.year) - Number(b.year));
  }, [editableLedgerRows, ledger, propertyContextText]);

  const finance = useMemo(() => {
    return buildBaseFinanceMetrics({
      ledger: derivedLedgerForFinance,
      yearlyIncome: incomeData.yearlyIncome,
      yearlyCapex: incomeData.yearlyCapex,
      propertyIncome: incomeData.propertyIncome,
    });
  }, [derivedLedgerForFinance, incomeData]);

  const isLoading =
    resolverLoading || propertyLoading || incomeLoading || ledgerLoading || editableLedgerLoading;
  const firstError = resolverError ?? propertyError ?? incomeError ?? ledgerError ?? editableLedgerError;

  const title = cleanDisplayName(
    [
      resolvedContext?.displayName,
      property?.name,
      property?.title,
      property?.address,
      property?.street,
    ].find((value) => value && String(value).trim().length > 0),
    "Objekt",
  );

  const resolvedLocation = cleanDisplayName(
    [
      resolvedContext?.address,
      property?.city,
      property?.location,
      property?.address,
      property?.street,
    ].find((value) => value && String(value).trim().length > 0),
    "–",
  );

  const purchasePrice =
    toNullableNumber(property?.purchasePrice ?? property?.purchase_price ?? property?.kaufpreis) ?? 0;

  const livingArea = toNullableNumber(
    property?.livingArea ??
      property?.living_area ??
      property?.wohnflaeche ??
      property?.wohnfläche,
  );

  const yearBuilt = toNullableNumber(
    property?.yearBuilt ?? property?.year_built ?? property?.baujahr,
  );

  function updateLedgerRow(rowId: string, field: keyof EditableLedgerRow, value: string) {
    setEditableLedgerRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)),
    );
    setSaveSuccess(null);
  }

  function addLedgerRow() {
    const lastYear =
      editableLedgerRows.length > 0
        ? Math.max(...editableLedgerRows.map((row) => toSafeNumber(row.year, 0)))
        : new Date().getFullYear();

    setEditableLedgerRows((prev) => [
      ...prev,
      {
        id: makeClientId(),
        dbId: null,
        year: String(lastYear + 1),
        interestPayment: "0",
        principalPayment: "0",
        remainingBalance: "0",
        source: "manual",
        isNew: true,
      },
    ]);
    setSaveSuccess(null);
  }

  function removeUnsavedRow(rowId: string) {
    setEditableLedgerRows((prev) => prev.filter((row) => row.id !== rowId));
    setSaveSuccess(null);
  }

  async function saveLedgerChanges() {
    if (!ledgerPropertyId) {
      setEditableLedgerError("Keine ledgerPropertyId gefunden.");
      return;
    }

    try {
      setIsSavingLedger(true);
      setEditableLedgerError(null);
      setSaveSuccess(null);

      const rowsSorted = [...editableLedgerRows].sort(
        (a, b) => toSafeNumber(a.year, 0) - toSafeNumber(b.year, 0),
      );

      for (const row of rowsSorted) {
        const payload = {
          year: toSafeNumber(row.year, 0),
          interest: toSafeNumber(row.interestPayment, 0),
          principal: toSafeNumber(row.principalPayment, 0),
          balance: toSafeNumber(row.remainingBalance, 0),
          source: row.source?.trim() || "manual",
        };

        if (!payload.year) continue;

        if (row.dbId) {
          // property_loan_ledger benutzt in der aktuellen DB die kanonischen Spalten
          // interest / principal / balance. Die alten UI-Namen interest_payment /
          // principal_payment / remaining_balance verursachten beim PATCH einen 400 Bad Request.
          await updatePropertyLoanLedgerRow(Number(row.dbId), payload);
        } else {
          await insertPropertyLoanLedgerRow(ledgerPropertyId, payload);
        }
      }

      const refreshed = await listPropertyLoanLedgerRows({ propertyIds: [ledgerPropertyId] });

      setEditableLedgerRows(
        refreshed.map((row) => ({
              id: makeClientId(),
              dbId: row.id || null,
              year: String(row.year),
              interestPayment: String(row.interest),
              principalPayment: String(row.principal),
              remainingBalance: String(cleanRemainingBalanceForProperty(row.balance, propertyContextText)),
              source: row.source ?? "manual",
            })),
      );

      await Promise.allSettled([reloadLedger(), reloadProperty()]);
      setSaveSuccess("Darlehensdaten wurden gespeichert.");
    } catch (error) {
      setEditableLedgerError(getErrorMessage(error));
    } finally {
      setIsSavingLedger(false);
    }
  }

  async function handleReload() {
    setSaveSuccess(null);
    await Promise.allSettled([reloadProperty(), reloadIncome(), reloadLedger()]);
  }

  if (!safePropertyId) {
    return (
      <div className="space-y-6">
        <EmptyState
          title="Keine Objekt-ID gefunden"
          description="Die URL enthält keine gültige Property-ID."
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-72 animate-pulse rounded-xl bg-slate-200" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-200" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-slate-200" />
        <div className="h-64 animate-pulse rounded-2xl bg-slate-200" />
      </div>
    );
  }

  if (firstError) {
    return (
      <div className="space-y-6">
        <Card
          title="Fehler beim Laden"
          action={
            <button
              type="button"
              onClick={handleReload}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              Neu laden
            </button>
          }
        >
          <p className="text-sm text-rose-700">{getErrorMessage(firstError)}</p>
        </Card>
      </div>
    );
  }

  if (!property && !resolvedContext) {
    return (
      <div className="space-y-6">
        <EmptyState
          title="Objekt nicht gefunden"
          description={`Für die Property-ID "${safePropertyId}" wurde kein Objekt gefunden.`}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">
            {pageMode === "monate"
              ? "Monate"
              : pageMode === "auswertungen"
                ? "Auswertungen"
                : "Objektdetail"}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-2 text-sm text-slate-600">Standort: {resolvedLocation}</p>
        </div>

        <button
          type="button"
          onClick={handleReload}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Daten neu laden
        </button>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Jährlicher Income"
          value={formatCurrency(finance.aggregated.annualIncome)}
        />
        <StatCard
          label="Debt Service"
          value={formatCurrency(finance.aggregated.debtService)}
        />
        <StatCard
          label="Cashflow"
          value={formatCurrency(finance.aggregated.cashflow)}
          className={
            finance.aggregated.cashflow >= 0
              ? "border-emerald-200 bg-emerald-50"
              : "border-rose-200 bg-rose-50"
          }
        />
        <StatCard
          label="DSCR / Risiko"
          value={`${formatNumber(finance.aggregated.dscr)} · ${finance.aggregated.riskLevel}`}
          className={getRiskTone(finance.aggregated.riskLevel)}
        />
      </div>

      {pageMode === "detail" && (
        <>
          {showBasisData && (
          <Card title="Basisdaten">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <InfoRow label="Kaufpreis" value={formatCurrency(purchasePrice)} />
              <InfoRow
                label="Wohnfläche"
                value={livingArea !== null ? `${formatInteger(livingArea)} m²` : "–"}
              />
              <InfoRow
                label="Baujahr"
                value={yearBuilt !== null ? formatInteger(yearBuilt) : "–"}
              />
              <InfoRow
                label="Restschuld"
                value={formatCurrency(finance.aggregated.remainingBalance)}
              />
            </div>
          </Card>
          )}

          {showLoanEdit && (
          <Card
            title="Darlehensübersicht / Edit"
            action={
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={addLedgerRow}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900"
                >
                  Jahr hinzufügen
                </button>
                <button
                  type="button"
                  onClick={saveLedgerChanges}
                  disabled={isSavingLedger}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {isSavingLedger ? "Speichert..." : "Änderungen speichern"}
                </button>
              </div>
            }
          >
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Hier bearbeitest du direkt die Darlehenswerte des aktuellen Objekts. Nach dem
                Speichern werden die Werte wieder für die Finanzberechnung dieses Objekts verwendet.
              </p>

              {saveSuccess ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  {saveSuccess}
                </div>
              ) : null}

              {editableLedgerError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {editableLedgerError}
                </div>
              ) : null}

              {editableLedgerRows.length === 0 ? (
                <EmptyState
                  title="Noch keine Darlehensjahre vorhanden"
                  description="Lege das erste Jahr direkt hier an."
                />
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">Jahr</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">Zinsen</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">Tilgung</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">Debt Service</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">Restschuld</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">Quelle</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">Aktion</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {editableLedgerRows
                        .slice()
                        .sort((a, b) => toSafeNumber(a.year, 0) - toSafeNumber(b.year, 0))
                        .map((row) => {
                          const debtService =
                            toSafeNumber(row.interestPayment, 0) + toSafeNumber(row.principalPayment, 0);

                          return (
                            <tr key={row.id}>
                              <td className="px-4 py-3 align-top">
                                <input
                                  value={row.year}
                                  onChange={(event) => updateLedgerRow(row.id, "year", event.target.value)}
                                  className="w-24 rounded-xl border border-slate-300 px-3 py-2 outline-none"
                                />
                              </td>
                              <td className="px-4 py-3 align-top">
                                <input
                                  value={row.interestPayment}
                                  onChange={(event) =>
                                    updateLedgerRow(row.id, "interestPayment", event.target.value)
                                  }
                                  className="w-32 rounded-xl border border-slate-300 px-3 py-2 outline-none"
                                />
                              </td>
                              <td className="px-4 py-3 align-top">
                                <input
                                  value={row.principalPayment}
                                  onChange={(event) =>
                                    updateLedgerRow(row.id, "principalPayment", event.target.value)
                                  }
                                  className="w-32 rounded-xl border border-slate-300 px-3 py-2 outline-none"
                                />
                              </td>
                              <td className="px-4 py-3 align-top text-slate-900">
                                {formatCurrency(debtService)}
                              </td>
                              <td className="px-4 py-3 align-top">
                                <input
                                  value={row.remainingBalance}
                                  onChange={(event) =>
                                    updateLedgerRow(row.id, "remainingBalance", event.target.value)
                                  }
                                  className="w-36 rounded-xl border border-slate-300 px-3 py-2 outline-none"
                                />
                              </td>
                              <td className="px-4 py-3 align-top">
                                <input
                                  value={row.source}
                                  onChange={(event) => updateLedgerRow(row.id, "source", event.target.value)}
                                  className="w-28 rounded-xl border border-slate-300 px-3 py-2 outline-none"
                                />
                              </td>
                              <td className="px-4 py-3 align-top">
                                {!row.dbId ? (
                                  <button
                                    type="button"
                                    onClick={() => removeUnsavedRow(row.id)}
                                    className="rounded-xl border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700"
                                  >
                                    Entfernen
                                  </button>
                                ) : (
                                  <span className="text-xs text-slate-500">Bestehender Datensatz</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
          )}

          {showFinance && <FinanceSection yearlyMetrics={finance.yearlyMetrics} />}
          {showIncome && <IncomeSection incomeData={incomeData} />}
          {showCapex && <CapexSection yearlyCapex={incomeData.yearlyCapex} />}
          {showLoanEdit && <LedgerReadOnlySection ledger={derivedLedgerForFinance} />}
        </>
      )}

      {pageMode === "monate" && (
        <>
          <Card title="Monats-/Periodenansicht">
            <div className="text-sm text-slate-600">
              Diese Ansicht verwendet aktuell die sauber aufgelösten Income- und Ledger-IDs.
              Monatsspezifische Datenservices können später separat ergänzt werden.
            </div>
          </Card>

          <IncomeSection incomeData={incomeData} />

          <Card title="Periodisierte Finanzsicht">
            {finance.yearlyMetrics.length === 0 ? (
              <EmptyState
                title="Keine Perioden-Daten"
                description="Es konnten noch keine periodisierten Finanzdaten dargestellt werden."
              />
            ) : (
              <DataTable
                columns={["Jahr", "Income", "Capex", "Debt Service", "Cashflow", "DSCR"]}
                rows={finance.yearlyMetrics.map((entry) => [
                  String(entry.year),
                  formatCurrency(entry.income),
                  formatCurrency(entry.capex),
                  formatCurrency(entry.debtService),
                  formatCurrency(entry.cashflow),
                  formatNumber(entry.dscr),
                ])}
              />
            )}
          </Card>
        </>
      )}

      {pageMode === "auswertungen" && (
        <>
          <Card title="Auswertungen">
            <div className="text-sm text-slate-600">
              Diese Ansicht bündelt die Jahresauswertung für Income, Capex und Finanzierung auf
              Basis der Datenquellen.
            </div>
          </Card>

          <IncomeSection incomeData={incomeData} />
          <CapexSection yearlyCapex={incomeData.yearlyCapex} />
          <LedgerReadOnlySection ledger={derivedLedgerForFinance} />
          <FinanceSection yearlyMetrics={finance.yearlyMetrics} />
        </>
      )}
    </div>
  );
}
