export const WORKFLOW_STATUSES = ["Offen", "In Arbeit", "In Prüfung", "Freigegeben", "Korrigiert"] as const;
export type WorkflowStatus = typeof WORKFLOW_STATUSES[number];

export const WORKFLOW_STATUS_INFO: Record<WorkflowStatus, { description: string; nextAction: string; className: string; colors: { background: string; color: string; border: string } }> = {
  Offen: { description: "Noch nicht begonnen oder unvollständig.", nextAction: "Bearbeitung starten.", className: "border-slate-200 bg-slate-100 text-slate-700", colors: { background: "#f1f5f9", color: "#475569", border: "#cbd5e1" } },
  "In Arbeit": { description: "Daten werden erfasst oder bearbeitet.", nextAction: "Daten vervollständigen und zur Prüfung geben.", className: "border-sky-200 bg-sky-50 text-sky-700", colors: { background: "#dbeafe", color: "#1d4ed8", border: "#93c5fd" } },
  "In Prüfung": { description: "Inhaltliche oder rechnerische Prüfung steht an.", nextAction: "Prüfen und freigeben oder korrigieren.", className: "border-amber-200 bg-amber-50 text-amber-700", colors: { background: "#fef3c7", color: "#92400e", border: "#fcd34d" } },
  Freigegeben: { description: "Geprüft und zur Verwendung freigegeben.", nextAction: "Bei Änderung eine Korrektur dokumentieren.", className: "border-emerald-200 bg-emerald-50 text-emerald-700", colors: { background: "#dcfce7", color: "#166534", border: "#86efac" } },
  Korrigiert: { description: "Nach Freigabe fachlich berichtigt.", nextAction: "Korrektur prüfen und bei Bedarf erneut freigeben.", className: "border-violet-200 bg-violet-50 text-violet-700", colors: { background: "#f3e8ff", color: "#7e22ce", border: "#d8b4fe" } },
};

export function normalizeWorkflowStatus(value: unknown, locked = false): WorkflowStatus {
  const normalized = String(value ?? "").trim().toLocaleLowerCase("de-DE");
  if (normalized.includes("korrigiert")) return "Korrigiert";
  if (locked || normalized.includes("freigegeben")) return "Freigegeben";
  if (normalized.includes("prüfung") || normalized.includes("prufung")) return "In Prüfung";
  if (normalized.includes("arbeit")) return "In Arbeit";
  return "Offen";
}
