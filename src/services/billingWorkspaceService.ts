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

type GarageBillingCostSnapshot = {
  id?: unknown;
  label?: unknown;
  totalCost?: unknown;
  key?: unknown;
  totalUnits?: unknown;
  yourUnits?: unknown;
  autoMode?: unknown;
};

type GarageBillingRecordSnapshot = {
  recordId?: unknown;
  unitCode?: unknown;
  unitLabel?: unknown;
  year?: unknown;
  finalized?: unknown;
  workflowStatus?: unknown;
  propertyLabel?: unknown;
  periodFrom?: unknown;
  periodTo?: unknown;
  monthlyHausgeld?: unknown;
  tenantPrepayments?: unknown;
  tenantName?: unknown;
  totalUnits?: unknown;
  yourUnits?: unknown;
  apportionableRows?: unknown;
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

function stringValue(value: unknown) {
  return String(value ?? "").trim();
}

function monthsInclusive(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1);
}

function isReleasedGarageStatus(value: unknown) {
  return /freigegeben|korrigiert/i.test(stringValue(value));
}

function garageCostToWorkspaceCost(
  value: GarageBillingCostSnapshot,
  record: GarageBillingRecordSnapshot,
  index: number,
): BillingCostSnapshot {
  const allocationKey = stringValue(value.key);
  const direct = allocationKey === "Direktbetrag" || allocationKey === "Verbrauch/Direkt";
  const periodFrom = stringValue(record.periodFrom);
  const periodTo = stringValue(record.periodTo);
  const totalCost = value.autoMode === "annualHausgeld"
    ? finiteNumber(record.monthlyHausgeld) * monthsInclusive(periodFrom, periodTo)
    : finiteNumber(value.totalCost);

  return {
    id: stringValue(value.id) || `tg-cost-${index + 1}`,
    label: stringValue(value.label) || `Kostenart ${index + 1}`,
    amount: roundMoney(totalCost),
    allocation: direct ? "directAmount" : "allocationKey",
    totalKey: finiteNumber(value.totalUnits) || finiteNumber(record.totalUnits),
    apartmentKey: finiteNumber(value.yourUnits) || finiteNumber(record.yourUnits),
    directAmount: direct ? roundMoney(totalCost) : 0,
    prorateByOccupancy: false,
  };
}

function garageRecordToWorkspaceRecord(
  value: GarageBillingRecordSnapshot,
  fallbackYear: number,
  index: number,
): BillingWorkspaceRecordSnapshot | null {
  if (!Array.isArray(value.apportionableRows)) return null;
  const year = finiteNumber(value.year) || fallbackYear;
  const id = stringValue(value.recordId) || `tg-billing-${year}-${index + 1}`;
  const unitCode = stringValue(value.unitCode);
  const unitLabel = stringValue(value.unitLabel) || unitCode || "Tiefgaragenstellplatz";
  const workflowStatus = stringValue(value.workflowStatus) || (value.finalized ? "Freigegeben" : "Offen");
  const apartmentId = `${id}-tenant`;

  return {
    id,
    name: `${unitCode || unitLabel} · ${year}`,
    workspace: {
      meta: {
        propertyCode: "rosenstein-str-25-tiefgarage",
        propertyLabel: stringValue(value.propertyLabel),
        billingYear: year,
        periodFrom: stringValue(value.periodFrom),
        periodTo: stringValue(value.periodTo),
        workflowStatus,
        locked: Boolean(value.finalized) || isReleasedGarageStatus(workflowStatus),
      },
      apartments: [{
        id: apartmentId,
        label: unitLabel,
        tenantName: stringValue(value.tenantName),
        occupancyMonths: monthsInclusive(stringValue(value.periodFrom), stringValue(value.periodTo)),
        advancePayments: finiteNumber(value.tenantPrepayments),
        co2LandlordDeductionKalo: 0,
        active: true,
      }],
      costs: (value.apportionableRows as GarageBillingCostSnapshot[]).map((row, rowIndex) => garageCostToWorkspaceCost(row, value, rowIndex)),
      selectedApartmentId: apartmentId,
    },
  };
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
  const candidate = data as { billings?: unknown[]; records?: unknown[] };

  if (Array.isArray(candidate.records)) {
    return candidate.records.flatMap((raw, index) => {
      if (!raw || typeof raw !== "object") return [];
      const record = garageRecordToWorkspaceRecord(raw as GarageBillingRecordSnapshot, fallbackYear, index);
      return record ? [record] : [];
    });
  }

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
