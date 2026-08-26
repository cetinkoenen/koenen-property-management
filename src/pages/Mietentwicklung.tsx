import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BarChart3, Building2, CalendarDays, Download, FileText, Pencil, Plus, Save, TrendingUp, WalletCards, X } from "lucide-react";
import { MIETBESTANDTEIL_NK_CATEGORY, isPureRentBackPayment } from "../lib/financeEntryLabels";
import { supabase } from "../lib/supabase";
import { useAppData, type AppObject, type FinanceEntry } from "../state/AppDataContext";

type PortfolioPropertyRow = {
  id: string;
  name: string | null;
  core_property_id: string | null;
};

type PortfolioRentalRow = {
  id: string;
  property_id: string;
  unit_id: string | null;
  rent_type: string | null;
  rent_monthly: number | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type MonthPoint = {
  key: string;
  year: number;
  month: number;
  label: string;
  expected: number;
  actual: number;
};

type RentChange = {
  key: string;
  sortKey: string;
  monthLabel: string;
  objectLabel: string;
  unitLabel: string;
  previousAmount: number;
  newAmount: number;
  delta: number;
  source: "Vermietungszeiträume" | "Buchungen";
};

type DevelopmentRow = {
  rowKey: string;
  object: AppObject;
  displayLabel: string;
  unitName: string;
  currentExpected: number;
  currentActual: number;
  netRent: number;
  utilitiesRent: number;
  warmRent: number;
  previousNetRent: number;
  previousUtilitiesRent: number;
  previousWarmRent: number;
  tenantName: string;
  lastAdjustmentDate: string | null;
  adjustmentReason: string;
  lastActualAmount: number;
  lastActualMonthLabel: string | null;
  previousExpected: number;
  deltaExpected: number;
  latestIncrease: RentChange | null;
  activeUnitSummary: string;
  activeUnitBreakdown: Array<{ key: string; label: string; amount: number }>;
  hasGarageUnit: boolean;
  monthPoints: MonthPoint[];
  quality: "ok" | "check" | "missing";
  qualityText: string;
  adjustmentStatus: "Aktiv" | "Prüfung empfohlen" | "Geplant" | "Offene Zustimmung";
  manualAdjustments: ManualRentAdjustment[];
};

type RentChartPoint = {
  key: string;
  label: string;
  coldRent: number;
  operatingCosts: number;
  totalRent: number;
};

type ManualRentAdjustment = {
  id: string;
  property_id: string | null;
  object_label: string;
  tenant_name: string | null;
  effective_date: string;
  effective_end_date: string | null;
  reason: string;
  status: "active" | "planned" | "consent_open" | "check";
  old_cold_rent: number | null;
  old_operating_costs: number | null;
  old_total_rent: number | null;
  new_cold_rent: number | null;
  new_operating_costs: number | null;
  new_total_rent: number | null;
  note: string | null;
  document_name: string | null;
  created_at: string | null;
};

type RentAdjustmentForm = {
  effectiveDate: string;
  effectiveEndDate: string;
  reason: string;
  status: ManualRentAdjustment["status"];
  oldColdRent: string;
  oldOperatingCosts: string;
  newColdRent: string;
  newOperatingCosts: string;
  note: string;
};

const START_YEAR = 2024;
const MONTH_FORMATTER = new Intl.DateTimeFormat("de-DE", { month: "short", year: "2-digit" });
const FULL_MONTH_FORMATTER = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" });

function toIso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthStart(year: number, month: number) {
  return toIso(new Date(year, month - 1, 1));
}

function monthEnd(year: number, month: number) {
  return toIso(new Date(year, month, 0));
}

function addMonths(year: number, month: number, offset: number) {
  const date = new Date(year, month - 1 + offset, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthLabel(year: number, month: number, full = false) {
  const date = new Date(year, month - 1, 1);
  return (full ? FULL_MONTH_FORMATTER : MONTH_FORMATTER).format(date);
}

function monthsSince2024() {
  const now = new Date();
  const months: Array<{ year: number; month: number; key: string; label: string }> = [];
  for (let year = START_YEAR; year <= now.getFullYear(); year += 1) {
    const maxMonth = year === now.getFullYear() ? now.getMonth() + 1 : 12;
    for (let month = 1; month <= maxMonth; month += 1) {
      months.push({ year, month, key: monthKey(year, month), label: monthLabel(year, month) });
    }
  }
  return months;
}

function money(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("de-DE");
}

function parseMoneyInput(value: string): number | null {
  const cleaned = value.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "").trim();
  if (!cleaned) return null;
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : null;
}

function formatMoneyInput(value: number) {
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function statusLabel(value: ManualRentAdjustment["status"] | DevelopmentRow["adjustmentStatus"]) {
  if (value === "active" || value === "Aktiv") return "Aktiv";
  if (value === "planned" || value === "Geplant") return "Geplant";
  if (value === "consent_open" || value === "Offene Zustimmung") return "Offene Zustimmung";
  return "Prüfung empfohlen";
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll("ß", "ss")
    .replace(/[ä]/g, "a")
    .replace(/[ö]/g, "o")
    .replace(/[ü]/g, "u")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactText(value: string | null | undefined): string {
  return normalizeText(value).replace(/\s+/g, "");
}

function relevantTokens(value: string | null | undefined): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !["objekt", "object", "miete", "str", "strasse", "wohnung", "haus"].includes(token));
}

function dateInMonth(date: string | null | undefined, year: number, month: number) {
  if (!date) return false;
  return date >= monthStart(year, month) && date <= monthEnd(year, month);
}

function bookingDay(date: string | null | undefined) {
  if (!date) return null;
  const day = Number(date.slice(8, 10));
  return Number.isFinite(day) ? day : null;
}

function bookingReference(entry: FinanceEntry) {
  return `${entry.category ?? ""} ${entry.note ?? ""} ${entry.objekt_code ?? ""}`;
}

function isStrictRentText(value: string | null | undefined): boolean {
  const text = normalizeText(value);
  return (
    text.includes("miete") ||
    text.includes("mietbestandteil nk") ||
    text.includes("kaltmiete") ||
    text.includes("warmmiete") ||
    text.includes("monatsmiete") ||
    text.includes("pacht")
  );
}

function isLilienthalerObject(object: AppObject): boolean {
  return normalizeText(object.label).includes("lilienthaler");
}

function isFuertherObject(object: AppObject): boolean {
  return normalizeText(object.label).includes("further") || normalizeText(object.label).includes("fuerther");
}

function isRosensteinObject(object: AppObject): boolean {
  return normalizeText(object.label).includes("rosenstein");
}

function isGarageLikeText(value: string | null | undefined): boolean {
  const normalized = normalizeText(value);
  return normalized.includes("garage") || normalized.includes("stellplatz") || normalized.includes("tiefgarage") || normalized.includes("tg") || /\bp\d{2,}\b/.test(normalized);
}

function isSameRentalPeriod(a: PortfolioRentalRow, b: PortfolioRentalRow): boolean {
  return (
    money(a.rent_monthly) === money(b.rent_monthly) &&
    (a.start_date ?? "") === (b.start_date ?? "") &&
    (a.end_date ?? "") === (b.end_date ?? "") &&
    normalizeText(a.unit_id) === normalizeText(b.unit_id) &&
    normalizeText(a.rent_type) === normalizeText(b.rent_type)
  );
}

function isExcludedIncome(entry: FinanceEntry): boolean {
  const text = normalizeText(bookingReference(entry));
  const isMietbestandteilNk = text.includes("mietbestandteil nk") || normalizeText(entry.category).includes(normalizeText(MIETBESTANDTEIL_NK_CATEGORY));
  if (isMietbestandteilNk) return false;
  if (isPureRentBackPayment(entry.category, entry.note) || text.includes("nachzahlung")) return true;
  return (
    text.includes("kaution") ||
    text.includes("erstattung") ||
    text.includes("rueckzahlung") ||
    text.includes("ruckzahlung") ||
    text.includes("darlehen") ||
    text.includes("zinsen") ||
    text.includes("versicherung") ||
    text.includes("steuer")
  );
}

function effectiveRentMonth(entry: FinanceEntry) {
  if (!entry.booking_date) return null;
  const day = bookingDay(entry.booking_date);
  const date = new Date(`${entry.booking_date}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (day !== null && day >= 25 && isStrictRentText(bookingReference(entry))) {
    const shifted = addMonths(date.getFullYear(), date.getMonth() + 1, 1);
    return shifted;
  }
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function effectiveRentMonthForObject(entry: FinanceEntry, object: AppObject) {
  if (isLilienthalerObject(object)) {
    if (!entry.booking_date) return null;
    const date = new Date(`${entry.booking_date}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    return { year: date.getFullYear(), month: date.getMonth() + 1 };
  }
  return effectiveRentMonth(entry);
}

function entryMatchesObject(entry: FinanceEntry, object: AppObject, candidateIds: Set<string>) {
  if (entry.object_id && candidateIds.has(String(entry.object_id))) return true;
  if (entry.objekt_code && object.code && normalizeText(entry.objekt_code) === normalizeText(object.code)) return true;

  const reference = normalizeText(bookingReference(entry));
  const label = normalizeText(object.label);
  if (label && (reference.includes(label) || label.includes(reference))) return true;

  const tokens = relevantTokens(object.label);
  return tokens.length > 0 && tokens.some((token) => reference.includes(token));
}

function isRentBookingForObject(entry: FinanceEntry, object: AppObject, candidateIds: Set<string>) {
  if (entry.entry_type !== "income" || money(entry.amount) <= 0) return false;
  if (isExcludedIncome(entry)) return false;
  if (!entryMatchesObject(entry, object, candidateIds)) return false;
  return isStrictRentText(bookingReference(entry));
}

function rentalOverlapsMonth(rental: PortfolioRentalRow, year: number, month: number) {
  const start = monthStart(year, month);
  const end = monthEnd(year, month);
  if (!rental.start_date || rental.start_date > end) return false;
  if (rental.end_date && rental.end_date < start) return false;
  return money(rental.rent_monthly) > 0;
}

function unitKeyFromRental(rental: PortfolioRentalRow) {
  const raw = `${rental.unit_id ?? ""} ${rental.rent_type ?? ""}`.trim();
  const normalized = normalizeText(raw);
  if (!normalized) return "hauptmiete";
  if (rental.unit_id?.trim()) return compactText(rental.unit_id);
  if (isGarageLikeText(raw)) {
    return compactText(raw);
  }
  const parkingCode = normalized.match(/\bp\d{2,}\b/)?.[0];
  const unitCode = normalized.match(/\be\d{6,}\b/)?.[0];
  if (parkingCode || unitCode) return `${parkingCode ?? ""}-${unitCode ?? ""}`;
  return "hauptmiete";
}

function unitLabelFromRental(rental: PortfolioRentalRow) {
  const raw = `${rental.unit_id ?? ""} ${rental.rent_type ?? ""}`;
  const normalized = normalizeText(raw);
  if (normalized.includes("p250")) return "P250 - E008440000121";
  if (normalized.includes("p253")) return "P253 - E008440000122";
  if (normalized.includes("p254")) return "P254 - E008440000123";
  if (rental.unit_id?.trim()) return rental.unit_id.trim();
  const type = rental.rent_type?.trim();
  const normalizedType = normalizeText(type);
  if (!type || normalizedType === "monthly") return "Hauptmiete";
  return type;
}

function friendlyUnitLabel(object: AppObject, rental: PortfolioRentalRow, index: number) {
  const rawLabel = unitLabelFromRental(rental);
  const compactLabel = compactText(rawLabel);
  const looksTechnicalId = /^[0-9a-f]{16,}$/i.test(compactLabel) || compactLabel.length >= 24;

  if (isRosensteinObject(object)) {
    if (rawLabel.includes("P250")) return "P250 - E008440000121";
    if (rawLabel.includes("P253")) return "P253 - E008440000122";
    if (rawLabel.includes("P254")) return "P254 - E008440000123";
    return `Garage ${index + 1}`;
  }
  if (isFuertherObject(object)) {
    if (money(rental.rent_monthly) <= 100 || isGarageLikeText(`${rental.unit_id ?? ""} ${rental.rent_type ?? ""}`)) return "Garage";
    return "Wohnung";
  }
  if (looksTechnicalId) return isGarageLikeText(rawLabel) ? "Garage" : "Wohnung";
  return rawLabel;
}

function completeKnownUnitBreakdown(
  object: AppObject,
  units: Array<{ key: string; label: string; amount: number }>,
) {
  if (!isRosensteinObject(object)) return units;

  const byLabel = new Map(units.map((unit) => [unit.label, unit]));
  return ["P250 - E008440000121", "P253 - E008440000122", "P254 - E008440000123"].map((label) => byLabel.get(label) ?? {
    key: `${object.id}-${label}`,
    label,
    amount: 0,
  });
}

function labelsReferToSameUnit(a: string, b: string) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if ((left.includes("p250") || right.includes("p250")) && left.includes("p250") && right.includes("p250")) return true;
  if ((left.includes("p253") || right.includes("p253")) && left.includes("p253") && right.includes("p253")) return true;
  if ((left.includes("p254") || right.includes("p254")) && left.includes("p254") && right.includes("p254")) return true;
  if (left.includes("garage") && right.includes("garage") && left.replace(/\D/g, "") === right.replace(/\D/g, "")) return true;
  return false;
}

function adjustmentBelongsToUnit(adjustment: ManualRentAdjustment, object: AppObject, unitLabel: string) {
  if (labelsReferToSameUnit(adjustment.object_label, `${object.label} ${unitLabel}`)) return true;

  const adjustmentLabel = normalizeText(adjustment.object_label);
  const objectLabel = normalizeText(object.label);
  const isObjectLevelAdjustment = adjustmentLabel === objectLabel;

  if (!isObjectLevelAdjustment) return false;

  const unitIsGarage = isGarageLikeText(unitLabel);
  if (isFuertherObject(object)) return !unitIsGarage;
  if (isRosensteinObject(object)) return false;
  return true;
}

function activeManualAdjustmentForUnit(adjustments: ManualRentAdjustment[], object: AppObject, unitLabel: string) {
  const today = toIso(new Date());
  return adjustments.find((adjustment) => {
    if (!adjustmentBelongsToUnit(adjustment, object, unitLabel)) return false;
    if (adjustment.effective_date > today) return false;
    if (adjustment.effective_end_date && adjustment.effective_end_date < today) return false;
    return manualNewTotal(adjustment) > 0;
  }) ?? null;
}

function unitRentPartForMonth(
  entries: FinanceEntry[],
  object: AppObject,
  candidateIds: Set<string>,
  year: number,
  month: number,
  unitLabel: string,
) {
  const normalizedUnit = normalizeText(unitLabel);
  const unitAmount = entries.reduce((sum, entry) => {
    if (!isRentBookingForObject(entry, object, candidateIds)) return sum;
    const effective = effectiveRentMonthForObject(entry, object);
    if (!effective || effective.year !== year || effective.month !== month) return sum;
    const reference = normalizeText(bookingReference(entry));
    if (reference.includes(normalizedUnit)) return sum + money(entry.amount);
    if (normalizedUnit.includes("p250") && reference.includes("p250")) return sum + money(entry.amount);
    if (normalizedUnit.includes("p253") && reference.includes("p253")) return sum + money(entry.amount);
    if (normalizedUnit.includes("p254") && reference.includes("p254")) return sum + money(entry.amount);
    if (normalizedUnit.includes("garage") && isGarageLikeText(reference)) return sum + money(entry.amount);
    return sum;
  }, 0);
  return unitAmount;
}

function activeManualAdjustmentForLabel(adjustments: ManualRentAdjustment[], label: string) {
  const today = toIso(new Date());
  return adjustments.find((adjustment) => {
    if (!labelsReferToSameUnit(adjustment.object_label, label)) return false;
    if (adjustment.effective_date > today) return false;
    if (adjustment.effective_end_date && adjustment.effective_end_date < today) return false;
    return manualNewTotal(adjustment) > 0;
  }) ?? null;
}

function manualOldTotal(adjustment: ManualRentAdjustment) {
  const explicitTotal = money(adjustment.old_total_rent);
  if (explicitTotal > 0) return explicitTotal;
  return money((adjustment.old_cold_rent ?? 0) + (adjustment.old_operating_costs ?? 0));
}

function manualNewTotal(adjustment: ManualRentAdjustment) {
  const explicitTotal = money(adjustment.new_total_rent);
  if (explicitTotal > 0) return explicitTotal;
  return money((adjustment.new_cold_rent ?? 0) + (adjustment.new_operating_costs ?? 0));
}

function manualRentParts(adjustment: ManualRentAdjustment, state: "old" | "new") {
  const coldRent = money(state === "old" ? adjustment.old_cold_rent : adjustment.new_cold_rent);
  const utilitiesRent = money(state === "old" ? adjustment.old_operating_costs : adjustment.new_operating_costs);
  const warmRent = state === "old" ? manualOldTotal(adjustment) : manualNewTotal(adjustment);

  return {
    netRent: coldRent > 0 ? coldRent : Math.max(0, money(warmRent - utilitiesRent)),
    utilitiesRent,
    warmRent,
  };
}

function previousMonthDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  date.setMonth(date.getMonth() - 1);
  return toIso(date);
}

function chartDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return MONTH_FORMATTER.format(date);
}

function buildRentChartData(row: DevelopmentRow): RentChartPoint[] {
  const sortedAdjustments = [...row.manualAdjustments].sort((a, b) => a.effective_date.localeCompare(b.effective_date));
  const points = new Map<string, RentChartPoint>();

  for (const adjustment of sortedAdjustments) {
    const oldParts = manualRentParts(adjustment, "old");
    const newParts = manualRentParts(adjustment, "new");
    const oldCold = oldParts.netRent;
    const oldNk = oldParts.utilitiesRent;
    const newCold = newParts.netRent;
    const newNk = newParts.utilitiesRent;

    if (!points.size && (oldCold > 0 || oldNk > 0)) {
      const oldKey = previousMonthDate(adjustment.effective_date);
      points.set(`${oldKey}-old`, {
        key: `${oldKey}-old`,
        label: `${chartDateLabel(oldKey)} vorher`,
        coldRent: oldCold,
        operatingCosts: oldNk,
        totalRent: oldParts.warmRent,
      });
    }

    points.set(adjustment.effective_date, {
      key: adjustment.effective_date,
      label: chartDateLabel(adjustment.effective_date),
      coldRent: newCold,
      operatingCosts: newNk,
      totalRent: newParts.warmRent,
    });
  }

  if (!points.size) {
    const previousLabel = row.monthPoints.length > 1 ? row.monthPoints[row.monthPoints.length - 2]?.label ?? "Vorher" : "Vorher";
    const currentLabel = row.monthPoints[row.monthPoints.length - 1]?.label ?? "Aktuell";
    points.set("previous", {
      key: "previous",
      label: previousLabel,
      coldRent: row.previousNetRent,
      operatingCosts: row.previousUtilitiesRent,
      totalRent: row.previousWarmRent,
    });
    points.set("current", {
      key: "current",
      label: currentLabel,
      coldRent: row.netRent,
      operatingCosts: row.utilitiesRent,
      totalRent: row.warmRent,
    });
  }

  const currentKey = `current-${row.rowKey}`;
  points.set(currentKey, {
    key: currentKey,
    label: "Aktuell",
    coldRent: row.netRent,
    operatingCosts: row.utilitiesRent,
    totalRent: row.warmRent,
  });

  return Array.from(points.values()).filter((point) => point.coldRent > 0 || point.operatingCosts > 0 || point.totalRent > 0);
}

