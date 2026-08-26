import { supabase } from "../lib/supabase";
import { isReadonlyApprovalEmail } from "../auth/accessControl";

export type TenantStatus = "active" | "notice" | "former" | "prospect";
export type RentalContractStatus = "active" | "vacant" | "ended" | "planned";
export type OccupancyContractStatus = Exclude<RentalContractStatus, "vacant">;

export type TenantProfile = {
  id: string;
  user_id: string;
  tenant_number: string | null;
  salutation: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  bank_name: string | null;
  iban: string | null;
  notes: string | null;
  status: TenantStatus;
  created_at: string;
  updated_at: string;
};

export type TenantContract = {
  id: string;
  user_id: string;
  tenant_id: string;
  property_id: string | null;
  object_code: string | null;
  unit_label: string | null;
  rent_type: string | null;
  cold_rent: number | null;
  operating_costs: number | null;
  total_rent: number | null;
  deposit_amount: number | null;
  start_date: string | null;
  end_date: string | null;
  status: RentalContractStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantWithContract = {
  tenant: TenantProfile;
  contract: TenantContract | null;
};

export type TenantProfileWithContracts = TenantProfile & {
  tenant_contracts?: TenantContract[];
};

export type TenantInput = {
  tenantNumber?: string;
  salutation?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  bankName?: string;
  iban?: string;
  notes?: string;
  status?: TenantStatus;
};

export type TenantContractInput = {
  propertyId?: string;
  objectCode?: string;
  unitLabel?: string;
  rentType?: string;
  coldRent?: number | null;
  operatingCosts?: number | null;
  totalRent?: number | null;
  depositAmount?: number | null;
  startDate?: string;
  endDate?: string;
  status?: RentalContractStatus;
  notes?: string;
};

function cleanText(value: string | null | undefined): string | null {
  const cleaned = String(value ?? "").trim();
  return cleaned ? cleaned : null;
}

function money(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const rawValue = String(value).trim();
  const isoValue = rawValue.includes("T") ? rawValue.slice(0, 10) : rawValue;
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoValue)) return isoValue;
  const germanMatch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(isoValue.replace(/\s+/g, ""));
  if (germanMatch) {
    const [, day, month, year] = germanMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const parsedDate = new Date(rawValue);
  if (Number.isNaN(parsedDate.getTime())) return null;
  const year = parsedDate.getFullYear();
  const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
  const day = String(parsedDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hasContractPayload(contractInput: TenantContractInput): boolean {
  return (
    Boolean(cleanText(contractInput.propertyId)) ||
    Boolean(cleanText(contractInput.objectCode)) ||
    Boolean(cleanText(contractInput.unitLabel)) ||
    Boolean(cleanText(contractInput.rentType)) ||
    money(contractInput.coldRent) !== null ||
    money(contractInput.operatingCosts) !== null ||
    money(contractInput.totalRent) !== null ||
    money(contractInput.depositAmount) !== null ||
    Boolean(cleanText(contractInput.startDate)) ||
    Boolean(cleanText(contractInput.endDate)) ||
    Boolean(cleanText(contractInput.notes))
  );
}

function buildTenantContractPayload(userId: string, tenantId: string, contractInput: TenantContractInput) {
  const startDate = toIsoDate(contractInput.startDate);
  const endDate = toIsoDate(contractInput.endDate);
  return {
    user_id: userId,
    tenant_id: tenantId,
    property_id: cleanText(contractInput.propertyId),
    object_code: cleanText(contractInput.objectCode),
    unit_label: cleanText(contractInput.unitLabel),
    rent_type: cleanText(contractInput.rentType),
    cold_rent: money(contractInput.coldRent),
    operating_costs: money(contractInput.operatingCosts),
    total_rent: money(contractInput.totalRent),
    deposit_amount: money(contractInput.depositAmount),
    start_date: startDate,
    end_date: endDate,
    status: contractInput.status ?? deriveRentalContractStatus(startDate, endDate),
    notes: cleanText(contractInput.notes),
  };
}

function buildTenantContractUpdatePayload(contractInput: TenantContractInput) {
  const startDate = toIsoDate(contractInput.startDate);
  const endDate = toIsoDate(contractInput.endDate);
  return {
    property_id: cleanText(contractInput.propertyId),
    object_code: cleanText(contractInput.objectCode),
    unit_label: cleanText(contractInput.unitLabel),
    rent_type: cleanText(contractInput.rentType),
    cold_rent: money(contractInput.coldRent),
    operating_costs: money(contractInput.operatingCosts),
    total_rent: money(contractInput.totalRent),
    deposit_amount: money(contractInput.depositAmount),
    start_date: startDate,
    end_date: endDate,
    status: contractInput.status ?? deriveRentalContractStatus(startDate, endDate),
    notes: cleanText(contractInput.notes),
  };
}

function todayDateKey(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function deriveRentalContractStatus(
  startDateValue: string | null | undefined,
  endDateValue: string | null | undefined,
  referenceDateValue = todayDateKey(),
): OccupancyContractStatus {
  const referenceDate = toIsoDate(referenceDateValue) ?? referenceDateValue;
  const startDate = toIsoDate(startDateValue);
  const endDate = toIsoDate(endDateValue);
  if (startDate && endDate && endDate < startDate) return "active";
  if (endDate && endDate < referenceDate) return "ended";
  if (startDate && startDate > referenceDate) return "planned";
  return "active";
}

export function deriveTenantProfileStatus(
  startDateValue: string | null | undefined,
  endDateValue: string | null | undefined,
  fallback: TenantStatus = "active",
  referenceDateValue = todayDateKey(),
): TenantStatus {
  const contractStatus = deriveRentalContractStatus(startDateValue, endDateValue, referenceDateValue);
  if (contractStatus === "ended") return "former";
  if (contractStatus === "planned") return "prospect";
  if (contractStatus === "active") return "active";
  return fallback;
}

function normalizedContractEndDate(contract: Pick<TenantContract, "start_date" | "end_date">): string | null {
  const startDate = toIsoDate(contract.start_date);
  const endDate = toIsoDate(contract.end_date);
  if (startDate && endDate && endDate < startDate) return null;
  return endDate;
}

function isContractCurrentOrFuture(
  contract: Pick<TenantContract, "start_date" | "end_date" | "status">,
  referenceDateIso: string,
): boolean {
  if (contract.status === "vacant") return false;
  const referenceDate = toIsoDate(referenceDateIso) ?? referenceDateIso;
  const endDate = normalizedContractEndDate(contract);
  if (endDate && endDate < referenceDate) return false;
  return true;
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll("ß", "ss")
    .replace(/[ä]/g, "ae")
    .replace(/[ö]/g, "oe")
    .replace(/[ü]/g, "ue")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactText(value: string | null | undefined): string {
  return normalizeText(value).replace(/\s+/g, "");
}

function parkingCode(value: string | null | undefined): string | null {
  return compactText(value).match(/p25[034]/)?.[0] ?? null;
}

function unitMatches(vacancyUnit: string | null | undefined, contractUnit: string | null | undefined): boolean {
  const vacancy = normalizeText(vacancyUnit);
  if (!vacancy) return true;
  const contract = normalizeText(contractUnit);
  if (!contract) return false;

  const vacancyParking = parkingCode(vacancyUnit);
  const contractParking = parkingCode(contractUnit);
  if (vacancyParking || contractParking) {
    return Boolean(vacancyParking && contractParking && vacancyParking === contractParking);
  }

  return vacancy.includes(contract) || contract.includes(vacancy);
}

function contractMatchesInput(contract: TenantContract, contractInput: TenantContractInput): boolean {
  const propertyId = cleanText(contractInput.propertyId);
  const objectCode = cleanText(contractInput.objectCode);
  const unitLabel = cleanText(contractInput.unitLabel);

  if (propertyId && contract.property_id && contract.property_id !== propertyId) return false;
  if (objectCode && contract.object_code && contract.object_code !== objectCode) return false;
  if (unitLabel && !unitMatches(unitLabel, contract.unit_label)) return false;
  return true;
}

function contractEditRank(contract: TenantContract, referenceDate: string): number {
  if (contract.status === "vacant") return 4;
  const startDate = toIsoDate(contract.start_date);
  const endDate = normalizedContractEndDate(contract);
  if ((!startDate || startDate <= referenceDate) && (!endDate || endDate >= referenceDate)) return 0;
  if (startDate && startDate > referenceDate) return 1;
  return 2;
}

function latestContractSort(left: TenantContract, right: TenantContract): number {
  const leftValue = left.start_date ?? left.updated_at ?? left.created_at ?? "";
  const rightValue = right.start_date ?? right.updated_at ?? right.created_at ?? "";
  return rightValue.localeCompare(leftValue);
}

async function findExistingTenantContractId(
  tenantId: string,
  contractInput: TenantContractInput,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("tenant_contracts")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_deleted", false)
    .limit(50);

  if (error) throw error;

  const contracts = ((data ?? []) as TenantContract[]).filter((contract) => contract.status !== "vacant");
  if (!contracts.length) return null;

  const matchingContracts = contracts.filter((contract) => contractMatchesInput(contract, contractInput));
  const candidates = matchingContracts.length ? matchingContracts : contracts.length === 1 ? contracts : [];
  if (!candidates.length) return null;

  const referenceDate = todayDateKey();
  return (
    [...candidates].sort((left, right) => {
      const rankDiff = contractEditRank(left, referenceDate) - contractEditRank(right, referenceDate);
      if (rankDiff !== 0) return rankDiff;
      return latestContractSort(left, right);
    })[0]?.id ?? null
  );
}

async function findBestTenantContractId(tenantId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("tenant_contracts")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_deleted", false)
    .limit(50);

  if (error) throw error;

  const contracts = ((data ?? []) as TenantContract[]).filter((contract) => contract.status !== "vacant");
  if (!contracts.length) return null;

  const referenceDate = todayDateKey();
  return (
    [...contracts].sort((left, right) => {
      const rankDiff = contractEditRank(left, referenceDate) - contractEditRank(right, referenceDate);
      if (rankDiff !== 0) return rankDiff;
      return latestContractSort(left, right);
    })[0]?.id ?? null
  );
}

async function updateTenantContractById(
  contractId: string,
  contractPayload: ReturnType<typeof buildTenantContractUpdatePayload>,
): Promise<TenantContract | null> {
  const { data, error } = await supabase
    .from("tenant_contracts")
    .update(contractPayload)
    .eq("id", contractId)
    .eq("is_deleted", false)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return (data as TenantContract | null) ?? null;
}

async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const userId = data.user?.id;
  if (!userId) throw new Error("Nicht eingeloggt.");
  return userId;
}

async function isCurrentUserReadonly(): Promise<boolean> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return isReadonlyApprovalEmail(data.user?.email);
}

export async function listTenantProfiles(limit = 20): Promise<TenantProfile[]> {
  const userId = await getCurrentUserId();
  let query = supabase
    .from("tenant_profiles")
    .select("*")
    .eq("is_deleted", false)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (!(await isCurrentUserReadonly())) query = query.eq("user_id", userId);
  const { data, error } = await query;

  if (error) throw error;
  return (data ?? []) as TenantProfile[];
}

export async function listTenantProfilesWithContracts(limit = 250): Promise<TenantProfileWithContracts[]> {
  const userId = await getCurrentUserId();
  const readonly = await isCurrentUserReadonly();
  let profilesQuery = supabase
    .from("tenant_profiles")
    .select("*")
    .eq("is_deleted", false)
    .order("updated_at", { ascending: false })
    .limit(limit);
  let contractsQuery = supabase
    .from("tenant_contracts")
    .select("*")
    .eq("is_deleted", false)
    .order("start_date", { ascending: false });
  if (!readonly) {
    profilesQuery = profilesQuery.eq("user_id", userId);
    contractsQuery = contractsQuery.eq("user_id", userId);
  }

  const [{ data: profilesData, error: profilesError }, { data: contractsData, error: contractsError }] =
    await Promise.all([profilesQuery, contractsQuery]);

  if (profilesError) throw profilesError;
  if (contractsError) throw contractsError;

  const contractsByTenant = new Map<string, TenantContract[]>();
  ((contractsData ?? []) as TenantContract[]).forEach((contract) => {
    const existing = contractsByTenant.get(contract.tenant_id) ?? [];
    existing.push(contract);
    contractsByTenant.set(contract.tenant_id, existing);
  });

  return ((profilesData ?? []) as TenantProfile[]).map((profile) => ({
    ...profile,
    tenant_contracts: contractsByTenant.get(profile.id) ?? [],
  }));
}

export async function createTenantWithContract(
  tenantInput: TenantInput,
  contractInput: TenantContractInput,
): Promise<TenantWithContract> {
  const userId = await getCurrentUserId();

  const tenantPayload = {
    user_id: userId,
    tenant_number: cleanText(tenantInput.tenantNumber),
    salutation: cleanText(tenantInput.salutation),
    first_name: cleanText(tenantInput.firstName),
    last_name: cleanText(tenantInput.lastName),
    company_name: cleanText(tenantInput.companyName),
    email: cleanText(tenantInput.email),
    phone: cleanText(tenantInput.phone),
    mobile: cleanText(tenantInput.mobile),
    street: cleanText(tenantInput.street),
    postal_code: cleanText(tenantInput.postalCode),
    city: cleanText(tenantInput.city),
    bank_name: cleanText(tenantInput.bankName),
    iban: cleanText(tenantInput.iban),
    notes: cleanText(tenantInput.notes),
    status: tenantInput.status ?? "active",
  };

  const { data: tenantData, error: tenantError } = await supabase
    .from("tenant_profiles")
    .insert(tenantPayload)
    .select("*")
    .single();

  if (tenantError) throw tenantError;

  if (!hasContractPayload(contractInput)) {
    return { tenant: tenantData as TenantProfile, contract: null };
  }

  const contractPayload = buildTenantContractPayload(userId, (tenantData as TenantProfile).id, contractInput);

  const { data: contractData, error: contractError } = await supabase
    .from("tenant_contracts")
    .insert(contractPayload)
    .select("*")
    .single();

  if (contractError) throw contractError;

  return {
    tenant: tenantData as TenantProfile,
    contract: contractData as TenantContract,
  };
}

export async function updateTenantProfile(id: string, tenantInput: TenantInput): Promise<TenantProfile> {
  await getCurrentUserId();
  const payload = {
    tenant_number: cleanText(tenantInput.tenantNumber),
    salutation: cleanText(tenantInput.salutation),
    first_name: cleanText(tenantInput.firstName),
    last_name: cleanText(tenantInput.lastName),
    company_name: cleanText(tenantInput.companyName),
    email: cleanText(tenantInput.email),
    phone: cleanText(tenantInput.phone),
    mobile: cleanText(tenantInput.mobile),
    street: cleanText(tenantInput.street),
    postal_code: cleanText(tenantInput.postalCode),
    city: cleanText(tenantInput.city),
    bank_name: cleanText(tenantInput.bankName),
    iban: cleanText(tenantInput.iban),
    notes: cleanText(tenantInput.notes),
    status: tenantInput.status ?? "active",
  };

  const { data, error } = await supabase
    .from("tenant_profiles")
    .update(payload)
    .eq("id", id)
    .eq("is_deleted", false)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Mieter konnte nicht aktualisiert werden. Bitte Mieterregister neu laden und erneut versuchen.");
  return data as TenantProfile;
}

export async function upsertTenantContractForTenant(
  tenantId: string,
  contractInput: TenantContractInput,
  existingContractId?: string | null,
  options: { preferUpdateExisting?: boolean } = {},
): Promise<TenantContract | null> {
  const userId = await getCurrentUserId();
  const cleanTenantId = cleanText(tenantId);
  const cleanContractId = cleanText(existingContractId);
  if (!cleanTenantId) throw new Error("Mieter-ID fehlt.");
  if (!cleanContractId && !hasContractPayload(contractInput)) return null;

  const contractPayload = buildTenantContractPayload(userId, cleanTenantId, contractInput);
  const contractUpdatePayload = buildTenantContractUpdatePayload(contractInput);

  if (cleanContractId) {
    const updatedContract = await updateTenantContractById(cleanContractId, contractUpdatePayload);
    if (!updatedContract) {
      throw new Error("Mietverhältnis konnte nicht aktualisiert werden. Bitte Mieterregister neu laden und erneut versuchen.");
    }
    return updatedContract;
  }

  const fallbackContractId = await findExistingTenantContractId(cleanTenantId, contractInput);
  if (fallbackContractId) {
    const updatedContract = await updateTenantContractById(fallbackContractId, contractUpdatePayload);
    if (updatedContract) return updatedContract;
  }

  if (options.preferUpdateExisting) {
    const bestContractId = await findBestTenantContractId(cleanTenantId);
    if (bestContractId) {
      const updatedContract = await updateTenantContractById(bestContractId, contractUpdatePayload);
      if (updatedContract) return updatedContract;
    }
  }

  const { data, error } = await supabase
    .from("tenant_contracts")
    .insert(contractPayload)
    .select("*")
    .single();

  if (error) throw error;
  return data as TenantContract;
}

export async function syncTenantEndFromVacancy(input: {
  propertyId: string;
  objectCode?: string | null;
  unitLabel?: string | null;
  vacancyStartDate: string;
}): Promise<number> {
  const userId = await getCurrentUserId();
  const propertyId = cleanText(input.propertyId);
  const vacancyStartDate = cleanText(input.vacancyStartDate);
  if (!propertyId || !vacancyStartDate) return 0;

  const tenantEndDate = addDays(vacancyStartDate, -1);
  const objectCode = cleanText(input.objectCode);
  const { data, error } = await supabase
    .from("tenant_contracts")
    .select("id,tenant_id,property_id,object_code,unit_label,start_date,end_date,status")
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .eq("property_id", propertyId);

  if (error) throw error;

  const candidates = ((data ?? []) as TenantContract[]).filter((contract) => {
    if (!isContractCurrentOrFuture(contract, vacancyStartDate)) return false;
    const endDate = normalizedContractEndDate(contract);
    if (endDate && endDate <= tenantEndDate) return false;
    if (objectCode && contract.object_code && contract.object_code !== objectCode) return false;
    return unitMatches(input.unitLabel, contract.unit_label);
  });

  if (!candidates.length) return 0;

  const contractIds = candidates.map((contract) => contract.id);
  const tenantIds = [...new Set(candidates.map((contract) => contract.tenant_id).filter(Boolean))];
  const { error: updateError } = await supabase
    .from("tenant_contracts")
    .update({ end_date: tenantEndDate, status: "ended" })
    .in("id", contractIds)
    .eq("user_id", userId);

  if (updateError) throw updateError;

  for (const tenantId of tenantIds) {
    const { data: activeContracts, error: activeError } = await supabase
      .from("tenant_contracts")
      .select("id,start_date,end_date,status")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .eq("is_deleted", false)
      .limit(50);

    if (activeError) throw activeError;
    if (((activeContracts ?? []) as TenantContract[]).some((contract) => isContractCurrentOrFuture(contract, vacancyStartDate))) continue;

    const { error: tenantError } = await supabase
      .from("tenant_profiles")
      .update({ status: "former" })
      .eq("id", tenantId)
      .eq("user_id", userId);

    if (tenantError) throw tenantError;
  }

  return contractIds.length;
}
