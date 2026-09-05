export type RentYearMonth = { year: number; month: number };

function parseIsoDate(value: string | null | undefined): { year: number; month: number; day: number } | null {
  if (!value || value.length < 10) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function shiftYearMonth(year: number, month: number, offset: number): RentYearMonth {
  const zeroBasedMonth = month - 1 + offset;
  const shiftedYear = year + Math.floor(zeroBasedMonth / 12);
  const shiftedMonth = ((zeroBasedMonth % 12) + 12) % 12;
  return { year: shiftedYear, month: shiftedMonth + 1 };
}

/**
 * Verschiebt ein ISO-Datum kalendersicher. Ein Monatsende wird auf den letzten
 * existierenden Tag des Zielmonats begrenzt (31.08. -> 30.09., nicht 01.10.).
 */
export function shiftIsoDateByMonthsClamped(value: string, offset: number): string {
  const parsed = parseIsoDate(value);
  if (!parsed) return value;
  const target = shiftYearMonth(parsed.year, parsed.month, offset);
  const lastTargetDay = new Date(target.year, target.month, 0).getDate();
  const targetDay = Math.min(parsed.day, lastTargetDay);
  return `${target.year}-${String(target.month).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

/** Zentrale Hausverwaltungsregel: Mietzahlung ab dem 25. zählt zum Folgemonat. */
export function effectiveRentYearMonth(value: string | null | undefined, cutoffDay = 25): RentYearMonth | null {
  const parsed = parseIsoDate(value);
  if (!parsed) return null;
  if (parsed.day < cutoffDay) return { year: parsed.year, month: parsed.month };
  return shiftYearMonth(parsed.year, parsed.month, 1);
}

export function effectiveRentDate(value: string | null | undefined, cutoffDay = 25): string | null {
  const parsed = parseIsoDate(value);
  if (!parsed || !value) return value ?? null;
  return parsed.day >= cutoffDay ? shiftIsoDateByMonthsClamped(value, 1) : value;
}
