import { useEffect, useMemo, useState } from "react";
import { loadBackendDataQualityChecks, loadBackendFinanceConsistency, loadBackendFinanceMaster, type BackendDataQualityCheckRow, type BackendFinanceConsistencyRow, type BackendFinanceMasterRow } from "@/services/backendFinanceMasterService";
import { buildMasterFinanceSnapshotsFromBackend, buildMasterTotals, type MasterFinanceSnapshot } from "@/services/masterDataService";

export type BackendFinanceMasterState = {
  rows: BackendFinanceMasterRow[];
  snapshots: MasterFinanceSnapshot[];
  consistency: BackendFinanceConsistencyRow[];
  dataQualityChecks: BackendDataQualityCheckRow[];
  loading: boolean;
  error: string | null;
  sourceLabel: "Backend-Finanzmaster" | "Frontend-Fallback";
  refreshedAt: string | null;
};

export function useBackendFinanceMaster(year: number, refreshKey = 0): BackendFinanceMasterState {
  const [rows, setRows] = useState<BackendFinanceMasterRow[]>([]);
  const [consistency, setConsistency] = useState<BackendFinanceConsistencyRow[]>([]);
  const [dataQualityChecks, setDataQualityChecks] = useState<BackendDataQualityCheckRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const startLoading = window.setTimeout(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
    }, 0);

    void Promise.allSettled([loadBackendFinanceMaster(year), loadBackendFinanceConsistency(year), loadBackendDataQualityChecks(year)])
      .then((results) => {
        if (cancelled) return;
        const [masterResult, consistencyResult, qualityResult] = results;

        const masterRows = masterResult.status === "fulfilled" ? masterResult.value : [];
        const consistencyRows = consistencyResult.status === "fulfilled" ? consistencyResult.value : [];
        const qualityRows = qualityResult.status === "fulfilled" ? qualityResult.value : [];

        setRows(masterRows);
        setConsistency(consistencyRows);
        setDataQualityChecks(qualityRows);

        const criticalErrors = [masterResult, consistencyResult]
          .filter((result): result is PromiseRejectedResult => result.status === "rejected")
          .map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason));

        // Die Datenqualitäts-RPC wurde in älteren produktiven Supabase-Ständen noch nicht angelegt.
        // Sie darf den gesamten Finanzmaster nicht mehr in den Frontend-Fallback ziehen.
        if (criticalErrors.length) setError(criticalErrors.join(" | "));
        else setError(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(startLoading);
    };
  }, [year, refreshKey]);

  const snapshots = useMemo(() => buildMasterFinanceSnapshotsFromBackend(rows), [rows]);
  const refreshedAt = useMemo(() => rows.find((row) => row.refreshed_at)?.refreshed_at ?? null, [rows]);

  return {
    rows,
    snapshots,
    consistency,
    dataQualityChecks,
    loading,
    error,
    sourceLabel: rows.length ? "Backend-Finanzmaster" : "Frontend-Fallback",
    refreshedAt,
  };
}

export function useBackendFinanceTotals(year: number) {
  const state = useBackendFinanceMaster(year);
  return { ...state, totals: buildMasterTotals(state.snapshots) };
}