function MiniRentChartIcon({ data }: { data: RentChartPoint[] }) {
  const recent = data.slice(-4);
  const maxValue = Math.max(1, ...recent.map((point) => point.totalRent));
  return (
    <span className="rent-chart-mini" aria-hidden="true">
      <span className="rent-chart-mini-line">
        {recent.map((point, index) => (
          <span
            key={`${point.key}-dot`}
            className="rent-chart-mini-dot"
            style={{
              left: `${12 + index * 24}%`,
              bottom: `${28 + (point.totalRent / maxValue) * 48}%`,
            }}
          />
        ))}
      </span>
      <span className="rent-chart-mini-bars">
        {recent.map((point) => (
          <span key={point.key} className="rent-chart-mini-stack">
            <span className="rent-chart-mini-bar rent-chart-mini-bar-cold" style={{ height: `${Math.max(10, (point.coldRent / maxValue) * 30)}px` }} />
            <span className="rent-chart-mini-bar rent-chart-mini-bar-nk" style={{ height: `${Math.max(6, (point.operatingCosts / maxValue) * 30)}px` }} />
          </span>
        ))}
      </span>
    </span>
  );
}

function buildSvgPolyline(data: RentChartPoint[], key: keyof Pick<RentChartPoint, "coldRent" | "operatingCosts" | "totalRent">, maxValue: number, width: number, height: number, padding: { top: number; right: number; bottom: number; left: number }) {
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const divisor = Math.max(1, data.length - 1);
  return data
    .map((point, index) => {
      const x = padding.left + (index / divisor) * innerWidth;
      const y = padding.top + innerHeight - (Math.max(0, point[key]) / maxValue) * innerHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function RentDevelopmentChart({ row }: { row: DevelopmentRow }) {
  const data = buildRentChartData(row);
  const hasData = data.length > 0;
  const width = 920;
  const height = 360;
  const padding = { top: 30, right: 28, bottom: 72, left: 88 };
  const maxValue = Math.max(1, ...data.flatMap((point) => [point.coldRent, point.operatingCosts, point.totalRent]));
  const roundedMax = Math.ceil(maxValue / 100) * 100;
  const axisMax = Math.max(100, roundedMax);
  const yTicks = [0, axisMax / 2, axisMax];
  const divisor = Math.max(1, data.length - 1);
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const series = [
    { key: "coldRent" as const, label: "Kaltmiete", color: "#315f72", width: 4, dash: undefined },
    { key: "operatingCosts" as const, label: "Nebenkosten", color: "#14b8a6", width: 4, dash: undefined },
    { key: "totalRent" as const, label: "Warmmiete", color: "#6366f1", width: 3, dash: "10 8" },
  ];
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Kaltmiete aktuell</span>
          <strong className="mt-2 block text-xl font-black text-slate-950">{formatCurrency(row.netRent)}</strong>
        </div>
        <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
          <span className="text-xs font-black uppercase tracking-[0.12em] text-cyan-700">Nebenkosten aktuell</span>
          <strong className="mt-2 block text-xl font-black text-cyan-800">{formatCurrency(row.utilitiesRent)}</strong>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <span className="text-xs font-black uppercase tracking-[0.12em] text-emerald-700">Warmmiete aktuell</span>
          <strong className="mt-2 block text-xl font-black text-emerald-800">{formatCurrency(row.warmRent)}</strong>
        </div>
      </div>
      <div className="h-[360px] rounded-[22px] border border-slate-200 bg-white p-3 sm:p-5">
        {hasData ? (
          <svg className="h-full w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Mietentwicklung für ${row.displayLabel}`}>
            <rect x="0" y="0" width={width} height={height} rx="18" fill="#ffffff" />
            {yTicks.map((tick) => {
              const y = padding.top + innerHeight - (tick / axisMax) * innerHeight;
              return (
                <g key={tick}>
                  <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#e2e8f0" strokeDasharray="5 6" />
                  <text x={padding.left - 14} y={y + 4} textAnchor="end" fontSize="14" fontWeight="800" fill="#64748b">
                    {Math.round(tick).toLocaleString("de-DE")} EUR
                  </text>
                </g>
              );
            })}
            <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#cbd5e1" strokeWidth="2" />
            <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="#cbd5e1" strokeWidth="2" />
            {series.map((item) => (
              <polyline
                key={item.key}
                points={buildSvgPolyline(data, item.key, axisMax, width, height, padding)}
                fill="none"
                stroke={item.color}
                strokeWidth={item.width}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={item.dash}
              />
            ))}
            {data.map((point, index) => {
              const x = padding.left + (index / divisor) * innerWidth;
              return (
                <g key={point.key}>
                  {series.map((item) => {
                    const y = padding.top + innerHeight - (Math.max(0, point[item.key]) / axisMax) * innerHeight;
                    return (
                      <g key={item.key}>
                        <circle cx={x} cy={y} r="6" fill={item.color} stroke="#ffffff" strokeWidth="3" />
                        {index === data.length - 1 ? (
                          <text x={x + 10} y={y - 10} fontSize="13" fontWeight="900" fill={item.color}>
                            {formatCurrency(point[item.key])}
                          </text>
                        ) : null}
                      </g>
                    );
                  })}
                  <text x={x} y={height - padding.bottom + 28} textAnchor="middle" fontSize="13" fontWeight="900" fill="#475569">
                    {point.label}
                  </text>
                </g>
              );
            })}
            <g transform={`translate(${padding.left}, ${height - 24})`}>
              {series.map((item, index) => (
                <g key={item.key} transform={`translate(${index * 170}, 0)`}>
                  <line x1="0" y1="-5" x2="34" y2="-5" stroke={item.color} strokeWidth={item.width} strokeDasharray={item.dash} strokeLinecap="round" />
                  <text x="44" y="0" fontSize="14" fontWeight="900" fill="#334155">{item.label}</text>
                </g>
              ))}
            </g>
          </svg>
        ) : (
          <div className="flex h-full items-center justify-center text-center text-sm font-black text-slate-500">
            Noch keine Mietwerte für ein Diagramm vorhanden.
          </div>
        )}
      </div>
      <p className="text-xs font-bold leading-5 text-slate-500">
        Quelle: manuell eingetragene Mietanpassungen, aktuelle Mietstruktur und erkannte Mietbestandteile.
      </p>
    </div>
  );
}

function selectActiveRentalsForMonth(rentals: PortfolioRentalRow[], candidateIds: Set<string>, year: number, month: number) {
  const matches = rentals.filter((rental) => candidateIds.has(String(rental.property_id)) && rentalOverlapsMonth(rental, year, month));
  const byUnit = new Map<string, PortfolioRentalRow>();

  for (const rental of matches) {
    const baseKey = unitKeyFromRental(rental);
    let key = baseKey;
    const current = byUnit.get(key);
    if (!current) {
      byUnit.set(key, rental);
      continue;
    }

    if (!isSameRentalPeriod(current, rental)) {
      key = `${baseKey}-${rental.id}`;
      byUnit.set(key, rental);
      continue;
    }

    const rentalSortKey = `${rental.start_date ?? ""}|${rental.end_date ?? "9999-12-31"}|${rental.updated_at ?? ""}|${rental.created_at ?? ""}`;
    const currentSortKey = `${current.start_date ?? ""}|${current.end_date ?? "9999-12-31"}|${current.updated_at ?? ""}|${current.created_at ?? ""}`;
    if (rentalSortKey > currentSortKey) byUnit.set(key, rental);
  }

  return [...byUnit.values()];
}

function expectedRentForMonth(rentals: PortfolioRentalRow[], candidateIds: Set<string>, year: number, month: number) {
  return selectActiveRentalsForMonth(rentals, candidateIds, year, month).reduce((sum, rental) => sum + money(rental.rent_monthly), 0);
}

function actualRentForMonth(entries: FinanceEntry[], object: AppObject, candidateIds: Set<string>, year: number, month: number) {
  return entries.reduce((sum, entry) => {
    if (!isRentBookingForObject(entry, object, candidateIds)) return sum;
    const effective = effectiveRentMonthForObject(entry, object);
    if (effective && effective.year === year && effective.month === month) return sum + money(entry.amount);
    if (!effective && dateInMonth(entry.booking_date, year, month)) return sum + money(entry.amount);
    return sum;
  }, 0);
}

function actualRentPartForMonth(entries: FinanceEntry[], object: AppObject, candidateIds: Set<string>, year: number, month: number, mode: "utilities" | "base") {
  return entries.reduce((sum, entry) => {
    if (!isRentBookingForObject(entry, object, candidateIds)) return sum;
    const effective = effectiveRentMonthForObject(entry, object);
    if (!effective || effective.year !== year || effective.month !== month) return sum;
    const text = normalizeText(bookingReference(entry));
    const isUtilities = text.includes("mietbestandteil nk") || text.includes("nebenkosten") || text.includes("hausgeld");
    if (mode === "utilities" && isUtilities) return sum + money(entry.amount);
    if (mode === "base" && !isUtilities) return sum + money(entry.amount);
    return sum;
  }, 0);
}

function latestAdjustmentDate(change: RentChange | null) {
  if (!change) return null;
  return `${change.sortKey}-01`;
}

function candidateIdsForObject(object: AppObject, portfolioProperties: PortfolioPropertyRow[]) {
  const ids = new Set<string>([object.id, ...(object.aliases ?? [])].filter(Boolean));
  const label = normalizeText(object.label);

  for (const property of portfolioProperties) {
    const propertyName = normalizeText(property.name);
    if (
      property.id === object.id ||
      property.core_property_id === object.id ||
      (propertyName && label && (propertyName === label || propertyName.includes(label) || label.includes(propertyName)))
    ) {
      ids.add(property.id);
      if (property.core_property_id) ids.add(property.core_property_id);
    }
  }

  return ids;
}

function rentChangesForObject(
  object: AppObject,
  entries: FinanceEntry[],
  rentals: PortfolioRentalRow[],
  candidateIds: Set<string>,
  points: MonthPoint[],
) {
  const changes: RentChange[] = [];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];

    if (previous.expected > 0 && current.expected - previous.expected > 0.01) {
      const activeRentals = selectActiveRentalsForMonth(rentals, candidateIds, current.year, current.month);
      changes.push({
        key: `${object.id}-${current.key}-expected`,
        sortKey: current.key,
        monthLabel: monthLabel(current.year, current.month, true),
        objectLabel: object.label,
        unitLabel: activeRentals.map(unitLabelFromRental).filter(Boolean).join(" + ") || "Gesamtmiete",
        previousAmount: previous.expected,
        newAmount: current.expected,
        delta: current.expected - previous.expected,
        source: "Vermietungszeiträume",
      });
    }

    if (previous.actual > 0 && current.actual - previous.actual > 5) {
      const currentMonthEntries = entries.filter((entry) => {
        const effective = effectiveRentMonthForObject(entry, object);
        return effective?.year === current.year && effective.month === current.month && isRentBookingForObject(entry, object, candidateIds);
      });
      changes.push({
        key: `${object.id}-${current.key}-actual`,
        sortKey: current.key,
        monthLabel: monthLabel(current.year, current.month, true),
        objectLabel: object.label,
        unitLabel: currentMonthEntries.map((entry) => entry.category || entry.note || "Buchung").slice(0, 2).join(" + ") || "Buchungen",
        previousAmount: previous.actual,
        newAmount: current.actual,
        delta: current.actual - previous.actual,
        source: "Buchungen",
      });
    }
  }

  return changes;
}

