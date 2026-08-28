import { useCallback, useEffect, useRef, useState } from "react";
import type { AsyncResourceState } from "./types";

interface UseAsyncResourceOptions<T> {
  enabled?: boolean;
  initialData?: T | null;
  onError?: (error: unknown) => void;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Ein unbekannter Fehler ist aufgetreten.";
}

export function useAsyncResource<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList,
  options: UseAsyncResourceOptions<T> = {}
) {
  const { enabled = true, initialData = null, onError } = options;

  const [state, setState] = useState<AsyncResourceState<T>>({
    data: initialData,
    loading: enabled,
    error: null,
    status: enabled ? "loading" : "idle",
  });

  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!enabled) {
      setState((prev) => ({
        ...prev,
        loading: false,
        status: "idle",
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      loading: true,
      error: null,
      status: "loading",
    }));

    try {
      const result = await fetcher();

      if (!mountedRef.current) return;

      setState({
        data: result,
        loading: false,
        error: null,
        status: "success",
      });
    } catch (error) {
      if (!mountedRef.current) return;

      const message = getErrorMessage(error);

      setState((prev) => ({
        ...prev,
        loading: false,
        error: message,
        status: "error",
      }));

      onError?.(error);
    }
  }, [enabled, fetcher, onError]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initialLoad);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return {
    ...state,
    reload: load,
  };
}
