export type ChfLoanSplitRule = {
  propertyKey: "lilienthaler-str-54" | "elsasser-str-52";
  propertyLabel: string;
  fixedPrincipalEur: number;
  source: string;
};

const OWNER_CONFIRMATION_DATE = "2026-09-11";

export const CHF_LOAN_SPLIT_RULES: readonly ChfLoanSplitRule[] = [
  {
    propertyKey: "lilienthaler-str-54",
    propertyLabel: "Lilienthaler Str. 54",
    fixedPrincipalEur: 1100,
    source: `rule:CHF-fixed-principal:1100:owner-confirmed-${OWNER_CONFIRMATION_DATE}`,
  },
  {
    propertyKey: "elsasser-str-52",
    propertyLabel: "Elsasser Str. 52",
    fixedPrincipalEur: 300,
    source: `rule:CHF-fixed-principal:300:owner-confirmed-${OWNER_CONFIRMATION_DATE}`,
  },
] as const;

function normalize(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ß", "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function resolveChfLoanSplitRule(value: unknown): ChfLoanSplitRule | null {
  const text = normalize(value);
  if (!text) return null;
  return CHF_LOAN_SPLIT_RULES.find((rule) => {
    const key = normalize(rule.propertyKey);
    const label = normalize(rule.propertyLabel);
    return text.includes(key) || text.includes(label);
  }) ?? null;
}

export function calculateChfLoanSplit(totalPaymentEur: number, propertyReference: unknown): {
  interestEur: number;
  principalEur: number;
  source: string;
  rule: ChfLoanSplitRule;
} | null {
  const rule = resolveChfLoanSplitRule(propertyReference);
  const payment = roundCurrency(Math.abs(totalPaymentEur));
  if (!rule || !Number.isFinite(payment) || payment < rule.fixedPrincipalEur) return null;
  return {
    interestEur: roundCurrency(payment - rule.fixedPrincipalEur),
    principalEur: rule.fixedPrincipalEur,
    source: rule.source,
    rule,
  };
}
