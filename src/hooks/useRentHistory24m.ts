import { devLog } from "@/lib/devLog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { RentHistory24mRow } from "@/types/rentHistory";

type ScopeType = "user" | "property";

interface UseRentHistoryParams {
  scopeType: ScopeType;
  /**
   * For scopeType="property": MUST be the core properties.id (UUID)
   * (matches portfolio_property_rentals.property_id).
   */
  propertyId?: string;
}

type UseRentHistoryResult = {
  data: RentHistory24mRow[];
  loading: boolean;
  error: string | null;
  requiresAuth: boolean;
  refetch: () => void;
};

function normalizeError(err: unknown): string {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (typeof err === "object" && err && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

/** Parse YYYY-MM-DD safely as UTC midnight. */
function parseYmdUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

/** Returns the UTC first day of the month for the given date. */
function monthStartUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Add months in UTC, always returning first day of resulting month. */
function addMonthsUtc(monthStart: Date, n: number): Date {
  return new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + n, 1));
}

/** Returns last day of the month (UTC) as a Date at 00:00:00Z of that day. */
function monthEndUtc(monthStart: Date): Date {
  // Day 0 of next month = last day of current month
  return new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
}

function toMonthLabel(monthStart: Date): string {
  const y = monthStart.getUTCFullYear();
  const m = String(monthStart.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

function moneyToCents(value: unknown): number {
  // Supabase/Postgres numeric often comes as string (e.g. "1960.00")
  if (value === null || value === undefined) return 0;
  const s = String(value).trim().replace(",", ".");
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

type RentalRow = {
  start_date: string | null;
  end_date: string | null;
  rent_monthly: unknown;
};

function compute24mFromRentals(rentals: RentalRow[], now: Date): RentHistory24mRow[] {
  const thisMonth = monthStartUtc(now);
  const firstMonth = addMonthsUtc(thisMonth, -23); // inclusive range of 24 months

  const rows: RentHistory24mRow[] = [];

  for (let i = 0; i < 24; i++) {
    const mStart = addMonthsUtc(firstMonth, i);
    const mEnd = monthEndUtc(mStart);
    const month = toMonthLabel(mStart);

    // If multiple rentals overlap the month, choose the one with the latest start_date.
    let best: { start_date: string; rent_monthly: unknown } | null = null;

    for (const r of rentals) {
      if (!r.start_date) continue;

      const rStart = parseYmdUtc(String(r.start_date));
      const rEnd = r.end_date ? parseYmdUtc(String(r.end_date)) : new Date("2999-12-31T00:00:00Z");

      const overlaps = rStart <= mEnd && rEnd >= mStart;
      if (!overlaps) continue;

      if (!best) {
        best = { start_date: String(r.start_date), rent_monthly: r.rent_monthly };
      } else {
        // string compare on YYYY-MM-DD works lexicographically
        if (String(r.start_date) > best.start_date) {
          best = { start_date: String(r.start_date), rent_monthly: r.rent_monthly };
        }
      }
    }

    const rentCentsTotal = best ? moneyToCents(best.rent_monthly) : 0;

    rows.push({
      month,
      rent_cents_total: rentCentsTotal,
    } as RentHistory24mRow);
  }

  return rows;
}

export function useRentHistory24m({ scopeType, propertyId }: UseRentHistoryParams): UseRentHistoryResult {
  const DEBUG = import.meta.env.VITE_DEBUG_CHARTS === "1";

  const [data, setData] = useState<RentHistory24mRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requiresAuth, setRequiresAuth] = useState(false);

  // manual refetch trigger (also used by auth change)
  const [bump, setBump] = useState(0);
  const refetch = useCallback(() => setBump((x) => x + 1), []);

  // stable request sequencing guard
  const reqSeq = useRef(0);

  const key = useMemo(() => `${scopeType}:${propertyId ?? ""}`, [scopeType, propertyId]);

  // Subscribe to auth changes ONCE
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      setBump((x) => x + 1);
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    const propertyIdMissing = scopeType === "property" && !propertyId;

    const mySeq = ++reqSeq.current;
    const isStale = () => mySeq !== reqSeq.current;

    async function run() {
      setLoading(true);
      setError(null);
      setRequiresAuth(false);

      if (propertyIdMissing) {
        if (isStale()) return;
        setData([]);
        setLoading(false);
        return;
      }

      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const session = sessionData?.session ?? null;

        if (DEBUG) {
          devLog("[useRentHistory24m] session", {
            hasSession: !!session,
            userId: session?.user?.id ?? null,
            hasToken: !!session?.access_token,
            scopeType,
            propertyId: propertyId ?? null,
            key,
            bump,
          });
        }

        // No session => not an error (but likely blocked by RLS)
        if (!session) {
          if (isStale()) return;
          setData([]);
          setRequiresAuth(true);
          setLoading(false);
          return;
        }

        if (scopeType === "user") {
          const { data: rows, error: qErr } = await supabase
            .from("v_rent_history_chart_unified_my_24m")
            .select("*")
            .eq("scope_type", "user")
            .order("month", { ascending: true });

          if (qErr) throw qErr;
          if (isStale()) return;

          const safeRows = (rows ?? []) as RentHistory24mRow[];
          setData(safeRows);
          setLoading(false);

          if (DEBUG) {
            devLog("[useRentHistory24m] result(user)", {
              rows: safeRows.length,
              sample: safeRows[0],
            });
          }
          return;
        }

        // scopeType === "property"
        const { data: rentals, error: rentalsErr } = await supabase
          .from("portfolio_property_rentals")
          .select("start_date,end_date,rent_monthly")
          .eq("property_id", propertyId!);

        if (rentalsErr) throw rentalsErr;
        if (isStale()) return;

        const rentalRows = (rentals ?? []) as RentalRow[];

        if (DEBUG) {
          devLog("[useRentHistory24m] result(rentals:property)", {
            propertyId,
            rows: rentalRows.length,
            sample: rentalRows[0],
          });
        }

        const computed = compute24mFromRentals(rentalRows, new Date());

        setData(computed);
        setLoading(false);

        if (DEBUG) {
          devLog("[useRentHistory24m] result(property:computed)", {
            rows: computed.length,
            sample: computed[0],
            last: computed[computed.length - 1],
          });
        }
      } catch (e) {
        const msg = normalizeError(e);
        console.error("[useRentHistory24m] fetch error:", e);

        if (isStale()) return;
        setData([]);
        setError(msg);
        setLoading(false);
      }
    }

    run();
  }, [key, scopeType, propertyId, bump, DEBUG]);

  return { data, loading, error, requiresAuth, refetch };
}
