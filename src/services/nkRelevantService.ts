import { supabase } from "../lib/supabase";
import { inferNkRelevant } from "../lib/nkClassification";

export type NkRelevantEntry = {
  id: number;
  objekt_code: string | null;
  booking_date: string;
  amount: number;
  category: string | null;
  note: string | null;
  entry_type: "income" | "expense";
  nk_relevant: boolean | null;
};

export async function listNkRelevantEntries(year: number, objektCode?: string | null): Promise<NkRelevantEntry[]> {
  const from = `${year}-01-01`;
  const to = `${year + 1}-01-01`;
  let query = supabase
    .from("finance_entry")
    .select("id,objekt_code,booking_date,amount,category,note,entry_type,nk_relevant")
    .eq("is_deleted", false)
    .eq("nk_relevant", true)
    .gte("booking_date", from)
    .lt("booking_date", to)
    .order("booking_date", { ascending: true });

  if (objektCode) query = query.eq("objekt_code", objektCode);

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: Number(row.id),
    objekt_code: row.objekt_code == null ? null : String(row.objekt_code),
    booking_date: String(row.booking_date ?? ""),
    amount: Number(row.amount ?? 0),
    category: row.category == null ? null : String(row.category),
    note: row.note == null ? null : String(row.note),
    entry_type: row.entry_type === "expense" ? "expense" : "income",
    nk_relevant: row.nk_relevant === true,
  }));
}

export async function classifyNkRelevantEntries(from = "2024-01-01", to = "2026-06-08"): Promise<{ updated: number; matched: number }> {
  const { data, error } = await supabase
    .from("finance_entry")
    .select("id,category,note,entry_type,nk_relevant")
    .eq("is_deleted", false)
    .gte("booking_date", from)
    .lt("booking_date", to)
    .in("entry_type", ["income", "expense"])
    .limit(10000);

  if (error) throw error;

  const rows: Array<Pick<NkRelevantEntry, "id" | "category" | "note" | "entry_type" | "nk_relevant">> = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: Number(row.id),
    category: row.category == null ? null : String(row.category),
    note: row.note == null ? null : String(row.note),
    entry_type: row.entry_type === "expense" ? "expense" : "income",
    nk_relevant: row.nk_relevant === true,
  }));
  const mismatches = rows
    .map((row) => ({ id: row.id, recommended: inferNkRelevant(row), current: row.nk_relevant === true }))
    .filter((row) => row.recommended !== row.current);
  const idsToSet = mismatches.filter((row) => row.recommended).map((row) => row.id);
  const idsToUnset = mismatches.filter((row) => !row.recommended).map((row) => row.id);
  if (!mismatches.length) return { updated: 0, matched: rows.filter((row) => inferNkRelevant(row)).length };

  if (idsToSet.length > 0) {
    const { error: updateError } = await supabase.from("finance_entry").update({ nk_relevant: true }).in("id", idsToSet);
    if (updateError) throw updateError;
  }

  if (idsToUnset.length > 0) {
    const { error: updateError } = await supabase.from("finance_entry").update({ nk_relevant: false }).in("id", idsToUnset);
    if (updateError) throw updateError;
  }

  return { updated: mismatches.length, matched: rows.filter((row) => inferNkRelevant(row)).length };
}
