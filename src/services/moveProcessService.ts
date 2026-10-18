import { supabase } from "../lib/supabase";
import { isReadonlyApprovalEmail } from "../auth/accessControl";
import { listTenantContracts } from "./tenantService";

export type MoveProcessType = "einzug" | "auszug" | "wechsel";
export type MoveProcessStatus = "offen" | "in_bearbeitung" | "erledigt" | "archiviert";

export type MoveChecklist = {
  schluessel?: boolean;
  zaehler?: boolean;
  kaution?: boolean;
  bescheinigung?: boolean;
  protokoll?: boolean;
  fotos?: boolean;
  dokumente?: boolean;
};

export type MoveMeterReadings = {
  strom?: string;
  wasser?: string;
  heizung?: string;
  gas?: string;
};

export type MoveProcess = {
  id: string;
  user_id: string;
  tenant_id: string | null;
  tenant_contract_id: string | null;
  property_id: string | null;
  object_code: string | null;
  unit_label: string | null;
  process_type: MoveProcessType;
  status: MoveProcessStatus;
  handover_date: string | null;
  meter_readings: MoveMeterReadings;
  deposit_status: string | null;
  checklist: MoveChecklist;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type MoveContractOption = {
  id: string;
  tenant_id: string;
  tenantName: string;
  property_id: string | null;
  object_code: string | null;
  unit_label: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
};

export type MoveProcessInput = {
  tenantId?: string | null;
  tenantContractId?: string | null;
  propertyId?: string | null;
  objectCode?: string | null;
  unitLabel?: string | null;
  processType: MoveProcessType;
  status: MoveProcessStatus;
  handoverDate?: string | null;
  meterReadings: MoveMeterReadings;
  depositStatus?: string | null;
  checklist: MoveChecklist;
  notes?: string | null;
};

type ContractRow = {
  id: string;
  tenant_id: string;
  property_id: string | null;
  object_code: string | null;
  unit_label: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  tenant_profiles?: {
    tenant_number: string | null;
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
  } | null;
};

function cleanText(value: string | null | undefined): string | null {
  const cleaned = String(value ?? "").trim();
  return cleaned ? cleaned : null;
}

async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const userId = data.user?.id;
  if (!userId) throw new Error("Nicht eingeloggt.");
  return userId;
}

async function isCurrentUserReadonly(): Promise<boolean> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return isReadonlyApprovalEmail(data.user?.email);
}

function tenantName(row: ContractRow): string {
  const tenant = row.tenant_profiles;
  const personal = [tenant?.first_name, tenant?.last_name].filter(Boolean).join(" ").trim();
  return tenant?.company_name || personal || tenant?.tenant_number || "Unbenannter Mieter";
}

export async function listMoveContractOptions(): Promise<MoveContractOption[]> {
  const userId = await getCurrentUserId();
  const readonly = await isCurrentUserReadonly();
  const data = await listTenantContracts({
    userId: readonly ? undefined : userId,
    orderBy: "updated_at",
  });

  return (data as unknown as ContractRow[]).map((row) => ({
    id: row.id,
    tenant_id: row.tenant_id,
    tenantName: tenantName(row),
    property_id: row.property_id,
    object_code: row.object_code,
    unit_label: row.unit_label,
    start_date: row.start_date,
    end_date: row.end_date,
    status: row.status,
  }));
}

export async function listMoveProcesses(): Promise<MoveProcess[]> {
  const userId = await getCurrentUserId();
  let query = supabase
    .from("move_processes")
    .select("*")
    .order("handover_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (!(await isCurrentUserReadonly())) query = query.eq("user_id", userId);
  const { data, error } = await query;

  if (error) throw error;
  return (data ?? []) as MoveProcess[];
}

export async function createMoveProcess(input: MoveProcessInput): Promise<MoveProcess> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("move_processes")
    .insert({
      user_id: userId,
      tenant_id: cleanText(input.tenantId),
      tenant_contract_id: cleanText(input.tenantContractId),
      property_id: cleanText(input.propertyId),
      object_code: cleanText(input.objectCode),
      unit_label: cleanText(input.unitLabel),
      process_type: input.processType,
      status: input.status,
      handover_date: cleanText(input.handoverDate),
      meter_readings: input.meterReadings,
      deposit_status: cleanText(input.depositStatus),
      checklist: input.checklist,
      notes: cleanText(input.notes),
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as MoveProcess;
}

export async function saveMoveProcess(input: MoveProcessInput & { id?: string | null }): Promise<MoveProcess> {
  if (!input.id) return createMoveProcess(input);

  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("move_processes")
    .update({
      tenant_id: cleanText(input.tenantId),
      tenant_contract_id: cleanText(input.tenantContractId),
      property_id: cleanText(input.propertyId),
      object_code: cleanText(input.objectCode),
      unit_label: cleanText(input.unitLabel),
      process_type: input.processType,
      status: input.status === "erledigt" ? "archiviert" : input.status,
      handover_date: cleanText(input.handoverDate),
      meter_readings: input.meterReadings,
      deposit_status: cleanText(input.depositStatus),
      checklist: input.checklist,
      notes: cleanText(input.notes),
    })
    .eq("id", input.id)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return data as MoveProcess;
}

export async function updateMoveProcessStatus(id: string, status: MoveProcessStatus): Promise<MoveProcess> {
  const userId = await getCurrentUserId();
  const nextStatus = status === "erledigt" ? "archiviert" : status;
  const { data, error } = await supabase
    .from("move_processes")
    .update({ status: nextStatus })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return data as MoveProcess;
}
