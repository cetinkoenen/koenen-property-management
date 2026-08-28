import { supabase } from "@/lib/supabase";

const AUDIT_TABLE = "app_audit_log";

export type AuditAction =
  | "loan_projection_generated"
  | "loan_row_saved"
  | "data_repair_requested"
  | "backup_created"
  | "portfolio_sync_checked"
  | "document_uploaded"
  | "document_deleted"
  | "task_created"
  | "task_completed"
  | "phase5a_backend_ready"
  | "phase5b_document_uploaded"
  | "phase5b_document_deleted"
  | "phase5b_task_saved"
  | "phase5b_task_completed";

export type AuditLogEntry = {
  id: string;
  created_at: string;
  action: AuditAction | string;
  property_id?: string | null;
  portfolio_property_id?: string | null;
  objekt_code?: string | null;
  label?: string | null;
  old_value?: unknown;
  new_value?: unknown;
  meta?: Record<string, unknown> | null;
};

export async function recordAuditLog(entry: Omit<AuditLogEntry, "id" | "created_at">): Promise<void> {
  const { error } = await supabase.from(AUDIT_TABLE).insert({
    action: entry.action,
    property_id: entry.property_id ?? null,
    portfolio_property_id: entry.portfolio_property_id ?? null,
    objekt_code: entry.objekt_code ?? null,
    label: entry.label ?? null,
    old_value: entry.old_value ?? null,
    new_value: entry.new_value ?? null,
    meta: entry.meta ?? null,
  });
  if (error) console.warn("Audit-Eintrag konnte nicht zentral gespeichert werden:", error.message);
}


export async function listAuditLogs(params: { propertyId?: string | null; portfolioPropertyId?: string | null; objektCode?: string | null; limit?: number } = {}): Promise<AuditLogEntry[]> {
  let query = supabase
    .from(AUDIT_TABLE)
    .select("id, created_at, action, property_id, portfolio_property_id, objekt_code, label, old_value, new_value, meta")
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 50);

  if (params.propertyId) query = query.eq("property_id", params.propertyId);
  if (params.portfolioPropertyId) query = query.eq("portfolio_property_id", params.portfolioPropertyId);
  if (params.objektCode) query = query.eq("objekt_code", params.objektCode);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AuditLogEntry[];
}
