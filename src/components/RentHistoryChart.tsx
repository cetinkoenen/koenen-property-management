import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/lib/supabase";
import { normalizeUuid } from "@/lib/ids";
import { useRentHistory24m } from "@/hooks/useRentHistory24m";

interface RentHistoryChartProps {
  scopeType: "user" | "property";
  portfolioPropertyId?: string;
  fallbackPropertyIds?: Array<string | null | undefined>;
}

type PropertyRentHistoryByUnitRow = {
  portfolio_property_id: string;
  property_name: string;
  unit_id: string | null;
  rental_id: string;
  start_date: string | null;
  end_date: string | null;
  rent_monthly: number | string | null;
  rent_type: string | null;
  kaltmiete_laut_mietvertrag: number | string | null;
  nebenkosten: number | string | null;
  gesamt_mietkosten: number | string | null;
  is_planned: boolean | null;
  previous_rent: number | string | null;
  rent_increase: number | string | null;
};

type UserChartPoint = {
  month: string;
  rent: number;
};

type MultiLineChartPoint = {
  month: string;
  [seriesKey: string]: string | number | null;
};

type UnitMeta = {
  unitId: string;
  label: string;
  maxRent: number;
  pointCount: number;
};

function uniqueValidIds(values: Array<string | null | undefined>): string[] {
  const normalized = values
    .map((value) => normalizeUuid(String(value ?? "").trim()))
    .filter((value): value is string => Boolean(value));

  return [...new Set(normalized)];
}

function errorText(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (typeof err === "object" && err && "message" in err) {
    return String((err as { message?: unknown }).message ?? "");
  }
  return String(err);
}

const eur = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function formatEur(value: unknown): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "";
  return eur.format(n);
}

function formatMonthTick(yyyyMm: string): string {
  const s = String(yyyyMm ?? "");
  const [y, m] = s.split("-").map(Number);
  if (!y || !m) return s;

  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("de-DE", {
    month: "short",
    year: "2-digit",
  });
}

function monthKeyFromDate(value: string | null | undefined): string {
  if (!value) return "";
  return String(value).slice(0, 7);
}

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function compareMonthKey(a: string, b: string): number {
  return a.localeCompare(b);
}

