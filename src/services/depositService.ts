import { listFinanceEntries } from "@/services/financeEntryRepository";
import { listTenantContracts } from "@/services/tenantService";

export type DepositStatus = "settled" | "open" | "overpaid" | "returned" | "none";

export type DepositLedgerEntry = {
  id: string;
  propertyId: string | null;
  objectCode: string | null;
  bookingDate: string | null;
  amount: number;
  category: string | null;
  note: string | null;
  direction: "received" | "returned";
};

export type DepositOverviewRow = {
  propertyId: string;
  propertyName: string;
  objectCode: string | null;
  tenantName: string | null;
  contractStatus: string | null;
  contractStart: string | null;
  contractEnd: string | null;
  expectedDeposit: number;
  receivedDeposit: number;
  returnedDeposit: number;
  balance: number;
  openAmount: number;
  status: DepositStatus;
  lastMovementDate: string | null;
  entries: DepositLedgerEntry[];
};

type AppObjectRef = {
  id: string;
  code?: string | null;
  label: string;
  aliases?: string[];
};

type ContractRow = {
  id: string;
  property_id: string | null;
  object_code: string | null;
  unit_label: string | null;
  deposit_amount: number | string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  tenant_profiles?: {
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
    tenant_number: string | null;
  } | Array<{
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
    tenant_number: string | null;
  }> | null;
};

type FinanceEntryRow = {
  id: string | number | null;
  object_id: string | null;
  objekt_code: string | null;
  booking_date: string | null;
  amount: number | string | null;
  category: string | null;
  note: string | null;
  entry_type: string | null;
};

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value == null) return 0;
  const parsed = Number(String(value).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/straße|strasse/g, "str")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactName(value: unknown): string {
  return String(value ?? "").trim();
}

function tenantName(row: ContractRow): string | null {
  const tenant = Array.isArray(row.tenant_profiles) ? row.tenant_profiles[0] : row.tenant_profiles;
  if (!tenant) return null;
  const personal = [tenant.first_name, tenant.last_name].map(compactName).filter(Boolean).join(" ").trim();
  return compactName(tenant.company_name) || personal || compactName(tenant.tenant_number) || null;
}

function isDepositEntry(row: FinanceEntryRow): boolean {
  const text = normalize(`${row.category ?? ""} ${row.note ?? ""}`);
  return /\b(kaution|mietsicherheit|sicherheitseinlage|deposit)\b/.test(text);
}

function isReturnedDeposit(row: FinanceEntryRow): boolean {
  const text = normalize(`${row.category ?? ""} ${row.note ?? ""}`);
  if (row.entry_type === "expense") return true;
  return /\b(zuruck|rueck|ruck|auszahlung|erstattung|retour|returned)\b/.test(text);
}

function buildObjectIndexes(objects: AppObjectRef[]) {
  const byId = new Map<string, AppObjectRef>();
  const byAlias = new Map<string, AppObjectRef>();

  for (const object of objects) {
    byId.set(object.id, object);
    const aliases = [object.id, object.code, object.label, ...(object.aliases ?? [])];
    for (const alias of aliases) {
      const key = normalize(alias);
      if (key) byAlias.set(key, object);
    }
  }

  return { byId, byAlias };
}

function resolveObject(
  refs: ReturnType<typeof buildObjectIndexes>,
  propertyId: string | null | undefined,
  objectCode: string | null | undefined,
): AppObjectRef | null {
  if (propertyId && refs.byId.has(propertyId)) return refs.byId.get(propertyId) ?? null;
  const propertyKey = normalize(propertyId);
  if (propertyKey && refs.byAlias.has(propertyKey)) return refs.byAlias.get(propertyKey) ?? null;
  const codeKey = normalize(objectCode);
  if (codeKey && refs.byAlias.has(codeKey)) return refs.byAlias.get(codeKey) ?? null;
  return null;
}

function statusFor(expected: number, received: number, returned: number): DepositStatus {
  const balance = received - returned;
  if (expected <= 0 && received <= 0 && returned <= 0) return "none";
  if (expected <= 0 && returned > 0 && balance <= 0) return "returned";
  if (balance < 0) return "returned";
  if (expected > 0 && balance >= expected - 0.01 && balance <= expected + 0.01) return "settled";
  if (expected > 0 && balance > expected + 0.01) return "overpaid";
  return "open";
}

function latestDate(entries: DepositLedgerEntry[]): string | null {
  return entries
    .map((entry) => entry.bookingDate)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.localeCompare(a))[0] ?? null;
}

