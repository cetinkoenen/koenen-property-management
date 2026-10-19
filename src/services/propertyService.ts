import { supabase } from "@/lib/supabase";
import { listPropertyLoanLedgerRows } from "@/services/propertyLoanLedgerService";

export type Property = {
  id: string;
  property_id?: string | number | null;
  objekt_id?: string | number | null;
  legacyId?: string | number | null;

  name: string | null;
  title: string | null;
  address: string | null;
  city: string | null;
  location: string | null;
  street: string | null;

  purchasePrice: number | null;
  purchase_price: number | null;
  kaufpreis: number | null;

  livingArea: number | null;
  living_area: number | null;
  wohnflaeche: number | null;
  wohnfläche: number | null;

  yearBuilt: number | null;
  year_built: number | null;
  baujahr: number | null;

  created_at: string | null;
  updated_at: string | null;

  source_table?: "properties" | "portfolio_properties";
};

type RawPropertyRow = Record<string, unknown>;
type PropertyTableName = "properties" | "portfolio_properties";

const PROPERTY_TABLES: PropertyTableName[] = ["properties", "portfolio_properties"];

function isShadowName(value: string | null | undefined): boolean {
  return String(value ?? "").toLowerCase().includes("shadow");
}

function cleanDisplayName(value: string | null | undefined, fallback: string | null = null): string | null {
  const cleaned = String(value ?? "")
    .replace(/\s*\(?\s*core[\W_]*shadow\s*\)?/gi, "")
    .replace(/\s*\(?\s*shadow\s*\)?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || fallback;
}

function normalizeNameForMatch(value: string | null | undefined): string {
  return cleanDisplayName(value, "")!
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ß", "ss")
    .replace(/strasse|straße/g, "str")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getBestNameFromRow(row: RawPropertyRow | null | undefined): string | null {
  if (!row) return null;
  return (
    toNullableString(row.name) ??
    toNullableString(row.objektname) ??
    toNullableString(row.object_name) ??
    toNullableString(row.title) ??
    toNullableString(row.bezeichnung) ??
    toNullableString(row.address) ??
    toNullableString(row.street)
  );
}

function isInvalidUuidSyntaxError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const message = String((error as { message?: unknown }).message ?? "").toLowerCase();

  return (
    message.includes("invalid input syntax for type uuid") ||
    message.includes("uuid")
  );
}

function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function toRequiredString(value: unknown): string {
  return String(value ?? "").trim();
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const normalized = value
      .trim()
      .replace(/\s+/g, "")
      .replace(",", ".")
      .replace(/[^\d.-]/g, "");

    if (!normalized) return null;

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizePropertyRow(
  row: RawPropertyRow,
  sourceTable: PropertyTableName,
): Property {
  const purchasePrice =
    toNullableNumber(row.purchasePrice) ??
    toNullableNumber(row.purchase_price) ??
    toNullableNumber(row.kaufpreis);

  const livingArea =
    toNullableNumber(row.livingArea) ??
    toNullableNumber(row.living_area) ??
    toNullableNumber(row.wohnflaeche) ??
    toNullableNumber(row["wohnfläche"]);

  const yearBuilt =
    toNullableNumber(row.yearBuilt) ??
    toNullableNumber(row.year_built) ??
    toNullableNumber(row.baujahr);

  const address =
    toNullableString(row.address) ??
    toNullableString(row.adresse) ??
    toNullableString(row.street) ??
    toNullableString(row.strasse) ??
    toNullableString(row["straße"]);

  const city =
    toNullableString(row.city) ??
    toNullableString(row.stadt);

  const street =
    toNullableString(row.street) ??
    toNullableString(row.strasse) ??
    toNullableString(row["straße"]) ??
    address;

  const location =
    toNullableString(row.location) ??
    toNullableString(row.ort) ??
    city ??
    address;

  const rawName =
    toNullableString(row.name) ??
    toNullableString(row.objektname) ??
    toNullableString(row.object_name);

  const rawTitle =
    toNullableString(row.title) ??
    toNullableString(row.bezeichnung) ??
    rawName ??
    toNullableString(row.objektname);

  const name = cleanDisplayName(rawName, rawName);
  const title = cleanDisplayName(rawTitle, rawTitle ?? name);

  const legacyId =
    (row.property_id ?? row.objekt_id ?? row.legacy_id ?? null) as string | number | null;

  return {
    id: toRequiredString(row.id),
    property_id: (row.property_id ?? null) as string | number | null,
    objekt_id: (row.objekt_id ?? null) as string | number | null,
    legacyId,

    name,
    title,
    address,
    city,
    location,
    street,

    purchasePrice,
    purchase_price: purchasePrice,
    kaufpreis: purchasePrice,

    livingArea,
    living_area: livingArea,
    wohnflaeche: livingArea,
    wohnfläche: livingArea,

    yearBuilt,
    year_built: yearBuilt,
    baujahr: yearBuilt,

    created_at: toNullableString(row.created_at),
    updated_at: toNullableString(row.updated_at),

    source_table: sourceTable,
  };
}

async function fetchByExactId(
  table: PropertyTableName,
  propertyId: string,
): Promise<Property | null> {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("id", propertyId)
    .maybeSingle();

  if (import.meta.env.DEV) console.debug("propertyService.fetchByExactId", {
    table,
    propertyId,
    found: !!data,
    error,
  });

  if (error) {
    if (isInvalidUuidSyntaxError(error)) {
      return null;
    }

    throw new Error(`propertyService.fetchByExactId(${table}) fehlgeschlagen: ${error.message}`);
  }

  return data ? normalizePropertyRow(data as RawPropertyRow, table) : null;
}

async function fetchByLooseId(
  table: PropertyTableName,
  propertyId: string,
): Promise<Property | null> {
  const possibleColumns = ["id", "property_id", "objekt_id", "legacy_id"];
  const numericId = Number(propertyId);
  const canUseNumericId = Number.isFinite(numericId);

  for (const column of possibleColumns) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq(column, propertyId)
      .maybeSingle();

    if (import.meta.env.DEV) console.debug("propertyService.fetchByLooseId.string", {
      table,
      column,
      propertyId,
      found: !!data,
      error,
    });

    if (!error && data) {
      return normalizePropertyRow(data as RawPropertyRow, table);
    }
  }

  if (canUseNumericId) {
    for (const column of possibleColumns) {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq(column, numericId)
        .maybeSingle();

      if (import.meta.env.DEV) console.debug("propertyService.fetchByLooseId.numeric", {
        table,
        column,
        propertyId,
        numericId,
        found: !!data,
        error,
      });

      if (!error && data) {
        return normalizePropertyRow(data as RawPropertyRow, table);
      }
    }
  }

  return null;
}

async function findCanonicalForShadowProperty(shadow: Property): Promise<Property | null> {
  const shadowName = shadow.name ?? shadow.title ?? shadow.address ?? shadow.street;
  const needle = normalizeNameForMatch(shadowName);
  if (!needle) return null;

  for (const table of PROPERTY_TABLES) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .limit(500);

    if (error || !Array.isArray(data)) continue;

    for (const row of data as RawPropertyRow[]) {
      const candidateName = getBestNameFromRow(row);
      if (isShadowName(candidateName)) continue;
      if (normalizeNameForMatch(candidateName) === needle) {
        return normalizePropertyRow(row, table);
      }
    }
  }

  return null;
}

