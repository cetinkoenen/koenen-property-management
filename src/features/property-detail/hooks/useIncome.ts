import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import propertyIncomeService from "@/services/propertyIncomeService";
import yearlyIncomeService from "@/services/yearlyIncomeService";
import yearlyCapexService from "@/services/yearlyCapexService";
import type { PropertyIncome } from "@/types/propertyIncome";
import type { YearlyCapexEntry, YearlyIncomeEntry } from "@/types/finance";

type UseIncomeState = {
  propertyIncome: PropertyIncome | null;
  yearlyIncome: YearlyIncomeEntry[];
  yearlyCapex: YearlyCapexEntry[];
  isLoading: boolean;
  error: string | null;
};

type UpsertPropertyIncomeInput = {
  annualRent: number;
  otherIncome: number;
};

type CreateYearlyIncomeInput = {
  year: number;
  annualRent: number;
  otherIncome: number;
  source?: string | null;
};

type UpdateYearlyIncomeInput = {
  year?: number;
  annualRent?: number;
  otherIncome?: number;
  source?: string | null;
};

type CreateYearlyCapexInput = {
  year: number;
  amount: number;
  category?: string | null;
  note?: string | null;
};

type UpdateYearlyCapexInput = {
  year?: number;
  amount?: number;
  category?: string | null;
  note?: string | null;
};

export type UseIncomeResult = UseIncomeState & {
  hasPropertyId: boolean;
  reload: () => Promise<void>;

  upsertPropertyIncome: (input: UpsertPropertyIncomeInput) => Promise<PropertyIncome>;
  removePropertyIncome: (id: string) => Promise<void>;

  createYearlyIncome: (input: CreateYearlyIncomeInput) => Promise<YearlyIncomeEntry>;
  updateYearlyIncome: (id: string, input: UpdateYearlyIncomeInput) => Promise<YearlyIncomeEntry>;
  removeYearlyIncome: (id: string) => Promise<void>;
  upsertYearlyIncome: (
    year: number,
    input: Omit<CreateYearlyIncomeInput, "year">,
  ) => Promise<YearlyIncomeEntry>;

  createYearlyCapex: (input: CreateYearlyCapexInput) => Promise<YearlyCapexEntry>;
  updateYearlyCapex: (id: string, input: UpdateYearlyCapexInput) => Promise<YearlyCapexEntry>;
  removeYearlyCapex: (id: string) => Promise<void>;
  upsertYearlyCapex: (input: CreateYearlyCapexInput) => Promise<YearlyCapexEntry>;

  setPropertyIncome: Dispatch<SetStateAction<PropertyIncome | null>>;
  setYearlyIncome: Dispatch<SetStateAction<YearlyIncomeEntry[]>>;
  setYearlyCapex: Dispatch<SetStateAction<YearlyCapexEntry[]>>;
  clearError: () => void;
};

function safePropertyId(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return fallback;
}

function sortYearlyIncome(entries: YearlyIncomeEntry[]): YearlyIncomeEntry[] {
  return [...entries].sort((a, b) => normalizeNumber(a.year) - normalizeNumber(b.year));
}

function sortYearlyCapex(entries: YearlyCapexEntry[]): YearlyCapexEntry[] {
  return [...entries].sort((a, b) => normalizeNumber(a.year) - normalizeNumber(b.year));
}

