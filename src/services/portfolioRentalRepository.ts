import { supabase } from "../lib/supabase";

export const PORTFOLIO_RENTAL_SELECT = [
  "id",
  "property_id",
  "unit_id",
  "rent_type",
  "rent_monthly",
  "kaltmiete_laut_mietvertrag",
  "nebenkosten",
  "gesamt_mietkosten",
  "start_date",
  "end_date",
  "created_at",
  "updated_at",
].join(",");

export type PortfolioRentalRepositoryRow = {
  id: string;
  property_id: string;
  unit_id: string | null;
  rent_type: string | null;
  rent_monthly: unknown;
  kaltmiete_laut_mietvertrag: unknown;
  nebenkosten: unknown;
  gesamt_mietkosten: unknown;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type PortfolioUnitRepositoryRow = {
  id: string;
  name: string | null;
  unit_type: string | null;
  property_id: string;
};

export type ListPortfolioRentalsOptions = {
  propertyId?: string;
  propertyIds?: string[];
  ascending?: boolean;
  pageSize?: number;
};

export type ListPortfolioUnitsOptions = {
  propertyId?: string;
  propertyIds?: string[];
  pageSize?: number;
};

function uniqueIds(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

/**
 * Verbindliche Lesefunktion für die historische Vermietungszeitreihe.
 *
 * PostgREST begrenzt Antworten serverseitig. Alle Fachseiten laden deshalb
 * dieselben vollständigen, deterministisch sortierten Zeiträume seitenweise.
 */
export async function listPortfolioRentals(
  options: ListPortfolioRentalsOptions = {},
): Promise<PortfolioRentalRepositoryRow[]> {
  const pageSize = Math.max(1, Math.min(1000, options.pageSize ?? 500));
  const ascending = options.ascending ?? true;
  const propertyIds = uniqueIds(options.propertyIds);
  const rows: PortfolioRentalRepositoryRow[] = [];

  if (options.propertyIds && propertyIds.length === 0) return rows;

  for (let offset = 0; ; offset += pageSize) {
    let query = supabase
      .from("portfolio_property_rentals")
      .select(PORTFOLIO_RENTAL_SELECT);

    if (options.propertyId) query = query.eq("property_id", options.propertyId);
    else if (propertyIds.length) query = query.in("property_id", propertyIds);

    const { data, error } = await query
      .order("start_date", { ascending, nullsFirst: false })
      .order("id", { ascending })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    const page = (data ?? []) as unknown as PortfolioRentalRepositoryRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

/** Lesbare Einheiten für die Zuordnung technischer unit_id-Werte. */
export async function listPortfolioUnits(
  options: ListPortfolioUnitsOptions = {},
): Promise<PortfolioUnitRepositoryRow[]> {
  const pageSize = Math.max(1, Math.min(1000, options.pageSize ?? 500));
  const propertyIds = uniqueIds(options.propertyIds);
  const rows: PortfolioUnitRepositoryRow[] = [];

  if (options.propertyIds && propertyIds.length === 0) return rows;

  for (let offset = 0; ; offset += pageSize) {
    let query = supabase
      .from("portfolio_units")
      .select("id,name,unit_type,property_id");

    if (options.propertyId) query = query.eq("property_id", options.propertyId);
    else if (propertyIds.length) query = query.in("property_id", propertyIds);

    const { data, error } = await query
      .order("property_id", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    const page = (data ?? []) as unknown as PortfolioUnitRepositoryRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}
