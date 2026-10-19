import { supabase } from "../lib/supabase";

const TABLE_NAME = "apartment_billing_workspaces";
const PAGE_SIZE = 500;

export type BillingWorkspaceRow = {
  object_id: string;
  year: string;
  data: unknown;
};

type BillingWorkspaceFilters = {
  objectId?: string;
  year?: string | number;
};

export async function listBillingWorkspaces(filters: BillingWorkspaceFilters = {}): Promise<BillingWorkspaceRow[]> {
  const rows: BillingWorkspaceRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabase
      .from(TABLE_NAME)
      .select("object_id,year,data")
      .order("object_id", { ascending: true })
      .order("year", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (filters.objectId) query = query.eq("object_id", filters.objectId);
    if (filters.year !== undefined) query = query.eq("year", String(filters.year));
    const { data, error } = await query;
    if (error) throw error;
    const page = (data ?? []) as BillingWorkspaceRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function getBillingWorkspace(objectId: string, year: string | number): Promise<BillingWorkspaceRow | null> {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("object_id,year,data")
    .eq("object_id", objectId)
    .eq("year", String(year))
    .maybeSingle();
  if (error) throw error;
  return (data as BillingWorkspaceRow | null) ?? null;
}

export async function upsertBillingWorkspace(objectId: string, year: string | number, data: unknown): Promise<void> {
  const { error } = await supabase.from(TABLE_NAME).upsert({
    object_id: objectId,
    year: String(year),
    data,
  }, { onConflict: "object_id,year" });
  if (error) throw error;
}
