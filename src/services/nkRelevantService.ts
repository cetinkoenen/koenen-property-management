import { inferNkRelevant } from "../lib/nkClassification";
import { listFinanceEntries, updateFinanceEntries } from "./financeEntryRepository";

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
  const rows = await listFinanceEntries({
    fromInclusive: from,
    toExclusive: to,
    objectCode: objektCode ?? undefined,
    nkRelevant: true,
    ascending: true,
  });

  return rows.map((row) => ({
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
  const financeEntries = await listFinanceEntries({
    fromInclusive: from,
    toExclusive: to,
    entryTypes: ["income", "expense"],
  });

  const rows: Array<Pick<NkRelevantEntry, "id" | "category" | "note" | "entry_type" | "nk_relevant">> = financeEntries
    .filter((row) => row.id != null)
    .map((row) => ({
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
    await updateFinanceEntries(idsToSet, { nk_relevant: true });
  }

  if (idsToUnset.length > 0) {
    await updateFinanceEntries(idsToUnset, { nk_relevant: false });
  }

  return { updated: mismatches.length, matched: rows.filter((row) => inferNkRelevant(row)).length };
}
