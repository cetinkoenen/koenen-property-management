import { useCallback, useState } from "react";

export interface UseSimulationResult {
  simulation: unknown;
  isLoading: boolean;
  error: Error | null;
  runSimulation: (input?: unknown) => Promise<unknown>;
  resetSimulation: () => void;
}

export function useSimulation(): UseSimulationResult {
  const [simulation, setSimulation] = useState<unknown>(null);
  const [isLoading] = useState(false);
  const [error] = useState<Error | null>(null);

  const runSimulation = useCallback(async (input?: unknown) => {
    const result = input ?? null;
    setSimulation(result);
    return result;
  }, []);

  const resetSimulation = useCallback(() => {
    setSimulation(null);
  }, []);

  return {
    simulation,
    isLoading,
    error,
    runSimulation,
    resetSimulation,
  };
}
