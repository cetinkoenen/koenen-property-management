import { canonicalizeFinanceCategory } from "@/lib/financeCategories";

type LoanCashflowEntry = {
  entry_type: string | null;
  booking_date: string | null;
  amount: number;
  category: string | null;
  loan_rate_plan_id?: string | null;
};

type LoanCashflowPlanRow = {
  id?: string;
  plan_date: string;
  payment_amount: number;
};

type LoanCashflowObject = { id: string };

export type MonthlyLoanCashflowResult = {
  amount: number;
  bookedAmount: number;
  plannedFallbackAmount: number;
  source: "booked" | "plan" | "mixed" | "none";
};

export function isCreditRateBooking(entry: LoanCashflowEntry): boolean {
  if (entry.entry_type !== "expense") return false;
  return canonicalizeFinanceCategory(entry.category, "expense") === "Kreditrate";
}

/**
 * Single source of truth for the monthly annuity shown in dashboards:
 * an actual credit-rate booking takes precedence. The repayment schedule is
 * only a fallback for an object/month without such a booking.
 */
export function resolveMonthlyLoanCashflow<
  Entry extends LoanCashflowEntry,
  Plan extends LoanCashflowPlanRow,
  ObjectRow extends LoanCashflowObject,
>(input: {
  monthKey: string;
  entries: Entry[];
  plans: Plan[];
  objects: ObjectRow[];
  entryMatchesObject: (entry: Entry, object: ObjectRow) => boolean;
  planMatchesObject: (plan: Plan, object: ObjectRow) => boolean;
}): MonthlyLoanCashflowResult {
  const bookedEntries = input.entries.filter(
    (entry) => entry.booking_date?.startsWith(input.monthKey) && isCreditRateBooking(entry),
  );
  const linkedPlanIds = new Set(
    bookedEntries.map((entry) => entry.loan_rate_plan_id).filter((id): id is string => Boolean(id)),
  );
  const objectsWithUnlinkedBooking = new Set(
    input.objects
      .filter((object) => bookedEntries.some((entry) => !entry.loan_rate_plan_id && input.entryMatchesObject(entry, object)))
      .map((object) => object.id),
  );

  const fallbackPlans = input.plans.filter((plan) => {
    if (!plan.plan_date.startsWith(input.monthKey)) return false;
    if (plan.id && linkedPlanIds.has(plan.id)) return false;
    const matchedObject = input.objects.find((object) => input.planMatchesObject(plan, object));
    return !matchedObject || !objectsWithUnlinkedBooking.has(matchedObject.id);
  });

  const bookedAmount = bookedEntries.reduce((sum, entry) => sum + Math.abs(Number(entry.amount || 0)), 0);
  const plannedFallbackAmount = fallbackPlans.reduce((sum, plan) => sum + Math.abs(Number(plan.payment_amount || 0)), 0);
  const source = bookedAmount > 0
    ? (plannedFallbackAmount > 0 ? "mixed" : "booked")
    : (plannedFallbackAmount > 0 ? "plan" : "none");

  return {
    amount: bookedAmount + plannedFallbackAmount,
    bookedAmount,
    plannedFallbackAmount,
    source,
  };
}
