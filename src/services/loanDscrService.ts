import { supabase } from "@/lib/supabase";

type LoanDscrYearRowDb = {
  property_id: unknown;
  property_name: unknown;
  year: unknown;
  operating_income: unknown;
  operating_expenses: unknown;
  noi: unknown;
  interest: unknown;
  principal: unknown;
  debt_service: unknown;
  dscr: unknown;
};

export type LoanDscrYearMetric = {
  propertyId: string;
  propertyName: string;
  year: number;
  operatingIncome: number;
  operatingExpenses: number;
  noi: number;
  interest: number;
  principal: number;
  debtService: number;
  dscr: number | null;
};

function toNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function loadLoanDscrYearMetrics(params?: {
  startYear?: number;
  endYear?: number;
}): Promise<LoanDscrYearMetric[]> {
  const currentYear = new Date().getFullYear();
  const startYear = params?.startYear ?? 2024;
  const endYear = params?.endYear ?? currentYear;

  const { data, error } = await supabase
    .from("v_property_loan_dscr_yearly")
    .select("property_id,property_name,year,operating_income,operating_expenses,noi,interest,principal,debt_service,dscr")
    .gte("year", startYear)
    .lte("year", endYear)
    .order("year", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as LoanDscrYearRowDb[]).map((row) => ({
    propertyId: String(row.property_id ?? ""),
    propertyName: String(row.property_name ?? ""),
    year: Math.trunc(toNumber(row.year)),
    operatingIncome: toNumber(row.operating_income),
    operatingExpenses: toNumber(row.operating_expenses),
    noi: toNumber(row.noi),
    interest: toNumber(row.interest),
    principal: toNumber(row.principal),
    debtService: toNumber(row.debt_service),
    dscr: row.dscr === null || row.dscr === undefined ? null : toNumber(row.dscr),
  }));
}
