import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import brandLogo from "../assets/koenen-brand-logo.webp";
import { supabase } from "../lib/supabase";
import { MIETBESTANDTEIL_NK_CATEGORY, isPureRentBackPayment } from "../lib/financeEntryLabels";
import { shiftIsoDateByMonthsClamped } from "../lib/rentMonth";
import { useAppData, type FinanceEntry } from "../state/AppDataContext";
import {
  isVacancyInRange,
  listDerivedVacanciesFromEndedRentals,
  listVacancies,
  type UnitVacancy,
} from "../services/vacancyService";

type TenantInfo = { firstName: string; lastName: string; phone: string; email: string };
type TenantContractInfo = {
  id: string;
  totalRent: number | null;
  coldRent: number | null;
  operatingCosts: number | null;
  rentType: string | null;
};
type RentStatus = "paid" | "partial" | "missing" | "inactive" | "vacant";
type PeriodMode = "month" | "year";
type OverviewRow = {
  objectId: string;
  objectCode: string | null;
  tenantKey: string;
  tenantLookupKey: string;
  label: string;
  unitLabel?: string;
  referenceLabel?: string;
  paidAmount: number;
  expectedAmount: number | null;
  lastBookingDate: string | null;
  status: RentStatus;
  vacancyReason?: string | null;
  periodLabel: string;
  year: number;
  month: number;
  expectedSource: string;
  tenantInfo: TenantInfo;
};

type AnnualOverviewRow = {
  key: string;
  objectId: string;
  objectCode: string | null;
  label: string;
  unitLabel?: string;
  referenceLabel?: string;
  tenantLookupKey: string;
  tenantInfo: TenantInfo;
  tenantHistory: TenantInfo[];
  months: Array<OverviewRow | undefined>;
  yearExpected: number;
  yearPaid: number;
  yearOpen: number;
  yearOverpaid: number;
};

export type RentAnnualKpiLabel =
  | "1.-5. Tag"
  | "6.-10. Tag"
  | "11.-20. Tag"
  | "ab 21. Tag"
  | "Teilweise"
  | "Fehlt"
  | "Leerstand"
  | "Neutral"
  | "—";

export type RentAnnualReportMonth = {
  month: number;
  monthLabel: string;
  kpi: RentAnnualKpiLabel;
  status: RentStatus | "none";
  paid: number;
  expected: number;
  open: number;
  overpaid: number;
  paymentDate: string | null;
  expectedSource: string;
};

export type RentAnnualReportRow = {
  key: string;
  objectId: string;
  objectLabel: string;
  unitLabel: string;
  tenantName: string;
  months: RentAnnualReportMonth[];
  yearPaid: number;
  yearExpected: number;
  yearOpen: number;
  yearOverpaid: number;
};

export type RentAnnualPropertyTotal = {
  objectId: string;
  objectLabel: string;
  paid: number;
  expected: number;
  open: number;
  overpaid: number;
};

export type RentAnnualReportSnapshot = {
  year: number;
  objectFilter: string;
  rows: RentAnnualReportRow[];
  propertyTotals: RentAnnualPropertyTotal[];
  totals: { paid: number; expected: number; open: number; overpaid: number };
  kpis: Record<Exclude<RentAnnualKpiLabel, "—">, number>;
};

type MietuebersichtProps = {
  embeddedAnnualReport?: boolean;
  reportYear?: number;
  reportObjectId?: string | null;
  onAnnualReportChange?: (snapshot: RentAnnualReportSnapshot) => void;
};

const emptyTenant: TenantInfo = { firstName: "", lastName: "", phone: "", email: "" };

type TenantContractProfileRow = {
  id: string;
  property_id: string | null;
  object_code: string | null;
  unit_label: string | null;
  rent_type: string | null;
  cold_rent: number | null;
  operating_costs: number | null;
  total_rent: number | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  tenant_profiles?: {
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
    email: string | null;
    phone: string | null;
    mobile: string | null;
  } | null;
};

function contractRentAmount(contract: TenantContractProfileRow | TenantContractInfo | null | undefined): number | null {
  if (!contract) return null;
  const totalRent = "total_rent" in contract ? Number(contract.total_rent) : Number(contract.totalRent);
  if (Number.isFinite(totalRent) && totalRent > 0) return totalRent;

  const coldRent = "cold_rent" in contract ? Number(contract.cold_rent) : Number(contract.coldRent);
  const operatingCosts = "operating_costs" in contract ? Number(contract.operating_costs) : Number(contract.operatingCosts);
  const summed = (Number.isFinite(coldRent) ? coldRent : 0) + (Number.isFinite(operatingCosts) ? operatingCosts : 0);
  return summed > 0 ? summed : null;
}

function tenantContractInfoFromContract(contract: TenantContractProfileRow | undefined): TenantContractInfo | null {
  if (!contract) return null;
  return {
    id: contract.id,
    totalRent: contract.total_rent == null ? null : Number(contract.total_rent),
    coldRent: contract.cold_rent == null ? null : Number(contract.cold_rent),
    operatingCosts: contract.operating_costs == null ? null : Number(contract.operating_costs),
    rentType: contract.rent_type ?? null,
  };
}

type PortfolioPropertyRow = {
  id: string;
  name: string | null;
  core_property_id: string | null;
};

type PortfolioRentalRow = {
  id: string;
  property_id: string;
  unit_id?: string | null;
  rent_type: string | null;
  rent_monthly: number | null;
  start_date: string | null;
  end_date: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type RentAdjustmentRow = {
  id: string | null;
  property_id: string | null;
  object_label: string | null;
  tenant_name?: string | null;
  effective_date: string | null;
  effective_end_date?: string | null;
  old_cold_rent?: number | null;
  old_operating_costs?: number | null;
  old_total_rent?: number | null;
  new_cold_rent?: number | null;
  new_operating_costs?: number | null;
  new_total_rent?: number | null;
  note?: string | null;
  created_at?: string | null;
  unit_label?: string | null;
  object_code?: string | null;
  [key: string]: unknown;
};

type UnitDefinition = {
  ref: string;
  title: string;
  matcher: (booking: FinanceEntry) => boolean;
  rentalMatcher?: (rental: PortfolioRentalRow) => boolean;
  expectedMode?: "sum" | "largest" | "single";
};

function toIso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function currentMonthRange(baseDate = new Date()) {
  const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
  const previousMonthEndWindowStart = new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 25);
  return {
    label: new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(start),
    start: toIso(start),
    end: toIso(end),
    previousMonthEndWindowStart: toIso(previousMonthEndWindowStart),
    year: start.getFullYear(),
    month: start.getMonth() + 1,
  };
}

function isDateInRange(value: string | null | undefined, start: string, end: string): boolean {
  return Boolean(value) && value! >= start && value! <= end;
}

function dateKeyFromValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const rawValue = String(value).trim();
  const isoValue = rawValue.includes("T") ? rawValue.slice(0, 10) : rawValue;
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoValue)) return isoValue;

  const germanMatch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(isoValue.replace(/\s+/g, ""));
  if (germanMatch) {
    const [, day, month, year] = germanMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsedDate = new Date(rawValue);
  if (Number.isNaN(parsedDate.getTime())) return null;
  return toIso(parsedDate);
}

function normalizedContractEndDate(contract: Pick<TenantContractProfileRow, "start_date" | "end_date">): string | null {
  const startDate = dateKeyFromValue(contract.start_date);
  const endDate = dateKeyFromValue(contract.end_date);
  // Altdaten-Schutz: Ein Enddatum vor Mietbeginn ist fachlich ungueltig
  // und wird wie ein offener Vertrag behandelt.
  if (startDate && endDate && endDate < startDate) return null;
  return endDate;
}

