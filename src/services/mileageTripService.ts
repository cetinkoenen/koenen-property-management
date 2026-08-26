import { supabase } from "../lib/supabaseClient";
import { calculateTravelTax, TRAVEL_RATE_EUR, type TravelTransportMode } from "../lib/travelTax";
import { parseLocaleNumber } from "../utils/numberParser";

export const MILEAGE_TRIP_REASONS = [
  "Handwerkertermin",
  "Eigentümerversammlung",
  "Mieterwechsel/Besichtigung",
  "Kontrollfahrt",
  "Bank-/Notartermin",
] as const;

export type MileageTripReason = (typeof MILEAGE_TRIP_REASONS)[number];

export type MileageTripRow = {
  id: string;
  user_id?: string;
  property_id: string | null;
  portfolio_property_id: string | null;
  property_label: string;
  trip_scope: "property" | "investment";
  investment_address: string | null;
  datum: string;
  grund: MileageTripReason;
  start_adresse: string;
  zieladresse: string;
  distanz_km: number;
  hin_und_rueckfahrt: boolean;
  verkehrsmittel: TravelTransportMode;
  ticketpreis_brutto: number;
  mehrtaegige_reise: boolean;
  hotelkosten_brutto: number;
  anzahl_uebernachtungen: number;
  fruehstueck_inklusive: boolean;
  vma_betrag: number;
  fahrtkosten_betrag: number;
  reisekosten_betrag: number;
  berechneter_betrag: number;
  beleg_url: string | null;
  steuerjahr: number;
  created_at?: string;
  updated_at?: string;
};

export type MileageTripInput = {
  id?: string;
  property_id?: string | null;
  portfolio_property_id?: string | null;
  property_label: string;
  trip_scope?: "property" | "investment";
  investment_address?: string | null;
  datum: string;
  grund: MileageTripReason;
  start_adresse: string;
  zieladresse: string;
  distanz_km: number | string;
  hin_und_rueckfahrt: boolean;
  verkehrsmittel?: TravelTransportMode;
  ticketpreis_brutto?: number | string | null;
  mehrtaegige_reise?: boolean;
  hotelkosten_brutto?: number | string | null;
  anzahl_uebernachtungen?: number | string | null;
  fruehstueck_inklusive?: boolean;
  beleg_url?: string | null;
};

export type MileageTripFilters = {
  propertyId?: string;
  year?: number;
  scope?: "property" | "investment";
};

export const MILEAGE_RECEIPT_BUCKET = "property-mileage-receipts";
export const MILEAGE_RATE_EUR = TRAVEL_RATE_EUR;

function toNumber(value: unknown, fallback = 0) {
  return parseLocaleNumber(value, fallback);
}

function normalizeRow(row: Record<string, unknown>): MileageTripRow {
  return {
    id: String(row.id ?? ""),
    user_id: row.user_id ? String(row.user_id) : undefined,
    property_id: row.property_id ? String(row.property_id) : null,
    portfolio_property_id: row.portfolio_property_id ? String(row.portfolio_property_id) : null,
    property_label: String(row.property_label ?? ""),
    trip_scope: row.trip_scope === "investment" ? "investment" : "property",
    investment_address: row.investment_address ? String(row.investment_address) : null,
    datum: String(row.datum ?? ""),
    grund: MILEAGE_TRIP_REASONS.includes(row.grund as MileageTripReason) ? (row.grund as MileageTripReason) : "Kontrollfahrt",
    start_adresse: String(row.start_adresse ?? ""),
    zieladresse: String(row.zieladresse ?? ""),
    distanz_km: toNumber(row.distanz_km),
    hin_und_rueckfahrt: row.hin_und_rueckfahrt !== false,
    verkehrsmittel: row.verkehrsmittel === "public_transport" ? "public_transport" : "car",
    ticketpreis_brutto: toNumber(row.ticketpreis_brutto),
    mehrtaegige_reise: row.mehrtaegige_reise === true,
    hotelkosten_brutto: toNumber(row.hotelkosten_brutto),
    anzahl_uebernachtungen: Math.max(0, Math.round(toNumber(row.anzahl_uebernachtungen))),
    fruehstueck_inklusive: row.fruehstueck_inklusive === true,
    vma_betrag: toNumber(row.vma_betrag),
    fahrtkosten_betrag: toNumber(row.fahrtkosten_betrag),
    reisekosten_betrag: toNumber(row.reisekosten_betrag),
    berechneter_betrag: toNumber(row.berechneter_betrag),
    beleg_url: row.beleg_url ? String(row.beleg_url) : null,
    steuerjahr: Number(row.steuerjahr ?? 0),
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100) || "beleg";
}

