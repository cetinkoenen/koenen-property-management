// src/features/entries/useMonthlyEntries.ts
import { listFinanceEntries } from "../../services/financeEntryRepository";

export type EntryType = "income" | "expense";

export interface FinanceEntry {
  id: number;
  object_id: string;          // ✅ neu
  objekt_code?: string;       // optional (alt/backup)
  booking_date: string;
  entry_type: EntryType;
  amount: number;
  category: string;
}

export interface CategorySummary {
  category: string;
  income: number;
  expense: number;
  net: number;
}

function toISODate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function useMonthlyEntries(objectId: string, year: number, month: number) {
  const fromDate = toISODate(year, month, 1);
  const toDate = month === 12 ? toISODate(year + 1, 1, 1) : toISODate(year, month + 1, 1);

  const load = async () => {
    if (!objectId) {
      return { entries: [], income: 0, expense: 0, saldo: 0, byCategory: [] as CategorySummary[] };
    }

    const data = await listFinanceEntries({
      objectId,
      fromInclusive: fromDate,
      toExclusive: toDate,
      entryTypes: ["income", "expense"],
      ascending: true,
    });
    const entries: FinanceEntry[] = data.map((row) => ({
      id: Number(row.id),
      object_id: String(row.object_id ?? objectId),
      objekt_code: row.objekt_code ?? undefined,
      booking_date: String(row.booking_date ?? ""),
      entry_type: row.entry_type === "income" ? "income" : "expense",
      amount: Number(row.amount) || 0,
      category: row.category ?? "",
    }));

    let income = 0;
    let expense = 0;

    const map = new Map<string, { income: number; expense: number }>();

    for (const e of entries) {
      const amt = Number(e.amount) || 0;

      if (e.entry_type === "income") income += amt;
      if (e.entry_type === "expense") expense += amt;

      const cat = (e.category ?? "").trim() || "(ohne Kategorie)";
      if (!map.has(cat)) map.set(cat, { income: 0, expense: 0 });

      const curr = map.get(cat)!;
      if (e.entry_type === "income") curr.income += amt;
      if (e.entry_type === "expense") curr.expense += amt;
    }

    const byCategory: CategorySummary[] = Array.from(map.entries()).map(([category, v]) => ({
      category,
      income: v.income,
      expense: v.expense,
      net: v.income - v.expense,
    }));

    byCategory.sort((a, b) => (b.expense !== a.expense ? b.expense - a.expense : b.income - a.income));

    return {
      entries,
      income,
      expense,
      saldo: income - expense,
      byCategory,
    };
  };

  return { load };
}
