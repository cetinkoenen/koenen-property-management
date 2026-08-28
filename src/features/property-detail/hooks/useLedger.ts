import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ledgerService from "@/services/ledgerService";
import type { YearlyLedgerEntry } from "@/types/finance";

type UseLedgerState = {
  ledgerEntries: YearlyLedgerEntry[];
  isLoading: boolean;
  error: string | null;
};

type CreateLedgerInput = {
  year: number;
  interest: number;
  principal: number;
  balance: number;
  source?: string | null;
};

type UpdateLedgerInput = {
  year?: number;
  interest?: number;
  principal?: number;
  balance?: number;
  source?: string | null;
};

function normalizeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return fallback;
}

function safePropertyId(value: unknown): string {
  return String(value ?? "").trim();
}

function sortLedgerEntries(entries: YearlyLedgerEntry[]): YearlyLedgerEntry[] {
  return [...entries].sort((a, b) => Number(a.year) - Number(b.year));
}

export type UseLedgerResult = UseLedgerState & {
  hasPropertyId: boolean;
  reload: () => Promise<void>;

  createLedgerEntry: (input: CreateLedgerInput) => Promise<YearlyLedgerEntry>;
  updateLedgerEntry: (id: string, input: UpdateLedgerInput) => Promise<YearlyLedgerEntry>;
  removeLedgerEntry: (id: string) => Promise<void>;

  setLedgerEntries: React.Dispatch<React.SetStateAction<YearlyLedgerEntry[]>>;
  clearError: () => void;
};

export function useLedger(propertyIdInput?: string | null): UseLedgerResult {
  const propertyId = useMemo(() => safePropertyId(propertyIdInput), [propertyIdInput]);
  const hasPropertyId = propertyId.length > 0;

  const [ledgerEntries, setLedgerEntries] = useState<YearlyLedgerEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
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
    const currentRequestId = ++requestIdRef.current;

    if (!hasPropertyId) {
      if (!mountedRef.current || currentRequestId !== requestIdRef.current) return;

      setLedgerEntries([]);
      setError(null);
      setIsLoading(false);

      if (import.meta.env.DEV) console.debug("useLedger.load.skip", {
        reason: "missing-propertyId",
      });

      return;
    }

    setIsLoading(true);
    setError(null);

    if (import.meta.env.DEV) console.debug("useLedger.load.start", {
      propertyId,
      requestId: currentRequestId,
    });

    try {
      const result = await ledgerService.getByPropertyId(propertyId);

      if (!mountedRef.current || currentRequestId !== requestIdRef.current) {
        if (import.meta.env.DEV) console.debug("useLedger.load.stale", {
          propertyId,
          requestId: currentRequestId,
        });
        return;
      }

      setLedgerEntries(sortLedgerEntries(result));
      setError(null);

      if (import.meta.env.DEV) console.debug("useLedger.load.success", {
        propertyId,
        requestId: currentRequestId,
        ledgerCount: result.length,
        years: result.map((entry) => entry.year),
      });
    } catch (err) {
      if (!mountedRef.current || currentRequestId !== requestIdRef.current) {
        return;
      }

      const message = normalizeErrorMessage(err, "Fehler beim Laden der Ledger-Daten.");

      setLedgerEntries([]);
      setError(message);

      console.error("useLedger.load.error", {
        propertyId,
        requestId: currentRequestId,
        error: err,
      });
    } finally {
      if (mountedRef.current && currentRequestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [hasPropertyId, propertyId]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);

  const reload = useCallback(async () => {
    await load();
  }, [load]);

  const createLedgerEntry = useCallback(
    async (input: CreateLedgerInput): Promise<YearlyLedgerEntry> => {
      if (!hasPropertyId) {
        throw new Error("Keine propertyId vorhanden.");
      }

      setError(null);

      try {
        const created = await ledgerService.create({
          propertyId,
          year: input.year,
          interest: input.interest,
          principal: input.principal,
          balance: input.balance,
          source: input.source ?? null,
        });

        if (mountedRef.current) {
          setLedgerEntries((prev) => sortLedgerEntries([...prev, created]));
        }

        if (import.meta.env.DEV) console.debug("useLedger.createLedgerEntry.success", {
          propertyId,
          id: created.id,
          year: created.year,
        });

        return created;
      } catch (err) {
        const message = normalizeErrorMessage(err, "Fehler beim Erstellen eines Ledger-Eintrags.");
        if (mountedRef.current) {
          setError(message);
        }

        console.error("useLedger.createLedgerEntry.error", {
          propertyId,
          input,
          error: err,
        });

        throw err;
      }
    },
    [hasPropertyId, propertyId]
  );

  const updateLedgerEntry = useCallback(
    async (id: string, input: UpdateLedgerInput): Promise<YearlyLedgerEntry> => {
      setError(null);

      try {
        const updated = await ledgerService.update(id, {
          year: input.year,
          interest: input.interest,
          principal: input.principal,
          balance: input.balance,
          source: input.source,
        });

        if (mountedRef.current) {
          setLedgerEntries((prev) =>
            sortLedgerEntries(prev.map((entry) => (entry.id === id ? updated : entry)))
          );
        }

        if (import.meta.env.DEV) console.debug("useLedger.updateLedgerEntry.success", {
          propertyId,
          id,
          year: updated.year,
        });

        return updated;
      } catch (err) {
        const message = normalizeErrorMessage(err, "Fehler beim Aktualisieren eines Ledger-Eintrags.");
        if (mountedRef.current) {
          setError(message);
        }

        console.error("useLedger.updateLedgerEntry.error", {
          propertyId,
          id,
          input,
          error: err,
        });

        throw err;
      }
    },
    [propertyId]
  );

  const removeLedgerEntry = useCallback(
    async (id: string): Promise<void> => {
      setError(null);

      try {
        await ledgerService.remove(id);

        if (mountedRef.current) {
          setLedgerEntries((prev) => prev.filter((entry) => entry.id !== id));
        }

        if (import.meta.env.DEV) console.debug("useLedger.removeLedgerEntry.success", {
          propertyId,
          id,
        });
      } catch (err) {
        const message = normalizeErrorMessage(err, "Fehler beim Löschen eines Ledger-Eintrags.");
        if (mountedRef.current) {
          setError(message);
        }

        console.error("useLedger.removeLedgerEntry.error", {
          propertyId,
          id,
          error: err,
        });

        throw err;
      }
    },
    [propertyId]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    ledgerEntries,
    isLoading,
    error,
    hasPropertyId,

    reload,

    createLedgerEntry,
    updateLedgerEntry,
    removeLedgerEntry,

    setLedgerEntries,
    clearError,
  };
}

export default useLedger;
