export const RENT_PAYMENT_ROUNDING_TOLERANCE = 0.10;

export function rentBalancePart(expected: number, paid: number, kind: "open" | "overpaid"): number {
  const difference = kind === "open" ? expected - paid : paid - expected;
  return difference > RENT_PAYMENT_ROUNDING_TOLERANCE
    ? Math.round((difference + Number.EPSILON) * 100) / 100
    : 0;
}