export default function Mietentwicklung() {
  const appData = useAppData();
  const [portfolioProperties, setPortfolioProperties] = useState<PortfolioPropertyRow[]>([]);
  const [portfolioRentals, setPortfolioRentals] = useState<PortfolioRentalRow[]>([]);
  const [manualAdjustments, setManualAdjustments] = useState<ManualRentAdjustment[]>([]);
  const [loadingRentals, setLoadingRentals] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [objectFilter, setObjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "action" | "future">("all");
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const [selectedChartRowKey, setSelectedChartRowKey] = useState<string | null>(null);
  const [showAdjustmentForm, setShowAdjustmentForm] = useState(false);
  const [savingAdjustment, setSavingAdjustment] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [generatedLetter, setGeneratedLetter] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [editingAdjustmentId, setEditingAdjustmentId] = useState<string | null>(null);
  const adjustmentFormRef = useRef<HTMLElement | null>(null);
  const [adjustmentForm, setAdjustmentForm] = useState<RentAdjustmentForm>({
    effectiveDate: toIso(new Date()),
    effectiveEndDate: "",
    reason: "Anpassung an ortsübliche Vergleichsmiete",
    status: "planned",
    oldColdRent: "",
    oldOperatingCosts: "",
    newColdRent: "",
    newOperatingCosts: "",
    note: "",
  });

  useEffect(() => {
    let cancelled = false;

    async function loadRentData() {
      setLoadingRentals(true);
      setLoadError(null);
      try {
        const [propertiesRes, rentalsRes, adjustmentsRes] = await Promise.all([
          supabase.from("portfolio_properties").select("id,name,core_property_id"),
          supabase
            .from("portfolio_property_rentals")
            .select("id,property_id,unit_id,rent_type,rent_monthly,start_date,end_date,created_at,updated_at")
            .order("start_date", { ascending: true }),
          supabase
            .from("rent_adjustments")
            .select("id,property_id,object_label,tenant_name,effective_date,effective_end_date,reason,status,old_cold_rent,old_operating_costs,old_total_rent,new_cold_rent,new_operating_costs,new_total_rent,note,document_name,created_at")
            .eq("is_deleted", false)
            .order("effective_date", { ascending: false }),
        ]);
        if (propertiesRes.error) throw propertiesRes.error;
        if (rentalsRes.error) throw rentalsRes.error;
        if (adjustmentsRes.error) throw adjustmentsRes.error;
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
        setManualAdjustments(((adjustmentsRes.data ?? []) as ManualRentAdjustment[]).map((row) => ({
          id: String(row.id),
          property_id: row.property_id ? String(row.property_id) : null,
          object_label: row.object_label ?? "",
          tenant_name: row.tenant_name ?? null,
          effective_date: row.effective_date,
          effective_end_date: row.effective_end_date ?? null,
          reason: row.reason,
          status: row.status,
          old_cold_rent: row.old_cold_rent == null ? null : Number(row.old_cold_rent),
          old_operating_costs: row.old_operating_costs == null ? null : Number(row.old_operating_costs),
          old_total_rent: row.old_total_rent == null ? null : Number(row.old_total_rent),
          new_cold_rent: row.new_cold_rent == null ? null : Number(row.new_cold_rent),
          new_operating_costs: row.new_operating_costs == null ? null : Number(row.new_operating_costs),
          new_total_rent: row.new_total_rent == null ? null : Number(row.new_total_rent),
          note: row.note ?? null,
          document_name: row.document_name ?? null,
          created_at: row.created_at ?? null,
        })));
      } catch (error) {
        if (cancelled) return;
        setPortfolioProperties([]);
        setPortfolioRentals([]);
        setManualAdjustments([]);
        setLoadError(error instanceof Error ? error.message : "Mietentwicklungsdaten konnten nicht geladen werden.");
      } finally {
        if (!cancelled) setLoadingRentals(false);
      }
    }

    void loadRentData();
    const reload = () => void loadRentData();
    window.addEventListener("focus", reload);
    window.addEventListener("koenen:rentals-changed", reload);
    window.addEventListener("koenen:finance-entry-changed", reload);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", reload);
      window.removeEventListener("koenen:rentals-changed", reload);
      window.removeEventListener("koenen:finance-entry-changed", reload);
    };
  }, [reloadVersion]);

  const months = useMemo(() => monthsSince2024(), []);
  const currentMonth = months[months.length - 1];

  const rows = useMemo<DevelopmentRow[]>(() => {
    return appData.objects.flatMap((object) => {
      const candidateIds = candidateIdsForObject(object, portfolioProperties);
      const manualForObject = manualAdjustments.filter((adjustment) => {
        if (adjustment.property_id && candidateIds.has(String(adjustment.property_id))) return true;
        const manualLabel = normalizeText(adjustment.object_label);
        const objectLabel = normalizeText(object.label);
        return manualLabel === objectLabel || manualLabel.startsWith(`${objectLabel} `);
      });
      const latestManualAdjustment = manualForObject[0] ?? null;
      const monthPoints = months.map((month) => ({
        ...month,
        expected: expectedRentForMonth(portfolioRentals, candidateIds, month.year, month.month),
        actual: actualRentForMonth(appData.entries, object, candidateIds, month.year, month.month),
      }));
      const current = monthPoints[monthPoints.length - 1] ?? { expected: 0, actual: 0 };
      const previous = monthPoints[monthPoints.length - 2] ?? { expected: 0, actual: 0 };
      const lastActual = [...monthPoints].reverse().find((point) => point.actual > 0);
      const activeRentals = selectActiveRentalsForMonth(portfolioRentals, candidateIds, currentMonth.year, currentMonth.month);
      const previousRentals = selectActiveRentalsForMonth(portfolioRentals, candidateIds, previous.year, previous.month);
      const activeUnitBreakdown = completeKnownUnitBreakdown(object, activeRentals.map((rental, index) => ({
        key: rental.id,
        label: friendlyUnitLabel(object, rental, index),
        amount: money(rental.rent_monthly),
      })));
      const activeUnitLabels = activeUnitBreakdown.map((unit) => `${unit.label} ${formatCurrency(unit.amount)}`).filter(Boolean);
      const activeUnitSummary = activeUnitLabels.length ? activeUnitLabels.join(" + ") : "Keine aktive Einheit";
      const hasGarageUnit = activeUnitLabels.some((label) => {
        return isGarageLikeText(label);
      });
      const changes = rentChangesForObject(object, appData.entries, portfolioRentals, candidateIds, monthPoints);
      const latestIncrease = [...changes].reverse()[0] ?? null;
      const currentUtilitiesFromBookings = actualRentPartForMonth(appData.entries, object, candidateIds, currentMonth.year, currentMonth.month, "utilities");
      const previousUtilitiesFromBookings = actualRentPartForMonth(appData.entries, object, candidateIds, previous.year, previous.month, "utilities");
      const rentalUtilities = activeRentals
        .filter((rental) => normalizeText(`${rental.unit_id ?? ""} ${rental.rent_type ?? ""}`).includes("nk") || normalizeText(rental.rent_type).includes("nebenkosten"))
        .reduce((sum, rental) => sum + money(rental.rent_monthly), 0);
      const previousRentalUtilities = previousRentals
        .filter((rental) => normalizeText(`${rental.unit_id ?? ""} ${rental.rent_type ?? ""}`).includes("nk") || normalizeText(rental.rent_type).includes("nebenkosten"))
        .reduce((sum, rental) => sum + money(rental.rent_monthly), 0);
      const activeManualForObject = activeManualAdjustmentForLabel(manualForObject, object.label);
      const currentManualParts = activeManualForObject ? manualRentParts(activeManualForObject, "new") : null;
      const previousManualParts = activeManualForObject ? manualRentParts(activeManualForObject, "old") : null;
      const utilitiesRent = money(currentManualParts?.utilitiesRent ?? (rentalUtilities || currentUtilitiesFromBookings));
      const previousUtilitiesRent = money(previousManualParts?.utilitiesRent ?? (previousRentalUtilities || previousUtilitiesFromBookings));
      const warmRent = money(currentManualParts?.warmRent ?? (current.expected || current.actual));
      const previousWarmRent = money(previousManualParts?.warmRent ?? (previous.expected || previous.actual || warmRent));
      const netRent = money(currentManualParts?.netRent ?? Math.max(0, money(warmRent - utilitiesRent)));
      const previousNetRent = money(previousManualParts?.netRent ?? Math.max(0, money(previousWarmRent - previousUtilitiesRent)));
      const hasRentals = activeRentals.length > 0;
      const hasActual = current.actual > 0;
      const quality: DevelopmentRow["quality"] = hasRentals && Math.abs(current.expected - current.actual) <= 1
        ? "ok"
        : hasRentals || hasActual
          ? "check"
          : "missing";
      const qualityText = quality === "ok"
        ? "Soll und Buchungen passen im aktuellen Monat."
        : quality === "check"
          ? "Soll/Ist oder Stammdaten prüfen."
          : "Keine aktuelle Miete erkennbar.";
      const manualStatus: DevelopmentRow["adjustmentStatus"] | null = latestManualAdjustment?.status === "planned"
        ? "Geplant"
        : latestManualAdjustment?.status === "consent_open"
          ? "Offene Zustimmung"
          : latestManualAdjustment?.status === "check"
            ? "Prüfung empfohlen"
            : latestManualAdjustment?.status === "active"
              ? "Aktiv"
              : null;
      const adjustmentStatus: DevelopmentRow["adjustmentStatus"] = manualStatus ?? (quality === "check"
        ? "Prüfung empfohlen"
        : latestIncrease
          ? "Aktiv"
          : hasRentals
            ? "Aktiv"
            : "Offene Zustimmung");

      const baseRow: DevelopmentRow = {
        rowKey: object.id,
        object,
        displayLabel: object.label,
        unitName: "Wohnung / Objekt",
        currentExpected: current.expected,
        currentActual: current.actual,
        netRent,
        utilitiesRent,
        warmRent,
        previousNetRent,
        previousUtilitiesRent,
        previousWarmRent,
        tenantName: latestManualAdjustment?.tenant_name || "Mieterdaten aus Vermietungszeitraum",
        lastAdjustmentDate: latestManualAdjustment?.effective_date ?? latestAdjustmentDate(latestIncrease),
        adjustmentReason: latestManualAdjustment?.reason ?? (latestIncrease?.source === "Buchungen" ? "Indexmiete / Buchungsänderung" : latestIncrease ? "Anpassung aus Vermietungszeitraum" : "Aktive Mietstruktur"),
        lastActualAmount: lastActual?.actual ?? 0,
        lastActualMonthLabel: lastActual ? monthLabel(lastActual.year, lastActual.month, true) : null,
        previousExpected: previous.expected,
        deltaExpected: current.expected - previous.expected,
        latestIncrease,
        activeUnitSummary,
        activeUnitBreakdown,
        hasGarageUnit,
        monthPoints,
        quality,
        qualityText,
        adjustmentStatus,
        manualAdjustments: manualForObject,
      };

      if (!isFuertherObject(object) && !isRosensteinObject(object)) return [baseRow];

      const unitRows = activeUnitBreakdown
        .filter((unit) => unit.amount > 0 || isRosensteinObject(object) || isFuertherObject(object))
        .map((unit): DevelopmentRow => {
          const unitLabel = `${object.label} ${unit.label}`;
          const unitManual = manualForObject.filter((adjustment) => adjustmentBelongsToUnit(adjustment, object, unit.label));
          const activeManual = activeManualAdjustmentForUnit(unitManual, object, unit.label);
          const latestManualWithRent = unitManual.find((adjustment) => manualNewTotal(adjustment) > 0) ?? null;
          const displayedManual = activeManual ?? latestManualWithRent ?? unitManual[0] ?? null;
          const unitActual = unitRentPartForMonth(appData.entries, object, candidateIds, currentMonth.year, currentMonth.month, unit.label);
          const unitPreviousActual = unitRentPartForMonth(appData.entries, object, candidateIds, previous.year, previous.month, unit.label);
          const isGarageUnit = isGarageLikeText(unit.label);
          const currentManualParts = activeManual ? manualRentParts(activeManual, "new") : null;
          const previousManualParts = activeManual ? manualRentParts(activeManual, "old") : null;
          const unitUtilities = money(currentManualParts?.utilitiesRent ?? 0);
          const unitPreviousUtilities = money(previousManualParts?.utilitiesRent ?? 0);
          const unitWarm = money(currentManualParts?.warmRent ?? (unit.amount || unitActual));
          const unitPreviousWarm = money(previousManualParts?.warmRent ?? (unitPreviousActual || unitWarm));
          const unitNet = money(currentManualParts?.netRent ?? Math.max(0, unitWarm - unitUtilities));
          const unitPreviousNet = money(previousManualParts?.netRent ?? Math.max(0, unitPreviousWarm - unitPreviousUtilities));
          const unitHasRentals = unit.amount > 0;
          const unitHasActual = unitActual > 0;
          const unitQuality: DevelopmentRow["quality"] = unitHasRentals && (unitActual === 0 || Math.abs(unit.amount - unitActual) <= 1)
            ? "ok"
            : unitHasRentals || unitHasActual
              ? "check"
              : "missing";
          const unitStatus: DevelopmentRow["adjustmentStatus"] = activeManual?.status === "planned"
            ? "Geplant"
            : activeManual?.status === "consent_open"
              ? "Offene Zustimmung"
              : activeManual?.status === "check"
                ? "Prüfung empfohlen"
                : "Aktiv";

          return {
            ...baseRow,
            rowKey: `${object.id}-${unit.key}`,
            displayLabel: unitLabel,
            unitName: unit.label,
            currentExpected: unit.amount,
            currentActual: unitActual,
            netRent: unitNet,
            utilitiesRent: unitUtilities,
            warmRent: unitWarm,
            previousNetRent: unitPreviousNet,
            previousUtilitiesRent: unitPreviousUtilities,
            previousWarmRent: unitPreviousWarm,
            tenantName: displayedManual?.tenant_name || baseRow.tenantName,
            lastAdjustmentDate: displayedManual?.effective_date ?? baseRow.lastAdjustmentDate,
            adjustmentReason: displayedManual?.reason ?? (isGarageUnit ? "Garagenmiete separat dokumentiert" : baseRow.adjustmentReason),
            lastActualAmount: unitActual,
            lastActualMonthLabel: unitActual > 0 ? monthLabel(currentMonth.year, currentMonth.month, true) : baseRow.lastActualMonthLabel,
            previousExpected: unitPreviousWarm,
            deltaExpected: unitWarm - unitPreviousWarm,
            latestIncrease: null,
            activeUnitSummary: `${unit.label} ${formatCurrency(unitWarm)}`,
            activeUnitBreakdown: [unit],
            hasGarageUnit: isGarageUnit,
            quality: unitQuality,
            qualityText: unitQuality === "ok" ? "Einheit ist separat dokumentiert." : unitQuality === "check" ? "Soll/Ist oder Stammdaten prüfen." : "Keine aktuelle Miete erkennbar.",
            adjustmentStatus: unitStatus,
            manualAdjustments: unitManual,
          };
        });

      return unitRows.length ? unitRows : [baseRow];
    });
  }, [appData.entries, appData.objects, currentMonth?.month, currentMonth?.year, manualAdjustments, months, portfolioProperties, portfolioRentals]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const objectMatch = !objectFilter || row.object.id === objectFilter;
      const statusMatch =
        statusFilter === "all" ||
        (statusFilter === "action" && row.adjustmentStatus === "Prüfung empfohlen") ||
        (statusFilter === "future" && row.adjustmentStatus === "Geplant");
      return objectMatch && statusMatch;
    });
  }, [objectFilter, rows, statusFilter]);

  const stats = useMemo(() => {
    const currentExpected = rows.reduce((sum, row) => sum + row.currentExpected, 0);
    const currentActual = rows.reduce((sum, row) => sum + row.currentActual, 0);
    const previousYearPointIndex = Math.max(0, months.length - 13);
    const previousYearExpected = rows.reduce((sum, row) => sum + (row.monthPoints[previousYearPointIndex]?.expected ?? 0), 0);
    const annualRunRate = currentExpected * 12;
    const changePct = previousYearExpected > 0 ? ((currentExpected - previousYearExpected) / previousYearExpected) * 100 : 0;
    return {
      currentExpected,
      currentActual,
      annualRunRate,
      changePct,
      checks: rows.filter((row) => row.quality !== "ok").length,
      changes: rows.filter((row) => row.latestIncrease).length,
    };
  }, [months.length, rows]);

  const loading = appData.loading || loadingRentals;
  const selectedRow = selectedRowKey ? rows.find((row) => row.rowKey === selectedRowKey) ?? null : null;
  const selectedChartRow = selectedChartRowKey ? rows.find((row) => row.rowKey === selectedChartRowKey) ?? null : null;

  useEffect(() => {
    if (!selectedChartRow) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedChartRowKey(null);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedChartRow]);

  function showAndFocusAdjustmentForm() {
    setShowAdjustmentForm(true);
    window.setTimeout(() => {
      adjustmentFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function openAdjustmentPlanner(row: DevelopmentRow) {
    setActionMessage(null);
    setGeneratedLetter(null);
    setEditingAdjustmentId(null);
    setAdjustmentForm({
      effectiveDate: toIso(new Date()),
      effectiveEndDate: "",
      reason: "Anpassung an ortsübliche Vergleichsmiete",
      status: "planned",
      oldColdRent: formatMoneyInput(row.netRent),
      oldOperatingCosts: formatMoneyInput(row.utilitiesRent),
      newColdRent: formatMoneyInput(row.netRent),
      newOperatingCosts: formatMoneyInput(row.utilitiesRent),
      note: "",
    });
    showAndFocusAdjustmentForm();
  }

  function editManualAdjustment(adjustment: ManualRentAdjustment) {
    const oldParts = manualRentParts(adjustment, "old");
    const newParts = manualRentParts(adjustment, "new");
    setActionMessage("Historien-Eintrag ist im Bearbeitungsformular geöffnet.");
    setGeneratedLetter(null);
    setEditingAdjustmentId(adjustment.id);
    setAdjustmentForm({
      effectiveDate: adjustment.effective_date,
      effectiveEndDate: adjustment.effective_end_date ?? "",
      reason: adjustment.reason,
      status: adjustment.status,
      oldColdRent: formatMoneyInput(oldParts.netRent),
      oldOperatingCosts: formatMoneyInput(oldParts.utilitiesRent),
      newColdRent: formatMoneyInput(newParts.netRent),
      newOperatingCosts: formatMoneyInput(newParts.utilitiesRent),
      note: adjustment.note ?? "",
    });
    showAndFocusAdjustmentForm();
  }

  async function saveManualAdjustment(row: DevelopmentRow) {
    setSavingAdjustment(true);
    setActionMessage(null);
    try {
      const userRes = await supabase.auth.getUser();
      const userId = userRes.data.user?.id;
      if (userRes.error) throw userRes.error;
      if (!userId) throw new Error("Bitte neu einloggen, damit die Mietanpassung gespeichert werden kann.");

      const oldCold = parseMoneyInput(adjustmentForm.oldColdRent);
      const oldNk = parseMoneyInput(adjustmentForm.oldOperatingCosts);
      const oldTotal = money((oldCold ?? 0) + (oldNk ?? 0));
      const newCold = parseMoneyInput(adjustmentForm.newColdRent);
      const newNk = parseMoneyInput(adjustmentForm.newOperatingCosts);
      const newTotal = money((newCold ?? 0) + (newNk ?? 0));

      const payload = {
        effective_date: adjustmentForm.effectiveDate,
        effective_end_date: adjustmentForm.effectiveEndDate || null,
        reason: adjustmentForm.reason,
        status: adjustmentForm.status,
        old_cold_rent: oldCold,
        old_operating_costs: oldNk,
        old_total_rent: oldTotal,
        new_cold_rent: newCold,
        new_operating_costs: newNk,
        new_total_rent: newTotal,
        note: adjustmentForm.note.trim() || null,
      };
      const { error } = editingAdjustmentId
        ? await supabase
          .from("rent_adjustments")
          .update(payload)
          .eq("id", editingAdjustmentId)
        : await supabase.from("rent_adjustments").insert({
          user_id: userId,
          property_id: row.object.id,
          object_label: row.displayLabel,
          tenant_name: row.tenantName,
          ...payload,
        });
      if (error) throw error;

      setActionMessage(editingAdjustmentId ? "Mietanpassung wurde aktualisiert." : "Mietanpassung wurde gespeichert und in die Historie übernommen.");
      setEditingAdjustmentId(null);
      setShowAdjustmentForm(false);
      setReloadVersion((version) => version + 1);
      window.dispatchEvent(new Event("koenen:rent-adjustments-changed"));
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Mietanpassung konnte nicht gespeichert werden.");
    } finally {
      setSavingAdjustment(false);
    }
  }

  function generateTenantLetter(row: DevelopmentRow) {
    const newest = row.manualAdjustments[0];
    const effectiveDate = newest?.effective_date ?? adjustmentForm.effectiveDate;
    const effectiveEndDate = newest?.effective_end_date ?? adjustmentForm.effectiveEndDate;
    const reason = newest?.reason ?? adjustmentForm.reason;
    const oldCold = newest?.old_cold_rent ?? parseMoneyInput(adjustmentForm.oldColdRent) ?? row.previousNetRent;
    const newCold = newest?.new_cold_rent ?? parseMoneyInput(adjustmentForm.newColdRent) ?? row.netRent;
    const oldNk = newest?.old_operating_costs ?? parseMoneyInput(adjustmentForm.oldOperatingCosts) ?? row.previousUtilitiesRent;
    const newNk = newest?.new_operating_costs ?? parseMoneyInput(adjustmentForm.newOperatingCosts) ?? row.utilitiesRent;
    const oldTotal = money(oldCold + oldNk);
    const newTotal = money(newCold + newNk);
    const note = newest?.note ?? adjustmentForm.note;
    const letter = [
      "Mietanpassung",
      "",
      `Objekt / Einheit: ${row.displayLabel}`,
      `Mieter: ${row.tenantName}`,
      `Wirksam ab: ${formatDate(effectiveDate)}`,
      effectiveEndDate ? `Gültig bis: ${formatDate(effectiveEndDate)}` : "Gültig bis: laufend / offen",
      `Grund der Anpassung: ${reason}`,
      "",
      "Vorher-Nachher-Vergleich",
      `Nettokaltmiete bisher: ${formatCurrency(oldCold)}`,
      `Nettokaltmiete neu: ${formatCurrency(newCold)}`,
      `Nebenkosten bisher: ${formatCurrency(oldNk)}`,
      `Nebenkosten neu: ${formatCurrency(newNk)}`,
      `Warmmiete bisher: ${formatCurrency(oldTotal)}`,
      `Warmmiete neu: ${formatCurrency(newTotal)}`,
      `Differenz Warmmiete: ${formatCurrency(newTotal - oldTotal)}`,
      "",
      "Hinweis",
      "Bitte prüfen Sie die gesetzlichen Voraussetzungen, insbesondere Kappungsgrenze und Jahressperrfrist, bevor dieses Schreiben versendet wird.",
      note ? "" : null,
      note ? `Notiz des Vermieters: ${note}` : null,
    ].filter((line): line is string => line !== null).join("\n");
    setGeneratedLetter(letter);
    setActionMessage("Schreiben wurde als Entwurf generiert.");
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6 lg:p-8">
        <div className="inline-flex items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-indigo-700">
          <TrendingUp size={16} />
          Mietanpassungen
        </div>
        <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
          Mietanpassungen
        </h1>
        <p className="mt-3 max-w-5xl text-sm font-semibold leading-6 text-slate-600">
          Hier sehen Sie die aktuellen Mietzusammensetzungen aller Ihrer Objekte. Klicken Sie auf eine Zeile, um die Details, den Vorher-Nachher-Vergleich und die Historie in der Seitenleiste zu öffnen.
        </p>

        <div className="mt-6 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <label className="grid gap-1 text-sm font-black text-slate-600">
            Immobilien
            <select className="h-12 rounded-2xl border border-slate-200 bg-white px-3 text-base font-bold text-slate-950" value={objectFilter} onChange={(event) => setObjectFilter(event.target.value)}>
              <option value="">Alle Immobilien</option>
              {appData.objects.map((object) => (
                <option key={object.id} value={object.id}>{object.label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-black text-slate-600">
            Status
            <select className="h-12 rounded-2xl border border-slate-200 bg-white px-3 text-base font-bold text-slate-950" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="all">Status: Alle</option>
              <option value="action">Nur Handlungsbedarf</option>
              <option value="future">Zukünftige Anpassungen</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2 md:min-w-[260px]">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">Warmmiete</span>
              <strong className="mt-1 block text-lg font-black text-emerald-800">{formatCurrency(stats.currentExpected)}</strong>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-700">Prüfen</span>
              <strong className="mt-1 block text-lg font-black text-amber-800">{stats.checks}</strong>
            </div>
          </div>
        </div>
      </section>

      {(loadError || appData.error) ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-black text-red-900">
          Fehler beim Laden: {loadError || appData.error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm font-black text-slate-600 shadow-sm">
          Mietentwicklung wird geladen...
        </div>
      ) : null}

      {!loading ? (
        <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
          <div className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_112px_112px_102px_112px_104px_72px] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 text-xs font-black uppercase tracking-[0.13em] text-slate-500 xl:grid">
            <span>Objekt & Einheit</span>
            <span>Mieter</span>
            <span>Letzte Anpassung</span>
            <span>Nettokaltmiete</span>
            <span>Nebenkosten</span>
            <span>Warmmiete</span>
            <span>Status</span>
            <span>Diagramm</span>
          </div>
          {filteredRows.length ? (
            filteredRows.map((row) => (
              <div
                key={row.rowKey}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setSelectedRowKey(row.rowKey);
                  setShowAdjustmentForm(false);
                  setActionMessage(null);
                  setGeneratedLetter(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedRowKey(row.rowKey);
                  }
                }}
                className="grid w-full cursor-pointer gap-3 border-b border-slate-100 bg-white px-5 py-5 text-left transition last:border-b-0 hover:bg-[#f8fbfa] xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_112px_112px_102px_112px_104px_72px] xl:items-center"
              >
                <div>
                  <h2 className="text-base font-black text-slate-950">{row.displayLabel}</h2>
                  <p className="mt-1 text-xs font-bold text-slate-500">{row.unitName} · {row.activeUnitSummary}</p>
                </div>
                <div className="text-sm font-bold text-slate-700">{row.tenantName}</div>
                <div className="text-sm font-black text-slate-950">{formatDate(row.lastAdjustmentDate)}</div>
                <div className="text-sm font-black text-slate-950">{formatCurrency(row.netRent)}</div>
                <div className="text-sm font-black text-slate-950">{formatCurrency(row.utilitiesRent)}</div>
                <div className="text-sm font-black text-emerald-700">{formatCurrency(row.warmRent)}</div>
                <div>
                  <span className={[
                    "inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.08em]",
                    row.adjustmentStatus === "Aktiv" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" :
                      row.adjustmentStatus === "Prüfung empfohlen" ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200" :
                        row.adjustmentStatus === "Geplant" ? "bg-blue-50 text-blue-800 ring-1 ring-blue-200" :
                          "bg-rose-50 text-rose-800 ring-1 ring-rose-200",
                  ].join(" ")}>
                    {row.adjustmentStatus}
                  </span>
                </div>
                <div className="flex justify-start xl:justify-end">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedChartRowKey(row.rowKey);
                    }}
                    className="rent-chart-button"
                    title={`Mietdiagramm für ${row.displayLabel} öffnen`}
                    aria-label={`Mietdiagramm für ${row.displayLabel} öffnen`}
                  >
                    <BarChart3 className="rent-chart-button-icon" size={18} aria-hidden="true" />
                    <MiniRentChartIcon data={buildRentChartData(row)} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="p-6 text-sm font-black text-slate-500">
              {rows.length ? "Keine Objekte oder Einheiten mit diesen Filtereinstellungen gefunden." : "Sie haben noch keine Mietverhältnisse angelegt. Sobald Sie Ihren ersten Mietvertrag mit Mietstruktur hinterlegen, erscheint hier Ihre dynamische Übersicht."}
            </div>
          )}
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <CalendarDays className="text-blue-700" size={20} />
            <h2 className="text-lg font-black text-slate-950">Letzte Erhöhungen</h2>
          </div>
          <p className="mt-2 text-sm font-bold text-slate-500">{stats.changes} erkannte Änderungen seit Januar 2024</p>
        </div>
        <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-amber-700" size={20} />
            <h2 className="text-lg font-black text-amber-950">Datenqualität</h2>
          </div>
          <p className="mt-2 text-sm font-bold leading-6 text-amber-900">
            {MIETBESTANDTEIL_NK_CATEGORY} wird als Mietbestandteil mitgezählt.
          </p>
        </div>
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-2 text-sm font-black text-slate-700">
            <span><Building2 size={16} className="mr-2 inline text-slate-500" />Objekte: {rows.length}</span>
            <span><WalletCards size={16} className="mr-2 inline text-slate-500" />Buchungen: {appData.entries.length}</span>
            <span><BarChart3 size={16} className="mr-2 inline text-slate-500" />Vermietungszeiträume: {portfolioRentals.length}</span>
          </div>
        </div>
      </section>

      {selectedRow ? (
        <div className="fixed inset-0 z-50 bg-slate-950/35 p-3 backdrop-blur-sm sm:p-5" onClick={() => setSelectedRowKey(null)}>
          <aside className="ml-auto flex h-full max-w-3xl flex-col overflow-hidden rounded-[24px] bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Details zur Mietanpassung</p>
                <h2 className="mt-2 text-2xl font-black text-slate-950">Details zur Mietanpassung</h2>
                <p className="mt-2 text-sm font-bold text-slate-600">Einheit: {selectedRow.displayLabel} | Mieter: {selectedRow.tenantName}</p>
              </div>
              <button type="button" onClick={() => setSelectedRowKey(null)} className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700" aria-label="Details schließen">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {actionMessage ? (
                <div className={[
                  "rounded-2xl border p-4 text-sm font-black",
                  actionMessage.includes("konnte") || actionMessage.includes("Bitte neu einloggen")
                    ? "border-rose-200 bg-rose-50 text-rose-800"
                    : "border-emerald-200 bg-emerald-50 text-emerald-800",
                ].join(" ")}>
                  {actionMessage}
                </div>
              ) : null}

              <section className="rounded-[22px] border border-slate-200 bg-slate-50 p-5">
                <h3 className="text-lg font-black text-slate-950">Aktuelle Anpassung</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Wirksam seit / ab</span>
                    <strong className="mt-2 block text-base font-black text-slate-950">{formatDate(selectedRow.lastAdjustmentDate)}</strong>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Grund der Anpassung</span>
                    <strong className="mt-2 block text-base font-black text-slate-950">{selectedRow.adjustmentReason}</strong>
                  </div>
                </div>
              </section>

              {showAdjustmentForm ? (
                <section ref={adjustmentFormRef} className="rounded-[22px] border border-blue-200 bg-blue-50 p-5">
                  <div className="flex items-center gap-2">
                    <Plus size={18} className="text-blue-700" />
                    <h3 className="text-lg font-black text-slate-950">
                      {editingAdjustmentId ? "Mietanpassung bearbeiten" : "Neue oder alte Mietanpassung eintragen"}
                    </h3>
                  </div>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                    Hier kannst du auch ältere Mietanpassungen nachtragen: alter Stand, neuer Stand und interne Notiz werden dauerhaft in der Historie gespeichert.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                      Wirksam seit / ab
                      <input
                        type="date"
                        className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-slate-950"
                        value={adjustmentForm.effectiveDate}
                        onChange={(event) => setAdjustmentForm((form) => ({ ...form, effectiveDate: event.target.value }))}
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                      Gültig bis
                      <input
                        type="date"
                        className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-slate-950"
                        value={adjustmentForm.effectiveEndDate}
                        onChange={(event) => setAdjustmentForm((form) => ({ ...form, effectiveEndDate: event.target.value }))}
                      />
                      <span className="text-[11px] font-bold normal-case leading-4 tracking-normal text-slate-500">Leer lassen, wenn die Anpassung aktuell/laufend gilt.</span>
                    </label>
                    <label className="grid gap-1 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                      Status
                      <select
                        className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-slate-950"
                        value={adjustmentForm.status}
                        onChange={(event) => setAdjustmentForm((form) => ({ ...form, status: event.target.value as ManualRentAdjustment["status"] }))}
                      >
                        <option value="planned">Geplant</option>
                        <option value="active">Aktiv</option>
                        <option value="consent_open">Offene Zustimmung</option>
                        <option value="check">Prüfung empfohlen</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs font-black uppercase tracking-[0.12em] text-slate-500 sm:col-span-2">
                      Grund der Anpassung
                      <select
                        className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-slate-950"
                        value={adjustmentForm.reason}
                        onChange={(event) => setAdjustmentForm((form) => ({ ...form, reason: event.target.value }))}
                      >
                        <option>Anpassung an ortsübliche Vergleichsmiete</option>
                        <option>Indexmiete</option>
                        <option>Staffelmiete</option>
                        <option>Modernisierung</option>
                        <option>Nebenkostenanpassung</option>
                        <option>Sonstige Mietanpassung</option>
                      </select>
                    </label>
                  </div>

                  <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <div className="grid grid-cols-4 gap-3 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                      <span>Kostenart</span>
                      <span>Alter Stand</span>
                      <span>Neuer Stand</span>
                      <span>Differenz</span>
                    </div>
                    {[
                      ["Nettokaltmiete", "oldColdRent", "newColdRent"],
                      ["Nebenkosten", "oldOperatingCosts", "newOperatingCosts"],
                    ].map(([label, oldKey, newKey]) => {
                      const oldValue = parseMoneyInput(adjustmentForm[oldKey as keyof RentAdjustmentForm]);
                      const newValue = parseMoneyInput(adjustmentForm[newKey as keyof RentAdjustmentForm]);
                      return (
                        <div key={label} className="grid grid-cols-4 gap-3 border-t border-slate-100 px-4 py-3 text-sm font-bold text-slate-700">
                          <span className="font-black text-slate-950">{label}</span>
                          <input
                            className="min-w-0 rounded-xl border border-slate-200 px-2 py-2 text-sm font-bold text-slate-950"
                            value={adjustmentForm[oldKey as keyof RentAdjustmentForm]}
                            onChange={(event) => setAdjustmentForm((form) => ({ ...form, [oldKey]: event.target.value }))}
                          />
                          <input
                            className="min-w-0 rounded-xl border border-slate-200 px-2 py-2 text-sm font-bold text-slate-950"
                            value={adjustmentForm[newKey as keyof RentAdjustmentForm]}
                            onChange={(event) => setAdjustmentForm((form) => ({ ...form, [newKey]: event.target.value }))}
                          />
                          <span className="py-2 text-emerald-700">{oldValue !== null && newValue !== null ? formatCurrency(newValue - oldValue) : "—"}</span>
                        </div>
                      );
                    })}
                    {(() => {
                      const oldCold = parseMoneyInput(adjustmentForm.oldColdRent) ?? 0;
                      const oldNk = parseMoneyInput(adjustmentForm.oldOperatingCosts) ?? 0;
                      const newCold = parseMoneyInput(adjustmentForm.newColdRent) ?? 0;
                      const newNk = parseMoneyInput(adjustmentForm.newOperatingCosts) ?? 0;
                      const oldTotal = money(oldCold + oldNk);
                      const newTotal = money(newCold + newNk);
                      return (
                        <div className="grid grid-cols-4 gap-3 border-t border-slate-100 bg-emerald-50/60 px-4 py-3 text-sm font-black text-slate-800">
                          <span>Warmmiete</span>
                          <span>{formatCurrency(oldTotal)}</span>
                          <span>{formatCurrency(newTotal)}</span>
                          <span className="text-emerald-700">{formatCurrency(newTotal - oldTotal)}</span>
                        </div>
                      );
                    })()}
                  </div>

                  <label className="mt-4 grid gap-1 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                    Notiz des Vermieters
                    <textarea
                      className="min-h-24 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold normal-case leading-6 tracking-normal text-slate-950"
                      placeholder="z. B. Zustimmung erfolgt am 15.10.2024 ohne Einwände."
                      value={adjustmentForm.note}
                      onChange={(event) => setAdjustmentForm((form) => ({ ...form, note: event.target.value }))}
                    />
                  </label>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void saveManualAdjustment(selectedRow)}
                      disabled={savingAdjustment}
                      className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm disabled:opacity-60"
                    >
                      <Save size={16} /> {savingAdjustment ? "Speichern..." : editingAdjustmentId ? "Änderungen speichern" : "Mietanpassung speichern"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAdjustmentId(null);
                        setShowAdjustmentForm(false);
                      }}
                      className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-950 shadow-sm"
                    >
                      Abbrechen
                    </button>
                  </div>
                </section>
              ) : null}

              <section className="rounded-[22px] border border-slate-200 bg-white p-5">
                <h3 className="text-lg font-black text-slate-950">Mietentwicklung im Detail</h3>
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                  <div className="grid grid-cols-4 gap-3 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                    <span>Kostenart</span>
                    <span>Alter Stand</span>
                    <span>Neuer Stand</span>
                    <span>Differenz</span>
                  </div>
                  {[
                    ["Nettokaltmiete", selectedRow.previousNetRent, selectedRow.netRent],
                    ["Nebenkosten", selectedRow.previousUtilitiesRent, selectedRow.utilitiesRent],
                    ["Warmmiete", selectedRow.previousWarmRent, selectedRow.warmRent],
                  ].map(([label, oldValue, newValue]) => (
                    <div key={String(label)} className="grid grid-cols-4 gap-3 border-t border-slate-100 px-4 py-3 text-sm font-bold text-slate-700">
                      <span className="font-black text-slate-950">{label}</span>
                      <span>{formatCurrency(Number(oldValue))}</span>
                      <span>{formatCurrency(Number(newValue))}</span>
                      <span className="text-emerald-700">{formatCurrency(Number(newValue) - Number(oldValue))}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[22px] border border-slate-200 bg-white p-5">
                <h3 className="text-lg font-black text-slate-950">Historie aller Mietanpassungen</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Lückenlose Dokumentation der bisherigen Erhöhungen und Begründungen für dieses Mietverhältnis.</p>
                <div className="mt-4 grid gap-3">
                  {selectedRow.manualAdjustments.map((adjustment) => {
                    const oldParts = manualRentParts(adjustment, "old");
                    const newParts = manualRentParts(adjustment, "new");
                    return (
                      <div key={adjustment.id} className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.1em] text-blue-700 ring-1 ring-blue-200">
                            Manuell eingetragen · {statusLabel(adjustment.status)}
                          </span>
                          <button
                            type="button"
                            onClick={() => editManualAdjustment(adjustment)}
                            className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-black text-blue-800 shadow-sm"
                          >
                            <Pencil size={14} /> Bearbeiten
                          </button>
                        </div>
                        <div className="grid gap-2 text-sm font-bold text-slate-700">
                          <span>
                            <strong>Zeitraum:</strong> {formatDate(adjustment.effective_date)}
                            {" "}bis {adjustment.effective_end_date ? formatDate(adjustment.effective_end_date) : "laufend / offen"}
                          </span>
                          <span><strong>Art:</strong> {adjustment.reason}</span>
                          <span>
                            <strong>Änderung:</strong>{" "}
                            Warmmiete {formatCurrency(manualOldTotal(adjustment))} auf {formatCurrency(manualNewTotal(adjustment))}
                            {" "}({formatCurrency(manualNewTotal(adjustment) - manualOldTotal(adjustment))})
                          </span>
                          <span>
                            <strong>Details:</strong>{" "}
                            Kaltmiete {formatCurrency(oldParts.netRent)} auf {formatCurrency(newParts.netRent)},{" "}
                            Nebenkosten {formatCurrency(oldParts.utilitiesRent)} auf {formatCurrency(newParts.utilitiesRent)}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2 text-xs font-bold text-slate-600">
                          <span className="inline-flex items-center gap-2"><FileText size={14} /> {adjustment.document_name || "Noch kein Dokument hinterlegt"}</span>
                          <span>Notiz des Vermieters: {adjustment.note || "Keine Notiz hinterlegt."}</span>
                        </div>
                      </div>
                    );
                  })}
                  {!selectedRow.manualAdjustments.length ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">
                      Noch keine manuelle Mietanpassung für dieses Mietverhältnis eingetragen.
                    </div>
                  ) : null}
                </div>
              </section>
              {generatedLetter ? (
                <section className="rounded-[22px] border border-emerald-200 bg-emerald-50 p-5">
                  <h3 className="text-lg font-black text-slate-950">Schreiben für Mieter</h3>
                  <textarea
                    readOnly
                    className="mt-4 min-h-64 w-full rounded-2xl border border-emerald-200 bg-white p-4 text-sm font-semibold leading-6 text-slate-800"
                    value={generatedLetter}
                  />
                  <button
                    type="button"
                    onClick={() => downloadTextFile(`Mietanpassung_${selectedRow.object.label.replace(/[^a-z0-9]+/gi, "_")}.txt`, generatedLetter)}
                    className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white shadow-sm"
                  >
                    <Download size={16} /> Schreiben herunterladen
                  </button>
                </section>
              ) : null}
            </div>
            <div className="grid gap-3 border-t border-slate-200 p-5 sm:grid-cols-2">
              <button type="button" onClick={() => openAdjustmentPlanner(selectedRow)} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm">
                Neue Mietanpassung planen
              </button>
              <button type="button" onClick={() => generateTenantLetter(selectedRow)} className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-950 shadow-sm">
                Schreiben für Mieter generieren
              </button>
              <p className="sm:col-span-2 text-xs font-bold leading-5 text-slate-500">
                Rechtlicher Hinweis: Beachten Sie bei Erhöhungen auf die ortsübliche Vergleichsmiete die gesetzliche Kappungsgrenze sowie die Jahressperrfrist von 12 Monaten seit der letzten Anpassung.
              </p>
            </div>
          </aside>
        </div>
      ) : null}

      {selectedChartRow ? (
        <div className="fixed inset-0 z-[60] bg-slate-950/45 p-3 backdrop-blur-sm sm:p-6" onClick={() => setSelectedChartRowKey(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="rent-chart-dialog-title"
            className="mx-auto mt-8 max-h-[calc(100vh-4rem)] max-w-5xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#315f72]">Mietentwicklungsdiagramm</p>
                <h2 id="rent-chart-dialog-title" className="mt-2 text-xl font-black text-slate-950 sm:text-2xl">{selectedChartRow.displayLabel}</h2>
                <p className="mt-1 text-sm font-bold text-slate-500">{selectedChartRow.tenantName}</p>
              </div>
              <button type="button" onClick={() => setSelectedChartRowKey(null)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm" aria-label="Diagramm schließen">
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[calc(100vh-11rem)] overflow-y-auto p-5 sm:p-6">
              <RentDevelopmentChart row={selectedChartRow} />
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
