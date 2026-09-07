export type BillingAllocationType = "allocationKey" | "persons" | "directAmount" | "heatingDirect";

export type BillingApartmentSnapshot = {
  id: string;
  label: string;
  tenantName: string;
  occupancyMonths: number;
  advancePayments: number;
  co2LandlordDeductionKalo: number;
  active?: boolean;
};

export type BillingCostSnapshot = {
  id: string;
  label: string;
  amount: number;
  allocation: BillingAllocationType;
  totalKey: number;
  apartmentKey: number;
  directAmount: number;
  prorateByOccupancy: boolean;
};

export type BillingWorkspaceSnapshot = {
  meta: {
    propertyCode: string;
    propertyLabel: string;
    billingYear: number;
    periodFrom: string;
    periodTo: string;
    workflowStatus?: string;
    locked?: boolean;
  };
  apartments: BillingApartmentSnapshot[];
  costs: BillingCostSnapshot[];
  selectedApartmentId: string | null;
};

export type BillingWorkspaceRecordSnapshot = {
  id: string;
  name: string;
  workspace: BillingWorkspaceSnapshot;
};

function finiteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function getPrimaryBillingApartment(workspace: BillingWorkspaceSnapshot) {
  return workspace.apartments.find((apartment) => apartment.id === workspace.selectedApartmentId) ?? workspace.apartments[0] ?? null;
}

export function summarizeBillingWorkspace(workspace: BillingWorkspaceSnapshot) {
  const apartment = getPrimaryBillingApartment(workspace);
  if (!apartment) {
    return { apartment: null, cold: 0, heatingBeforeCo2: 0, co2Deduction: 0, tenantTotal: 0, advance: 0, balance: 0, label: "Guthaben" as const };
  }

  let cold = 0;
  let heatingBeforeCo2 = 0;
  for (const row of workspace.costs) {
    const isHeating = row.allocation === "heatingDirect" || /heiz|wärme|waerme|warmwasser|kalo/i.test(row.label);
    let amount = 0;
    if (row.allocation === "directAmount" || row.allocation === "heatingDirect") {
      amount = finiteNumber(row.directAmount);
    } else {
      const totalKey = finiteNumber(row.totalKey);
      const base = totalKey > 0 ? finiteNumber(row.amount) * (finiteNumber(row.apartmentKey) / totalKey) : 0;
      amount = row.prorateByOccupancy ? base * (clamp(finiteNumber(apartment.occupancyMonths), 0, 12) / 12) : base;
    }
    if (isHeating) heatingBeforeCo2 += amount;
    else cold += amount;
  }

  const co2Deduction = Math.min(
    Math.max(finiteNumber(apartment.co2LandlordDeductionKalo), 0),
    Math.max(heatingBeforeCo2, 0),
  );
  const tenantTotal = roundMoney(cold + Math.max(heatingBeforeCo2 - co2Deduction, 0));
  const advance = finiteNumber(apartment.advancePayments);
  const balance = roundMoney(advance - tenantTotal);

  return {
    apartment,
    cold: roundMoney(cold),
    heatingBeforeCo2: roundMoney(heatingBeforeCo2),
    co2Deduction: roundMoney(co2Deduction),
    tenantTotal,
    advance,
    balance,
    label: balance >= 0 ? "Guthaben" as const : "Nachzahlung" as const,
  };
}

function isWorkspace(value: unknown): value is BillingWorkspaceSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BillingWorkspaceSnapshot>;
  return Boolean(candidate.meta && Array.isArray(candidate.apartments) && Array.isArray(candidate.costs));
}

export function extractBillingWorkspaceRecords(data: unknown, fallbackYear: number): BillingWorkspaceRecordSnapshot[] {
  if (!data || typeof data !== "object") return [];
  const candidate = data as { billings?: unknown[] };
  const rawRecords = Array.isArray(candidate.billings) ? candidate.billings : [{ id: `legacy-${fallbackYear}`, name: "Abrechnung", workspace: data }];

  return rawRecords.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const record = raw as { id?: unknown; name?: unknown; workspace?: unknown };
    if (!isWorkspace(record.workspace)) return [];
    return [{
      id: String(record.id ?? `billing-${fallbackYear}-${index + 1}`),
      name: String(record.name ?? `Abrechnung ${index + 1}`),
      workspace: record.workspace,
    }];
  });
}