export function calculateMileageAmount(distanceKm: number | string, roundTrip: boolean) {
  return calculateTravelTax({ transportMode: "car", distanceKm, roundTrip }).travelCosts;
}

export function calculateMileageTripAmount(input: Pick<MileageTripInput, "verkehrsmittel" | "distanz_km" | "hin_und_rueckfahrt" | "ticketpreis_brutto" | "mehrtaegige_reise" | "hotelkosten_brutto" | "anzahl_uebernachtungen" | "fruehstueck_inklusive">) {
  return calculateTravelTax({
    transportMode: input.verkehrsmittel ?? "car",
    distanceKm: input.distanz_km,
    roundTrip: input.hin_und_rueckfahrt,
    ticketGross: input.ticketpreis_brutto,
    multiDay: input.mehrtaegige_reise,
    hotelGross: input.hotelkosten_brutto,
    overnightCount: input.anzahl_uebernachtungen,
    breakfastIncluded: input.fruehstueck_inklusive,
  });
}

export function extractMileageTaxYear(date: string) {
  const year = Number(String(date).slice(0, 4));
  return Number.isFinite(year) ? year : new Date().getFullYear();
}

export async function listMileageTrips(filters: MileageTripFilters = {}): Promise<MileageTripRow[]> {
  let query = supabase
    .from("property_mileage_trips")
    .select("*")
    .order("datum", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters.propertyId) query = query.eq("property_id", filters.propertyId);
  if (filters.year) query = query.eq("steuerjahr", filters.year);
  if (filters.scope) query = query.eq("trip_scope", filters.scope);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => normalizeRow(row as Record<string, unknown>));
}

export async function saveMileageTrip(input: MileageTripInput): Promise<MileageTripRow> {
  const distance = Math.max(0, toNumber(input.distanz_km));
  const breakdown = calculateMileageTripAmount(input);
  const payload = {
    property_id: input.property_id || null,
    portfolio_property_id: input.portfolio_property_id ?? null,
    property_label: input.property_label.trim(),
    trip_scope: input.trip_scope ?? (input.property_id ? "property" : "investment"),
    investment_address: input.investment_address?.trim() || null,
    datum: input.datum,
    grund: input.grund,
    start_adresse: input.start_adresse.trim(),
    zieladresse: input.zieladresse.trim(),
    distanz_km: distance,
    hin_und_rueckfahrt: input.hin_und_rueckfahrt,
    verkehrsmittel: input.verkehrsmittel ?? "car",
    ticketpreis_brutto: breakdown.ticketCosts,
    mehrtaegige_reise: input.mehrtaegige_reise === true,
    hotelkosten_brutto: breakdown.hotelCosts,
    anzahl_uebernachtungen: breakdown.overnightCount,
    fruehstueck_inklusive: input.fruehstueck_inklusive === true,
    vma_betrag: breakdown.vmaAmount,
    fahrtkosten_betrag: breakdown.travelCosts,
    reisekosten_betrag: breakdown.totalAmount,
    beleg_url: input.beleg_url?.trim() || null,
  };

  const request = input.id
    ? supabase.from("property_mileage_trips").update(payload).eq("id", input.id).select("*").single()
    : supabase.from("property_mileage_trips").insert(payload).select("*").single();

  const { data, error } = await request;
  if (error) throw error;
  return normalizeRow((data ?? {}) as Record<string, unknown>);
}

export async function deleteMileageTrip(id: string) {
  const { error } = await supabase.from("property_mileage_trips").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadMileageReceipt(propertyId: string, file: File) {
  const filePath = `${propertyId}/${Date.now()}-${sanitizeFileName(file.name)}`;
  const { error } = await supabase.storage
    .from(MILEAGE_RECEIPT_BUCKET)
    .upload(filePath, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw error;
  return filePath;
}

export async function openMileageReceipt(path: string) {
  const { data, error } = await supabase.storage
    .from(MILEAGE_RECEIPT_BUCKET)
    .createSignedUrl(path, 60 * 5);
  if (error) throw error;
  if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}
