import { supabase } from "../lib/supabaseClient";
import { isReadonlyApprovalEmail } from "../auth/accessControl";

export type PropertyExtraInfo = {
  property_id?: string;
  livingArea: string;
  rooms: string;
  coldRent: string;
  operatingCosts: string;
  totalRent: string;
  marketValue: string;
  equipment: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  living_area?: string;
  cold_rent?: string;
  operating_costs?: string;
  total_rent?: string;
  market_value?: string;
  first_name?: string;
  last_name?: string;
};

export type PropertyExtra = PropertyExtraInfo;
export type PropertyWealthProfile = Record<string, string>;

export const emptyPropertyExtra: PropertyExtraInfo = {
  property_id: "",
  livingArea: "",
  rooms: "",
  coldRent: "",
  operatingCosts: "",
  totalRent: "",
  marketValue: "",
  equipment: "",
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  living_area: "",
  cold_rent: "",
  operating_costs: "",
  total_rent: "",
  market_value: "",
  first_name: "",
  last_name: "",
};

const STORAGE_KEY = "koenen:property-extra-info:v5";
const OLD_KEYS = [
  "koenen:portfolio:object-overview-extra:v4",
  "koenen:portfolio:object-overview-extra:v3",
  "koenen:portfolio:object-overview-extra:v2",
  "koenen:mieteruebersicht:tenant-info:v3",
  "koenen:mieteruebersicht:tenant-info:v2",
  "koenen_property_extra_info",
];

function safeStorageGet(key: string) {
  try { return typeof localStorage === "undefined" ? null : localStorage.getItem(key); } catch { return null; }
}

function readObjectValue(value: unknown, key: string): unknown {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

function normalize(value: unknown): PropertyExtraInfo {
  const normalized: PropertyExtraInfo = {
    ...emptyPropertyExtra,
    property_id: String(readObjectValue(value, "property_id") ?? readObjectValue(value, "propertyId") ?? ""),
    livingArea: String(readObjectValue(value, "livingArea") ?? readObjectValue(value, "living_area") ?? ""),
    rooms: String(readObjectValue(value, "rooms") ?? ""),
    coldRent: String(readObjectValue(value, "coldRent") ?? readObjectValue(value, "cold_rent") ?? ""),
    operatingCosts: String(readObjectValue(value, "operatingCosts") ?? readObjectValue(value, "operating_costs") ?? ""),
    totalRent: String(readObjectValue(value, "totalRent") ?? readObjectValue(value, "total_rent") ?? ""),
    marketValue: String(readObjectValue(value, "marketValue") ?? readObjectValue(value, "market_value") ?? ""),
    equipment: String(readObjectValue(value, "equipment") ?? ""),
    firstName: String(readObjectValue(value, "firstName") ?? readObjectValue(value, "first_name") ?? ""),
    lastName: String(readObjectValue(value, "lastName") ?? readObjectValue(value, "last_name") ?? ""),
    phone: String(readObjectValue(value, "phone") ?? ""),
    email: String(readObjectValue(value, "email") ?? ""),
  };
  normalized.living_area = normalized.livingArea;
  normalized.cold_rent = normalized.coldRent;
  normalized.operating_costs = normalized.operatingCosts;
  normalized.total_rent = normalized.totalRent;
  normalized.market_value = normalized.marketValue;
  normalized.first_name = normalized.firstName;
  normalized.last_name = normalized.lastName;
  return normalized;
}

function readRecordFromStorage(key: string): Record<string, PropertyExtraInfo> {
  const raw = safeStorageGet(key);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: Record<string, PropertyExtraInfo> = {};
    for (const [propertyId, value] of Object.entries(parsed ?? {})) {
      result[propertyId] = { ...normalize(value), property_id: String(readObjectValue(value, "property_id") ?? propertyId) };
    }
    return result;
  } catch { return {}; }
}

export function loadLocalTenantExtras(): Record<string, PropertyExtraInfo> {
  const merged: Record<string, PropertyExtraInfo> = {};
  for (const key of [...OLD_KEYS, STORAGE_KEY]) {
    const record = readRecordFromStorage(key);
    for (const [propertyId, value] of Object.entries(record)) {
      merged[propertyId] = { ...(merged[propertyId] ?? emptyPropertyExtra), ...normalize(value), property_id: propertyId };
    }
  }
  return merged;
}
export function mergeLocalSources(): Record<string, PropertyExtraInfo> { return loadLocalTenantExtras(); }

export function writeLocalTenantExtras(dataOrPropertyId: Record<string, PropertyExtraInfo> | string, extra?: Partial<PropertyExtraInfo>) {
  void dataOrPropertyId;
  void extra;
}
export function writeLocalPropertyExtras(dataOrPropertyId: Record<string, PropertyExtraInfo> | string, extra?: Partial<PropertyExtraInfo>) { writeLocalTenantExtras(dataOrPropertyId, extra); }
export function writeLocalPropertyExtra(propertyId: string, extra: Partial<PropertyExtraInfo>) { writeLocalTenantExtras(propertyId, extra); }

