import { supabase } from "../lib/supabase";

export const RENT_ADJUSTMENT_SELECT = [
  "id",
  "property_id",
  "object_label",
  "tenant_name",
  "effective_date",
  "effective_end_date",
  "reason",
  "status",
  "old_cold_rent",
  "old_operating_costs",
  "old_total_rent",
  "new_cold_rent",
  "new_operating_costs",
  "new_total_rent",
  "note",
  "document_name",
  "created_at",
  "is_deleted",
].join(",");

export type RentAdjustmentRepositoryRow = {
  id: string;
  property_id: string | null;
  object_label: string | null;
  tenant_name: string | null;
  effective_date: string;
  effective_end_date: string | null;
  reason: string | null;
  status: string | null;
  old_cold_rent: unknown;
  old_operating_costs: unknown;
  old_total_rent: unknown;
  new_cold_rent: unknown;
  new_operating_costs: unknown;
  new_total_rent: unknown;
  note: string | null;
  document_name: string | null;
  created_at: string | null;
  is_deleted: boolean | null;
};

export type RentAdjustmentMutation = {
  effective_date: string;
  effective_end_date?: string | null;
  reason?: string | null;
  status?: string | null;
  old_cold_rent?: number | null;
  old_operating_costs?: number | null;
  old_total_rent?: number | null;
  new_cold_rent?: number | null;
  new_operating_costs?: number | null;
  new_total_rent?: number | null;
  note?: string | null;
  document_name?: string | null;
};

export type NewRentAdjustment = RentAdjustmentMutation & {
  user_id: string;
  property_id: string;
  object_label: string;
  tenant_name?: string | null;
};

export type ListRentAdjustmentsOptions = {
  propertyId?: string;
  ascending?: boolean;
  pageSize?: number;
};

/** Verbindliche, vollständig paginierte Lesefunktion für Mietanpassungen. */
export async function listRentAdjustments(
  options: ListRentAdjustmentsOptions = {},
): Promise<RentAdjustmentRepositoryRow[]> {
  const pageSize = Math.max(1, Math.min(1000, options.pageSize ?? 500));
  const ascending = options.ascending ?? false;
  const rows: RentAdjustmentRepositoryRow[] = [];

  for (let offset = 0; ; offset += pageSize) {
    let query = supabase
      .from("rent_adjustments")
      .select(RENT_ADJUSTMENT_SELECT)
      .eq("is_deleted", false);

    if (options.propertyId) query = query.eq("property_id", options.propertyId);

    const { data, error } = await query
      .order("effective_date", { ascending, nullsFirst: false })
      .order("id", { ascending })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    const page = (data ?? []) as unknown as RentAdjustmentRepositoryRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

export async function insertRentAdjustment(payload: NewRentAdjustment): Promise<void> {
  const { error } = await supabase.from("rent_adjustments").insert(payload);
  if (error) throw error;
}

export async function updateRentAdjustment(
  id: string,
  payload: RentAdjustmentMutation,
): Promise<void> {
  const { error } = await supabase
    .from("rent_adjustments")
    .update(payload)
    .eq("id", id)
    .eq("is_deleted", false);
  if (error) throw error;
}