function mergeMessages(messages: Array<string | null | undefined>): string | null {
  const cleaned = messages.map((msg) => String(msg ?? "").trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(" | ") : null;
}

export function useIncome(propertyIdInput?: string | null): UseIncomeResult {
  const propertyId = useMemo(() => safePropertyId(propertyIdInput), [propertyIdInput]);
  const hasPropertyId = propertyId.length > 0;

  const [propertyIncome, setPropertyIncome] = useState<PropertyIncome | null>(null);
  const [yearlyIncome, setYearlyIncome] = useState<YearlyIncomeEntry[]>([]);
  const [yearlyCapex, setYearlyCapex] = useState<YearlyCapexEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    if (import.meta.env.DEV) console.debug("[useIncome] load start", { propertyId, hasPropertyId, requestId });

    if (!hasPropertyId) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;

      setPropertyIncome(null);
      setYearlyIncome([]);
      setYearlyCapex([]);
      setError(null);
      setIsLoading(false);

      if (import.meta.env.DEV) console.debug("[useIncome] no propertyId -> reset state");
      return;
    }

    if (mountedRef.current && requestId === requestIdRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const [propertyIncomeResult, yearlyIncomeResult, yearlyCapexResult] =
        await Promise.allSettled([
          propertyIncomeService.getByPropertyId(propertyId),
          yearlyIncomeService.getByPropertyId(propertyId),
          yearlyCapexService.getByPropertyId(propertyId),
        ]);

      if (import.meta.env.DEV) console.debug("[useIncome] raw Promise results", {
        propertyId,
        propertyIncomeResult,
        yearlyIncomeResult,
        yearlyCapexResult,
      });

      if (!mountedRef.current || requestId !== requestIdRef.current) {
        if (import.meta.env.DEV) console.debug("[useIncome] abort after raw load because request is stale", {
          propertyId,
          requestId,
          currentRequestId: requestIdRef.current,
        });
        return;
      }

      let nextPropertyIncome: PropertyIncome | null = null;
      let nextYearlyIncome: YearlyIncomeEntry[] = [];
      let nextYearlyCapex: YearlyCapexEntry[] = [];
      const partialErrors: string[] = [];

      if (propertyIncomeResult.status === "fulfilled") {
        nextPropertyIncome = propertyIncomeResult.value ?? null;
      } else {
        partialErrors.push(
          `property_income: ${normalizeErrorMessage(
            propertyIncomeResult.reason,
            "Fehler beim Laden von property_income.",
          )}`,
        );
      }

      if (yearlyIncomeResult.status === "fulfilled") {
        nextYearlyIncome = Array.isArray(yearlyIncomeResult.value)
          ? sortYearlyIncome(yearlyIncomeResult.value)
          : [];
      } else {
        partialErrors.push(
          `yearly_property_income: ${normalizeErrorMessage(
            yearlyIncomeResult.reason,
            "Fehler beim Laden von yearly_property_income.",
          )}`,
        );
      }

      if (yearlyCapexResult.status === "fulfilled") {
        nextYearlyCapex = Array.isArray(yearlyCapexResult.value)
          ? sortYearlyCapex(yearlyCapexResult.value)
          : [];
      } else {
        partialErrors.push(
          `yearly_capex_entries: ${normalizeErrorMessage(
            yearlyCapexResult.reason,
            "Fehler beim Laden von yearly_capex_entries.",
          )}`,
        );
      }

      if (import.meta.env.DEV) console.debug("[useIncome] normalized service values", {
        propertyId,
        propertyIncome: nextPropertyIncome,
        yearlyIncomeCount: nextYearlyIncome.length,
        yearlyIncome: nextYearlyIncome,
        yearlyCapexCount: nextYearlyCapex.length,
        yearlyCapex: nextYearlyCapex,
      });

      if (nextPropertyIncome && nextYearlyIncome.length === 0) {
        console.warn("[useIncome] triggering ensureGeneratedForProperty", {
          propertyId,
          hasPropertyIncome: true,
          yearlyIncomeCount: nextYearlyIncome.length,
        });

        try {
          const regeneratedYearlyIncome = await yearlyIncomeService.ensureGeneratedForProperty(
            propertyId,
            {
              startYear: 2024,
              yearCount: 10,
            },
          );

          if (!mountedRef.current || requestId !== requestIdRef.current) {
            if (import.meta.env.DEV) console.debug("[useIncome] abort after regeneration because request is stale", {
              propertyId,
              requestId,
              currentRequestId: requestIdRef.current,
            });
            return;
          }

          nextYearlyIncome = sortYearlyIncome(regeneratedYearlyIncome);

          if (import.meta.env.DEV) console.debug("[useIncome] regenerated yearly income", {
            propertyId,
            regeneratedCount: nextYearlyIncome.length,
            regeneratedYearlyIncome: nextYearlyIncome,
          });
        } catch (err) {
          partialErrors.push(
            `yearly_property_income regeneration: ${normalizeErrorMessage(
              err,
              "Fehler beim Generieren von yearly_property_income.",
            )}`,
          );
        }
      }

      if (import.meta.env.DEV) console.debug("[useIncome] committing state", {
        propertyId,
        propertyIncomeExists: !!nextPropertyIncome,
        yearlyIncomeCount: nextYearlyIncome.length,
        yearlyCapexCount: nextYearlyCapex.length,
        partialErrors,
      });

      setPropertyIncome(nextPropertyIncome);
      setYearlyIncome(nextYearlyIncome);
      setYearlyCapex(nextYearlyCapex);
      setError(mergeMessages(partialErrors));
      setIsLoading(false);
    } catch (err) {
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return;
      }

      const message = normalizeErrorMessage(err, "Fehler beim Laden der Income-Daten.");

      console.error("[useIncome] load failed", {
        propertyId,
        error: err,
        message,
      });

      setPropertyIncome(null);
      setYearlyIncome([]);
      setYearlyCapex([]);
      setError(message);
      setIsLoading(false);
    }
  }, [hasPropertyId, propertyId]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);

  const reload = useCallback(async () => {
    await load();
  }, [load]);

  const upsertPropertyIncome = useCallback(
    async (input: UpsertPropertyIncomeInput): Promise<PropertyIncome> => {
      if (!hasPropertyId) {
        throw new Error("Keine propertyId vorhanden.");
      }

      setError(null);

      try {
        const saved = await propertyIncomeService.upsertByPropertyId(propertyId, {
          annualRent: normalizeNumber(input.annualRent, 0),
          otherIncome: normalizeNumber(input.otherIncome, 0),
        });

        const syncedYearlyIncome = await yearlyIncomeService.ensureGeneratedForProperty(propertyId, {
          startYear: 2024,
          yearCount: 10,
        });

        if (import.meta.env.DEV) console.debug("[useIncome] upsertPropertyIncome success", {
          propertyId,
          saved,
          syncedYearlyIncomeCount: syncedYearlyIncome.length,
          syncedYearlyIncome,
        });

        if (mountedRef.current) {
          setPropertyIncome(saved);
          setYearlyIncome(sortYearlyIncome(syncedYearlyIncome));
        }

        return saved;
      } catch (err) {
        const message = normalizeErrorMessage(
          err,
          "Fehler beim Speichern von property_income.",
        );

        if (mountedRef.current) {
          setError(message);
        }

        console.error("[useIncome] upsertPropertyIncome failed", {
          propertyId,
          error: err,
          message,
        });

        throw err;
      }
    },
    [hasPropertyId, propertyId],
  );

  const removePropertyIncome = useCallback(
    async (id: string): Promise<void> => {
      setError(null);

      try {
        await propertyIncomeService.remove(id);

        if (mountedRef.current) {
          setPropertyIncome(null);
        }
      } catch (err) {
        const message = normalizeErrorMessage(
          err,
          "Fehler beim Löschen von property_income.",
        );

        if (mountedRef.current) {
          setError(message);
        }

        throw err;
      }
    },
    [],
  );

  const createYearlyIncome = useCallback(
    async (input: CreateYearlyIncomeInput): Promise<YearlyIncomeEntry> => {
      if (!hasPropertyId) {
        throw new Error("Keine propertyId vorhanden.");
      }

      setError(null);

      try {
        const created = await yearlyIncomeService.create({
          propertyId,
          year: input.year,
          annualRent: normalizeNumber(input.annualRent, 0),
          otherIncome: normalizeNumber(input.otherIncome, 0),
          source: input.source ?? null,
        });

        if (mountedRef.current) {
          setYearlyIncome((prev) => sortYearlyIncome([...prev, created]));
        }

        return created;
      } catch (err) {
        const message = normalizeErrorMessage(
          err,
          "Fehler beim Erstellen eines yearly income entry.",
        );

        if (mountedRef.current) {
          setError(message);
        }

        throw err;
      }
    },
    [hasPropertyId, propertyId],
  );

  const updateYearlyIncome = useCallback(
    async (id: string, input: UpdateYearlyIncomeInput): Promise<YearlyIncomeEntry> => {
      setError(null);

      try {
        const updated = await yearlyIncomeService.update(id, {
          year: input.year,
          annualRent: input.annualRent,
          otherIncome: input.otherIncome,
          source: input.source,
        });

        if (mountedRef.current) {
          setYearlyIncome((prev) =>
            sortYearlyIncome(prev.map((entry) => (entry.id === id ? updated : entry))),
          );
        }

        return updated;
      } catch (err) {
        const message = normalizeErrorMessage(
          err,
          "Fehler beim Aktualisieren eines yearly income entry.",
        );

        if (mountedRef.current) {
          setError(message);
        }

        throw err;
      }
    },
    [],
  );

  const removeYearlyIncome = useCallback(
    async (id: string): Promise<void> => {
      setError(null);

      try {
        await yearlyIncomeService.remove(id);

        if (mountedRef.current) {
          setYearlyIncome((prev) => prev.filter((entry) => entry.id !== id));
        }
      } catch (err) {
        const message = normalizeErrorMessage(
          err,
          "Fehler beim Löschen eines yearly income entry.",
        );

        if (mountedRef.current) {
          setError(message);
        }

        throw err;
      }
    },
    [],
  );

  const upsertYearlyIncome = useCallback(
    async (
      year: number,
      input: Omit<CreateYearlyIncomeInput, "year">,
    ): Promise<YearlyIncomeEntry> => {
      if (!hasPropertyId) {
        throw new Error("Keine propertyId vorhanden.");
      }

      setError(null);

      try {
        const saved = await yearlyIncomeService.upsertByPropertyIdAndYear(propertyId, year, {
          annualRent: normalizeNumber(input.annualRent, 0),
          otherIncome: normalizeNumber(input.otherIncome, 0),
          source: input.source ?? null,
        });

        if (mountedRef.current) {
          setYearlyIncome((prev) => {
            const withoutSameId = prev.filter((entry) => entry.id !== saved.id);
            const withoutSameYear = withoutSameId.filter((entry) => entry.year !== saved.year);
            return sortYearlyIncome([...withoutSameYear, saved]);
          });
        }

        return saved;
      } catch (err) {
        const message = normalizeErrorMessage(
          err,
          "Fehler beim Upsert eines yearly income entry.",
        );

        if (mountedRef.current) {
          setError(message);
        }

        throw err;
      }
    },
    [hasPropertyId, propertyId],
  );

  const createYearlyCapex = useCallback(
    async (input: CreateYearlyCapexInput): Promise<YearlyCapexEntry> => {
      if (!hasPropertyId) {
        throw new Error("Keine propertyId vorhanden.");
      }

      setError(null);

      try {
        const created = await yearlyCapexService.create({
          propertyId,
          year: input.year,
          amount: normalizeNumber(input.amount, 0),
          category: input.category ?? null,
          note: input.note ?? null,
        });

        if (mountedRef.current) {
          setYearlyCapex((prev) => sortYearlyCapex([...prev, created]));
        }

        return created;
      } catch (err) {
        const message = normalizeErrorMessage(
          err,
          "Fehler beim Erstellen eines yearly capex entry.",
        );

        if (mountedRef.current) {
          setError(message);
        }

        throw err;
      }
    },
    [hasPropertyId, propertyId],
  );

  const updateYearlyCapex = useCallback(
    async (id: string, input: UpdateYearlyCapexInput): Promise<YearlyCapexEntry> => {
      setError(null);

      try {
        const updated = await yearlyCapexService.update(id, {
          year: input.year,
          amount: input.amount,
          category: input.category,
          note: input.note,
        });

        if (mountedRef.current) {
          setYearlyCapex((prev) =>
            sortYearlyCapex(prev.map((entry) => (entry.id === id ? updated : entry))),
          );
        }

        return updated;
      } catch (err) {
        const message = normalizeErrorMessage(
          err,
          "Fehler beim Aktualisieren eines yearly capex entry.",
        );

        if (mountedRef.current) {
          setError(message);
        }

        throw err;
      }
    },
    [],
  );

  const removeYearlyCapex = useCallback(
    async (id: string): Promise<void> => {
      setError(null);

      try {
        await yearlyCapexService.remove(id);

        if (mountedRef.current) {
          setYearlyCapex((prev) => prev.filter((entry) => entry.id !== id));
        }
      } catch (err) {
        const message = normalizeErrorMessage(
          err,
          "Fehler beim Löschen eines yearly capex entry.",
        );

        if (mountedRef.current) {
          setError(message);
        }

        throw err;
      }
    },
    [],
  );

  const upsertYearlyCapex = useCallback(
    async (input: CreateYearlyCapexInput): Promise<YearlyCapexEntry> => {
      if (!hasPropertyId) {
        throw new Error("Keine propertyId vorhanden.");
      }

      setError(null);

      try {
        const saved = await yearlyCapexService.upsertByPropertyIdAndYear({
          propertyId,
          year: input.year,
          amount: normalizeNumber(input.amount, 0),
          category: input.category ?? null,
          note: input.note ?? null,
        });

        if (mountedRef.current) {
          setYearlyCapex((prev) => {
            const withoutSameId = prev.filter((entry) => entry.id !== saved.id);
            const withoutSameYear = withoutSameId.filter((entry) => entry.year !== saved.year);
            return sortYearlyCapex([...withoutSameYear, saved]);
          });
        }

        return saved;
      } catch (err) {
        const message = normalizeErrorMessage(
          err,
          "Fehler beim Upsert eines yearly capex entry.",
        );

        if (mountedRef.current) {
          setError(message);
        }

        throw err;
      }
    },
    [hasPropertyId, propertyId],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    propertyIncome,
    yearlyIncome,
    yearlyCapex,
    isLoading,
    error,
    hasPropertyId,

    reload,

    upsertPropertyIncome,
    removePropertyIncome,

    createYearlyIncome,
    updateYearlyIncome,
    removeYearlyIncome,
    upsertYearlyIncome,

    createYearlyCapex,
    updateYearlyCapex,
    removeYearlyCapex,
    upsertYearlyCapex,

    setPropertyIncome,
    setYearlyIncome,
    setYearlyCapex,
    clearError,
  };
}

export default useIncome;
