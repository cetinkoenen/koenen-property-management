// app/property-dashboard/page.tsx
import PropertyLoanDashboard, { type Row } from "../components/PropertyLoanDashboard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type DashboardSourceRow = {
  property_id?: unknown;
  property_name?: unknown;
  first_year?: unknown;
  last_year?: unknown;
  last_balance_year?: unknown;
  last_balance?: unknown;
  interest_total?: unknown;
  principal_total?: unknown;
};

function eur(value: unknown) {
  if (value === null || value === undefined) return "—";
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(numberValue);
}

function yearOrDash(v: unknown) {
  if (v === null || v === undefined) return "—";
  const s = String(v).trim();
  if (!s || s.toLowerCase() === "null" || s === "—") return "—";
  return s;
}

export default async function Page() {
  let rows: Row[] = [];
  let error: string | null = null;

  try {
    const sb = supabaseAdmin();

    // ✅ HIER: richtige View verwenden (die bei dir Daten liefert)
    const { data, error: qerr } = await sb
      .from("vw_property_loan_dashboard_display")
      .select(`
        property_id,
        property_name,
        first_year,
        last_year,
        last_balance_year,
        last_balance,
        interest_total,
        principal_total
      `);

    if (qerr) throw qerr;

    const safe = (Array.isArray(data) ? data : []) as DashboardSourceRow[];

    rows = safe.map((r) => {
      const hasLoanData =
        r.last_balance !== null ||
        r.interest_total !== null ||
        r.principal_total !== null ||
        (r.first_year !== null && r.first_year !== "—");

      // Simple Status (kannst du später nach Wunsch verfeinern):
      const repayment_status: Row["repayment_status"] = hasLoanData ? "green" : "grey";
      const repayment_label: Row["repayment_label"] = hasLoanData ? "healthy" : "no_data";
      const status_rank = hasLoanData ? 3 : 9;

      return {
        property_id: String(r.property_id ?? ""),
        property_name: String(r.property_name ?? "—"),

        repayment_status,
        repayment_label,
        status_rank,

        // Diese View liefert (noch) kein repaid_percent → erstmal "—"
        repaid_percent: null,
        repaid_percent_display: "—",

        // Zahlen → EUR-Format
        last_balance_eur: eur(r.last_balance),
        interest_total_eur: eur(r.interest_total),
        principal_total_eur: eur(r.principal_total),

        first_year: yearOrDash(r.first_year),
        last_year: yearOrDash(r.last_year),
        last_balance_year: yearOrDash(r.last_balance_year),

        // optional: timestamp
        refreshed_at: new Date().toISOString(),
      } satisfies Row;
    });
  } catch (e: unknown) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return <PropertyLoanDashboard rows={rows} error={error} />;
}
