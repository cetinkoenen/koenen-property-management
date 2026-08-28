import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as propertyServiceModule from "@/services/propertyService";

type ServiceResponse<T> = T | { data?: T | null } | null;

export interface UsePropertyDetailResult<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  hasPropertyId: boolean;
  reload: () => Promise<void>;
  refetch: () => Promise<void>;
  clearError: () => void;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

function normalizeError(error: unknown, fallback: string): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string" && error.trim()) return new Error(error);
  return new Error(fallback);
}

function normalizePropertyId(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function normalizeServiceResponse<T>(response: ServiceResponse<T>): T | null {
  if (response === null || response === undefined) return null;

  if (typeof response === "object" && "data" in response) {
    return (response.data ?? null) as T | null;
  }

  return response as T;
}

function resolveGetPropertyById<T>() {
  const mod = propertyServiceModule as Record<string, unknown> & {
    default?: Record<string, unknown>;
  };

  if (typeof mod.getPropertyById === "function") {
    return mod.getPropertyById as (propertyId: string) => Promise<ServiceResponse<T>>;
  }

  if (mod.default && typeof mod.default.getPropertyById === "function") {
    return mod.default.getPropertyById as (
      propertyId: string
    ) => Promise<ServiceResponse<T>>;
  }

  throw new Error(
    "propertyService.getPropertyById wurde nicht gefunden. Prüfe den Export in src/services/propertyService.ts."
  );
}

export function usePropertyDetail<T = unknown>(
  propertyIdInput: string | null | undefined
): UsePropertyDetailResult<T> {
  const propertyId = useMemo(() => normalizePropertyId(propertyIdInput), [propertyIdInput]);
  const hasPropertyId = propertyId.length > 0;

  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

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

      setData(null);
      setError(null);
      setIsLoading(false);

      if (import.meta.env.DEV) console.debug("usePropertyDetail.load.skip", {
        reason: "missing-propertyId",
      });

      return;
    }

    setIsLoading(true);
    setError(null);

    if (import.meta.env.DEV) console.debug("usePropertyDetail.load.start", {
      propertyId,
      requestId: currentRequestId,
    });

    try {
      const getPropertyById = resolveGetPropertyById<T>();
      const response = await getPropertyById(propertyId);

      if (!mountedRef.current || currentRequestId !== requestIdRef.current) {
        if (import.meta.env.DEV) console.debug("usePropertyDetail.load.stale", {
          propertyId,
          requestId: currentRequestId,
        });
        return;
      }

      const normalized = normalizeServiceResponse<T>(response);

      setData(normalized);
      setError(null);

      if (import.meta.env.DEV) console.debug("usePropertyDetail.load.success", {
        propertyId,
        requestId: currentRequestId,
        found: Boolean(normalized),
      });
    } catch (err) {
      if (!mountedRef.current || currentRequestId !== requestIdRef.current) {
        return;
      }

      const normalizedError = normalizeError(
        err,
        "Objektdaten konnten nicht geladen werden."
      );

      setData(null);
      setError(normalizedError);

      console.error("usePropertyDetail.load.error", {
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

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    data,
    isLoading,
    error,
    hasPropertyId,
    reload,
    refetch: reload,
    clearError,
    setData,
  };
}

export default usePropertyDetail;
