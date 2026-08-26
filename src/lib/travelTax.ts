import { parseLocaleNumber } from "../utils/numberParser";

export const TRAVEL_RATE_EUR = 0.3;
export const ONE_DAY_VMA_EUR = 16;
export const ARRIVAL_DEPARTURE_VMA_EUR = 16;
export const FULL_DAY_VMA_EUR = 32;
export const BREAKFAST_DEDUCTION_EUR = 6.4;

export type TravelTransportMode = "car" | "public_transport";

export type TravelTaxInput = {
  transportMode: TravelTransportMode;
  distanceKm: number | string;
  roundTrip: boolean;
  ticketGross?: number | string | null;
  multiDay?: boolean;
  hotelGross?: number | string | null;
  overnightCount?: number | string | null;
  breakfastIncluded?: boolean;
};

export type TravelTaxBreakdown = {
  transportMode: TravelTransportMode;
  travelCosts: number;
  ticketCosts: number;
  hotelCosts: number;
  vmaAmount: number;
  totalAmount: number;
  taxableKilometers: number;
  overnightCount: number;
};

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function num(value: unknown): number {
  return Math.max(0, parseLocaleNumber(value, 0));
}

export function calculateTravelTax(input: TravelTaxInput): TravelTaxBreakdown {
  const transportMode = input.transportMode === "public_transport" ? "public_transport" : "car";
  const distance = num(input.distanceKm);
  const taxableKilometers = transportMode === "car" ? distance * (input.roundTrip ? 2 : 1) : 0;
  const ticketCosts = transportMode === "public_transport" ? num(input.ticketGross) : 0;
  const travelCosts = transportMode === "car" ? taxableKilometers * TRAVEL_RATE_EUR : ticketCosts;
  const overnightCount = input.multiDay ? Math.max(1, Math.round(num(input.overnightCount || 1))) : 0;
  const hotelCosts = input.multiDay ? num(input.hotelGross) : 0;

  const baseVma = input.multiDay
    ? ARRIVAL_DEPARTURE_VMA_EUR * 2 + Math.max(0, overnightCount - 1) * FULL_DAY_VMA_EUR
    : ONE_DAY_VMA_EUR;
  const breakfastDays = input.multiDay && input.breakfastIncluded ? overnightCount + 1 : 0;
  const vmaAmount = Math.max(0, baseVma - breakfastDays * BREAKFAST_DEDUCTION_EUR);

  return {
    transportMode,
    travelCosts: money(travelCosts),
    ticketCosts: money(ticketCosts),
    hotelCosts: money(hotelCosts),
    vmaAmount: money(vmaAmount),
    totalAmount: money(travelCosts + hotelCosts + vmaAmount),
    taxableKilometers: money(taxableKilometers),
    overnightCount,
  };
}

export function splitSection35aTripCosts(totalTripCosts: number, homeOfficePercentage: number) {
  const percent = Math.min(100, Math.max(0, Number.isFinite(homeOfficePercentage) ? homeOfficePercentage : 0));
  const homeOfficeAmount = money(totalTripCosts * (percent / 100));
  return {
    homeOfficeAmount,
    section35aAmount: money(Math.max(0, totalTripCosts - homeOfficeAmount)),
  };
}