export async function loadDepositOverview(objects: AppObjectRef[]): Promise<DepositOverviewRow[]> {
  const refs = buildObjectIndexes(objects);
  const [contractRows, financeEntries] = await Promise.all([
    listTenantContracts(),
    listFinanceEntries(),
  ]);

  const rowsByProperty = new Map<string, DepositOverviewRow>();

  for (const object of objects) {
    rowsByProperty.set(object.id, {
      propertyId: object.id,
      propertyName: object.label,
      objectCode: object.code ?? null,
      tenantName: null,
      contractStatus: null,
      contractStart: null,
      contractEnd: null,
      expectedDeposit: 0,
      receivedDeposit: 0,
      returnedDeposit: 0,
      balance: 0,
      openAmount: 0,
      status: "none",
      lastMovementDate: null,
      entries: [],
    });
  }

  for (const contract of contractRows as unknown as ContractRow[]) {
    const object = resolveObject(refs, contract.property_id, contract.object_code);
    const propertyId = object?.id ?? compactName(contract.property_id) ?? compactName(contract.object_code);
    if (!propertyId) continue;

    const existing = rowsByProperty.get(propertyId);
    const expectedDeposit = toNumber(contract.deposit_amount);
    const candidate: DepositOverviewRow = existing ?? {
      propertyId,
      propertyName: object?.label ?? compactName(contract.object_code) ?? propertyId,
      objectCode: object?.code ?? contract.object_code ?? null,
      tenantName: null,
      contractStatus: null,
      contractStart: null,
      contractEnd: null,
      expectedDeposit: 0,
      receivedDeposit: 0,
      returnedDeposit: 0,
      balance: 0,
      openAmount: 0,
      status: "none",
      lastMovementDate: null,
      entries: [],
    };

    candidate.expectedDeposit += expectedDeposit;
    if (!candidate.tenantName || contract.status === "active") candidate.tenantName = tenantName(contract);
    if (!candidate.contractStatus || contract.status === "active") candidate.contractStatus = contract.status;
    if (!candidate.contractStart || String(contract.start_date ?? "") > candidate.contractStart) candidate.contractStart = contract.start_date;
    if (!candidate.contractEnd) candidate.contractEnd = contract.end_date;
    rowsByProperty.set(propertyId, candidate);
  }

  for (const entry of (financeEntries as unknown as FinanceEntryRow[]).filter(isDepositEntry)) {
    const object = resolveObject(refs, entry.object_id, entry.objekt_code);
    const propertyId = object?.id ?? compactName(entry.object_id) ?? compactName(entry.objekt_code);
    if (!propertyId) continue;

    const existing = rowsByProperty.get(propertyId);
    const row: DepositOverviewRow = existing ?? {
      propertyId,
      propertyName: object?.label ?? compactName(entry.objekt_code) ?? propertyId,
      objectCode: object?.code ?? entry.objekt_code ?? null,
      tenantName: null,
      contractStatus: null,
      contractStart: null,
      contractEnd: null,
      expectedDeposit: 0,
      receivedDeposit: 0,
      returnedDeposit: 0,
      balance: 0,
      openAmount: 0,
      status: "none",
      lastMovementDate: null,
      entries: [],
    };

    const amount = Math.abs(toNumber(entry.amount));
    const direction = isReturnedDeposit(entry) ? "returned" : "received";
    if (direction === "returned") row.returnedDeposit += amount;
    else row.receivedDeposit += amount;

    row.entries.push({
      id: String(entry.id ?? `${propertyId}-${entry.booking_date}-${amount}`),
      propertyId: entry.object_id,
      objectCode: entry.objekt_code,
      bookingDate: entry.booking_date,
      amount,
      category: entry.category,
      note: entry.note,
      direction,
    });

    rowsByProperty.set(propertyId, row);
  }

  return [...rowsByProperty.values()]
    .map((row) => {
      const balance = row.receivedDeposit - row.returnedDeposit;
      return {
        ...row,
        balance,
        openAmount: Math.max(row.expectedDeposit - balance, 0),
        status: statusFor(row.expectedDeposit, row.receivedDeposit, row.returnedDeposit),
        lastMovementDate: latestDate(row.entries),
        entries: row.entries.sort((a, b) => String(b.bookingDate ?? "").localeCompare(String(a.bookingDate ?? ""))),
      };
    })
    .sort((a, b) => a.propertyName.localeCompare(b.propertyName, "de"));
}