function addMonth(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  const d = new Date(year, mon - 1, 1);
  d.setMonth(d.getMonth() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function buildMonthRange(start: string, end: string): string[] {
  const result: string[] = [];
  let current = start;

  while (current <= end) {
    result.push(current);
    current = addMonth(current);
  }

  return result;
}

function buildUnitLabel(unitId: string, index: number, isMain: boolean): string {
  const short = unitId.slice(0, 6);
  return isMain ? `Haupteinheit (${short})` : `Einheit ${index + 1} (${short})`;
}

function getMainUnitId(rows: PropertyRentHistoryByUnitRow[]): string | null {
  const byUnit = new Map<string, { maxRent: number; pointCount: number }>();

  for (const row of rows) {
    const unitId = row.unit_id ?? "unknown";
    const rent = toNumber(row.rent_monthly);
    const current = byUnit.get(unitId);

    if (!current) {
      byUnit.set(unitId, { maxRent: rent, pointCount: 1 });
      continue;
    }

    byUnit.set(unitId, {
      maxRent: Math.max(current.maxRent, rent),
      pointCount: current.pointCount + 1,
    });
  }

  let bestUnitId: string | null = null;
  let bestMaxRent = -1;
  let bestPointCount = -1;

  for (const [unitId, stats] of byUnit.entries()) {
    if (
      stats.maxRent > bestMaxRent ||
      (stats.maxRent === bestMaxRent && stats.pointCount > bestPointCount)
    ) {
      bestUnitId = unitId;
      bestMaxRent = stats.maxRent;
      bestPointCount = stats.pointCount;
    }
  }

  return bestUnitId;
}

function buildPropertyChartData(rows: PropertyRentHistoryByUnitRow[]): {
  chartData: MultiLineChartPoint[];
  units: UnitMeta[];
} {
  const byUnit = new Map<string, PropertyRentHistoryByUnitRow[]>();
  const mainUnitId = getMainUnitId(rows);

  for (const row of rows) {
    const unitId = row.unit_id ?? "unknown";
    const list = byUnit.get(unitId) ?? [];
    list.push(row);
    byUnit.set(unitId, list);
  }

  const orderedUnits = Array.from(byUnit.entries())
    .map(([unitId, unitRows]) => {
      const sortedRows = unitRows
        .slice()
        .sort((a, b) =>
          String(a.start_date ?? "").localeCompare(String(b.start_date ?? ""))
        );

      const maxRent = Math.max(...sortedRows.map((row) => toNumber(row.rent_monthly)));

      return {
        unitId,
        rows: sortedRows,
        maxRent,
        pointCount: sortedRows.length,
      };
    })
    .sort((a, b) => {
      if (b.maxRent !== a.maxRent) return b.maxRent - a.maxRent;
      return b.pointCount - a.pointCount;
    });

  const units: UnitMeta[] = orderedUnits.map((unit, index) => ({
    unitId: unit.unitId,
    label: buildUnitLabel(unit.unitId, index, unit.unitId === mainUnitId),
    maxRent: unit.maxRent,
    pointCount: unit.pointCount,
  }));

  const allMonths = rows
    .map((row) => monthKeyFromDate(row.start_date))
    .filter(Boolean)
    .sort(compareMonthKey);

  if (allMonths.length === 0) {
    return { chartData: [], units };
  }

  const firstMonth = allMonths[0];
  const lastMonth = allMonths[allMonths.length - 1];
  const fullMonths = buildMonthRange(firstMonth, lastMonth);

  const chartData: MultiLineChartPoint[] = fullMonths.map((month) => ({ month }));

  for (const unit of orderedUnits) {
    let currentRent: number | null = null;
    let rowIndex = 0;

    for (const point of chartData) {
      const month = String(point.month);

      while (
        rowIndex < unit.rows.length &&
        monthKeyFromDate(unit.rows[rowIndex].start_date) <= month
      ) {
        currentRent = toNumber(unit.rows[rowIndex].rent_monthly);
        rowIndex += 1;
      }

      point[unit.unitId] = currentRent;
    }
  }

  return { chartData, units };
}

function buildUserChartData(data: unknown[]): UserChartPoint[] {
  const rows = Array.isArray(data) ? data : [];

  return rows.map((value) => {
    const row = typeof value === "object" && value !== null
      ? value as { month?: unknown; rent_cents_total?: unknown; rent?: unknown }
      : {};
    const hasCents = row.rent_cents_total != null;
    const raw = Number(row.rent_cents_total ?? row.rent ?? 0);

    return {
      month: String(row.month ?? "").slice(0, 7),
      rent: hasCents ? raw / 100 : raw,
    };
  });
}

function ChartDiagnostics({
  visible,
  onToggle,
  candidateChartIds,
  matchedChartPropertyId,
  rowCount,
  unitCount,
  pointCount,
}: {
  visible: boolean;
  onToggle: () => void;
  candidateChartIds: string[];
  matchedChartPropertyId: string | null;
  rowCount: number;
  unitCount: number;
  pointCount: number;
}) {
  return (
    <div className="mb-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onToggle}
          className="rounded border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700"
        >
          {visible ? "Chart-Diagnose ausblenden" : "Chart-Diagnose anzeigen"}
        </button>
      </div>

      {visible ? (
        <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700">
          <div>
            <b>Chart-Diagnose</b>
          </div>
          <div>Kandidaten: {candidateChartIds.join(" | ") || "keine"}</div>
          <div>Treffer-ID: {matchedChartPropertyId ?? "keine"}</div>
          <div>Rows: {rowCount}</div>
          <div>Units: {unitCount}</div>
          <div>Chart points: {pointCount}</div>
        </div>
      ) : null}
    </div>
  );
}

export default function RentHistoryChart({
  scopeType,
  portfolioPropertyId,
  fallbackPropertyIds = [],
}: RentHistoryChartProps) {
  const userHookResult = useRentHistory24m({ scopeType });

  const userData = userHookResult?.data ?? [];
  const userError = userHookResult?.error ?? null;
  const userRequiresAuth = Boolean(userHookResult?.requiresAuth ?? false);
  const userLoading = Boolean(userHookResult.loading);

  const [propertyRows, setPropertyRows] = useState<PropertyRentHistoryByUnitRow[]>([]);
  const [propertyLoading, setPropertyLoading] = useState(false);
  const [propertyError, setPropertyError] = useState<string | null>(null);
  const [matchedChartPropertyId, setMatchedChartPropertyId] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const candidateChartIds = useMemo(() => {
    return uniqueValidIds([portfolioPropertyId, ...fallbackPropertyIds]);
  }, [portfolioPropertyId, fallbackPropertyIds]);

  useEffect(() => {
    let cancelled = false;

    async function loadPropertyChart() {
      if (scopeType !== "property") {
        setPropertyRows([]);
        setMatchedChartPropertyId(null);
        setPropertyError(null);
        setPropertyLoading(false);
        return;
      }

      if (!candidateChartIds.length) {
        setPropertyRows([]);
        setMatchedChartPropertyId(null);
        setPropertyError("Keine Property-ID für den Chart vorhanden.");
        setPropertyLoading(false);
        return;
      }

      setPropertyLoading(true);
      setPropertyError(null);

      try {
        let foundRows: PropertyRentHistoryByUnitRow[] = [];
        let foundId: string | null = null;

        for (const candidateId of candidateChartIds) {
          const { data, error } = await supabase
            .from("property_rent_history_by_unit")
            .select("*")
            .eq("portfolio_property_id", candidateId)
            .order("unit_id", { ascending: true })
            .order("start_date", { ascending: true });

          if (cancelled) return;
          if (error) throw error;

          const rows = (data ?? []) as PropertyRentHistoryByUnitRow[];

          if (rows.length > 0) {
            foundRows = rows;
            foundId = candidateId;
            break;
          }
        }

        setPropertyRows(foundRows);
        setMatchedChartPropertyId(foundId);
        setPropertyError(null);
      } catch (error) {
        if (cancelled) return;
        console.error("RentHistoryChart property query failed:", error);
        setPropertyRows([]);
        setMatchedChartPropertyId(null);
        setPropertyError(errorText(error));
      } finally {
        if (!cancelled) {
          setPropertyLoading(false);
        }
      }
    }

    void loadPropertyChart();

    return () => {
      cancelled = true;
    };
  }, [scopeType, candidateChartIds]);

  const propertyChart = useMemo(() => {
    if (scopeType !== "property") {
      return {
        chartData: [] as MultiLineChartPoint[],
        units: [] as UnitMeta[],
      };
    }

    return buildPropertyChartData(propertyRows);
  }, [scopeType, propertyRows]);

  const userChartData = useMemo(() => {
    if (scopeType !== "user") return [];
    return buildUserChartData(userData);
  }, [scopeType, userData]);

  const isLoading = scopeType === "property" ? propertyLoading : userLoading;
  const error = scopeType === "property" ? propertyError : errorText(userError);
  const requiresAuth = scopeType === "property" ? false : userRequiresAuth;

  const yDomain = useMemo(() => {
    const values =
      scopeType === "property"
        ? propertyChart.chartData.flatMap((row) =>
            Object.entries(row)
              .filter(([key]) => key !== "month")
              .map(([, value]) => Number(value))
          )
        : userChartData.map((d) => d.rent);

    const vals = values.filter((n) => Number.isFinite(n));

    if (!vals.length) {
      return ["auto", "auto"] as const;
    }

    const min = Math.min(...vals);
    const max = Math.max(...vals);

    if (min === max) {
      return [Math.max(0, min * 0.9), max * 1.1] as const;
    }

    const pad = (max - min) * 0.1;
    return [Math.max(0, min - pad), max + pad] as const;
  }, [scopeType, propertyChart.chartData, userChartData]);

  if (isLoading) {
    return <div className="text-sm text-gray-500">Lade Mietverlauf…</div>;
  }

  if (error) {
    return <div className="text-sm text-black">Fehler beim Laden: {error}</div>;
  }

  if (requiresAuth) {
    return (
      <div className="text-sm text-gray-500">
        Bitte einloggen, um den Mietverlauf zu sehen.
      </div>
    );
  }

  if (scopeType === "property" && !candidateChartIds.length) {
    return (
      <div className="text-sm text-gray-500">
        Keine Property-ID für den Chart vorhanden.
      </div>
    );
  }

  if (scopeType === "property" && propertyChart.chartData.length === 0) {
    return (
      <div className="text-sm text-gray-500">
        Keine Mietdaten gefunden.
      </div>
    );
  }

  if (scopeType === "user" && userChartData.length === 0) {
    return <div className="text-sm text-gray-500">Keine Mietdaten gefunden.</div>;
  }

  return (
    <>
      {scopeType === "property" ? (
        <ChartDiagnostics
          visible={showDiagnostics}
          onToggle={() => setShowDiagnostics((current) => !current)}
          candidateChartIds={candidateChartIds}
          matchedChartPropertyId={matchedChartPropertyId}
          rowCount={propertyRows.length}
          unitCount={propertyChart.units.length}
          pointCount={propertyChart.chartData.length}
        />
      ) : null}

      {scopeType === "property" && propertyChart.units.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2 text-xs text-gray-600">
          {propertyChart.units.map((unit) => (
            <div
              key={unit.unitId}
              className="rounded border border-gray-200 bg-gray-50 px-2 py-1"
            >
              <b>{unit.label}</b> · {unit.pointCount} Zeiträume · max.{" "}
              {formatEur(unit.maxRent)}
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ width: "100%", minWidth: 0, minHeight: 320, height: 320 }}>
        <ResponsiveContainer width="100%" height={320}>
          {scopeType === "property" ? (
            <LineChart
              data={propertyChart.chartData}
              margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="month"
                tickFormatter={(v) => formatMonthTick(String(v))}
                interval="preserveStartEnd"
              />
              <YAxis domain={yDomain} tickFormatter={(v) => formatEur(v)} />
              <Tooltip
                labelFormatter={(label) => formatMonthTick(String(label))}
                formatter={(value, name) => [formatEur(value), String(name)]}
              />
              {propertyChart.units.map((unit) => (
                <Line
                  key={unit.unitId}
                  type="stepAfter"
                  dataKey={unit.unitId}
                  name={unit.label}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          ) : (
            <LineChart
              data={userChartData}
              margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="month"
                tickFormatter={(v) => formatMonthTick(String(v))}
                interval="preserveStartEnd"
              />
              <YAxis domain={yDomain} tickFormatter={(v) => formatEur(v)} />
              <Tooltip
                labelFormatter={(label) => formatMonthTick(String(label))}
                formatter={(value) => formatEur(value)}
              />
              <Line
                type="stepAfter"
                dataKey="rent"
                dot={false}
                name="Miete"
                isAnimationActive={false}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </>
  );
}