function bookingDayOfMonth(value: string | null | undefined): number | null {
  if (!value) return null;
  const day = Number(value.slice(8, 10));
  return Number.isFinite(day) ? day : null;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("de-DE").format(date);
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function addMonthsToYearMonth(year: number, month: number, offset: number) {
  const date = new Date(year, month - 1 + offset, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function monthRangeFromYearMonth(year: number, month: number) {
  return currentMonthRange(new Date(year, month - 1, 1));
}

function buildDisplayedPeriods(year: number, month: number, mode: PeriodMode) {
  if (mode === "month") return [monthRangeFromYearMonth(year, month)];
  const now = new Date();
  const currentYear = now.getFullYear();
  const maxMonth = year === currentYear ? now.getMonth() + 1 : 12;
  return Array.from({ length: maxMonth }, (_, index) => monthRangeFromYearMonth(year, index + 1));
}

function rentStartDateForObject(objectLabel: string): string | null {
  const normalized = normalizeReferenceText(objectLabel);
  if (normalized.includes("hohenloher")) return "2025-04-01";
  if (normalized.includes("rosenstein")) return "2025-11-01";
  return null;
}

function isInactiveForRentMonth(objectLabel: string, monthStart: string): boolean {
  const startDate = rentStartDateForObject(objectLabel);
  return Boolean(startDate && monthStart < startDate);
}

function resolveRentStatus(paidAmount: number, expectedAmount: number | null, inactive: boolean): RentStatus {
  if (inactive) return "inactive";
  if (expectedAmount !== null) {
    if (Math.abs(paidAmount - expectedAmount) <= 0.01) return "paid";
    if (paidAmount > 0) return "partial";
    return "missing";
  }
  return paidAmount > 0 ? "paid" : "missing";
}

function statusLabel(status: RentStatus): string {
  if (status === "paid") return "BEZAHLT";
  if (status === "partial") return "TEILWEISE";
  if (status === "inactive") return "NEUTRAL";
  if (status === "vacant") return "LEERSTAND";
  return "FEHLT";
}

function statusClass(status: RentStatus): string {
  if (status === "paid") return "is-paid";
  if (status === "partial") return "is-partial";
  if (status === "inactive") return "is-inactive";
  if (status === "vacant") return "is-vacant";
  return "is-missing";
}

function monthShortLabel(month: number): string {
  return new Intl.DateTimeFormat("de-DE", { month: "short" }).format(new Date(2025, month - 1, 1)).replace(".", "");
}

function paymentTimingTone(row: OverviewRow | undefined): string {
  if (!row) return "bg-slate-50 text-slate-300 border-slate-100";
  if (row.status === "vacant") return "bg-zinc-100 text-zinc-700 border-zinc-200";
  if (row.status === "inactive") return "bg-slate-100 text-slate-500 border-slate-200";
  if (row.status === "missing") return "bg-rose-50 text-rose-800 border-rose-200";
  if (row.status === "partial") return "bg-amber-50 text-amber-800 border-amber-200";

  const day = bookingDayOfMonth(row.lastBookingDate);
  if (day === null) return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (day <= 5) return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (day <= 10) return "bg-teal-50 text-teal-800 border-teal-200";
  if (day <= 20) return "bg-sky-50 text-sky-800 border-sky-200";
  return "bg-indigo-50 text-indigo-800 border-indigo-200";
}

function paymentTimingLabel(row: OverviewRow | undefined): RentAnnualKpiLabel {
  if (!row) return "—";
  if (row.status === "vacant") return "Leerstand";
  if (row.status === "inactive") return "Neutral";
  if (row.status === "missing") return "Fehlt";
  if (row.status === "partial") return "Teilweise";

  const day = bookingDayOfMonth(row.lastBookingDate);
  if (day === null || day <= 5) return "1.-5. Tag";
  if (day <= 10) return "6.-10. Tag";
  if (day <= 20) return "11.-20. Tag";
  return "ab 21. Tag";
}

function normalizeFilterText(value: string | null | undefined): string {
  return normalizeReferenceText(value).replace(/\s+/g, " ").trim();
}

function rentalOverlapsMonth(rental: PortfolioRentalRow, start: string, end: string): boolean {
  if (!rental.start_date) return false;
  if (rental.start_date > end) return false;
  if (rental.end_date && rental.end_date < start) return false;
  return true;
}

function rentalMatchesUnit(rental: PortfolioRentalRow, unit: UnitDefinition): boolean {
  if (unit.rentalMatcher) return unit.rentalMatcher(rental);

  const unitText = normalizeReferenceText(`${unit.ref} ${unit.title}`);
  const rentalText = normalizeReferenceText(`${rental.rent_type ?? ""} ${rental.unit_id ?? ""}`);
  const compactRental = compactReferenceText(`${rental.rent_type ?? ""} ${rental.unit_id ?? ""}`);
  const compactUnit = compactReferenceText(`${unit.ref} ${unit.title}`);
  const rentalLooksGarage =
    rentalText.includes("garage") ||
    rentalText.includes("tiefgarage") ||
    rentalText.includes("stellplatz") ||
    rentalText.includes("tg") ||
    rentalText.includes("p250") ||
    rentalText.includes("p253") ||
    rentalText.includes("p254");

  if (!rentalText) return true;
  if (unit.ref === "hauptmiete" || unit.ref === "wohnung") return !rentalLooksGarage;
  if (unit.ref === "garage") return rentalLooksGarage;
  return rentalText.includes(unitText) || unitText.includes(rentalText) || compactRental.includes(compactUnit) || compactUnit.includes(compactRental);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

function candidatePropertyIdsForObject(
  object: { id: string; code: string | null; label: string },
  portfolioRows: Array<{ property_id: string; portfolio_property_id: string | null; property_name: string }>,
  portfolioProperties: PortfolioPropertyRow[],
): string[] {
  const objectName = normalizeFilterText(object.label);
  const ids = [object.id];

  for (const row of portfolioRows) {
    if (String(row.property_id) === object.id || row.portfolio_property_id === object.id || normalizeFilterText(row.property_name) === objectName) {
      ids.push(row.property_id, row.portfolio_property_id ?? "");
    }
  }

  for (const property of portfolioProperties) {
    const propertyName = normalizeFilterText(property.name);
    if (
      property.id === object.id ||
      property.core_property_id === object.id ||
      (propertyName && (propertyName === objectName || propertyName.includes(objectName) || objectName.includes(propertyName)))
    ) {
      ids.push(property.id, property.core_property_id ?? "");
    }
  }

  return uniqueStrings(ids);
}

function expectedRentFromRentals(
  rentals: PortfolioRentalRow[],
  candidateIds: string[],
  unit: UnitDefinition,
  start: string,
  end: string,
): { expectedAmount: number | null; source: string; activeRentalCount: number } {
  const idSet = new Set(candidateIds);
  const matches = rentals.filter((rental) => idSet.has(String(rental.property_id)) && rentalOverlapsMonth(rental, start, end) && rentalMatchesUnit(rental, unit));
  const amounts = matches.map((rental) => Number(rental.rent_monthly) || 0).filter((amount) => amount > 0);
  let amount = 0;

  if (unit.expectedMode === "sum") {
    amount = amounts.reduce((sum, value) => sum + value, 0);
  } else if (unit.expectedMode === "largest") {
    amount = Math.max(0, ...amounts);
  } else {
    // Einzelobjekte wie Lilienthaler Str. haben teils doppelte historische
    // Vermietungszeiträume. Für den Mieteingang zählt pro Monat genau der
    // fachlich gültige Zeitraum aus Portfolio -> Vermietungszeiträume, nicht
    // die Summe überlappender Korrektur-/Duplikatzeilen.
    const selected = [...matches]
      .filter((rental) => Number(rental.rent_monthly) > 0)
      .sort((a, b) => {
        const startCompare = String(b.start_date ?? "").localeCompare(String(a.start_date ?? ""));
        if (startCompare !== 0) return startCompare;
        const endCompare = String(b.end_date ?? "9999-12-31").localeCompare(String(a.end_date ?? "9999-12-31"));
        if (endCompare !== 0) return endCompare;
        const updatedCompare = String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""));
        if (updatedCompare !== 0) return updatedCompare;
        return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
      })[0];
    amount = Number(selected?.rent_monthly) || 0;
  }

  return {
    expectedAmount: amount > 0 ? amount : null,
    source: matches.length ? "Portfolio > Vermietungszeiträume" : "Kein aktiver Vermietungszeitraum",
    activeRentalCount: matches.length,
  };
}


function normalizeReferenceText(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll("ß", "ss")
    .replace(/[ä]/g, "a")
    .replace(/[ö]/g, "o")
    .replace(/[ü]/g, "u")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactReferenceText(value: string | null | undefined): string {
  return normalizeReferenceText(value).replace(/\s+/g, "");
}

function tenantHasAnyValue(tenant: TenantInfo): boolean {
  return Boolean(tenant.firstName || tenant.lastName || tenant.phone || tenant.email);
}

function moneyFromUnknown(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function valueFromRecord(row: RentAdjustmentRow, keys: string[]): unknown {
  const record = row as Record<string, unknown>;
  return keys.map((key) => record[key]).find((value) => value != null && value !== "");
}

function dateKeyFromUnknown(value: unknown): string | null {
  if (typeof value === "string") return dateKeyFromValue(value);
  if (typeof value === "number" || value instanceof Date) return dateKeyFromValue(String(value));
  return null;
}

function rentAdjustmentStartDate(row: RentAdjustmentRow): string | null {
  const rawEffectiveStart = valueFromRecord(row, [
    "effective_date",
    "effective_from",
    "valid_from",
    "from_date",
    "rent_start_date",
    "new_rent_from",
    "new_rent_start_date",
    "start_date",
    "begin_date",
  ]);
  const effectiveStart = dateKeyFromUnknown(rawEffectiveStart);
  if (effectiveStart) return effectiveStart;

  // Legacy fallback only: adjustment_date can be the entry date in older rows,
  // so it must never override a true rent start date.
  const legacyStart = valueFromRecord(row, ["adjustment_effective_date", "adjustment_date"]);
  return dateKeyFromUnknown(legacyStart);
}

function rentAdjustmentEndDate(row: RentAdjustmentRow): string | null {
  const rawEnd = valueFromRecord(row, ["effective_end_date", "valid_until", "until_date", "rent_end_date", "end_date"]);
  const end = dateKeyFromUnknown(rawEnd);
  const start = rentAdjustmentStartDate(row);
  if (start && end && end < start) return null;
  return end;
}

function rentAdjustmentTotal(row: RentAdjustmentRow): number | null {
  const explicit = moneyFromUnknown(valueFromRecord(row, [
    "new_total_rent",
    "total_rent",
    "warm_rent",
    "warmmiete",
    "new_warm_rent",
    "current_total_rent",
    "current_warm_rent",
    "monthly_rent",
    "rent_total",
  ]));
  if (explicit != null && explicit > 0) return explicit;
  const cold = moneyFromUnknown(valueFromRecord(row, ["new_cold_rent", "cold_rent", "net_cold_rent", "kaltmiete", "new_net_rent"])) ?? 0;
  const operatingCosts = moneyFromUnknown(valueFromRecord(row, ["new_operating_costs", "operating_costs", "nebenkosten", "betriebskosten", "new_service_charges"])) ?? 0;
  const total = cold + operatingCosts;
  return total > 0 ? total : null;
}

function rentAdjustmentOldTotal(row: RentAdjustmentRow): number | null {
  const explicit = moneyFromUnknown(valueFromRecord(row, ["old_total_rent", "previous_total_rent", "old_warm_rent", "previous_warm_rent"]));
  if (explicit != null && explicit > 0) return explicit;
  const cold = moneyFromUnknown(valueFromRecord(row, ["old_cold_rent", "previous_cold_rent"]));
  const operatingCosts = moneyFromUnknown(valueFromRecord(row, ["old_operating_costs", "previous_operating_costs"]));
  const total = (cold ?? 0) + (operatingCosts ?? 0);
  return total > 0 ? total : null;
}

function rentAdjustmentMatchesObject(
  row: RentAdjustmentRow,
  object: { id: string; code: string | null; label: string },
  candidateIds: string[],
): boolean {
  // Die fachliche Objektbezeichnung der Mietanpassung ist hier die stärkste
  // Zuordnung. Portfolio-/Kern-IDs können in historischen Bridge-Daten als
  // Alias auch bei einem anderen Objekt auftauchen. Würden wir dann nur der ID
  // vertrauen, könnte z. B. eine Lilienthaler-Anpassung (1.542,55 EUR) als
  // Sollmiete der Fürther Wohnung verwendet werden.
  const adjustmentLabel = normalizeReferenceText(row.object_label);
  const objectLabel = normalizeReferenceText(object.label);
  if (adjustmentLabel) {
    return adjustmentLabel === objectLabel
      || adjustmentLabel.startsWith(`${objectLabel} `)
      || objectLabel.startsWith(`${adjustmentLabel} `)
      || enoughAddressOverlap(adjustmentLabel, objectLabel);
  }

  const propertyId = row.property_id == null ? "" : String(row.property_id);
  if (propertyId) return propertyId === object.id || candidateIds.includes(propertyId);

  const rowText = normalizeReferenceText(`${row.object_label ?? ""} ${row.object_code ?? ""} ${row.note ?? ""}`);
  const objectText = normalizeReferenceText(`${object.label} ${object.code ?? ""}`);
  return enoughTokenOverlap(rowText, objectText) || compactReferenceText(rowText).includes(compactReferenceText(object.label));
}

function rentAdjustmentMatchesUnit(
  row: RentAdjustmentRow,
  object: { id: string; code: string | null; label: string },
  candidateIds: string[],
  unit: UnitDefinition,
): boolean {
  if (!rentAdjustmentMatchesObject(row, object, candidateIds)) return false;
  const rowText = normalizeReferenceText(`${row.unit_label ?? ""} ${row.object_label ?? ""} ${row.tenant_name ?? ""} ${row.note ?? ""}`);
  const unitCompact = compactReferenceText(`${unit.ref} ${unit.title}`);
  const rowParking = parkingCodeFromText(rowText);
  const unitParking = parkingCodeFromText(unitCompact);
  if (rowParking || unitParking) {
    if (rowParking && unitParking) return rowParking === unitParking;
    if (rowParking && unit.ref === "garage") return true;
    return false;
  }
  if (unit.ref === "hauptmiete" || unit.ref === "wohnung") return !(rowText.includes("garage") || rowText.includes("stellplatz") || rowText.includes("tiefgarage") || rowText.includes(" tg "));
  if (unit.ref === "garage") return rowText.includes("garage") || rowText.includes("stellplatz") || rowText.includes("tiefgarage") || rowText.includes(" tg ");
  return rowText.includes(normalizeReferenceText(unit.title)) || rowText.includes(normalizeReferenceText(unit.ref));
}

function expectedRentFromAdjustments(
  adjustments: RentAdjustmentRow[],
  object: { id: string; code: string | null; label: string },
  candidateIds: string[],
  unit: UnitDefinition,
  start: string,
  end: string,
): { expectedAmount: number | null; source: string } {
  const matched = adjustments
    .filter((row) => rentAdjustmentMatchesUnit(row, object, candidateIds, unit))
    .map((row) => ({ row, startDate: rentAdjustmentStartDate(row), endDate: rentAdjustmentEndDate(row) }))
    .filter((item): item is { row: RentAdjustmentRow; startDate: string; endDate: string | null } => Boolean(item.startDate))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const active = [...matched]
    .filter((item) => item.startDate <= end && (!item.endDate || item.endDate >= start))
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  const activeAmount = active ? rentAdjustmentTotal(active.row) : null;
  if (activeAmount != null) return { expectedAmount: activeAmount, source: "Mietentwicklung > Mietanpassungen" };

  const nextAdjustment = matched.find((item) => item.startDate > end);
  const oldAmount = nextAdjustment ? rentAdjustmentOldTotal(nextAdjustment.row) : null;
  if (oldAmount != null) return { expectedAmount: oldAmount, source: "Mietentwicklung > Mietanpassungen (alter Stand)" };

  return { expectedAmount: null, source: "Mietentwicklung > Mietanpassungen" };
}

function expectedAmountForOpen(row: Pick<OverviewRow, "status" | "expectedAmount" | "paidAmount">): number {
  if (row.status === "inactive" || row.status === "vacant" || row.expectedAmount == null) return 0;
  return row.expectedAmount;
}

function bookingReferenceText(booking: FinanceEntry): string {
  const raw = booking as unknown as Record<string, unknown>;
  return [
    booking.category,
    booking.note,
    booking.objekt_code,
    raw.description,
    raw.reference,
    raw.booking_text,
    raw.text,
    raw.counterparty,
    raw.payee,
    raw.subject,
    raw.verwendungszweck,
    raw.purpose,
  ]
    .filter((part): part is string | number => typeof part === "string" || typeof part === "number")
    .join(" ");
}

function monthlyRentTextForBooking(booking: FinanceEntry): string {
  return normalizeReferenceText(`${booking.category ?? ""} ${booking.note ?? ""} ${bookingReferenceText(booking)}`);
}

function objectNumberFromText(value: string | null | undefined): string | null {
  const normalized = normalizeReferenceText(value);
  const match = normalized.match(/(?:objekt|object)\s*0*([0-9]+)/);
  return match?.[1] ?? null;
}

function streetTokens(value: string | null | undefined): string[] {
  return referenceTokens(value).filter((token) => !/^\d+$/.test(token));
}

function referenceTokens(value: string | null | undefined): string[] {
  return normalizeReferenceText(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !["objekt", "object", "wohnung", "miete", "miet", "euro", "eur", "und", "der", "die", "das", "str", "strasse", "straße"].includes(token));
}

function addressReferenceTokens(value: string | null | undefined): string[] {
  return normalizeReferenceText(value)
    .split(" ")
    .map((token) => token.replace(/(?:strasse|str)$/g, ""))
    .filter((token) => token.length >= 3 && !["objekt", "object", "wohnung", "miete", "miet", "euro", "eur", "und", "der", "die", "das"].includes(token));
}

function numericReferenceTokens(value: string | null | undefined): string[] {
  return normalizeReferenceText(value)
    .split(" ")
    .filter((token) => /^\d+[a-z]?$/.test(token));
}

function enoughTokenOverlap(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = referenceTokens(left);
  const b = referenceTokens(right);
  if (!a.length || !b.length) return false;
  const overlap = a.filter((token) => b.some((other) => other === token || other.includes(token) || token.includes(other)));
  return overlap.length >= Math.min(2, Math.min(a.length, b.length));
}

function enoughAddressOverlap(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = addressReferenceTokens(left);
  const b = addressReferenceTokens(right);
  if (!a.length || !b.length) return false;

  const streetOverlap = a.some(
    (token) =>
      !/^\d/.test(token) &&
      b.some((other) => !/^\d/.test(other) && (other === token || other.includes(token) || token.includes(other))),
  );
  if (!streetOverlap) return false;

  const leftNumbers = numericReferenceTokens(left);
  const rightNumbers = numericReferenceTokens(right);
  if (!leftNumbers.length || !rightNumbers.length) return true;
  return leftNumbers.some((token) => rightNumbers.includes(token));
}

function isRentLikeText(value: string | null | undefined): boolean {
  const text = normalizeReferenceText(value);
  return (
    text.length === 0 ||
    text.includes("miete") ||
    text.includes("miet") ||
    text.includes("kaltmiete") ||
    text.includes("warmmiete") ||
    text.includes("pacht") ||
    text.includes("zahlung") ||
    text.includes("eingang")
  );
}

function isLikelyRentOrObjectIncome(booking: FinanceEntry): boolean {
  if (booking.entry_type !== "income" || booking.amount <= 0) return false;
  if (isClearlyExcludedFromRent(booking)) return false;
  return isRentLikeText(`${booking.category ?? ""} ${booking.note ?? ""}`);
}

function isRentBackPaymentBooking(booking: FinanceEntry): boolean {
  const text = monthlyRentTextForBooking(booking);
  const compactText = compactReferenceText(text);
  const hasBackPaymentSignal =
    text.includes("miete nachzahlung") ||
    compactText.includes("mietenachzahlung") ||
    text.includes("mietnachzahlung") ||
    compactText.includes("mietnachzahlung") ||
    text.includes("nachzahlung miete") ||
    text.includes("miet nachzahlung") ||
    text.includes("mietdifferenz") ||
    text.includes("nachberechnung") ||
    text.includes("nachzahlung");
  const hasRentContext =
    text.includes("miete") ||
    text.includes("miet") ||
    text.includes("nebenkosten") ||
    text.includes("betriebskosten") ||
    text.includes("nk");
  return isPureRentBackPayment(booking.category, booking.note) || (hasBackPaymentSignal && hasRentContext);
}

function isClearlyExcludedFromRent(booking: FinanceEntry): boolean {
  const text = monthlyRentTextForBooking(booking);
  const isIncome = booking.entry_type === "income";

  if (isIncome) {
    // Mieteingang prueft die regulaere Monats-Warmmiete. Explizite
    // Miet-Nachzahlungen sind steuerliche Einnahmen, aber keine Zahlung
    // fuer die aktuelle Sollmiete des Monats.
    return (
      isRentBackPaymentBooking(booking) ||
      text.includes("kaution") ||
      text.includes("erstattung") ||
      text.includes("rueckzahlung") ||
      text.includes("ruckzahlung") ||
      text.includes("darlehen") ||
      text.includes("loan") ||
      text.includes("zinsen") ||
      text.includes("versicherung") ||
      text.includes("steuer")
    );
  }

  return (
    text.includes("nebenkosten") ||
    text.includes("nk") ||
    text.includes("betriebskosten") ||
    text.includes("kaution") ||
    text.includes("erstattung") ||
    text.includes("rueckzahlung") ||
    text.includes("ruckzahlung") ||
    text.includes("darlehen") ||
    text.includes("loan") ||
    text.includes("zinsen") ||
    text.includes("versicherung") ||
    text.includes("steuer")
  );
}

function isServiceChargeRentComponent(booking: FinanceEntry): boolean {
  const text = normalizeReferenceText(bookingReferenceText(booking));
  return text.includes("mietbestandteil nk") || text.includes("nebenkosten") || text.includes("betriebskosten") || text.includes("hausgeld") || text.includes("nk");
}

function isHohenloherRentComponent(booking: FinanceEntry, objectId: string, objectCode: string | null | undefined, objectLabel: string, start: string, end: string): boolean {
  if (!normalizeReferenceText(objectLabel).includes("hohenloher")) return false;
  if (booking.entry_type !== "income" || booking.amount <= 0) return false;
  const effectiveDate = attributedRentDateForUnit(booking, objectLabel, "hauptmiete");
  const inMonth = isDateInRange(effectiveDate, start, end);
  if (!inMonth || !isServiceChargeRentComponent(booking)) return false;
  return directObjectMatch(booking, objectId, objectCode) || bookingMatchesObject(booking, objectId, objectCode, objectLabel);
}

function hasStrictRentText(booking: FinanceEntry): boolean {
  if (isClearlyExcludedFromRent(booking)) return false;
  const category = normalizeReferenceText(booking.category);
  // "Mietbestandteil-NK" enthaelt zwar sprachlich "Miete", ist aber eine
  // eigene Nebenkosten-Komponente. Sie wird nur bei Hohenloher gezielt addiert.
  if (
    category.includes("mietbestandteil nk") ||
    category.includes("nebenkosten") ||
    category.includes("betriebskosten") ||
    category.includes("hausgeld") ||
    category === "nk"
  ) return false;
  const text = normalizeReferenceText(`${booking.category ?? ""} ${booking.note ?? ""}`);
  return (
    text.includes("miete") ||
    text.includes("mieteingang") ||
    text.includes("kaltmiete") ||
    text.includes("warmmiete") ||
    text.includes("monatsmiete") ||
    text.includes("wohnungsmiete") ||
    text.includes("pacht")
  );
}

function matchesTenantName(booking: FinanceEntry, tenant: TenantInfo): boolean {
  if (isClearlyExcludedFromRent(booking)) return false;
  const tenantTokens = referenceTokens(`${tenant.firstName} ${tenant.lastName}`);
  if (!tenantTokens.length) return false;
  const text = monthlyRentTextForBooking(booking);
  return tenantTokens.some((token) => text.includes(token));
}

function directObjectMatch(booking: FinanceEntry, objectId: string, objectCode: string | null | undefined): boolean {
  const exactIdMatch = String(booking.object_id ?? "") === String(objectId);
  const exactCodeMatch = Boolean(objectCode) && normalizeReferenceText(booking.objekt_code) === normalizeReferenceText(objectCode);
  return exactIdMatch || exactCodeMatch;
}

function isStrictRentBookingForObject(booking: FinanceEntry, objectId: string, objectCode: string | null | undefined, start: string, end: string): boolean {
  const exactIdMatch = String(booking.object_id ?? "") === String(objectId);
  const exactCodeMatch = Boolean(objectCode) && normalizeReferenceText(booking.objekt_code) === normalizeReferenceText(objectCode);
  const isIncome = booking.entry_type === "income";
  const effectiveDate = attributedRentDateForUnit(booking, "", "");
  const inMonth = isDateInRange(effectiveDate, start, end);

  return (exactIdMatch || exactCodeMatch) && isIncome && hasStrictRentText(booking) && inMonth;
}


function bookingMatchesObject(booking: FinanceEntry, objectId: string, objectCode: string | null | undefined, objectLabel: string): boolean {
  if (directObjectMatch(booking, objectId, objectCode)) return true;

  const refText = normalizeReferenceText(bookingReferenceText(booking));
  const labelText = normalizeReferenceText(objectLabel);
  const codeText = normalizeReferenceText(objectCode);
  const labelNumber = objectNumberFromText(objectLabel) ?? objectNumberFromText(objectCode);
  const bookingNumber = objectNumberFromText(booking.objekt_code) ?? objectNumberFromText(booking.note) ?? objectNumberFromText(booking.category);

  if (codeText && (refText.includes(codeText) || codeText.includes(refText))) return true;
  if (labelText && (refText.includes(labelText) || labelText.includes(refText))) return true;
  if (labelNumber && bookingNumber && labelNumber === bookingNumber) return true;

  const targetStreetTokens = streetTokens(objectLabel);
  if (targetStreetTokens.length && targetStreetTokens.some((token) => refText.includes(token))) return true;

  // Fallback für Buchungen, deren Objekt-Code/Objekt-ID nicht sauber gesetzt wurde,
  // aber in Notiz/Kategorie die Adresse, Objekt-Nr. oder der Objektname steht.
  return enoughTokenOverlap(refText, objectLabel) || enoughTokenOverlap(refText, objectCode);
}


function isPositiveIncomeInMonthForObject(booking: FinanceEntry, objectId: string, objectCode: string | null | undefined, objectLabel: string, start: string, end: string): boolean {
  const effectiveDate = attributedRentDateForUnit(booking, objectLabel, "hauptmiete");
  const inMonth = isDateInRange(effectiveDate, start, end);
  if (!inMonth || booking.entry_type !== "income" || booking.amount <= 0 || isClearlyExcludedFromRent(booking)) return false;

  // Priorität für echte Miet-Referenzen aus Monate/Buchungen. Dadurch wird ein Eingang
  // ab dem 25. mit Referenz "Miete" sauber als Folgemonatsmiete erkannt.
  if (hasStrictRentText(booking) && directObjectMatch(booking, objectId, objectCode)) return true;

  // Fallback für ältere Buchungen ohne saubere Kategorie: nur wenn objektbezogen und rentenähnlich.
  return isLikelyRentOrObjectIncome(booking) && bookingMatchesObject(booking, objectId, objectCode, objectLabel);
}

function getUnitDefinitions(objectLabel: string): UnitDefinition[] {
  const normalizedLabel = normalizeReferenceText(objectLabel);

  if (normalizedLabel.includes("further") || normalizedLabel.includes("fuerther")) {
    return [
      {
        ref: "wohnung",
        title: "Wohnung",
        expectedMode: "largest",
        matcher: (booking) => {
          const text = normalizeReferenceText(bookingReferenceText(booking));
          return !(text.includes("garage") || text.includes("tiefgarage") || text.includes("tg") || text.includes("stellplatz"));
        },
        rentalMatcher: (rental) => {
          const text = normalizeReferenceText(`${rental.rent_type ?? ""} ${rental.unit_id ?? ""}`);
          return !(
            text.includes("garage") ||
            text.includes("tiefgarage") ||
            text.includes("stellplatz") ||
            text.includes("tg")
          );
        },
      },
      {
        ref: "garage",
        title: "Garage",
        matcher: (booking) => {
          const text = normalizeReferenceText(bookingReferenceText(booking));
          return text.includes("garage") || text.includes("tiefgarage") || text.includes("tg") || text.includes("stellplatz");
        },
        rentalMatcher: (rental) => {
          const text = normalizeReferenceText(`${rental.rent_type ?? ""} ${rental.unit_id ?? ""}`);
          return text.includes("garage") || text.includes("tiefgarage") || text.includes("stellplatz") || text.includes("tg");
        },
      },
    ];
  }

  if (normalizedLabel.includes("rosenstein")) {
    const garages = [
      { ref: "P250 - E008440000121", title: "Garage 1" },
      { ref: "P253 - E008440000122", title: "Garage 2" },
      { ref: "P254 - E008440000123", title: "Garage 3" },
    ];

    // Rosensteinstraße hat laut Bestand nur 3 Garagen/Stellplätze und keine Wohnung.
    // Daher darf im Mieteingang keine zusätzliche Zeile "Wohnung / Hauptmiete"
    // erzeugt werden; die drei Garagen behalten ihre bisherigen Matcher/Funktionen.
    return garages.map((garage) => ({
      ref: garage.ref,
      title: garage.title,
      matcher: (booking: FinanceEntry) => {
        const text = compactReferenceText(bookingReferenceText(booking));
        return compactReferenceText(garage.ref).split("").length > 0 && (
          text.includes(compactReferenceText(garage.ref)) ||
          text.includes(compactReferenceText(garage.title)) ||
          text.includes(compactReferenceText(garage.ref.split(" - ")[0] ?? "")) ||
          text.includes(compactReferenceText(garage.ref.split(" - ")[1] ?? ""))
        );
      },
      rentalMatcher: (rental: PortfolioRentalRow) => {
        const text = compactReferenceText(`${rental.rent_type ?? ""} ${rental.unit_id ?? ""}`);
        const parkingCode = compactReferenceText(garage.ref.split(" - ")[0] ?? "");
        const unitCode = compactReferenceText(garage.ref.split(" - ")[1] ?? "");
        const title = compactReferenceText(garage.title);
        return Boolean(
          (parkingCode && text.includes(parkingCode)) ||
          (unitCode && text.includes(unitCode)) ||
          (title && text.includes(title))
        );
      },
    }));
  }

  return [{ ref: "hauptmiete", title: "Miete", matcher: () => true }];
}

function isFuertherObject(objectLabel: string): boolean {
  const normalizedLabel = normalizeReferenceText(objectLabel);
  return normalizedLabel.includes("further") || normalizedLabel.includes("fuerther");
}

function isLilienthalerObject(objectLabel: string): boolean {
  return normalizeReferenceText(objectLabel).includes("lilienthaler");
}

function isLilienthalerRentBookingForObject(
  booking: FinanceEntry,
  object: { id: string; code: string | null; label: string },
): boolean {
  if (booking.entry_type !== "income" || booking.amount <= 0) return false;

  // Fachregel fuer Lilienthaler: ausschliesslich direkt zugeordnete Buchungen
  // aus der Hauptquelle Buchungen mit der Kategorie "Miete" verwenden.
  // Dadurch koennen z. B. die 270-EUR-NK-Komponenten von Hohenloher weder ueber
  // Text-Fallbacks noch ueber das Wort "Mietbestandteil" hier einfließen.
  return normalizeReferenceText(booking.category) === "miete" && directObjectMatch(booking, object.id, object.code);
}

function lilienthalerBookingAllocation(
  allKnownBookings: FinanceEntry[],
  object: { id: string; code: string | null; label: string },
  unit: UnitDefinition,
  period: ReturnType<typeof monthRangeFromYearMonth>,
  expectedAmount: number | null,
): { paidAmount: number; lastBookingDate: string | null } | null {
  if (!isLilienthalerObject(object.label) || unit.ref !== "hauptmiete" || expectedAmount === null) return null;

  const objectRentBookings = allKnownBookings
    .filter((booking) => booking.booking_date && isLilienthalerRentBookingForObject(booking, object) && unit.matcher(booking))
    .sort((a, b) => String(a.booking_date ?? "").localeCompare(String(b.booking_date ?? "")));

  const currentMonthBookings = objectRentBookings.filter((booking) => isDateInRange(booking.booking_date, period.start, period.end));
  const currentMonthTotal = currentMonthBookings.reduce((sum, booking) => sum + booking.amount, 0);
  const currentMonthDates = currentMonthBookings.map((booking) => booking.booking_date).filter(Boolean).sort() as string[];

  if (currentMonthBookings.length > 0) {
    return {
      paidAmount: currentMonthTotal,
      lastBookingDate: currentMonthDates[currentMonthDates.length - 1] ?? null,
    };
  }

  const nextMonth = addMonthsToYearMonth(period.year, period.month, 1);
  const nextPeriod = monthRangeFromYearMonth(nextMonth.year, nextMonth.month);
  const catchUpBooking = objectRentBookings.find((booking) => {
    if (!booking.booking_date || !isDateInRange(booking.booking_date, nextPeriod.start, nextPeriod.end)) return false;
    const day = bookingDayOfMonth(booking.booking_date);
    const text = normalizeReferenceText(bookingReferenceText(booking));
    return day !== null && day <= 10 && (text.includes("nachzahlung") || booking.amount >= expectedAmount * 1.7);
  });

  if (catchUpBooking) {
    return {
      paidAmount: expectedAmount,
      lastBookingDate: catchUpBooking.booking_date ?? null,
    };
  }

  // Fuer Lilienthaler ist das Ergebnis auch ohne Treffer abschliessend.
  // Ein null-Wert wuerde danach die allgemeine (breitere) Buchungslogik
  // aktivieren und koennte eine fremde Einnahme als Ersatzwert uebernehmen.
  return { paidAmount: 0, lastBookingDate: null };
}



function isFuertherWohnungUnit(objectLabel: string, unitRef: string): boolean {
  return isFuertherObject(objectLabel) && unitRef === "wohnung";
}

function isGarageLikeBooking(booking: FinanceEntry): boolean {
  const text = normalizeReferenceText(bookingReferenceText(booking));
  return text.includes("garage") || text.includes("tiefgarage") || text.includes("tg") || text.includes("stellplatz");
}

function attributedRentDateForUnit(booking: FinanceEntry, objectLabel: string, unitRef: string): string | null {
  void unitRef;
  if (!booking.booking_date) return null;

  // Dauerregel für die Verknüpfung Monate/Buchungen -> Mieteingang:
  // Wenn ab dem 25. Monatstag ein Zahlungseingang mit Referenz/Kategorie "Miete" gebucht wird,
  // zählt dieser Eingang automatisch als Miete für den Folgemonat.
  // Beispiel: 672,33 € am 30.04. mit Referenz "Miete" zählt als Mai-Miete.
  const day = bookingDayOfMonth(booking.booking_date);
  const isHohenloherNkComponent =
    normalizeReferenceText(objectLabel).includes("hohenloher") &&
    isServiceChargeRentComponent(booking);
  const keepSameMonthForLilienthaler = isLilienthalerObject(objectLabel);

  if (
    day !== null &&
    (((day >= 25 && hasStrictRentText(booking)) && !keepSameMonthForLilienthaler) || (day >= 24 && isHohenloherNkComponent))
  ) {
    return shiftIsoDateByMonthsClamped(booking.booking_date, 1);
  }

  return booking.booking_date;
}

function isBookingRelevantForDisplayedMonth(booking: FinanceEntry, objectLabel: string, unitRef: string, start: string, end: string): boolean {
  const effectiveDate = attributedRentDateForUnit(booking, objectLabel, unitRef);
  return isDateInRange(effectiveDate, start, end);
}

function rentAmountKey(amount: number): string {
  return String(Math.round(Math.abs(amount) * 100));
}

function pickMostLikelySingleRentBooking(currentCandidates: FinanceEntry[], historicalCandidates: FinanceEntry[]): FinanceEntry[] {
  if (currentCandidates.length <= 1) return currentCandidates;

  // Miete für eine Einheit soll im Mieteingang nicht als Summe mehrerer
  // Bankbuchungen erscheinen. Wenn im Buchungsfenster mehrere mögliche Treffer
  // existieren, nehmen wir den wiederkehrenden Monatsbetrag bzw. den besten
  // Einzel-Treffer. So werden z. B. zusätzliche Zahlungen am Monatsende nicht
  // in die Fürther-Wohnung-Miete hineinsummiert.
  const amountFrequency = new Map<string, number>();
  for (const booking of historicalCandidates) {
    if (booking.amount <= 0) continue;
    const key = rentAmountKey(booking.amount);
    amountFrequency.set(key, (amountFrequency.get(key) ?? 0) + 1);
  }

  const recurringKeys = [...amountFrequency.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);

  for (const key of recurringKeys) {
    const matching = currentCandidates.filter((booking) => rentAmountKey(booking.amount) === key);
    if (matching.length) {
      return [matching.sort((a, b) => String(b.booking_date ?? '').localeCompare(String(a.booking_date ?? '')))[0]];
    }
  }

  const strictRentCandidates = currentCandidates.filter(hasStrictRentText);
  const source = strictRentCandidates.length ? strictRentCandidates : currentCandidates;

  // Letzter Zahlungseingang gewinnt; bei mehreren Buchungen am gleichen Tag nehmen
  // wir den kleineren plausiblen Betrag, damit Nebenzahlungen nicht addiert werden.
  const latestDate = source
    .map((booking) => booking.booking_date)
    .filter(Boolean)
    .sort()
    .pop();
  const latest = latestDate ? source.filter((booking) => booking.booking_date === latestDate) : source;
  return [latest.sort((a, b) => a.amount - b.amount)[0]];
}

function parkingCodeFromText(value: string | null | undefined): string | null {
  const compact = compactReferenceText(value);
  const directCode = compact.match(/p\d{2,4}/)?.[0] ?? null;
  if (directCode) return directCode;

  const normalized = normalizeReferenceText(value);
  if (/\b(garage|tg|stellplatz|tiefgarage)\s*1\b/.test(normalized)) return "p250";
  if (/\b(garage|tg|stellplatz|tiefgarage)\s*2\b/.test(normalized)) return "p253";
  if (/\b(garage|tg|stellplatz|tiefgarage)\s*3\b/.test(normalized)) return "p254";

  if (compact.includes("garage1") || compact.includes("tg1") || compact.includes("stellplatz1") || compact.includes("tiefgarage1")) return "p250";
  if (compact.includes("garage2") || compact.includes("tg2") || compact.includes("stellplatz2") || compact.includes("tiefgarage2")) return "p253";
  if (compact.includes("garage3") || compact.includes("tg3") || compact.includes("stellplatz3") || compact.includes("tiefgarage3")) return "p254";

  return null;
}

function vacancyMatchesObject(vacancy: UnitVacancy, object: { id: string; code: string | null; label: string }): boolean {
  const vacancyCode = normalizeReferenceText(vacancy.object_code);
  const vacancyLabel = normalizeReferenceText(vacancy.object_label);
  const objectCode = normalizeReferenceText(object.code);
  const objectLabel = normalizeReferenceText(object.label);
  const vacancyObjectNumber = objectNumberFromText(vacancy.object_code ?? vacancy.object_label);
  const objectNumber = objectNumberFromText(object.code ?? object.label);
  const vacancyObjectText = `${vacancy.object_code ?? ""} ${vacancy.object_label ?? ""}`;
  const targetObjectText = `${object.code ?? ""} ${object.label}`;

  return (
    vacancy.property_id === object.id ||
    Boolean(vacancyCode && (vacancyCode === objectCode || vacancyCode === objectLabel)) ||
    Boolean(vacancyLabel && (vacancyLabel === objectLabel || vacancyLabel.includes(objectLabel) || objectLabel.includes(vacancyLabel))) ||
    Boolean(vacancyObjectNumber && objectNumber && vacancyObjectNumber === objectNumber) ||
    enoughAddressOverlap(vacancyObjectText, targetObjectText) ||
    enoughTokenOverlap(vacancy.object_code, object.label) ||
    enoughTokenOverlap(vacancy.object_label, object.label)
  );
}

function vacancyMatchesUnit(vacancy: UnitVacancy, object: { id: string; code: string | null; label: string }, unit: UnitDefinition): boolean {
  if (!vacancyMatchesObject(vacancy, object)) return false;

  const vacancyUnit = normalizeReferenceText(vacancy.unit_label);
  const unitRef = normalizeReferenceText(unit.ref);
  const unitTitle = normalizeReferenceText(unit.title);
  const vacancyUnitSource = `${vacancy.unit_label ?? ""} ${vacancy.object_code ?? ""} ${vacancy.object_label ?? ""}`;
  const vacancySearchSource = `${vacancyUnitSource} ${vacancy.reason ?? ""} ${vacancy.notes ?? ""}`;
  const compactVacancyUnit = compactReferenceText(vacancyUnitSource);
  const compactUnitRef = compactReferenceText(unit.ref);
  const compactUnitTitle = compactReferenceText(unit.title);
  const combinedUnitText = normalizeReferenceText(`${unit.ref} ${unit.title}`);
  const vacancyParkingCode = parkingCodeFromText(vacancyUnitSource);
  const unitParkingCode = parkingCodeFromText(`${unit.ref} ${unit.title}`);

  if (vacancyParkingCode || unitParkingCode) {
    if (vacancyParkingCode && unitParkingCode) return vacancyParkingCode === unitParkingCode;
    if (vacancyParkingCode && unitRef === "garage") return true;
    return false;
  }

  if (!vacancyUnit) return true;

  if (vacancyUnit.includes(unitRef) || unitRef.includes(vacancyUnit) || vacancyUnit.includes(unitTitle) || unitTitle.includes(vacancyUnit)) return true;
  if (compactVacancyUnit && (compactUnitRef.includes(compactVacancyUnit) || compactUnitTitle.includes(compactVacancyUnit))) return true;

  const vacancyTokens = referenceTokens(vacancySearchSource);
  return vacancyTokens.some((token) => combinedUnitText.includes(token) || compactUnitRef.includes(token));
}

function isContractInMonth(contract: TenantContractProfileRow, start: string, end: string): boolean {
  const status = normalizeReferenceText(contract.status);
  if (status === "vacant" || status === "leerstand") return false;
  const startDate = dateKeyFromValue(contract.start_date);
  const endDate = normalizedContractEndDate(contract);
  if (startDate && startDate > end) return false;
  if (endDate && endDate < start) return false;
  return true;
}

function contractMatchesUnit(contract: TenantContractProfileRow, object: { id: string; code: string | null; label: string }, unit: UnitDefinition): boolean {
  const contractObjectNumber = objectNumberFromText(contract.object_code);
  const objectNumber = objectNumberFromText(object.code);
  const propertyMatch =
    String(contract.property_id ?? "") === String(object.id) ||
    normalizeReferenceText(contract.object_code) === normalizeReferenceText(object.code) ||
    normalizeReferenceText(contract.object_code) === normalizeReferenceText(object.label) ||
    Boolean(contractObjectNumber && objectNumber && contractObjectNumber === objectNumber) ||
    enoughTokenOverlap(contract.object_code, object.label);
  if (!propertyMatch) return false;

  const contractUnit = compactReferenceText(contract.unit_label);
  if (!contractUnit) return true;
  const unitRef = compactReferenceText(unit.ref);
  const unitTitle = compactReferenceText(unit.title);
  const contractUnitText = normalizeReferenceText(contract.unit_label);
  const contractParkingCode = parkingCodeFromText(contract.unit_label);
  const unitParkingCode = parkingCodeFromText(`${unit.ref} ${unit.title}`);
  const isContractGarage = Boolean(contractParkingCode) || contractUnitText.includes("garage") || contractUnitText.includes("tiefgarage") || contractUnitText.includes("stellplatz") || contractUnitText.includes("tg") || contractUnitText.includes("p250") || contractUnitText.includes("p253") || contractUnitText.includes("p254");

  if (contractParkingCode || unitParkingCode) {
    if (contractParkingCode && unitParkingCode) return contractParkingCode === unitParkingCode;
    if (contractParkingCode && unitRef === "garage") return true;
    return false;
  }
  if (unitRef === "hauptmiete") return !isContractGarage;
  if (unitRef === "wohnung") return !isContractGarage;
  if (unitRef === "garage") return isContractGarage;

  return contractUnit.includes(unitRef) || unitRef.includes(contractUnit) || contractUnit.includes(unitTitle) || unitTitle.includes(contractUnit);
}

function tenantInfoFromContract(contract: TenantContractProfileRow | undefined): TenantInfo {
  const tenant = contract?.tenant_profiles;
  if (!tenant) return emptyTenant;
  return {
    firstName: tenant.company_name || tenant.first_name || "",
    lastName: tenant.company_name ? "" : tenant.last_name || "",
    phone: tenant.phone || tenant.mobile || "",
    email: tenant.email || "",
  };
}

function DonutChart({ paid, partial, missing, inactive, vacant }: { paid: number; partial: number; missing: number; inactive: number; vacant: number }) {
  const total = paid + partial + missing + inactive + vacant;
  const paidPercent = total > 0 ? Math.round((paid / total) * 100) : 0;
  const partialPercent = total > 0 ? Math.round((partial / total) * 100) : 0;
  const missingPercent = total > 0 ? Math.round((missing / total) * 100) : 0;
  const inactivePercent = total > 0 ? Math.round((inactive / total) * 100) : 0;
  const paidEnd = paidPercent;
  const partialEnd = paidEnd + partialPercent;
  const missingEnd = partialEnd + missingPercent;
  const inactiveEnd = missingEnd + inactivePercent;
  return (
    <div className="tenant-donut-wrap">
      <div className="tenant-donut" style={{ background: `conic-gradient(#22c55e 0 ${paidEnd}%, #f59e0b ${paidEnd}% ${partialEnd}%, #ef4444 ${partialEnd}% ${missingEnd}%, #94a3b8 ${missingEnd}% ${inactiveEnd}%, #a1a1aa ${inactiveEnd}% 100%)` }}>
        <div>{paidPercent}%</div>
      </div>
      <span>Mieteingänge</span>
    </div>
  );
}

export default function Mietuebersicht({
  embeddedAnnualReport = false,
  reportYear,
  reportObjectId,
  onAnnualReportChange,
}: MietuebersichtProps = {}) {
  const location = useLocation();
  const annualOverviewMode = embeddedAnnualReport || location.pathname.includes("jahresuebersicht");
  // Ab dem 25. gebuchte Mieten zählen fachlich zum Folgemonat.
  // Deshalb startet der Mieteingang ab dem 25. automatisch im Folgemonat,
  // damit z. B. eine am 29.05. gebuchte "Juni 2026"-Miete sofort sichtbar ist.
  const recommendedMonthOffset = () => (new Date().getDate() >= 25 ? 1 : 0);
  const recommendedYearMonth = () => {
    const now = new Date();
    return addMonthsToYearMonth(now.getFullYear(), now.getMonth() + 1, recommendedMonthOffset());
  };
  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    const recommended = recommendedYearMonth();
    return reportYear ? { ...recommended, year: reportYear } : recommended;
  });
  const [periodMode, setPeriodMode] = useState<PeriodMode>(annualOverviewMode ? "year" : "month");
  const month = useMemo(() => {
    return monthRangeFromYearMonth(selectedPeriod.year, selectedPeriod.month);
  }, [selectedPeriod.year, selectedPeriod.month]);
  const effectivePeriodMode: PeriodMode = annualOverviewMode ? "year" : periodMode;
  const displayedPeriods = useMemo(() => buildDisplayedPeriods(selectedPeriod.year, selectedPeriod.month, effectivePeriodMode), [selectedPeriod.year, selectedPeriod.month, effectivePeriodMode]);
  const displayedRange = useMemo(() => {
    const first = displayedPeriods[0] ?? month;
    const last = displayedPeriods[displayedPeriods.length - 1] ?? month;
    return { start: first.start, end: last.end };
  }, [displayedPeriods, month]);
  const dataRange = useMemo(() => {
    if (effectivePeriodMode === "year") {
      return {
        start: `${selectedPeriod.year}-01-01`,
        end: `${selectedPeriod.year}-12-31`,
      };
    }
    return displayedRange;
  }, [displayedRange, effectivePeriodMode, selectedPeriod.year]);
  const appData = useAppData();
  const [vacancies, setVacancies] = useState<UnitVacancy[]>([]);
  const [tenantInfo, setTenantInfo] = useState<Record<string, TenantInfo>>({});
  const [tenantContracts, setTenantContracts] = useState<Record<string, TenantContractInfo>>({});
  const [tenantContractRows, setTenantContractRows] = useState<TenantContractProfileRow[]>([]);
  const [portfolioRentalsLoading, setPortfolioRentalsLoading] = useState(true);
  const [vacanciesLoading, setVacanciesLoading] = useState(true);
  const [tenantContractsLoading, setTenantContractsLoading] = useState(true);
  const [rentAdjustmentsLoading, setRentAdjustmentsLoading] = useState(true);
  const [portfolioProperties, setPortfolioProperties] = useState<PortfolioPropertyRow[]>([]);
  const [portfolioRentals, setPortfolioRentals] = useState<PortfolioRentalRow[]>([]);
  const [rentAdjustments, setRentAdjustments] = useState<RentAdjustmentRow[]>([]);
  const [status, setStatus] = useState<Record<string, string>>({});
  const [objectFilter, setObjectFilter] = useState(embeddedAnnualReport ? reportObjectId ?? "" : "");
  const [statusFilter, setStatusFilter] = useState<RentStatus | "all">("all");

  const sourceObjects = useMemo(() => {
    if (appData.objects.length) return appData.objects.map((object) => ({ id: object.id, code: object.code, label: object.label }));
    return appData.portfolioRows.map((row, index) => ({ id: row.property_id, code: `Objekt_${index + 1}`, label: row.property_name }));
  }, [appData.objects, appData.portfolioRows]);

  useEffect(() => {
    let cancelled = false;

    async function loadPortfolioRentals() {
      setPortfolioRentalsLoading(true);
      try {
        const [propertiesRes, rentalsRes] = await Promise.all([
          supabase.from("portfolio_properties").select("id,name,core_property_id"),
          supabase.from("portfolio_property_rentals").select("id,property_id,unit_id,rent_type,rent_monthly,start_date,end_date,created_at,updated_at"),
        ]);
        if (propertiesRes.error) throw propertiesRes.error;
        if (rentalsRes.error) throw rentalsRes.error;
        if (cancelled) return;
        setPortfolioProperties(((propertiesRes.data ?? []) as PortfolioPropertyRow[]).map((row) => ({
          id: String(row.id),
          name: row.name ?? null,
          core_property_id: row.core_property_id ? String(row.core_property_id) : null,
        })));
        setPortfolioRentals(((rentalsRes.data ?? []) as PortfolioRentalRow[]).map((row) => ({
          id: String(row.id),
          property_id: String(row.property_id),
          unit_id: row.unit_id ?? null,
          rent_type: row.rent_type ?? null,
          rent_monthly: row.rent_monthly == null ? null : Number(row.rent_monthly),
          start_date: row.start_date ?? null,
          end_date: row.end_date ?? null,
          created_at: row.created_at ?? null,
          updated_at: row.updated_at ?? null,
        })));
      } catch (error) {
        if (cancelled) return;
        console.warn("Vermietungszeiträume konnten nicht geladen werden:", error);
        setPortfolioProperties([]);
        setPortfolioRentals([]);
      } finally {
        if (!cancelled) setPortfolioRentalsLoading(false);
      }
    }

    void loadPortfolioRentals();
    const handler = () => void loadPortfolioRentals();
    window.addEventListener("focus", handler);
    window.addEventListener("koenen:rentals-changed", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", handler);
      window.removeEventListener("koenen:rentals-changed", handler);
    };
  }, []);

  useEffect(() => {
    if (!sourceObjects.length) return;
    let cancelled = false;

    async function loadVacancies() {
      setVacanciesLoading(true);
      try {
        const propertyIds = sourceObjects.map((object) => object.id);
        const labelByPropertyId = Object.fromEntries(sourceObjects.map((object) => [object.id, object.label]));
        const [manualRows, derivedRows] = await Promise.all([
          listVacancies({ from: dataRange.start, to: dataRange.end }),
          listDerivedVacanciesFromEndedRentals(propertyIds, dataRange.start, dataRange.end, labelByPropertyId),
        ]);
        if (cancelled) return;
        const monthRows = [...manualRows, ...derivedRows].filter((row) => isVacancyInRange(row, dataRange.start, dataRange.end));
        setVacancies(monthRows);
      } catch (error) {
        if (cancelled) return;
        console.warn("Leerstände konnten nicht geladen werden:", error);
        setVacancies([]);
      } finally {
        if (!cancelled) setVacanciesLoading(false);
      }
    }

    void loadVacancies();
    const handler = () => void loadVacancies();
    window.addEventListener("koenen:vacancy-changed", handler);
    window.addEventListener("focus", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("koenen:vacancy-changed", handler);
      window.removeEventListener("focus", handler);
    };
  }, [sourceObjects, dataRange.start, dataRange.end]);

  useEffect(() => {
    if (!sourceObjects.length) return;

    let cancelled = false;

    async function loadTenantContracts() {
      setTenantContractsLoading(true);
      try {
        const { data, error } = await supabase
          .from("tenant_contracts")
          .select("id,property_id,object_code,unit_label,rent_type,cold_rent,operating_costs,total_rent,start_date,end_date,status,tenant_profiles(first_name,last_name,company_name,email,phone,mobile)")
          .eq("is_deleted", false)
          .order("start_date", { ascending: false, nullsFirst: false });

        if (error) throw error;
        if (cancelled) return;

        const rangeContracts = ((data ?? []) as unknown as TenantContractProfileRow[]).filter((contract) =>
          isContractInMonth(contract, displayedRange.start, displayedRange.end),
        );
        const currentContracts = rangeContracts.filter((contract) => isContractInMonth(contract, month.start, month.end));
        const nextTenantInfo: Record<string, TenantInfo> = {};
        const nextTenantContracts: Record<string, TenantContractInfo> = {};

        for (const object of sourceObjects) {
          const units = getUnitDefinitions(object.label);
          for (const unit of units) {
            const tenantKey = units.length > 1 ? `${object.id}::${unit.ref}` : object.id;
            const contract = currentContracts.find((candidate) => contractMatchesUnit(candidate, object, unit));
            nextTenantInfo[tenantKey] = tenantInfoFromContract(contract);
            const contractInfo = tenantContractInfoFromContract(contract);
            if (contractInfo) nextTenantContracts[tenantKey] = contractInfo;
            if (units.length === 1) nextTenantInfo[object.id] = nextTenantInfo[tenantKey];
            if (units.length === 1 && contractInfo) nextTenantContracts[object.id] = contractInfo;
          }
        }

        setTenantInfo(nextTenantInfo);
        setTenantContracts(nextTenantContracts);
        setTenantContractRows(rangeContracts);
        setStatus((prev) => ({ ...prev, __global: "Mieterdaten aus tenant_profiles/tenant_contracts geladen." }));
      } catch (error) {
        if (cancelled) return;
        setTenantInfo({});
        setTenantContracts({});
        setTenantContractRows([]);
        setStatus((prev) => ({
          ...prev,
          __global: "Mieterstammdaten konnten nicht geladen werden. Bitte tenant_profiles/tenant_contracts prüfen.",
        }));
        console.warn("Mietuebersicht tenant contract load failed:", error);
      } finally {
        if (!cancelled) setTenantContractsLoading(false);
      }
    }

    void loadTenantContracts();
    return () => {
      cancelled = true;
    };
  }, [sourceObjects, displayedRange.start, displayedRange.end, month.start, month.end]);

  useEffect(() => {
    let cancelled = false;

    async function loadRentAdjustments() {
      setRentAdjustmentsLoading(true);
      try {
        const { data, error } = await supabase
          .from("rent_adjustments")
          .select("id,property_id,object_label,tenant_name,effective_date,effective_end_date,old_cold_rent,old_operating_costs,old_total_rent,new_cold_rent,new_operating_costs,new_total_rent,note,created_at")
          .order("effective_date", { ascending: false, nullsFirst: false });

        if (error) throw error;
        if (cancelled) return;
        setRentAdjustments((data ?? []) as unknown as RentAdjustmentRow[]);
      } catch (error) {
        if (cancelled) return;
        console.warn("Mietanpassungen konnten nicht geladen werden:", error);
        setRentAdjustments([]);
      } finally {
        if (!cancelled) setRentAdjustmentsLoading(false);
      }
    }

    void loadRentAdjustments();
    const handler = () => void loadRentAdjustments();
    window.addEventListener("focus", handler);
    window.addEventListener("koenen:rent-adjustments-changed", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", handler);
      window.removeEventListener("koenen:rent-adjustments-changed", handler);
    };
  }, [displayedRange.start, displayedRange.end]);

  const reportDataLoading = appData.loading
    || portfolioRentalsLoading
    || vacanciesLoading
    || tenantContractsLoading
    || rentAdjustmentsLoading;

  const rows = useMemo<OverviewRow[]>(
    () =>
      sourceObjects.flatMap((object) => {
        const objectCandidateIds = candidatePropertyIdsForObject(object, appData.portfolioRows, portfolioProperties);
        const allKnownBookings = appData.entries.filter((booking, index, list) => {
          const key = booking.id != null ? `id:${booking.id}` : `${booking.object_id ?? ""}|${booking.objekt_code ?? ""}|${booking.booking_date ?? ""}|${booking.amount}|${booking.category ?? ""}|${booking.note ?? ""}`;
          return list.findIndex((other) => (other.id != null ? `id:${other.id}` : `${other.object_id ?? ""}|${other.objekt_code ?? ""}|${other.booking_date ?? ""}|${other.amount}|${other.category ?? ""}|${other.note ?? ""}`) === key) === index;
        });
        const units = getUnitDefinitions(object.label);
        return displayedPeriods.flatMap((period) => {
          const monthlyKnownBookings = allKnownBookings.filter((booking) =>
            isBookingRelevantForDisplayedMonth(booking, object.label, "hauptmiete", period.start, period.end)
          );
          const strictRentBookings = monthlyKnownBookings.filter((booking) =>
            isStrictRentBookingForObject(booking, object.id, object.code, period.start, period.end)
          );
          const monthlyIncomeBookings = monthlyKnownBookings.filter((booking) =>
            isPositiveIncomeInMonthForObject(booking, object.id, object.code, object.label, period.start, period.end)
          );
          const hohenloherComponents = monthlyKnownBookings.filter((booking) =>
            isHohenloherRentComponent(booking, object.id, object.code, object.label, period.start, period.end)
          );
          const regularMonthlyRentBookings = (strictRentBookings.length > 0 ? strictRentBookings : monthlyIncomeBookings).filter(
            (booking) => !isRentBackPaymentBooking(booking) && !isClearlyExcludedFromRent(booking)
          );
          const relevantBookings = [...regularMonthlyRentBookings, ...hohenloherComponents].filter((booking, index, list) => {
            const key = booking.id != null ? `id:${booking.id}` : `${booking.object_id ?? ""}|${booking.objekt_code ?? ""}|${booking.booking_date ?? ""}|${booking.amount}|${booking.category ?? ""}|${booking.note ?? ""}`;
            return list.findIndex((other) => (other.id != null ? `id:${other.id}` : `${other.object_id ?? ""}|${other.objekt_code ?? ""}|${other.booking_date ?? ""}|${other.amount}|${other.category ?? ""}|${other.note ?? ""}`) === key) === index;
          });

          return units.map((unit) => {
            const tenantKey = units.length > 1 ? `${object.id}::${unit.ref}` : object.id;
            const periodContract = tenantContractRows.find((candidate) =>
              isContractInMonth(candidate, period.start, period.end) && contractMatchesUnit(candidate, object, unit)
            );
            const periodTenant = tenantInfoFromContract(periodContract);
            const tenantForMatch = tenantHasAnyValue(periodTenant) ? periodTenant : tenantInfo[tenantKey] ?? tenantInfo[object.id] ?? emptyTenant;
            const tenantContract = periodContract ? tenantContractInfoFromContract(periodContract) : tenantContracts[tenantKey] ?? tenantContracts[object.id] ?? null;
            const vacancy = vacancies.find((candidate) => vacancyMatchesUnit(candidate, object, unit) && isVacancyInRange(candidate, period.start, period.end));
            let unitBookings = relevantBookings.filter(unit.matcher);

            if (isFuertherWohnungUnit(object.label, unit.ref)) {
              const matchesFuertherWohnungRent = (booking: FinanceEntry, requireCurrentMonth: boolean) => {
                if (booking.entry_type !== "income" || booking.amount <= 0) return false;
                if (isGarageLikeBooking(booking)) return false;
                if (isClearlyExcludedFromRent(booking)) return false;

                const effectiveDate = attributedRentDateForUnit(booking, object.label, unit.ref);
                if (requireCurrentMonth && !isDateInRange(effectiveDate, period.start, period.end)) return false;

                const isRentPayment = hasStrictRentText(booking) || matchesTenantName(booking, tenantForMatch);
                if (!isRentPayment) return false;

                if (directObjectMatch(booking, object.id, object.code)) return true;
                return bookingMatchesObject(booking, object.id, object.code, object.label);
              };

              const currentCandidates = monthlyKnownBookings.filter((booking) => matchesFuertherWohnungRent(booking, true));
              const historicalCandidates = allKnownBookings.filter((booking) => matchesFuertherWohnungRent(booking, false));
              unitBookings = pickMostLikelySingleRentBooking(currentCandidates, historicalCandidates);
            }

            if (unitBookings.length === 0 && (tenantForMatch.firstName || tenantForMatch.lastName)) {
              const tenantTokens = referenceTokens(`${tenantForMatch.firstName} ${tenantForMatch.lastName}`);
              unitBookings = monthlyKnownBookings.filter((booking) => {
                const effectiveDate = attributedRentDateForUnit(booking, object.label, unit.ref);
                const inMonth = isDateInRange(effectiveDate, period.start, period.end);
                if (!inMonth || booking.entry_type !== "income" || booking.amount <= 0 || isClearlyExcludedFromRent(booking) || isRentBackPaymentBooking(booking)) return false;
                const text = monthlyRentTextForBooking(booking);
                return tenantTokens.some((token) => text.includes(token));
              });
            }

            if (units.length > 1 && unit.ref === "hauptmiete" && unitBookings.length === 0) {
              unitBookings = relevantBookings.filter((booking) => {
                const text = normalizeReferenceText(bookingReferenceText(booking));
                return !(text.includes("garage") || text.includes("tiefgarage") || text.includes("tg") || text.includes("stellplatz") || text.includes("p250") || text.includes("p253") || text.includes("p254"));
              });
            }
            const adjustmentReference = expectedRentFromAdjustments(rentAdjustments, object, objectCandidateIds, unit, period.start, period.end);
            const rentalReference = expectedRentFromRentals(portfolioRentals, objectCandidateIds, unit, period.start, period.end);
            const contractExpectedAmount = contractRentAmount(tenantContract);
            const expectedAmountBeforeVacancy = adjustmentReference.expectedAmount ?? contractExpectedAmount ?? rentalReference.expectedAmount;
            const expectedSourceBeforeVacancy = adjustmentReference.expectedAmount !== null
              ? adjustmentReference.source
              : contractExpectedAmount !== null
                ? "Mieterregister > Mietvertrag"
                : rentalReference.source;
            const expectedAmount = vacancy ? null : expectedAmountBeforeVacancy;
            const expectedSource = vacancy ? "Leerstand > Leerstandszeitraum" : expectedSourceBeforeVacancy;
            const lilienthalerAllocation = lilienthalerBookingAllocation(allKnownBookings, object, unit, period, expectedAmount);
            const bookingAmount = lilienthalerAllocation?.paidAmount ?? unitBookings.reduce((sum, booking) => sum + booking.amount, 0);
            const inactive = !vacancy && bookingAmount <= 0 && !tenantContract && isInactiveForRentMonth(object.label, period.start);
            const paidAmount = vacancy ? 0 : bookingAmount;
            const sortedDates = unitBookings.map((booking) => booking.booking_date).filter(Boolean).sort() as string[];
            const lastBookingDate = lilienthalerAllocation?.lastBookingDate ?? (sortedDates.length ? sortedDates[sortedDates.length - 1] : null);

            return {
              objectId: object.id,
              objectCode: object.code,
              tenantKey: `${tenantKey}::${period.year}-${String(period.month).padStart(2, "0")}`,
              tenantLookupKey: tenantKey,
              label: object.label,
              unitLabel: units.length > 1 ? unit.title : undefined,
              referenceLabel: units.length > 1 ? unit.ref : undefined,
              paidAmount,
              expectedAmount,
              lastBookingDate: vacancy || inactive ? null : lastBookingDate,
              status: vacancy ? "vacant" : resolveRentStatus(paidAmount, expectedAmount, inactive),
              vacancyReason: vacancy?.reason ?? vacancy?.notes ?? null,
              periodLabel: period.label,
              year: period.year,
              month: period.month,
              expectedSource,
              tenantInfo: tenantForMatch,
            };
          });
        });
      }),
    [sourceObjects, appData, portfolioProperties, displayedPeriods, tenantInfo, tenantContracts, tenantContractRows, vacancies, portfolioRentals, rentAdjustments]
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const objectMatches = !objectFilter || row.objectId === objectFilter;
      const statusMatches = statusFilter === "all" || row.status === statusFilter;
      return objectMatches && statusMatches;
    });
  }, [rows, objectFilter, statusFilter]);

  const annualRows = useMemo<AnnualOverviewRow[]>(() => {
    const objectFilteredRows = rows.filter((row) => !objectFilter || row.objectId === objectFilter);
    const map = new Map<string, AnnualOverviewRow>();

    for (const row of objectFilteredRows) {
      const key = `${row.objectId}::${row.referenceLabel ?? row.unitLabel ?? "main"}`;
      const current = map.get(key) ?? {
        key,
        objectId: row.objectId,
        objectCode: row.objectCode,
        label: row.label,
        unitLabel: row.unitLabel,
        referenceLabel: row.referenceLabel,
        tenantLookupKey: row.tenantLookupKey,
        tenantInfo: row.tenantInfo,
        tenantHistory: [],
        months: Array.from({ length: 12 }, () => undefined),
        yearExpected: 0,
        yearPaid: 0,
        yearOpen: 0,
        yearOverpaid: 0,
      };
      const expected = expectedAmountForOpen(row);
      const tenantSignature = normalizeReferenceText(`${row.tenantInfo.firstName} ${row.tenantInfo.lastName} ${row.tenantInfo.email}`);
      if (tenantSignature && !current.tenantHistory.some((tenant) => normalizeReferenceText(`${tenant.firstName} ${tenant.lastName} ${tenant.email}`) === tenantSignature)) {
        current.tenantHistory.push(row.tenantInfo);
      }
      if (!tenantHasAnyValue(current.tenantInfo) && tenantHasAnyValue(row.tenantInfo)) {
        current.tenantInfo = row.tenantInfo;
      }
      current.months[row.month - 1] = row;
      current.yearExpected += expected;
      current.yearPaid += row.paidAmount;
      current.yearOpen += Math.max(expected - row.paidAmount, 0);
      current.yearOverpaid += Math.max(row.paidAmount - expected, 0);
      map.set(key, current);
    }

    return [...map.values()]
      .filter((row) => statusFilter === "all" || row.months.some((monthRow) => monthRow?.status === statusFilter))
      .sort((a, b) => `${a.label} ${a.unitLabel ?? ""}`.localeCompare(`${b.label} ${b.unitLabel ?? ""}`, "de"));
  }, [objectFilter, rows, statusFilter]);

  const annualPropertyTotals = useMemo<RentAnnualPropertyTotal[]>(() => {
    const totalsByObject = new Map<string, RentAnnualPropertyTotal>();
    for (const row of annualRows) {
      const current = totalsByObject.get(row.objectId) ?? {
        objectId: row.objectId,
        objectLabel: row.label,
        paid: 0,
        expected: 0,
        open: 0,
        overpaid: 0,
      };
      current.paid += row.yearPaid;
      current.expected += row.yearExpected;
      current.open += row.yearOpen;
      current.overpaid += row.yearOverpaid;
      totalsByObject.set(row.objectId, current);
    }
    return [...totalsByObject.values()].sort((a, b) => a.objectLabel.localeCompare(b.objectLabel, "de"));
  }, [annualRows]);

  const annualKpis = useMemo<RentAnnualReportSnapshot["kpis"]>(() => {
    const counts: RentAnnualReportSnapshot["kpis"] = {
      "1.-5. Tag": 0,
      "6.-10. Tag": 0,
      "11.-20. Tag": 0,
      "ab 21. Tag": 0,
      Teilweise: 0,
      Fehlt: 0,
      Leerstand: 0,
      Neutral: 0,
    };
    annualRows.forEach((row) => row.months.forEach((monthRow) => {
      const label = paymentTimingLabel(monthRow);
      if (label !== "—") counts[label] += 1;
    }));
    return counts;
  }, [annualRows]);

  const annualReportRows = useMemo<RentAnnualReportRow[]>(() => annualRows.map((row) => {
    const tenantNames = row.tenantHistory
      .map((tenant) => [tenant.firstName, tenant.lastName].filter(Boolean).join(" ").trim())
      .filter(Boolean);
    const fallbackTenant = [row.tenantInfo.firstName, row.tenantInfo.lastName].filter(Boolean).join(" ").trim();
    const uniqueTenantNames = [...new Set(tenantNames.length ? tenantNames : fallbackTenant ? [fallbackTenant] : [])];
    return {
      key: row.key,
      objectId: row.objectId,
      objectLabel: row.label,
      unitLabel: row.unitLabel ?? row.referenceLabel ?? "Gesamte Immobilie",
      tenantName: uniqueTenantNames.length > 1 ? uniqueTenantNames.join(" / ") : uniqueTenantNames[0] ?? "—",
      months: row.months.map((monthRow, index) => {
        const expected = monthRow ? expectedAmountForOpen(monthRow) : 0;
        const paid = monthRow?.paidAmount ?? 0;
        return {
          month: index + 1,
          monthLabel: monthShortLabel(index + 1),
          kpi: paymentTimingLabel(monthRow),
          status: monthRow?.status ?? "none",
          paid,
          expected,
          open: Math.max(expected - paid, 0),
          overpaid: Math.max(paid - expected, 0),
          paymentDate: monthRow?.lastBookingDate ?? null,
          expectedSource: monthRow?.expectedSource ?? "—",
        };
      }),
      yearPaid: row.yearPaid,
      yearExpected: row.yearExpected,
      yearOpen: row.yearOpen,
      yearOverpaid: row.yearOverpaid,
    };
  }), [annualRows]);

  useEffect(() => {
    if (!onAnnualReportChange || reportDataLoading) return;
    onAnnualReportChange({
      year: selectedPeriod.year,
      objectFilter,
      rows: annualReportRows,
      propertyTotals: annualPropertyTotals,
      totals: annualPropertyTotals.reduce((sum, row) => ({
        paid: sum.paid + row.paid,
        expected: sum.expected + row.expected,
        open: sum.open + row.open,
        overpaid: sum.overpaid + row.overpaid,
      }), { paid: 0, expected: 0, open: 0, overpaid: 0 }),
      kpis: annualKpis,
    });
  }, [annualKpis, annualPropertyTotals, annualReportRows, objectFilter, onAnnualReportChange, reportDataLoading, selectedPeriod.year]);

  const resetToRecommendedMonth = () => setSelectedPeriod(recommendedYearMonth());
  const shiftSelectedMonth = (offset: number) => setSelectedPeriod((value) => addMonthsToYearMonth(value.year, value.month, offset));

  const stats = useMemo(() => {
    const paid = filteredRows.filter((row) => row.status === "paid").length;
    const partial = filteredRows.filter((row) => row.status === "partial").length;
    const missing = filteredRows.filter((row) => row.status === "missing").length;
    const inactive = filteredRows.filter((row) => row.status === "inactive").length;
    const vacant = filteredRows.filter((row) => row.status === "vacant").length;
    const amount = filteredRows.reduce((sum, row) => sum + row.paidAmount, 0);
    const expected = filteredRows.reduce((sum, row) => sum + expectedAmountForOpen(row), 0);
    const open = filteredRows.reduce((sum, row) => sum + Math.max(expectedAmountForOpen(row) - row.paidAmount, 0), 0);
    const overpaid = filteredRows.reduce((sum, row) => sum + Math.max(row.paidAmount - expectedAmountForOpen(row), 0), 0);
    return { paid, partial, missing, inactive, vacant, total: filteredRows.length, amount, expected, open, overpaid };
  }, [filteredRows]);

  function openFilteredPdf() {
    const rowsHtml = filteredRows.map((row) => {
      const expected = expectedAmountForOpen(row);
      const open = Math.max(expected - row.paidAmount, 0);
      return `
      <tr>
        <td>${escapeHtml(row.periodLabel)}</td>
        <td>${escapeHtml(row.label)}${row.unitLabel ? `<br/><small>${escapeHtml(row.unitLabel)}</small>` : ""}</td>
        <td>${escapeHtml(statusLabel(row.status))}</td>
        <td class="right">${escapeHtml(formatCurrency(row.paidAmount))}</td>
        <td class="right">${escapeHtml(row.expectedAmount === null ? "—" : formatCurrency(row.expectedAmount))}</td>
        <td class="right">${escapeHtml(formatCurrency(open))}</td>
        <td>${escapeHtml(row.expectedSource)}</td>
        <td>${escapeHtml(formatDate(row.lastBookingDate))}</td>
      </tr>
    `;
    }).join("");
    const printWindow = window.open("", "_blank", "width=960,height=1200");
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Mieteingang ${escapeHtml(month.label)}</title><style>
      body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;padding:28px}
      .brand-logo{display:block;width:240px;height:auto;max-height:96px;object-fit:contain;object-position:left center;margin:0 0 18px}
      h1{margin:0 0 6px;font-size:22px} .meta{color:#475569;margin-bottom:18px}
      table{width:100%;border-collapse:collapse;font-size:12px} th,td{padding:8px;border-bottom:1px solid #dbe3ee;text-align:left;vertical-align:top}
      th{background:#f1f5f9;font-size:11px;text-transform:uppercase;letter-spacing:.06em}.right{text-align:right}
      .kpis{display:grid;grid-template-columns:repeat(8,1fr);gap:8px;margin:16px 0}.kpi{border:1px solid #dbe3ee;padding:10px}.kpi b{display:block;font-size:16px;margin-top:4px}
      @media print{body{padding:0}.no-print{display:none}}
    </style></head><body>
      <button class="no-print" onclick="window.print()" style="margin-bottom:16px;padding:8px 12px">Als PDF speichern / drucken</button>
      <img class="brand-logo" src="${brandLogo}" alt="Koenen Property Management Logo" />
      <h1>Mieteingang ${escapeHtml(month.label)}</h1>
      <div class="meta">Filter: Objekt "${escapeHtml(objectFilter || "Alle")}" · Status "${escapeHtml(statusFilter === "all" ? "Alle" : statusLabel(statusFilter))}"</div>
      <div class="kpis">
        <div class="kpi">Bezahlt<b>${stats.paid}</b></div>
        <div class="kpi">Teilweise<b>${stats.partial}</b></div>
        <div class="kpi">Fehlt<b>${stats.missing}</b></div>
        <div class="kpi">Neutral<b>${stats.inactive}</b></div>
        <div class="kpi">Leerstand<b>${stats.vacant}</b></div>
        <div class="kpi">Summe<b>${escapeHtml(formatCurrency(stats.amount))}</b></div>
        <div class="kpi">Soll<b>${escapeHtml(formatCurrency(stats.expected))}</b></div>
        <div class="kpi">Offen<b>${escapeHtml(formatCurrency(stats.open))}</b></div>
      </div>
      <table><thead><tr><th>Zeitraum</th><th>Objekt</th><th>Status</th><th class="right">Eingang</th><th class="right">Sollmiete</th><th class="right">Offen</th><th>Soll-Quelle</th><th>Letzter Eingang</th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="8">Keine Ergebnisse.</td></tr>`}</tbody></table>
      <script>window.onload=function(){setTimeout(function(){window.print();},250)};</script>
    </body></html>`);
    printWindow.document.close();
  }

  return (
    <div className={embeddedAnnualReport ? "space-y-4" : "tenant-page"}>
      {!embeddedAnnualReport ? <header className="tenant-hero">
        <h1>{annualOverviewMode ? "Mieteingang Jahresübersicht" : "Mieteingang"}</h1>
        <p>
          {annualOverviewMode
            ? "Jahresmatrix aus Mieteingängen: Sollmiete aus Mietentwicklung/Mietanpassungen, Leerstände aus Leerstand und Ist-Zahlungen aus Buchungen."
            : "Abgleich von Buchungen, Mietentwicklung und Leerstand: Ist-Zahlung, Sollmiete, Zeitraum und Abweichungen werden pro Objekt geprüft."}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          {annualOverviewMode ? (
            <Link to="/mieter/mieteingang" className="tenant-mini-button no-underline">← Monatsprüfung öffnen</Link>
          ) : (
            <Link to="/mieter/mieteingang/jahresuebersicht" className="tenant-mini-button no-underline">Jahresübersicht öffnen</Link>
          )}
        </div>
        {status.__global ? <div className="tenant-message" style={{ marginTop: 12 }}>{status.__global}</div> : null}
      </header> : null}

      <section className={embeddedAnnualReport ? "block" : "tenant-dashboard-grid"}>
        {!embeddedAnnualReport ? <aside className="tenant-summary tenant-summary-top">
          <div>
            <h2>Zusammenfassung</h2>
            <p>{effectivePeriodMode === "year" ? `Ganzes Jahr ${selectedPeriod.year}` : month.label}</p>
          </div>
          <DonutChart paid={stats.paid} partial={stats.partial} missing={stats.missing} inactive={stats.inactive} vacant={stats.vacant} />
          <div className="tenant-summary-lines">
            <div><span>Bezahlt</span><b>{stats.paid}</b></div>
            <div className="amber"><span>Teilweise</span><b>{stats.partial}</b></div>
            <div className="red"><span>Fehlt</span><b>{stats.missing}</b></div>
            <div className="gray"><span>Neutral</span><b>{stats.inactive}</b></div>
            <div className="gray"><span>Leerstand</span><b>{stats.vacant}</b></div>
            <div><span>Gesamt</span><b>{stats.total}</b></div>
          </div>
        </aside> : null}

        <main className="tenant-card">
          {reportDataLoading ? (
            <div role="status" className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-bold text-sky-800">
              Buchungen, Mietverträge, Mietanpassungen und Leerstände werden geladen. Exporte sind gleich verfügbar.
            </div>
          ) : null}
          <div className="tenant-card-head">
            <div>
              <h2>{annualOverviewMode ? `Zahlungskalender ${selectedPeriod.year}` : effectivePeriodMode === "year" ? `Mieteingänge ${selectedPeriod.year}` : `Mieteingänge ${month.label}`}</h2>
              <p>Soll: Mietentwicklung/Mietanpassungen. Ist: Buchungen. Leerstand: Seite Leerstand. Teilweise = weniger oder mehr als Sollmiete.</p>
              {!annualOverviewMode ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  <button type="button" onClick={() => shiftSelectedMonth(-1)} className="tenant-mini-button">← Vormonat</button>
                  <button type="button" onClick={resetToRecommendedMonth} className="tenant-mini-button">Aktueller Mietmonat</button>
                  <button type="button" onClick={() => shiftSelectedMonth(1)} className="tenant-mini-button">Folgemonat →</button>
                </div>
              ) : null}
            </div>
            <div className="tenant-total-grid">
              <div className="tenant-total-box">
                <span>Summe Zahlungseingänge</span>
                <strong>{formatCurrency(stats.amount)}</strong>
              </div>
              <div className="tenant-total-box tenant-total-box-neutral">
                <span>Soll gesamt</span>
                <strong>{formatCurrency(stats.expected)}</strong>
              </div>
              <div className="tenant-total-box tenant-total-box-warning">
                <span>Noch offen</span>
                <strong>{formatCurrency(stats.open)}</strong>
              </div>
              <div className="tenant-total-box tenant-total-box-neutral">
                <span>Überzahlung</span>
                <strong>{formatCurrency(stats.overpaid)}</strong>
              </div>
            </div>
          </div>

          {!embeddedAnnualReport ? <div className="tenant-search">
            <label>
              Objekt
              <select value={objectFilter} onChange={(event) => setObjectFilter(event.target.value)}>
                <option value="">Alle Objekte</option>
                {sourceObjects.map((object) => (
                  <option key={object.id} value={object.id}>{object.label}</option>
                ))}
              </select>
            </label>
            {!annualOverviewMode ? (
              <>
                <label>
                  Zeitraum
                  <select value={periodMode} onChange={(event) => setPeriodMode(event.target.value as PeriodMode)}>
                    <option value="month">Monat</option>
                    <option value="year">Ganzes Jahr</option>
                  </select>
                </label>
                <label>
                  Monat
                  <select value={selectedPeriod.month} disabled={periodMode === "year"} onChange={(event) => setSelectedPeriod((value) => ({ ...value, month: Number(event.target.value) }))}>
                    {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
                      <option key={value} value={value}>{new Intl.DateTimeFormat("de-DE", { month: "long" }).format(new Date(2025, value - 1, 1))}</option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            <label>
              Jahr
              <input
                type="number"
                min="2024"
                max="2100"
                value={selectedPeriod.year}
                onChange={(event) => setSelectedPeriod((value) => ({ ...value, year: Number(event.target.value) || value.year }))}
              />
            </label>
            <label>
              Status
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as RentStatus | "all")}>
                <option value="all">Alle</option>
                <option value="paid">Bezahlt</option>
                <option value="partial">Teilweise</option>
                <option value="missing">Fehlt</option>
                <option value="inactive">Neutral</option>
                <option value="vacant">Leerstand</option>
              </select>
            </label>
            <button type="button" onClick={openFilteredPdf} disabled={reportDataLoading} className="tenant-mini-button tenant-export-button disabled:cursor-wait disabled:opacity-60">PDF exportieren</button>
          </div> : null}

          {appData.error && <div className="tenant-message error">Fehler beim Laden: {appData.error}</div>}
          {appData.loading && <div className="tenant-message">Mieteingang wird geladen…</div>}

          {!appData.loading && annualOverviewMode && (
            <div className="space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap gap-2 text-xs font-black">
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-800">1.-5. Tag · {annualKpis["1.-5. Tag"]}</span>
                  <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-teal-800">6.-10. Tag · {annualKpis["6.-10. Tag"]}</span>
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-800">11.-20. Tag · {annualKpis["11.-20. Tag"]}</span>
                  <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-indigo-800">ab 21. Tag · {annualKpis["ab 21. Tag"]}</span>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-800">Teilweise · {annualKpis.Teilweise}</span>
                  <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-800">Fehlt · {annualKpis.Fehlt}</span>
                  <span className="rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-zinc-700">Leerstand · {annualKpis.Leerstand}</span>
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-slate-600">Neutral · {annualKpis.Neutral}</span>
                </div>
              </div>
              {annualRows.length > 0 ? (
                <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white">
                  <table className="min-w-[1180px] w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                        <th className="border-b border-slate-200 p-4">Objekt / Einheit</th>
                        <th className="border-b border-slate-200 p-4">Mieter</th>
                        {Array.from({ length: 12 }, (_, index) => (
                          <th key={index + 1} className="border-b border-slate-200 p-3 text-center">{monthShortLabel(index + 1)}</th>
                        ))}
                        <th className="border-b border-slate-200 p-4 text-right">Jahr Ist</th>
                        <th className="border-b border-slate-200 p-4 text-right">Jahr Soll</th>
                        <th className="border-b border-slate-200 p-4 text-right">Offen</th>
                        <th className="border-b border-slate-200 p-4 text-right">Überzahlung</th>
                      </tr>
                    </thead>
                    <tbody>
	                      {annualRows.map((row) => {
	                        const tenant = tenantHasAnyValue(row.tenantInfo) ? row.tenantInfo : tenantInfo[row.tenantLookupKey] ?? tenantInfo[row.objectId] ?? emptyTenant;
	                        const fallbackTenantName = [tenant.firstName, tenant.lastName].filter(Boolean).join(" ") || "—";
	                        const annualObject = { id: row.objectId, code: row.objectCode, label: row.label };
	                        const annualUnit: UnitDefinition = {
	                          ref: row.referenceLabel ?? row.unitLabel ?? "main",
	                          title: row.unitLabel ?? row.referenceLabel ?? row.label,
	                          matcher: () => false,
	                        };
	                        const tenantSegments = row.months.reduce<Array<{ label: string; from: number; to: number; tone: string; source: string }>>((segments, monthRow, index) => {
	                          const monthNumber = index + 1;
	                          const monthRange = monthRangeFromYearMonth(selectedPeriod.year, monthNumber);
	                          const monthVacancy = vacancies.find((candidate) =>
	                            vacancyMatchesUnit(candidate, annualObject, annualUnit) && isVacancyInRange(candidate, monthRange.start, monthRange.end)
	                          );
	                          const monthContract = tenantContractRows.find((candidate) =>
	                            isContractInMonth(candidate, monthRange.start, monthRange.end) && contractMatchesUnit(candidate, annualObject, annualUnit)
	                          );
	                          const contractTenant = tenantInfoFromContract(monthContract);
	                          const monthTenant = tenantHasAnyValue(contractTenant) ? contractTenant : monthRow?.tenantInfo;
	                          const monthTenantName = monthTenant && tenantHasAnyValue(monthTenant)
	                            ? [monthTenant.firstName, monthTenant.lastName].filter(Boolean).join(" ")
	                            : "";
	                          const label = monthVacancy || monthRow?.status === "vacant"
	                            ? "Leerstand"
	                            : monthContract || monthRow
	                              ? monthTenantName || "Mieter offen"
	                              : "Kein Zeitraum";
	                          const tone = monthVacancy || monthRow?.status === "vacant"
	                            ? "border-slate-200 bg-slate-100 text-slate-600"
	                            : monthContract || monthRow
	                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
	                              : "border-slate-200 bg-white text-slate-400";
	                          const source = monthVacancy ? "Leerstand" : monthContract ? "Mieterregister" : monthRow ? "Buchungen" : "—";
	                          const last = segments[segments.length - 1];
	                          if (last && last.label === label && last.tone === tone && last.source === source && last.to === monthNumber - 1) {
	                            last.to = monthNumber;
	                          } else {
	                            segments.push({ label, from: monthNumber, to: monthNumber, tone, source });
	                          }
	                          return segments;
	                        }, []).filter((segment) => segment.label !== "Kein Zeitraum");
                        const uniqueTenantLabels = new Set(
                          tenantSegments
                            .map((segment) => segment.label)
                            .filter((label) => label !== "Leerstand" && label !== "Mieter offen")
                        );
                        const tenantName = uniqueTenantLabels.size > 1
                          ? "Mieterwechsel"
                          : tenantSegments.some((segment) => segment.label === "Leerstand")
                            ? `${fallbackTenantName} / Leerstand`
                            : fallbackTenantName;
                        return (
                          <tr key={row.key} className="align-top">
                            <td className="border-b border-slate-100 p-4">
                              <div className="text-sm font-black text-slate-950">{row.label}</div>
                              {row.unitLabel ? <div className="mt-1 text-xs font-black text-slate-500">{row.unitLabel}</div> : null}
                              {row.referenceLabel && row.referenceLabel !== row.unitLabel ? <div className="mt-1 text-[11px] font-bold text-slate-400">{row.referenceLabel}</div> : null}
                            </td>
                            <td className="border-b border-slate-100 p-4 text-sm font-bold text-slate-600">
                              <div>{tenantName}</div>
                              {tenantSegments.length > 1 ? (
                                <div className="mt-2 flex max-w-[180px] flex-col gap-1">
	                                  {tenantSegments.map((segment) => (
	                                    <span key={`${row.key}-${segment.label}-${segment.from}-${segment.to}`} className={`rounded-xl border px-2 py-1 text-[10px] font-black leading-tight ${segment.tone}`}>
	                                      {segment.from === segment.to ? monthShortLabel(segment.from) : `${monthShortLabel(segment.from)}-${monthShortLabel(segment.to)}`}: {segment.label}
	                                    </span>
	                                  ))}
                                </div>
                              ) : null}
                            </td>
                            {row.months.map((monthRow, index) => {
                              const expected = monthRow ? expectedAmountForOpen(monthRow) : 0;
                              const openAmount = monthRow ? Math.max(expected - monthRow.paidAmount, 0) : 0;
                              const title = monthRow
                                ? `${statusLabel(monthRow.status)} · Eingang ${formatCurrency(monthRow.paidAmount)} · Soll ${monthRow.expectedAmount === null ? "—" : formatCurrency(monthRow.expectedAmount)} · Offen ${formatCurrency(openAmount)} · Quelle ${monthRow.expectedSource} · Datum ${formatDate(monthRow.lastBookingDate)}`
                                : "Kein Zeitraum";
                              return (
                                <td key={`${row.key}-${index}`} className="border-b border-slate-100 p-2">
                                  <div className={`min-h-[82px] rounded-2xl border p-2 text-center ${paymentTimingTone(monthRow)}`} title={title}>
                                    <div className="text-[10px] font-black uppercase tracking-[0.08em]">{paymentTimingLabel(monthRow)}</div>
                                    <div className="mt-1 text-xs font-black">{monthRow ? formatCurrency(monthRow.paidAmount) : "—"}</div>
                                    <div className="mt-1 text-[10px] font-bold opacity-80">{monthRow ? formatDate(monthRow.lastBookingDate) : ""}</div>
                                    {monthRow && openAmount > 0 ? <div className="mt-1 text-[10px] font-black text-rose-700">Offen {formatCurrency(openAmount)}</div> : null}
                                  </div>
                                </td>
                              );
                            })}
                            <td className="border-b border-slate-100 p-4 text-right text-sm font-black text-emerald-800">{formatCurrency(row.yearPaid)}</td>
                            <td className="border-b border-slate-100 p-4 text-right text-sm font-black text-slate-900">{formatCurrency(row.yearExpected)}</td>
                            <td className="border-b border-slate-100 p-4 text-right text-sm font-black text-rose-700">{formatCurrency(row.yearOpen)}</td>
                            <td className="border-b border-slate-100 p-4 text-right text-sm font-black text-indigo-700">{formatCurrency(row.yearOverpaid)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="tenant-message">Keine Jahresdaten für diese Filter gefunden.</div>
              )}
              {annualPropertyTotals.length > 0 ? (
                <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
                    <h3 className="text-base font-black text-slate-950">Jahressummen nach Immobilie</h3>
                    <p className="mt-1 text-xs font-bold text-slate-500">Direkt aus dem Zahlungskalender aggregiert – ohne eigene Report-Datenquelle.</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-[760px] w-full border-collapse text-left">
                      <thead>
                        <tr className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                          <th className="border-b border-slate-200 p-4">Immobilie</th>
                          <th className="border-b border-slate-200 p-4 text-right">Summe Zahlungseingänge</th>
                          <th className="border-b border-slate-200 p-4 text-right">Soll gesamt</th>
                          <th className="border-b border-slate-200 p-4 text-right">Noch offen</th>
                          <th className="border-b border-slate-200 p-4 text-right">Überzahlung</th>
                        </tr>
                      </thead>
                      <tbody>
                        {annualPropertyTotals.map((property) => (
                          <tr key={property.objectId}>
                            <td className="border-b border-slate-100 p-4 text-sm font-black text-slate-950">{property.objectLabel}</td>
                            <td className="border-b border-slate-100 p-4 text-right text-sm font-black text-emerald-800">{formatCurrency(property.paid)}</td>
                            <td className="border-b border-slate-100 p-4 text-right text-sm font-black text-slate-900">{formatCurrency(property.expected)}</td>
                            <td className="border-b border-slate-100 p-4 text-right text-sm font-black text-rose-700">{formatCurrency(property.open)}</td>
                            <td className="border-b border-slate-100 p-4 text-right text-sm font-black text-indigo-700">{formatCurrency(property.overpaid)}</td>
                          </tr>
                        ))}
                        <tr className="bg-slate-950 text-white">
                          <td className="p-4 text-sm font-black">Gesamt</td>
                          <td className="p-4 text-right text-sm font-black">{formatCurrency(annualPropertyTotals.reduce((sum, row) => sum + row.paid, 0))}</td>
                          <td className="p-4 text-right text-sm font-black">{formatCurrency(annualPropertyTotals.reduce((sum, row) => sum + row.expected, 0))}</td>
                          <td className="p-4 text-right text-sm font-black">{formatCurrency(annualPropertyTotals.reduce((sum, row) => sum + row.open, 0))}</td>
                          <td className="p-4 text-right text-sm font-black">{formatCurrency(annualPropertyTotals.reduce((sum, row) => sum + row.overpaid, 0))}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {!appData.loading && !annualOverviewMode && filteredRows.length > 0 && (
            <div className="tenant-list">
              {filteredRows.map((row) => {
                const tenant = tenantHasAnyValue(row.tenantInfo) ? row.tenantInfo : tenantInfo[row.tenantLookupKey] ?? tenantInfo[row.objectId] ?? emptyTenant;
                const vacant = row.status === "vacant";
                const expectedForRow = expectedAmountForOpen(row);
                const openAmount = Math.max(expectedForRow - row.paidAmount, 0);
                return (
                  <article key={row.tenantKey} className={`tenant-row ${statusClass(row.status)}`}>
                    <div className="tenant-row-top">
                      <div className="tenant-status"><span>{statusLabel(row.status)}</span></div>
                      <div className="tenant-unit"><small>{row.periodLabel}</small><b>{row.label}</b>{row.unitLabel ? <em style={{ display: "block", marginTop: 4, color: "#0f172a", fontStyle: "normal", fontWeight: 900 }}>{row.unitLabel}</em> : null}{row.referenceLabel && row.referenceLabel !== row.unitLabel ? <small style={{ display: "block", marginTop: 3 }}>Betreff-Referenz: {row.referenceLabel}</small> : null}</div>
                      <div className="tenant-amount"><small>Mieteingang</small><b>{vacant ? "Leerstand" : formatCurrency(row.paidAmount)}</b>{vacant && row.vacancyReason ? <small>{row.vacancyReason}</small> : null}</div>
                      <div className="tenant-date"><small>Sollmiete</small><b>{row.expectedAmount === null ? "—" : formatCurrency(row.expectedAmount)}</b><small style={{ marginTop: 4 }}>{row.expectedSource}</small>{openAmount > 0 ? <><small style={{ marginTop: 4 }}>Offen</small><b style={{ color: "#be123c" }}>{formatCurrency(openAmount)}</b></> : null}{normalizeReferenceText(row.label).includes("hohenloher") ? <small style={{ marginTop: 4 }}>{MIETBESTANDTEIL_NK_CATEGORY}: 270,00 € als Mietbestandteil</small> : null}<small style={{ marginTop: 4 }}>Letzter Eingang</small><b>{formatDate(row.lastBookingDate)}</b></div>
                    </div>
                    <div className="tenant-contact-grid" title="Mieterdaten werden zentral unter Mieter anlegen gepflegt">
                      <div><span>Vorname</span><b>{tenant.firstName || "—"}</b></div>
                      <div><span>Nachname</span><b>{tenant.lastName || "—"}</b></div>
                      <div><span>Telefon</span><b>{tenant.phone || "—"}</b></div>
                      <div><span>E-Mail</span><b>{tenant.email || "—"}</b></div>
                    </div>
                    <div className="tenant-row-note">
                      Mieterdaten sind hier nur lesbar · Pflege über Mieter anlegen
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {!appData.loading && rows.length === 0 && <div className="tenant-message">Keine Objekte gefunden.</div>}
          {!appData.loading && !annualOverviewMode && rows.length > 0 && filteredRows.length === 0 && <div className="tenant-message">Keine Ergebnisse für diese Suche.</div>}
        </main>
      </section>
    </div>
  );
}
