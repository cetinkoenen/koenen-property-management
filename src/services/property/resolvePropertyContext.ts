import { supabase } from "../../lib/supabaseClient";
import { expandPropertyIdAliases, type PropertyIdAliasRow } from "../../lib/propertyIdAliases";

function toSafeString(value: unknown): string {
  return String(value ?? "").trim();
}

function cleanDisplayName(value: string | undefined): string | undefined {
  const cleaned = String(value ?? "")
    .replace(/\s*\(?\s*core[\W_]*shadow\s*\)?/gi, "")
    .replace(/\s*\(?\s*shadow\s*\)?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || undefined;
}

function isShadowName(value: string | undefined): boolean {
  return String(value ?? "").toLowerCase().includes("shadow");
}

function normalizeNameForMatch(value: string | undefined): string {
  return String(cleanDisplayName(value) ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ß", "ss")
    .replace(/strasse|straße/g, "str")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function pickRawDisplayName(row: Record<string, unknown> | null | undefined): string | undefined {
  if (!row) return undefined;
  return [row.name, row.title, row.property_name, row.object_name, row.address, row.street]
    .map(toSafeString)
    .find(Boolean);
}

function pickDisplayName(row: Record<string, unknown> | null | undefined): string | undefined {
  return cleanDisplayName(pickRawDisplayName(row));
}

function pickAddress(row: Record<string, unknown> | null | undefined): string | undefined {
  if (!row) return undefined;
  return [row.address, row.street, row.location, row.city]
    .map(toSafeString)
    .find(Boolean);
}

async function aliasesForKnownPropertyIds(ids: string[]): Promise<string[]> {
  const { data, error } = await supabase
    .from("property_id_aliases")
    .select("object_id,legacy_property_id")
    .limit(500);
  if (error) {
    console.warn("property_id_aliases load failed:", error.message);
    return [];
  }
  return expandPropertyIdAliases(ids, (data ?? []) as PropertyIdAliasRow[]);
}

async function bridgeCandidatesForContext(ids: string[], displayName?: string): Promise<string[]> {
  const cleanIds = Array.from(new Set(ids.map(toSafeString).filter(Boolean)));
  const result: string[] = [];

  for (const id of cleanIds) {
    const byPropertyId = await supabase
      .from("v_koenen_object_bridge")
      .select("object_id, property_id")
      .eq("property_id", id)
      .maybeSingle();

    if (!byPropertyId.error && byPropertyId.data) {
      result.push(toSafeString(byPropertyId.data.object_id), toSafeString(byPropertyId.data.property_id));
    }

    const byObjectId = await supabase
      .from("v_koenen_object_bridge")
      .select("object_id, property_id")
      .eq("object_id", id)
      .maybeSingle();

    if (!byObjectId.error && byObjectId.data) {
      result.push(toSafeString(byObjectId.data.object_id), toSafeString(byObjectId.data.property_id));
    }
  }

  const normalizedName = normalizeNameForMatch(displayName);
  if (normalizedName) {
    const byName = await supabase
      .from("v_koenen_object_bridge")
      .select("property_name, object_id, property_id")
      .limit(100);

    if (!byName.error && Array.isArray(byName.data)) {
      for (const row of byName.data as Record<string, unknown>[]) {
        if (normalizeNameForMatch(toSafeString(row.property_name)) === normalizedName) {
          result.push(toSafeString(row.object_id), toSafeString(row.property_id));
        }
      }
    }
  }

  return Array.from(new Set(result.filter(Boolean)));
}

async function hasRows(table: string, propertyId: string): Promise<boolean> {
  if (!propertyId) return false;

  const { data, error } = await supabase
    .from(table)
    .select("property_id")
    .eq("property_id", propertyId)
    .limit(1);

  return !error && Array.isArray(data) && data.length > 0;
}

async function bestIdForTables(candidates: string[], tables: string[]): Promise<string> {
  const cleanCandidates = Array.from(new Set(candidates.map(toSafeString).filter(Boolean)));
  for (const candidate of cleanCandidates) {
    const checks = await Promise.all(tables.map((table) => hasRows(table, candidate)));
    if (checks.some(Boolean)) return candidate;
  }
  return cleanCandidates[0] ?? "";
}

export async function resolvePropertyContext(propertyId: string) {
  const routeId = toSafeString(propertyId);
  if (!routeId) return null;

  const [propertyById, portfolioById, portfolioByCoreId] = await Promise.all([
    supabase.from("properties").select("*").eq("id", routeId).maybeSingle(),
    supabase.from("portfolio_properties").select("*").eq("id", routeId).maybeSingle(),
    supabase.from("portfolio_properties").select("*").eq("core_property_id", routeId).maybeSingle(),
  ]);

  if (propertyById.error) console.warn("resolvePropertyContext properties error:", propertyById.error.message);
  if (portfolioById.error) console.warn("resolvePropertyContext portfolio id error:", portfolioById.error.message);
  if (portfolioByCoreId.error) console.warn("resolvePropertyContext portfolio core error:", portfolioByCoreId.error.message);

  let portfolio = (portfolioById.data ?? portfolioByCoreId.data ?? null) as Record<string, unknown> | null;
  let property = (propertyById.data ?? null) as Record<string, unknown> | null;

  // Shadow-/Core-Spiegelobjekte dürfen im UI nicht als echte Objekte erscheinen.
  // Falls eine alte Route direkt auf ein Shadow-Objekt zeigt, versuchen wir ein
  // kanonisches Portfolio-/Property-Objekt mit demselben bereinigten Namen zu finden.
  const routeDisplayName = pickRawDisplayName(portfolio) ?? pickRawDisplayName(property);
  if (isShadowName(routeDisplayName)) {
    const needle = normalizeNameForMatch(routeDisplayName);
    const [allPortfolio, allProperties] = await Promise.all([
      supabase.from("portfolio_properties").select("*").limit(500),
      supabase.from("properties").select("*").limit(500),
    ]);

    const portfolioMatch = Array.isArray(allPortfolio.data)
      ? (allPortfolio.data as Record<string, unknown>[]).find((row) => !isShadowName(pickRawDisplayName(row)) && normalizeNameForMatch(pickRawDisplayName(row)) === needle)
      : null;
    const propertyMatch = Array.isArray(allProperties.data)
      ? (allProperties.data as Record<string, unknown>[]).find((row) => !isShadowName(pickRawDisplayName(row)) && normalizeNameForMatch(pickRawDisplayName(row)) === needle)
      : null;

    portfolio = portfolioMatch ?? portfolio;
    property = propertyMatch ?? property;
  }
  const corePropertyId = toSafeString(portfolio?.core_property_id) || toSafeString(property?.id);
  const portfolioPropertyId = toSafeString(portfolio?.id);
  const displayName = cleanDisplayName(pickDisplayName(portfolio) ?? pickDisplayName(property));
  const address = cleanDisplayName(pickAddress(portfolio) ?? pickAddress(property));

  const baseCandidates = [routeId, corePropertyId, portfolioPropertyId].filter(Boolean);
  const bridgeCandidates = await bridgeCandidatesForContext(baseCandidates, displayName ?? address);
  const knownAliasCandidates = await aliasesForKnownPropertyIds([...baseCandidates, ...bridgeCandidates]);
  const candidates = Array.from(
    new Set([...baseCandidates, ...bridgeCandidates, ...knownAliasCandidates].map(toSafeString).filter(Boolean))
  );

  const incomePropertyId = await bestIdForTables(candidates, [
    "property_income",
    "yearly_property_income",
    "yearly_capex_entries",
  ]);
  const ledgerPropertyId = await bestIdForTables(candidates, ["property_loan_ledger"]);

  return {
    propertyId: routeId,
    property: property ?? portfolio ?? null,
    incomePropertyId: incomePropertyId || routeId,
    ledgerPropertyId: ledgerPropertyId || routeId,
    portfolioPropertyId: portfolioPropertyId || undefined,
    corePropertyId: corePropertyId || undefined,
    displayName,
    address,
  };
}

export type ResolvedPropertyContext = {
  propertyId: string;
  property: Record<string, unknown> | null;
  incomePropertyId?: string;
  ledgerPropertyId?: string;
  portfolioPropertyId?: string;
  corePropertyId?: string;
  displayName?: string;
  address?: string;
};