export async function fetchPropertyExtras(propertyIds?: string[]): Promise<Record<string, PropertyExtraInfo>> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return {};
  let query = supabase.from("property_extra_info").select("*");
  if (!isReadonlyApprovalEmail(user.email)) query = query.eq("user_id", user.id);
  if (propertyIds && propertyIds.length > 0) query = query.in("property_id", propertyIds);
  const { data, error } = await query;
  if (error) { console.warn("property_extra_info load skipped:", error.message); return {}; }
  const result: Record<string, PropertyExtraInfo> = {};
  for (const row of data ?? []) {
    const propertyId = String(row.property_id ?? "");
    if (!propertyId) continue;
    result[propertyId] = { ...normalize(row), property_id: propertyId };
  }
  return result;
}

export async function savePropertyExtra(propertyId: string, extra: Partial<PropertyExtraInfo>): Promise<{ ok: boolean; message: string; error?: unknown }> {
  const normalized = { ...normalize(extra), property_id: propertyId };
  // Clean sync: Supabase ist die einzige Quelle. Kein localStorage-Write mehr.
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, message: "Nicht eingeloggt" };
  const { error } = await supabase.from("property_extra_info").upsert({
    user_id: user.id,
    property_id: propertyId,
    living_area: normalized.livingArea,
    rooms: normalized.rooms,
    cold_rent: normalized.coldRent,
    operating_costs: normalized.operatingCosts,
    total_rent: normalized.totalRent,
    market_value: normalized.marketValue,
    equipment: normalized.equipment,
    first_name: normalized.firstName,
    last_name: normalized.lastName,
    phone: normalized.phone,
    email: normalized.email,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,property_id" });
  if (error) { console.error("property_extra_info save failed:", error.message); return { ok: false, message: "Supabase Fehler: " + error.message, error }; }
  return { ok: true, message: "Gespeichert" };
}
export async function savePropertyExtras(propertyId: string, extra: Partial<PropertyExtraInfo>) { return savePropertyExtra(propertyId, extra); }
export async function loadPropertyExtras(): Promise<Record<string, PropertyExtraInfo>> {
  return await fetchPropertyExtras();
}
export async function loadAllPropertyExtras(): Promise<Record<string, PropertyExtraInfo>> { return loadPropertyExtras(); }
export async function loadPropertyExtra(propertyId: string): Promise<PropertyExtraInfo | null> { const all = await loadPropertyExtras(); return all[propertyId] ?? null; }
export async function migrateLocalExtrasToSupabase(propertyIds: string[], local: Record<string, PropertyExtraInfo>, remote: Record<string, PropertyExtraInfo>) {
  for (const propertyId of propertyIds) if (local[propertyId] && !remote[propertyId]) await savePropertyExtra(propertyId, local[propertyId]);
}

function normalizeWealthProfile(value: unknown): PropertyWealthProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, fieldValue]) => typeof fieldValue === "string")
      .map(([key, fieldValue]) => [key, String(fieldValue)]),
  );
}

export async function fetchPropertyWealthProfiles(propertyIds?: string[]): Promise<Record<string, PropertyWealthProfile>> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return {};

  let query = supabase.from("property_extra_info").select("property_id,wealth_profile");
  if (!isReadonlyApprovalEmail(user.email)) query = query.eq("user_id", user.id);
  if (propertyIds?.length) query = query.in("property_id", propertyIds);
  const { data, error } = await query;
  if (error) {
    console.warn("property wealth profiles load failed:", error.message);
    return {};
  }

  const result: Record<string, PropertyWealthProfile> = {};
  for (const row of data ?? []) {
    const propertyId = String(row.property_id ?? "").trim();
    if (!propertyId) continue;
    result[propertyId] = normalizeWealthProfile(row.wealth_profile);
  }
  return result;
}

export async function savePropertyWealthProfile(
  propertyId: string,
  profile: PropertyWealthProfile,
): Promise<{ ok: boolean; message: string; error?: unknown }> {
  const normalizedPropertyId = String(propertyId ?? "").trim();
  if (!normalizedPropertyId) return { ok: false, message: "Objektzuordnung fehlt" };

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, message: "Nicht eingeloggt" };

  const { error } = await supabase.from("property_extra_info").upsert({
    user_id: user.id,
    property_id: normalizedPropertyId,
    wealth_profile: normalizeWealthProfile(profile),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,property_id" });

  if (error) {
    console.error("property wealth profile save failed:", error.message);
    return { ok: false, message: `Supabase Fehler: ${error.message}`, error };
  }
  return { ok: true, message: "In Supabase gespeichert" };
}
