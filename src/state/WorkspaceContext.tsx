/* eslint-disable react-refresh/only-export-components -- Hook und Provider gehören bewusst zu demselben Kontextmodul. */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type WorkspaceContextValue = {
  objectId: string;
  objectLabel: string;
  year: number;
  setObject: (id: string, label?: string) => void;
  setYear: (year: number) => void;
  reset: () => void;
};

const STORAGE_KEY = "koenen:workspace-context:v1";
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
const currentYear = () => new Date().getFullYear();

function loadInitial() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<WorkspaceContextValue>;
    return {
      objectId: typeof saved.objectId === "string" ? saved.objectId : "",
      objectLabel: typeof saved.objectLabel === "string" ? saved.objectLabel : "",
      year: typeof saved.year === "number" && saved.year >= 2020 && saved.year <= 2200 ? saved.year : currentYear(),
    };
  } catch {
    return { objectId: "", objectLabel: "", year: currentYear() };
  }
}

export function WorkspaceContextProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState(loadInitial);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(selection)); }, [selection]);
  const value = useMemo<WorkspaceContextValue>(() => ({
    ...selection,
    setObject: (objectId, objectLabel = "") => setSelection(current => ({ ...current, objectId, objectLabel })),
    setYear: year => setSelection(current => ({ ...current, year })),
    reset: () => setSelection({ objectId: "", objectLabel: "", year: currentYear() }),
  }), [selection]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceContext() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspaceContext muss innerhalb des WorkspaceContextProvider verwendet werden.");
  return value;
}
