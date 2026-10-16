import type { FinanceEntry } from "../state/AppDataContext";

/** Preserve the first occurrence and the established fallback for legacy rows. */
export function uniqueFinanceEntries<T extends FinanceEntry>(entries: readonly T[]): T[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = entry.id != null
      ? `id:${entry.id}`
      : `${entry.object_id ?? ""}|${entry.objekt_code ?? ""}|${entry.booking_date ?? ""}|${entry.amount}|${entry.category ?? ""}|${entry.note ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