async function findPropertyAcrossTables(
  propertyId: string,
): Promise<Property | null> {
  for (const table of PROPERTY_TABLES) {
    const property = await fetchByExactId(table, propertyId);
    if (property) {
      if (isShadowName(property.name ?? property.title)) {
        return (await findCanonicalForShadowProperty(property)) ?? property;
      }
      return property;
    }
  }

  for (const table of PROPERTY_TABLES) {
    const property = await fetchByLooseId(table, propertyId);
    if (property) {
      if (isShadowName(property.name ?? property.title)) {
        return (await findCanonicalForShadowProperty(property)) ?? property;
      }
      return property;
    }
  }

  return null;
}

async function collectCandidatePropertyIdsFromFinanceTables(): Promise<string[]> {
  const candidateIds = new Set<string>();

  const [results, ledgerRows] = await Promise.all([
    Promise.all([
    supabase.from("property_income").select("property_id").limit(200),
    supabase.from("yearly_property_income").select("property_id").limit(200),
    supabase.from("yearly_capex_entries").select("property_id").limit(200),
    ]),
    listPropertyLoanLedgerRows(),
  ]);

  for (const result of results) {
    const rows = Array.isArray(result.data) ? result.data : [];

    for (const row of rows) {
      const id = String((row as { property_id?: unknown }).property_id ?? "").trim();
      if (id) {
        candidateIds.add(id);
      }
    }
  }

  for (const row of ledgerRows) candidateIds.add(row.propertyId);

  return Array.from(candidateIds);
}

export async function getPropertyById(propertyId: string): Promise<Property | null> {
  const trimmedPropertyId = String(propertyId ?? "").trim();

  if (!trimmedPropertyId) {
    throw new Error("Es wurde keine gültige propertyId übergeben.");
  }

  return findPropertyAcrossTables(trimmedPropertyId);
}

export async function getFirstProperty(): Promise<Property | null> {
  for (const table of PROPERTY_TABLES) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .limit(1);

    if (import.meta.env.DEV) console.debug("propertyService.getFirstProperty", {
      table,
      rowCount: Array.isArray(data) ? data.length : 0,
      error,
    });

    if (error) {
      continue;
    }

    const firstRow = Array.isArray(data) ? data[0] : null;
    if (firstRow) {
      return normalizePropertyRow(firstRow as RawPropertyRow, table);
    }
  }

  return null;
}

export async function getFirstPropertyWithData(): Promise<Property | null> {
  const candidateIds = await collectCandidatePropertyIdsFromFinanceTables();

  for (const candidateId of candidateIds) {
    const property = await findPropertyAcrossTables(candidateId);

    if (import.meta.env.DEV) console.debug("propertyService.getFirstPropertyWithData.candidate", {
      candidateId,
      found: !!property,
    });

    if (property) {
      return property;
    }
  }

  return null;
}

const propertyService = {
  getPropertyById,
  getFirstProperty,
  getFirstPropertyWithData,
};

export default propertyService;
