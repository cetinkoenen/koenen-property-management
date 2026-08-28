import { useCallback, useEffect, useState } from "react";
import yearlyIncomeService from "@/services/yearlyIncomeService";
import type { YearlyIncomeEntry } from "@/types/finance";

type UseYearlyIncomeOptions = {
  autoGenerateIfMissing?: boolean;
  startYear?: number;
  yearCount?: number;
};

type UseYearlyIncomeResult = {
  yearlyIncome: YearlyIncomeEntry[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

export function useYearlyIncome(
  propertyId?: string,
  options?: UseYearlyIncomeOptions,
): UseYearlyIncomeResult {
  const [yearlyIncome, setYearlyIncome] = useState<YearlyIncomeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const autoGenerateIfMissing = options?.autoGenerateIfMissing ?? true;
  const startYear = options?.startYear ?? 2024;
  const yearCount = options?.yearCount ?? 10;

  const load = useCallback(async () => {
    if (!propertyId) {
      setYearlyIncome([]);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const rows = autoGenerateIfMissing
        ? await yearlyIncomeService.ensureGeneratedForProperty(propertyId, {
            startYear,
            yearCount,
          })
        : await yearlyIncomeService.getByPropertyId(propertyId);

      setYearlyIncome(rows);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unbekannter Fehler beim Laden der Jahresdaten";
      setError(message);
      setYearlyIncome([]);
    } finally {
      setLoading(false);
    }
  }, [propertyId, autoGenerateIfMissing, startYear, yearCount]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);

  return {
    yearlyIncome,
    loading,
    error,
    reload: load,
  };
}

export default useYearlyIncome;
