import { supabase } from "../lib/supabase";

export const FINANCE_ENTRY_SELECT = [
  "id",
  "object_id",
  "objekt_code",
  "entry_type",
  "booking_date",
  "amount",
  "category",
  "note",
  "tax_relevant",
  "nk_relevant",
  "loan_interest_amount",
  "loan_principal_amount",
  "loan_rate_plan_id",
  "loan_split_source",
  "is_deleted",
].join(",");

export type FinanceEntryRepositoryRow = {
  id: string | number | null;
  object_id: string | null;
  objekt_code: string | null;
  entry_type: string | null;
  booking_date: string | null;
  amount: unknown;
  category: string | null;
  note: string | null;
  tax_relevant: boolean | null;
  nk_relevant: boolean | null;
  loan_interest_amount: unknown;
  loan_principal_amount: unknown;
  loan_rate_plan_id: string | null;
  loan_split_source: string | null;
  is_deleted: boolean | null;
};

export type FinanceEntryMutation = {
  object_id?: string | null;
  objekt_code?: string | null;
  entry_type?: "income" | "expense";
  booking_date?: string;
  amount?: number;
  category?: string | null;
  note?: string | null;
  tax_relevant?: boolean;
  nk_relevant?: boolean;
  loan_interest_amount?: number | null;
  loan_principal_amount?: number | null;
  loan_rate_plan_id?: string | null;
  loan_split_source?: string | null;
};

export type ListFinanceEntriesOptions = {
  fromInclusive?: string;
  toExclusive?: string;
  toInclusive?: string;
  objectId?: string;
  objectCode?: string;
  entryTypes?: Array<"income" | "expense">;
  nkRelevant?: boolean;
  ascending?: boolean;
  pageSize?: number;
};

export type UpdateFinanceEntryOptions = {
  userId?: string;
};

/**
 * Zentrale Lesefunktion für finance_entry.
 *
 * Supabase/PostgREST begrenzt Antworten serverseitig. Deshalb werden alle
 * Treffer deterministisch nach Buchungsdatum und ID seitenweise geladen.
 * Fachseiten dürfen dadurch keine still abgeschnittenen Jahressummen bilden.
 */
export async function listFinanceEntries(
  options: ListFinanceEntriesOptions = {},
): Promise<FinanceEntryRepositoryRow[]> {
  const pageSize = Math.max(1, Math.min(1000, options.pageSize ?? 500));
  const ascending = options.ascending ?? false;
  const rows: FinanceEntryRepositoryRow[] = [];

  for (let offset = 0; ; offset += pageSize) {
    let query = supabase
      .from("finance_entry")
      .select(FINANCE_ENTRY_SELECT)
      .eq("is_deleted", false);

    if (options.fromInclusive) query = query.gte("booking_date", options.fromInclusive);
    if (options.toExclusive) query = query.lt("booking_date", options.toExclusive);
    else if (options.toInclusive) query = query.lte("booking_date", options.toInclusive);
    if (options.objectId) query = query.eq("object_id", options.objectId);
    if (options.objectCode && options.objectCode !== "ALL") {
      query = query.eq("objekt_code", options.objectCode);
    }
    if (options.entryTypes?.length) query = query.in("entry_type", options.entryTypes);
    if (typeof options.nkRelevant === "boolean") query = query.eq("nk_relevant", options.nkRelevant);

    const { data, error } = await query
      .order("booking_date", { ascending })
      .order("id", { ascending })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    const page = (data ?? []) as unknown as FinanceEntryRepositoryRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

export async function listFinanceEntryCategories(): Promise<string[]> {
  const pageSize = 1000;
  const categories = new Set<string>();

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("finance_entry")
      .select("category")
      .eq("is_deleted", false)
      .order("category", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as Array<{ category: string | null }>;
    for (const row of page) {
      const category = row.category?.trim();
      if (category) categories.add(category);
    }
    if (page.length < pageSize) break;
  }

  return [...categories];
}

export async function insertFinanceEntry(payload: FinanceEntryMutation): Promise<void> {
  const { error } = await supabase.from("finance_entry").insert(payload);
  if (error) throw error;
}

export async function updateFinanceEntry(
  id: string | number,
  payload: FinanceEntryMutation,
  options: UpdateFinanceEntryOptions = {},
): Promise<void> {
  let query = supabase
    .from("finance_entry")
    .update(payload)
    .eq("id", id)
    .eq("is_deleted", false);
  if (options.userId) query = query.eq("user_id", options.userId);
  const { error } = await query;
  if (error) throw error;
}

export async function updateFinanceEntries(
  ids: Array<string | number>,
  payload: FinanceEntryMutation,
): Promise<void> {
  const chunkSize = 500;
  for (let offset = 0; offset < ids.length; offset += chunkSize) {
    const chunk = ids.slice(offset, offset + chunkSize);
    const { error } = await supabase
      .from("finance_entry")
      .update(payload)
      .in("id", chunk)
      .eq("is_deleted", false);
    if (error) throw error;
  }
}

export async function softDeleteFinanceEntries(ids: Array<string | number>): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("finance_entry")
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw error;
}
