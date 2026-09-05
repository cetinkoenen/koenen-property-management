import { useEffect, useMemo, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Calculator, CheckCircle2, FileText, Home, Lock, Pencil, Plus, Printer, Trash2, UserSquare2, Warehouse } from "lucide-react";
import brandLogo from "../assets/koenen-brand-logo.webp";
import { supabase } from "../lib/supabase";
import { listNkRelevantEntries, type NkRelevantEntry } from "../services/nkRelevantService";

type AllocationType = "allocationKey" | "persons" | "directAmount" | "heatingDirect";

type ObjectOption = { objekt_code: string; label: string };
type ApartmentRow = { id: string; label: string; tenantName: string; area: number; allocationKey: number; persons: number; occupancyMonths: number; advancePayments: number; co2LandlordDeductionKalo: number; active: boolean };
type CostRow = { id: string; label: string; amount: number; allocation: AllocationType; totalKey: number; apartmentKey: number; directAmount: number; prorateByOccupancy: boolean; note: string };
type HeatingSettings = { totalHeatingCost: number; totalWarmWaterCost: number; totalCo2Cost: number; totalConsumptionKwh: number; emissionFactor: number; heatedArea: number };
type NkWorkflowStatus = "offen" | "In Arbeit" | "in Prüfung" | "Freigegeben" | "Korrigiert";
type BuildingMeta = { propertyCode: string; propertyLabel: string; billingYear: number; periodFrom: string; periodTo: string; landlordName: string; landlordAddress: string; attachmentReferences: string; workflowStatus: NkWorkflowStatus; locked: boolean };
type BillingWorkspace = { meta: BuildingMeta; apartments: ApartmentRow[]; costs: CostRow[]; heating: HeatingSettings; selectedApartmentId: string | null };
type BillingRecord = { id: string; name: string; workspace: BillingWorkspace };
type BillingCollection = { version: 2; selectedBillingId: string | null; billings: BillingRecord[] };
type Co2StageResult = { stage: number; tenantPercent: number; landlordPercent: number };

function createId() { return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function roundMoney(v: number) { return Math.round((v + Number.EPSILON) * 100) / 100; }
function clamp(v: number, min: number, max: number) { return Math.min(Math.max(v, min), max); }
function parseGermanNumber(value: string) { const n = Number(value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; }
function formatCurrency(value: number) { return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number.isFinite(value) ? value : 0); }
function formatNumber(value: number, decimals = 2) { return Number.isFinite(value) ? value.toLocaleString("de-DE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : ""; }
function formatFlex(value: number) { return Number.isFinite(value) ? value.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 4 }) : ""; }
function formatDate(value: string) { const d = new Date(`${value}T00:00:00`); return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat("de-DE").format(d); }
function safeFilename(value: string) { return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120) || "NK-Abrechnung"; }
function downloadText(filename: string, content: string) { const blob = new Blob(["\uFEFF" + content], { type: "text/plain;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
function allocationLabel(t: AllocationType) { return t === "allocationKey" ? "Umlageschlüssel" : t === "persons" ? "Personen/Tage" : t === "directAmount" ? "Direktbetrag" : "KALO-Direktbetrag"; }
function getCo2Stage(co2PerSqm: number): Co2StageResult { if (co2PerSqm < 12) return { stage: 1, tenantPercent: 100, landlordPercent: 0 }; if (co2PerSqm < 17) return { stage: 2, tenantPercent: 90, landlordPercent: 10 }; if (co2PerSqm < 22) return { stage: 3, tenantPercent: 80, landlordPercent: 20 }; if (co2PerSqm < 27) return { stage: 4, tenantPercent: 70, landlordPercent: 30 }; if (co2PerSqm < 32) return { stage: 5, tenantPercent: 60, landlordPercent: 40 }; if (co2PerSqm < 37) return { stage: 6, tenantPercent: 50, landlordPercent: 50 }; if (co2PerSqm < 42) return { stage: 7, tenantPercent: 40, landlordPercent: 60 }; if (co2PerSqm < 47) return { stage: 8, tenantPercent: 30, landlordPercent: 70 }; if (co2PerSqm < 52) return { stage: 9, tenantPercent: 20, landlordPercent: 80 }; return { stage: 10, tenantPercent: 5, landlordPercent: 95 }; }
function isGarage(o: ObjectOption) { const t = `${o.objekt_code} ${o.label}`.toLowerCase(); return t.includes("garage") || t.includes("garagen") || t.includes("tg") || t.includes("tiefgarage"); }


type HeatingMode = "kalo" | "separate_contract" | "bescheid" | "none";
type NkPropertyConfig = {
  match: string[];
  displayName: string;
  defaultTotalKey: number;
  defaultApartmentKey: number;
  defaultArea: number;
  heatingMode: HeatingMode;
  co2Enabled: boolean;
  note: string;
  costs: Array<Omit<CostRow, "id">>;
};

const COLMARER_COSTS: Array<Omit<CostRow, "id">> = [
  { label: "Wasser / Kanal", amount: 4357.3, allocation: "allocationKey", totalKey: 9911, apartmentKey: 365, directAmount: 0, prorateByOccupancy: true, note: "Colmarer 2025: erst Jahresanteil laut Hausverwaltung 160,47 € (= 4.357,30 × 365 / 9.911), dann bei 7 Monaten 160,47 / 12 × 7 = 93,61 €." },
  { label: "Heiz- und Warmwasserkosten", amount: 23175.9, allocation: "heatingDirect", totalKey: 0, apartmentKey: 0, directAmount: 474.25, prorateByOccupancy: false, note: "KALO-Direktbetrag hier eintragen. Erste Periode 474,25 €, zweite Periode 353,44 €. Keine zusätzliche Wärmeversorgung anlegen." },
  { label: "Straßenreinigung", amount: 2119.29, allocation: "allocationKey", totalKey: 10000, apartmentKey: 170.99, directAmount: 0, prorateByOccupancy: false, note: "MEA gesamt" },
  { label: "Müllabfuhr", amount: 3338.39, allocation: "allocationKey", totalKey: 9911, apartmentKey: 365, directAmount: 0, prorateByOccupancy: true, note: "Colmarer 2025: Jahresanteil 122,95 € (= 3.338,39 × 365 / 9.911), bei 7 Monaten 71,72 €." },
  { label: "Gebäudereinigung", amount: 7699.48, allocation: "allocationKey", totalKey: 9613.01, apartmentKey: 170.99, directAmount: 0, prorateByOccupancy: false, note: "MEA ohne Garagen" },
  { label: "Gartenpflege", amount: 3768.12, allocation: "allocationKey", totalKey: 10000, apartmentKey: 170.99, directAmount: 0, prorateByOccupancy: false, note: "MEA gesamt" },
  { label: "Allgemeinstrom", amount: 696.01, allocation: "allocationKey", totalKey: 9911, apartmentKey: 365, directAmount: 0, prorateByOccupancy: true, note: "Colmarer 2025: Jahresanteil 25,63 € (= 696,01 × 365 / 9.911), bei 7 Monaten 14,95 €." },
  { label: "Haftpflichtversicherung", amount: 449.88, allocation: "allocationKey", totalKey: 10000, apartmentKey: 170.99, directAmount: 0, prorateByOccupancy: false, note: "MEA gesamt" },
  { label: "Gebäudeversicherung", amount: 10970.93, allocation: "allocationKey", totalKey: 10000, apartmentKey: 170.99, directAmount: 0, prorateByOccupancy: false, note: "MEA gesamt" },
  { label: "Glasbruchschadenversicherung", amount: 340.74, allocation: "allocationKey", totalKey: 10000, apartmentKey: 170.99, directAmount: 0, prorateByOccupancy: false, note: "MEA gesamt" },
  { label: "Wartung Pumpen / Hebeanlage", amount: 201.11, allocation: "allocationKey", totalKey: 10000, apartmentKey: 170.99, directAmount: 0, prorateByOccupancy: false, note: "MEA gesamt" },
  { label: "Grundsteuer", amount: 321.6, allocation: "directAmount", totalKey: 0, apartmentKey: 0, directAmount: 321.6, prorateByOccupancy: false, note: "Direkt laut Bescheid / eigener Ansatz" },
  { label: "Dachrinnenreinigung", amount: 0, allocation: "directAmount", totalKey: 0, apartmentKey: 0, directAmount: 0, prorateByOccupancy: false, note: "Nur eintragen, wenn Kosten vorhanden" },
];

function genericCosts(totalKey: number, apartmentKey: number): Array<Omit<CostRow, "id">> {
  return [
    { label: "Gebäudeversicherung", amount: 0, allocation: "allocationKey", totalKey, apartmentKey, directAmount: 0, prorateByOccupancy: false, note: "Betrag laut Hausgeld-/Betriebskostenabrechnung eintragen." },
    { label: "Haftpflichtversicherung", amount: 0, allocation: "allocationKey", totalKey, apartmentKey, directAmount: 0, prorateByOccupancy: false, note: "Betrag laut Abrechnung eintragen." },
    { label: "Straßenreinigung", amount: 0, allocation: "allocationKey", totalKey, apartmentKey, directAmount: 0, prorateByOccupancy: false, note: "Betrag laut Abrechnung eintragen." },
    { label: "Wasser / Abwasser", amount: 0, allocation: "allocationKey", totalKey, apartmentKey, directAmount: 0, prorateByOccupancy: true, note: "Bei Wasser ggf. Sonderverteiler/Personentage aus Bescheid verwenden." },
    { label: "Müllabfuhr", amount: 0, allocation: "allocationKey", totalKey, apartmentKey, directAmount: 0, prorateByOccupancy: true, note: "Betrag laut Abrechnung eintragen." },
    { label: "Gebäudereinigung", amount: 0, allocation: "allocationKey", totalKey, apartmentKey, directAmount: 0, prorateByOccupancy: false, note: "Betrag laut Abrechnung eintragen." },
    { label: "Gartenpflege", amount: 0, allocation: "allocationKey", totalKey, apartmentKey, directAmount: 0, prorateByOccupancy: false, note: "Betrag laut Abrechnung eintragen." },
    { label: "Allgemeinstrom / Hausstrom", amount: 0, allocation: "allocationKey", totalKey, apartmentKey, directAmount: 0, prorateByOccupancy: false, note: "Betrag laut Abrechnung eintragen." },
    { label: "Grundsteuer", amount: 0, allocation: "directAmount", totalKey: 0, apartmentKey: 0, directAmount: 0, prorateByOccupancy: false, note: "Direktbetrag laut Bescheid." },
  ];
}

const PROPERTY_BILLING_CONFIGS: NkPropertyConfig[] = [
  { match: ["colmarer"], displayName: "Colmarer Str. 45", defaultTotalKey: 10000, defaultApartmentKey: 170.99, defaultArea: 36, heatingMode: "kalo", co2Enabled: true, note: "Colmarer ist das Referenzobjekt: KALO-Heizkosten, CO₂KostAufG und 2025-Teilabrechnungen bleiben aktiv.", costs: COLMARER_COSTS },
  { match: ["elsasser", "elsässer"], displayName: "Elsasser Str. 52", defaultTotalKey: 1000, defaultApartmentKey: 100, defaultArea: 39, heatingMode: "separate_contract", co2Enabled: false, note: "Wohnung 39 m², Gesamtfläche 422 m². Keine Heizkosten/CO₂, weil der Mieter einen separaten Vertrag mit dem Energieversorger hat.", costs: [
    { label: "Gebäudeversicherung", amount: 3715.38, allocation: "allocationKey", totalKey: 1000, apartmentKey: 100, directAmount: 0, prorateByOccupancy: false, note: "1000stel laut Bescheid." },
    { label: "Haftpflichtversicherung", amount: 114.43, allocation: "allocationKey", totalKey: 1000, apartmentKey: 100, directAmount: 0, prorateByOccupancy: false, note: "1000stel laut Bescheid." },
    { label: "Straßenreinigung", amount: 386.52, allocation: "allocationKey", totalKey: 1000, apartmentKey: 100, directAmount: 0, prorateByOccupancy: false, note: "1000stel laut Bescheid." },
    { label: "Wasser / Abwasser", amount: 2868.95, allocation: "allocationKey", totalKey: 2868.95, apartmentKey: 328.57, directAmount: 0, prorateByOccupancy: true, note: "Wasserkosten Techem; Ihr Anteil laut Bescheid 328,57." },
    { label: "Gartenwasser", amount: 147.18, allocation: "allocationKey", totalKey: 1000, apartmentKey: 100, directAmount: 0, prorateByOccupancy: false, note: "1000stel laut Bescheid." },
    { label: "Hausstrom", amount: 178.64, allocation: "allocationKey", totalKey: 1000, apartmentKey: 100, directAmount: 0, prorateByOccupancy: false, note: "1000stel laut Bescheid." },
    { label: "Grundsteuer", amount: 0, allocation: "directAmount", totalKey: 0, apartmentKey: 0, directAmount: 0, prorateByOccupancy: false, note: "Direktbetrag laut Grundsteuerbescheid ergänzen." },
  ] },
  { match: ["fürther", "fuerther"], displayName: "Fürther Str. 74", defaultTotalKey: 829, defaultApartmentKey: 45, defaultArea: 45, heatingMode: "separate_contract", co2Enabled: false, note: "Wohnung 45 m², Gesamtfläche 829 m². Keine Heizkosten/CO₂, weil der Mieter einen separaten Vertrag mit dem Energieversorger hat.", costs: [
    { label: "Versicherungen", amount: 7173.60, allocation: "allocationKey", totalKey: 10000, apartmentKey: 524, directAmount: 0, prorateByOccupancy: false, note: "Miteigentumsanteil laut Bescheid." },
    { label: "Gebäudereinigung", amount: 4010.64, allocation: "allocationKey", totalKey: 14, apartmentKey: 1, directAmount: 0, prorateByOccupancy: false, note: "Je Wohnung laut Bescheid." },
    { label: "Gehwegreinigung", amount: 702.07, allocation: "allocationKey", totalKey: 14, apartmentKey: 1, directAmount: 0, prorateByOccupancy: false, note: "Je Wohnung laut Bescheid." },
    { label: "Gartenpflege", amount: 1100.80, allocation: "allocationKey", totalKey: 14, apartmentKey: 1, directAmount: 0, prorateByOccupancy: false, note: "Je Wohnung laut Bescheid." },
    { label: "Müllabfuhr", amount: 4638.28, allocation: "persons", totalKey: 8249.64, apartmentKey: 366, directAmount: 0, prorateByOccupancy: false, note: "Personentage laut Bescheid." },
    { label: "Sonstige Kosten", amount: 193.85, allocation: "allocationKey", totalKey: 10000, apartmentKey: 524, directAmount: 0, prorateByOccupancy: false, note: "Miteigentumsanteil laut Bescheid." },
    { label: "Verwalterhonorar", amount: 4788.00, allocation: "allocationKey", totalKey: 14, apartmentKey: 1, directAmount: 0, prorateByOccupancy: false, note: "Laut Bescheid; steuerlich/umlagefähig bitte bei Bedarf prüfen." },
    { label: "Allgemeinstrom", amount: 288.37, allocation: "allocationKey", totalKey: 14, apartmentKey: 1, directAmount: 0, prorateByOccupancy: false, note: "Je Wohnung laut Bescheid." },
    { label: "Wasser", amount: 4694.21, allocation: "persons", totalKey: 8249.64, apartmentKey: 366, directAmount: 0, prorateByOccupancy: false, note: "Personentage laut Bescheid." },
    { label: "MwSt Verw.Honorar", amount: 909.72, allocation: "allocationKey", totalKey: 14, apartmentKey: 1, directAmount: 0, prorateByOccupancy: false, note: "Laut Bescheid; steuerlich/umlagefähig bitte bei Bedarf prüfen." },
    { label: "Grundsteuer", amount: 0, allocation: "directAmount", totalKey: 0, apartmentKey: 0, directAmount: 0, prorateByOccupancy: false, note: "Direktbetrag laut Grundsteuerbescheid ergänzen." },
  ] },
  { match: ["hohenloher"], displayName: "Hohenloher Str. 78", defaultTotalKey: 1000, defaultApartmentKey: 0, defaultArea: 0, heatingMode: "none", co2Enabled: false, note: "Objektmodul vorbereitet. Grunddaten/Kostenarten bitte nachreichen oder direkt eintragen.", costs: genericCosts(1000, 0) },
  { match: ["lilienthaler"], displayName: "Lilienthaler Str. 54", defaultTotalKey: 100, defaultApartmentKey: 120, defaultArea: 120, heatingMode: "bescheid", co2Enabled: false, note: "Wohnung 120 m², Gesamtfläche laut deiner Angabe 100 m². Verteilungswerte nach Bescheid eintragen.", costs: genericCosts(100, 120) },
];

const GENERIC_PROPERTY_CONFIG: NkPropertyConfig = { match: [], displayName: "Unbekanntes Objekt", defaultTotalKey: 1000, defaultApartmentKey: 0, defaultArea: 0, heatingMode: "none", co2Enabled: false, note: "Objekt noch nicht vorkonfiguriert. Bitte Grunddaten und Kostenarten eintragen.", costs: genericCosts(1000, 0) };

function getPropertyBillingConfig(object?: ObjectOption | null): NkPropertyConfig {
  const t = `${object?.objekt_code ?? ""} ${object?.label ?? ""}`.toLowerCase();
  return PROPERTY_BILLING_CONFIGS.find(c => c.match.some(m => t.includes(m))) ?? GENERIC_PROPERTY_CONFIG;
}

function costsForObject(object?: ObjectOption | null): Array<Omit<CostRow, "id">> {
  return getPropertyBillingConfig(object).costs;
}


const DEFAULT_COSTS: Array<Omit<CostRow, "id">> = COLMARER_COSTS;

function createDefaultWorkspace(year: number, object?: ObjectOption): BillingWorkspace {
  const id = createId();
  const config = getPropertyBillingConfig(object);
  const attachmentReferences = config.co2Enabled
    ? "Hausverwaltungsabrechnung\nKALO-Heizkostenabrechnung / CO₂-Anlage\nGrundsteuerbescheid / Versicherungsnachweise / Rechnungen"
    : "Hausverwaltungsabrechnung\nGrundsteuerbescheid / Versicherungsnachweise / Rechnungen";
  const heating = config.co2Enabled
    ? { totalHeatingCost: 22968.84, totalWarmWaterCost: 0, totalCo2Cost: 2177.66, totalConsumptionKwh: 181071, emissionFactor: 0.2664, heatedArea: 2079.38 }
    : { totalHeatingCost: 0, totalWarmWaterCost: 0, totalCo2Cost: 0, totalConsumptionKwh: 0, emissionFactor: 0, heatedArea: 0 };

  return {
    meta: { propertyCode: object?.objekt_code ?? "", propertyLabel: object?.label ?? "Bitte Objekt wählen", billingYear: year, periodFrom: `${year}-01-01`, periodTo: `${year}-12-31`, landlordName: "", landlordAddress: "", attachmentReferences, workflowStatus: "offen", locked: false },
    apartments: [{ id, label: "Wohnung 1", tenantName: "", area: config.defaultArea, allocationKey: config.defaultApartmentKey, persons: 1, occupancyMonths: 12, advancePayments: 0, co2LandlordDeductionKalo: 0, active: true }],
    costs: costsForObject(object).map((c) => ({ ...c, id: createId() })),
    heating,
    selectedApartmentId: id,
  };
}
type LegacyCostRow = Partial<CostRow> & { allocationTotalKey?: number; allocationApartmentKey?: number };
function normalizeCost(row: LegacyCostRow | null | undefined, index: number, object?: ObjectOption): CostRow { const defaults = costsForObject(object); const d = defaults[index % defaults.length] ?? DEFAULT_COSTS[index % DEFAULT_COSTS.length]; return { ...d, ...(row ?? {}), id: row?.id || createId(), totalKey: Number.isFinite(row?.totalKey) ? Number(row?.totalKey) : (row?.allocationTotalKey ?? d.totalKey), apartmentKey: Number.isFinite(row?.apartmentKey) ? Number(row?.apartmentKey) : (row?.allocationApartmentKey ?? d.apartmentKey), prorateByOccupancy: typeof row?.prorateByOccupancy === "boolean" ? row.prorateByOccupancy : d.prorateByOccupancy }; }
function applyColmarer2025Fixes(costs: CostRow[], year: number, object?: ObjectOption): CostRow[] {
  const objectText = `${object?.objekt_code ?? ""} ${object?.label ?? ""}`.toLowerCase();
  const isColmarer2025 = year === 2025 && objectText.includes("colmarer");
  if (!isColmarer2025) return costs;

  return costs.map((row) => {
    const label = row.label.toLowerCase();

    if (label.includes("wasser") || label.includes("kanal")) {
      return {
        ...row,
        label: "Wasser / Kanal",
        allocation: "allocationKey",
        amount: 4357.3,
        totalKey: 9911,
        apartmentKey: 365,
        directAmount: 0,
        prorateByOccupancy: true,
        note: "Korrektur Colmarer 2025: 4.357,30 × 365 / 9.911 = 160,47 € Jahresanteil; bei 7 Monaten = 93,61 €.",
      };
    }

    if (label.includes("müll") || label.includes("muell")) {
      return {
        ...row,
        label: "Müllabfuhr",
        allocation: "allocationKey",
        amount: 3338.39,
        totalKey: 9911,
        apartmentKey: 365,
        directAmount: 0,
        prorateByOccupancy: true,
        note: "Korrektur Colmarer 2025: 3.338,39 × 365 / 9.911 = 122,95 € Jahresanteil; bei 7 Monaten = 71,72 €.",
      };
    }

    if (label.includes("allgemeinstrom") || label.includes("strom gebäude") || label.includes("strom gebaeude")) {
      return {
        ...row,
        label: "Allgemeinstrom",
        allocation: "allocationKey",
        amount: 696.01,
        totalKey: 9911,
        apartmentKey: 365,
        directAmount: 0,
        prorateByOccupancy: true,
        note: "Korrektur Colmarer 2025: 696,01 × 365 / 9.911 = 25,63 € Jahresanteil; bei 7 Monaten = 14,95 €.",
      };
    }

    return row;
  });
}
function normalizeWorkspace(raw: Partial<BillingWorkspace> | null | undefined, year: number, object?: ObjectOption): BillingWorkspace { const fb = createDefaultWorkspace(year, object); const apartments = Array.isArray(raw?.apartments) && raw.apartments.length ? raw.apartments.map((a, i) => ({ ...fb.apartments[0], ...a, id: a?.id || createId(), label: a?.label || `Wohnung ${i + 1}`, co2LandlordDeductionKalo: Number.isFinite(a?.co2LandlordDeductionKalo) ? a.co2LandlordDeductionKalo : 0, active: typeof a?.active === "boolean" ? a.active : true })) : fb.apartments; const costs = applyColmarer2025Fixes(Array.isArray(raw?.costs) && raw.costs.length ? raw.costs.map((row, index) => normalizeCost(row, index, object)) : fb.costs, year, object); return { meta: { ...fb.meta, ...(raw?.meta ?? {}), propertyCode: object?.objekt_code ?? raw?.meta?.propertyCode ?? fb.meta.propertyCode, propertyLabel: object?.label ?? raw?.meta?.propertyLabel ?? fb.meta.propertyLabel, billingYear: year, locked: Boolean(raw?.meta?.locked) }, apartments, costs, heating: { ...fb.heating, ...(raw?.heating ?? {}) }, selectedApartmentId: raw?.selectedApartmentId && apartments.some(a => a.id === raw.selectedApartmentId) ? raw.selectedApartmentId : apartments[0]?.id ?? null }; }



function colmarer2025FrozenCosts(period: "first" | "second"): CostRow[] {
  const months = period === "first" ? 7 : 5;
  const heatingDirect = period === "first" ? 474.25 : 353.44;
  const heatingAmount = period === "first" ? 23175.90 : 22968.84;
  const grundsteuerDirect = period === "first" ? 187.60 : 134.00;

  const rows: Array<Omit<CostRow, "id">> = [
    { label: "Wasser / Kanal", amount: 4357.30, allocation: "allocationKey", totalKey: 9911, apartmentKey: 365, directAmount: 0, prorateByOccupancy: true, note: `Colmarer 2025 eingefroren: 4.357,30 × 365 / 9.911 × ${months} / 12.` },
    { label: "Gartenpflege", amount: 3768.12, allocation: "allocationKey", totalKey: 10000, apartmentKey: 170.99, directAmount: 0, prorateByOccupancy: true, note: `Colmarer 2025 eingefroren: 3.768,12 × 170,99 / 10.000 × ${months} / 12.` },
    { label: "Gebäudereinigung", amount: 7699.48, allocation: "allocationKey", totalKey: 9613.01, apartmentKey: 170.99, directAmount: 0, prorateByOccupancy: true, note: `Colmarer 2025 eingefroren: 7.699,48 × 170,99 / 9.613,01 × ${months} / 12.` },
    { label: "Grundsteuer", amount: 321.60, allocation: "directAmount", totalKey: 9911, apartmentKey: 365, directAmount: grundsteuerDirect, prorateByOccupancy: false, note: "Colmarer 2025 eingefroren: Direktbetrag laut freigegebener Abrechnung." },
    { label: "Müllabfuhr", amount: 3338.39, allocation: "allocationKey", totalKey: 9911, apartmentKey: 365, directAmount: 0, prorateByOccupancy: true, note: `Colmarer 2025 eingefroren: 3.338,39 × 365 / 9.911 × ${months} / 12.` },
    { label: "Allgemeinstrom", amount: 696.01, allocation: "allocationKey", totalKey: 9911, apartmentKey: 365, directAmount: 0, prorateByOccupancy: true, note: `Colmarer 2025 eingefroren: 696,01 × 365 / 9.911 × ${months} / 12.` },
    { label: "Fehlende Mietzahlungen / Rechnung", amount: 0, allocation: "directAmount", totalKey: 9911, apartmentKey: 365, directAmount: 0, prorateByOccupancy: false, note: "Colmarer 2025 eingefroren." },
    { label: "Haftpflichtversicherung", amount: 449.88, allocation: "allocationKey", totalKey: 10000, apartmentKey: 170.99, directAmount: 0, prorateByOccupancy: true, note: `Colmarer 2025 eingefroren: 449,88 × 170,99 / 10.000 × ${months} / 12.` },
    { label: "Gebäudeversicherung", amount: 10970.93, allocation: "allocationKey", totalKey: 10000, apartmentKey: 170.99, directAmount: 0, prorateByOccupancy: true, note: `Colmarer 2025 eingefroren: 10.970,93 × 170,99 / 10.000 × ${months} / 12.` },
    { label: "Glasbruchschadenversicherung", amount: 340.74, allocation: "allocationKey", totalKey: 10000, apartmentKey: 170.99, directAmount: 0, prorateByOccupancy: true, note: `Colmarer 2025 eingefroren: 340,74 × 170,99 / 10.000 × ${months} / 12.` },
    { label: "Wartung Pumpen / Hebeanlage", amount: 201.11, allocation: "allocationKey", totalKey: 10000, apartmentKey: 170.99, directAmount: 0, prorateByOccupancy: true, note: `Colmarer 2025 eingefroren: 201,11 × 170,99 / 10.000 × ${months} / 12.` },
    { label: "Dachrinnenreinigung", amount: 0, allocation: "directAmount", totalKey: 0, apartmentKey: 0, directAmount: 0, prorateByOccupancy: false, note: "Colmarer 2025 eingefroren." },
    { label: "Wärmeversorgung / Heizkosten", amount: heatingAmount, allocation: "heatingDirect", totalKey: 9911, apartmentKey: 365, directAmount: heatingDirect, prorateByOccupancy: false, note: "Colmarer 2025 eingefroren: KALO-Direktbetrag abzüglich CO₂-Vermieteranteil." },
    { label: "Straßenreinigung", amount: 2119.29, allocation: "allocationKey", totalKey: 10000, apartmentKey: 170.99, directAmount: 0, prorateByOccupancy: true, note: `Colmarer 2025 eingefroren: 2.119,29 × 170,99 / 10.000 × ${months} / 12.` },
  ];

  return rows.map((row) => ({ ...row, id: createId() }));
}

function freezeColmarer2025Workspace(source: BillingWorkspace, period: "first" | "second", year: number, object?: ObjectOption): BillingWorkspace {
  const isFirst = period === "first";
  const tenantName = isFirst ? "Cansu Kurt" : "Nicholas Kraeft-Wendte";
  const from = isFirst ? "2025-01-01" : "2025-08-01";
  const to = isFirst ? "2025-07-31" : "2025-12-31";
  const advancePayments = isFirst ? 770 : 600;
  const occupancyMonths = isFirst ? 7 : 5;
  const co2LandlordDeductionKalo = isFirst ? 13.49 : 9.26;
  const id = source.selectedApartmentId || source.apartments[0]?.id || createId();

  return {
    ...source,
    meta: {
      ...source.meta,
      propertyCode: object?.objekt_code ?? source.meta.propertyCode,
      propertyLabel: object?.label ?? source.meta.propertyLabel,
      billingYear: year,
      periodFrom: from,
      periodTo: to,
      landlordName: source.meta.landlordName?.trim() || "Nihal Könen",
      landlordAddress: source.meta.landlordAddress?.trim() || "Hohenloher Str. 78/1 74243\nLangenbrettach",
      attachmentReferences: "Hausverwaltungsabrechnung\nKALO-Heizkostenabrechnung / CO₂-Anlage\nGrundsteuerbescheid / Versicherungsnachweise / Rechnungen",
      locked: true,
    },
    apartments: [{
      id,
      label: isFirst ? "Wohnung 1" : "Wohnung 2",
      tenantName,
      area: 36,
      allocationKey: 170.99,
      persons: 1,
      occupancyMonths,
      advancePayments,
      co2LandlordDeductionKalo,
      active: true,
    }],
    costs: colmarer2025FrozenCosts(period),
    heating: {
      totalHeatingCost: 22968.84,
      totalWarmWaterCost: 0,
      totalCo2Cost: isFirst ? 2177.66 : 2178.06,
      totalConsumptionKwh: 181071,
      emissionFactor: 0.2664,
      heatedArea: 2079.38,
    },
    selectedApartmentId: id,
  };
}

function makePeriodName(w: BillingWorkspace) {
  const from = w.meta.periodFrom ? formatDate(w.meta.periodFrom) : "von offen";
  const to = w.meta.periodTo ? formatDate(w.meta.periodTo) : "bis offen";
  const tenant = w.apartments.find(a => a.id === w.selectedApartmentId)?.tenantName || w.apartments[0]?.tenantName || "ohne Mieter";
  return `${from} - ${to} · ${tenant}`;
}
function makeBillingRecord(workspace: BillingWorkspace, id = createId()): BillingRecord { return { id, name: makePeriodName(workspace), workspace }; }
function asBillingCollection(raw: unknown, year: number, object?: ObjectOption): BillingCollection {
  const candidate = raw as (Partial<BillingCollection> & Partial<BillingWorkspace>) | null | undefined;
  if (candidate?.version === 2 && Array.isArray(candidate.billings) && candidate.billings.length) {
    const billings = candidate.billings.map((b, i) => {
      const workspace = normalizeWorkspace(b?.workspace ?? null, year, object);
      return { id: b?.id || createId(), name: b?.name || makePeriodName(workspace) || `Abrechnung ${i + 1}`, workspace };
    });
    const selectedBillingId = candidate.selectedBillingId && billings.some((b: BillingRecord) => b.id === candidate.selectedBillingId) ? candidate.selectedBillingId : billings[0].id;
    return cleanupBillingRecords(billings, selectedBillingId, year, object);
  }
  const workspace = normalizeWorkspace(candidate, year, object);
  const record = makeBillingRecord(workspace);
  return cleanupBillingRecords([record], record.id, year, object);
}
function replaceBillingRecord(records: BillingRecord[], id: string | null, workspace: BillingWorkspace) {
  if (!id) return records.length ? records : [makeBillingRecord(workspace)];
  const next = records.map(b => b.id === id ? { ...b, name: makePeriodName(workspace), workspace } : b);
  return next.some(b => b.id === id) ? next : [...next, makeBillingRecord(workspace, id)];
}

function isColmarer2025(year: number, object?: ObjectOption) {
  const objectText = `${object?.objekt_code ?? ""} ${object?.label ?? ""}`.toLowerCase();
  return year === 2025 && objectText.includes("colmarer");
}

function getPrimaryApartment(workspace: BillingWorkspace): ApartmentRow | undefined {
  return workspace.apartments.find(a => a.id === workspace.selectedApartmentId) ?? workspace.apartments[0];
}

function workspaceCompletenessScore(workspace: BillingWorkspace): number {
  const apartment = getPrimaryApartment(workspace);
  let score = 0;
  if (apartment?.tenantName?.trim()) score += 1000;
  if (Number.isFinite(apartment?.advancePayments) && (apartment?.advancePayments ?? 0) > 0) score += 200;
  if (Number.isFinite(apartment?.co2LandlordDeductionKalo) && (apartment?.co2LandlordDeductionKalo ?? 0) > 0) score += 100;
  if (Number.isFinite(apartment?.occupancyMonths) && (apartment?.occupancyMonths ?? 0) > 0) score += 50;
  if (workspace.meta.landlordName?.trim()) score += 20;
  if (workspace.meta.landlordAddress?.trim()) score += 20;
  score += workspace.costs.filter(c => Number.isFinite(c.directAmount) && c.directAmount > 0).length * 10;
  score += workspace.costs.filter(c => Number.isFinite(c.amount) && c.amount > 0).length;
  return score;
}

function pickBestWorkspace(candidates: BillingWorkspace[], fallback: BillingWorkspace): BillingWorkspace {
  if (!candidates.length) return fallback;
  return [...candidates].sort((a, b) => workspaceCompletenessScore(b) - workspaceCompletenessScore(a))[0];
}

function cleanupBillingRecords(records: BillingRecord[], selectedId: string | null, year: number, object?: ObjectOption): BillingCollection {
  let cleaned = records.filter((record) => {
    const from = record.workspace.meta.periodFrom;
    const to = record.workspace.meta.periodTo;
    if (from === "2025-07-31" && to === "2025-07-31") return false;
    if (from === "2025-07-31" && to === "2025-12-31") return false;
    return true;
  });

  const seen = new Set<string>();
  cleaned = cleaned.filter((record) => {
    const tenant = getPrimaryApartment(record.workspace)?.tenantName || "";
    const key = `${record.workspace.meta.periodFrom}|${record.workspace.meta.periodTo}|${tenant}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (isColmarer2025(year, object)) {
    const defaultWorkspace = createDefaultWorkspace(year, object);
    const firstCandidates = cleaned
      .filter(r => r.id === "colmarer-2025-01-07" || (r.workspace.meta.periodFrom === "2025-01-01" && r.workspace.meta.periodTo === "2025-07-31"))
      .map(r => r.workspace);
    const firstExisting = pickBestWorkspace(firstCandidates, defaultWorkspace);

    const secondFallback = nextPeriodWorkspace(firstExisting, year, object);
    const secondCandidates = cleaned
      .filter(r => r.id === "colmarer-2025-08-12" || (r.workspace.meta.periodFrom === "2025-08-01" && r.workspace.meta.periodTo === "2025-12-31"))
      .map(r => r.workspace);
    const secondExisting = pickBestWorkspace(secondCandidates, secondFallback);

    const firstWorkspace = freezeColmarer2025Workspace(firstExisting, "first", year, object);
    const secondWorkspace = freezeColmarer2025Workspace(secondExisting, "second", year, object);

    const first: BillingRecord = { id: "colmarer-2025-01-07", name: makePeriodName(firstWorkspace), workspace: firstWorkspace };
    const second: BillingRecord = { id: "colmarer-2025-08-12", name: makePeriodName(secondWorkspace), workspace: secondWorkspace };
    const selectedOriginalSecond = Boolean(selectedId && cleaned.some(r => r.id === selectedId && (r.id === "colmarer-2025-08-12" || (r.workspace.meta.periodFrom === "2025-08-01" && r.workspace.meta.periodTo === "2025-12-31"))));
    const preferred = selectedOriginalSecond ? second.id : first.id;
    return { version: 2, selectedBillingId: preferred, billings: [first, second] };
  }

  if (!cleaned.length) {
    const workspace = createDefaultWorkspace(year, object);
    const record = makeBillingRecord(workspace);
    return cleanupBillingRecords([record], record.id, year, object);
  }

  const validSelectedId = selectedId && cleaned.some(r => r.id === selectedId) ? selectedId : cleaned[0].id;
  return { version: 2, selectedBillingId: validSelectedId, billings: cleaned.map(r => ({ ...r, name: makePeriodName(r.workspace) })) };
}
function nextPeriodWorkspace(source: BillingWorkspace, year: number, object?: ObjectOption): BillingWorkspace {
  const clone: BillingWorkspace = JSON.parse(JSON.stringify(source));
  const nextId = createId();
  const end = new Date(`${source.meta.periodTo || `${year}-07-31`}T00:00:00`);
  const nextStart = Number.isNaN(end.getTime()) ? new Date(year, 7, 1) : new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  const fallbackStart = new Date(year, 7, 1);
  const start = nextStart.getFullYear() === year ? nextStart : fallbackStart;
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  clone.meta = { ...clone.meta, propertyCode: object?.objekt_code ?? clone.meta.propertyCode, propertyLabel: object?.label ?? clone.meta.propertyLabel, billingYear: year, periodFrom: iso(start), periodTo: `${year}-12-31`, locked: false };
  clone.apartments = clone.apartments.map((a, i) => ({ ...a, id: i === 0 ? nextId : createId(), tenantName: "", advancePayments: 0, co2LandlordDeductionKalo: 0, occupancyMonths: Math.max(1, 12 - start.getMonth()) }));
  clone.costs = clone.costs.map(c => ({ ...c, id: createId() }));
  clone.selectedApartmentId = nextId;
  return clone;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-2"><span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</span>{children}</label>; }
function TextInput(props: InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={`h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-[15px] text-slate-900 shadow-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100 ${props.className ?? ""}`} />; }
function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) { const { children, ...rest } = props; return <select {...rest} className={`h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-[15px] font-medium text-slate-900 shadow-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100 ${props.className ?? ""}`}>{children}</select>; }
function TextAreaInput(props: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...props} className={`min-h-[72px] w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-[15px] text-slate-900 shadow-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100 ${props.className ?? ""}`} />; }
function NumberInput({ value, onCommit, disabled, decimals = 2, min, max }: { value: number; onCommit: (v: number) => void; disabled?: boolean; decimals?: number; min?: number; max?: number }) { const [draft, setDraft] = useState(decimals === 4 ? formatFlex(value) : formatNumber(value, decimals)); useEffect(() => { const syncDraft = window.setTimeout(() => setDraft(decimals === 4 ? formatFlex(value) : formatNumber(value, decimals)), 0); return () => window.clearTimeout(syncDraft); }, [value, decimals]); function commit() { let n = parseGermanNumber(draft || "0"); if (typeof min === "number") n = Math.max(min, n); if (typeof max === "number") n = Math.min(max, n); onCommit(n); setDraft(decimals === 4 ? formatFlex(n) : formatNumber(n, decimals)); } return <TextInput inputMode="decimal" value={draft} disabled={disabled} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} />; }
function YearInput({ value, onChange, disabled }: { value: number; onChange: (year: number) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState(String(value || new Date().getFullYear()));
  useEffect(() => { const syncDraft = window.setTimeout(() => setDraft(String(value || new Date().getFullYear())), 0); return () => window.clearTimeout(syncDraft); }, [value]);
  function commit() {
    const digits = draft.replace(/\D/g, "").slice(0, 4);
    const year = Number(digits || new Date().getFullYear());
    const safeYear = Number.isFinite(year) && year >= 1900 && year <= 2100 ? year : new Date().getFullYear();
    onChange(safeYear);
    setDraft(String(safeYear));
  }
  return (
    <TextInput
      inputMode="numeric"
      pattern="[0-9]*"
      value={draft}
      disabled={disabled}
      onChange={e => setDraft(e.target.value.replace(/\D/g, "").slice(0, 4))}
      onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
    />
  );
}

function Card({ title, icon, actions, children }: { title: string; icon: ReactNode; actions?: ReactNode; children: ReactNode }) { return <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-indigo-100 bg-indigo-50 text-indigo-700">{icon}</div><h2 className="text-base font-semibold text-slate-950">{title}</h2></div>{actions}</div><div className="p-5 md:p-6">{children}</div></section>; }
function Stat({ title, value, accent = "default" }: { title: string; value: string; accent?: "default" | "success" | "danger" }) { const c = accent === "success" ? "text-emerald-700" : accent === "danger" ? "text-rose-700" : "text-slate-950"; return <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm"><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{title}</div><div className={`mt-3 text-2xl font-semibold ${c}`}>{value}</div></div>; }

export default function NebenkostenWohnungen() {
  const currentYear = new Date().getFullYear();
  const [objects, setObjects] = useState<ObjectOption[]>([]); const [selectedObjectCode, setSelectedObjectCode] = useState(""); const [selectedYear, setSelectedYear] = useState(currentYear);
  const [workspace, setWorkspace] = useState<BillingWorkspace>(() => createDefaultWorkspace(currentYear)); const [billingRecords, setBillingRecords] = useState<BillingRecord[]>([]); const [selectedBillingId, setSelectedBillingId] = useState<string | null>(null); const [status, setStatus] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false); const loaded = useRef(false);
  const [nkEntries, setNkEntries] = useState<NkRelevantEntry[]>([]);
  const [nkLoading, setNkLoading] = useState(false);
  useEffect(() => { let alive = true; (async () => { const { data, error } = await supabase.from("v_object_dropdown").select("objekt_code,label").order("label", { ascending: true }); if (!alive) return; if (error) { setError(`Objekte konnten nicht geladen werden: ${error.message}`); return; } const list = ((data ?? []) as ObjectOption[]).filter(o => o.objekt_code && o.label && !isGarage(o)); setObjects(list); if (!selectedObjectCode && list[0]) setSelectedObjectCode(list[0].objekt_code); })(); return () => { alive = false; }; }, [selectedObjectCode]);
  const selectedObject = useMemo(() => objects.find(o => o.objekt_code === selectedObjectCode) ?? null, [objects, selectedObjectCode]);
  const selectedConfig = useMemo(() => getPropertyBillingConfig(selectedObject), [selectedObject]);
  const co2EnabledForSelectedObject = selectedConfig.co2Enabled;
  useEffect(() => { let alive = true; async function loadNk() { if (!selectedObjectCode) return; setNkLoading(true); try { const rows = await listNkRelevantEntries(selectedYear, selectedObjectCode); if (alive) setNkEntries(rows); } catch (err) { if (alive) setError(err instanceof Error ? err.message : String(err)); } finally { if (alive) setNkLoading(false); } } void loadNk(); return () => { alive = false; }; }, [selectedObjectCode, selectedYear]);
  useEffect(() => { let alive = true; async function load() { if (!selectedObjectCode) return; loaded.current = false; setLoading(true); setError(""); const { data, error } = await supabase.from("apartment_billing_workspaces").select("data").eq("object_id", selectedObjectCode).eq("year", String(selectedYear)).maybeSingle(); if (!alive) return; if (error) { const ws = createDefaultWorkspace(selectedYear, selectedObject ?? undefined); const rec = makeBillingRecord(ws); setBillingRecords([rec]); setSelectedBillingId(rec.id); setWorkspace(ws); setError(`Supabase-Fehler: ${error.message}`); } else { const collection = asBillingCollection(data?.data ?? null, selectedYear, selectedObject ?? undefined); const selected = collection.billings.find(b => b.id === collection.selectedBillingId) ?? collection.billings[0]; setBillingRecords(collection.billings); setSelectedBillingId(selected.id); setWorkspace(selected.workspace); setStatus(data?.data ? `Gespeicherte Abrechnungen für ${selectedYear} geladen.` : `Neue Abrechnung für ${selectedYear} erstellt.`); } setLoading(false); loaded.current = true; } void load(); return () => { alive = false; }; }, [selectedObjectCode, selectedYear, selectedObject]);
  useEffect(() => { if (!selectedObjectCode || !loaded.current) return; const normalizedWorkspace = { ...workspace, meta: { ...workspace.meta, propertyCode: selectedObjectCode, propertyLabel: selectedObject?.label ?? workspace.meta.propertyLabel, billingYear: selectedYear } }; const billingsRaw = replaceBillingRecord(billingRecords, selectedBillingId, normalizedWorkspace); const cleaned = cleanupBillingRecords(billingsRaw, selectedBillingId, selectedYear, selectedObject ?? undefined); const payload: BillingCollection = cleaned; const id = window.setTimeout(async () => { setSaving(true); const { error } = await supabase.from("apartment_billing_workspaces").upsert({ object_id: selectedObjectCode, year: String(selectedYear), data: payload }, { onConflict: "object_id,year" }); setSaving(false); if (error) setError(`Supabase-Fehler: ${error.message}`); else { setStatus(`Gespeichert: ${selectedObject?.label ?? selectedObjectCode} / ${selectedYear} / ${makePeriodName(normalizedWorkspace)}`); } }, 650); return () => window.clearTimeout(id); }, [workspace, billingRecords, selectedObjectCode, selectedYear, selectedObject, selectedBillingId]);
  const locked = workspace.meta.locked; const activeApartment = useMemo(() => workspace.apartments.find(a => a.id === workspace.selectedApartmentId) ?? workspace.apartments[0] ?? null, [workspace]);
  function update(updater: (p: BillingWorkspace) => BillingWorkspace) { setWorkspace(prev => { const next = updater(prev); setBillingRecords(current => cleanupBillingRecords(replaceBillingRecord(current, selectedBillingId, next), selectedBillingId, selectedYear, selectedObject ?? undefined).billings); return next; }); } function selectBilling(id: string) { if (id === selectedBillingId) return; const cleaned = cleanupBillingRecords(replaceBillingRecord(billingRecords, selectedBillingId, workspace), selectedBillingId, selectedYear, selectedObject ?? undefined); const target = cleaned.billings.find(b => b.id === id); if (!target) return; setBillingRecords(cleaned.billings); setSelectedBillingId(id); setWorkspace(target.workspace); } function createNewPartialBilling() { const cleaned = cleanupBillingRecords(replaceBillingRecord(billingRecords, selectedBillingId, workspace), selectedBillingId, selectedYear, selectedObject ?? undefined); if (isColmarer2025(selectedYear, selectedObject ?? undefined) && cleaned.billings.length >= 2) { const second = cleaned.billings[1]; setBillingRecords(cleaned.billings); setSelectedBillingId(second.id); setWorkspace(second.workspace); setStatus("Für Colmarer Str. 2025 sind die zwei Teilabrechnungen bereits angelegt."); return; } const newWorkspace = nextPeriodWorkspace(workspace, selectedYear, selectedObject ?? undefined); const rec = makeBillingRecord(newWorkspace); const next = cleanupBillingRecords([...cleaned.billings, rec], rec.id, selectedYear, selectedObject ?? undefined); const selected = next.billings.find(b => b.id === next.selectedBillingId) ?? next.billings[0]; setBillingRecords(next.billings); setSelectedBillingId(selected.id); setWorkspace(selected.workspace); setStatus("Neue Teilabrechnung erstellt. Zeitraum, Mieter und Vorauszahlungen bitte anpassen."); } function updateMeta<K extends keyof BuildingMeta>(key: K, value: BuildingMeta[K]) { if (isColmarer2025(selectedYear, selectedObject ?? undefined) && key === "locked" && value === false) { setStatus("Colmarer Str. 45 / 2025 ist freigegeben und bleibt eingefroren. Bitte nicht bearbeiten."); return; } update(p => ({ ...p, meta: { ...p.meta, [key]: value } })); } function updateHeating<K extends keyof HeatingSettings>(key: K, value: HeatingSettings[K]) { update(p => ({ ...p, heating: { ...p.heating, [key]: value } })); } function updateApartment(id: string, patch: Partial<ApartmentRow>) { update(p => ({ ...p, apartments: p.apartments.map(a => a.id === id ? { ...a, ...patch } : a) })); } function updateCost(id: string, patch: Partial<CostRow>) { update(p => ({ ...p, costs: p.costs.map(c => c.id === id ? { ...c, ...patch } : c) })); }
  function addApartment() { if (locked) return; const a: ApartmentRow = { id: createId(), label: `Wohnung ${workspace.apartments.length + 1}`, tenantName: "", area: 0, allocationKey: 0, persons: 1, occupancyMonths: 12, advancePayments: 0, co2LandlordDeductionKalo: 0, active: true }; update(p => ({ ...p, apartments: [...p.apartments, a], selectedApartmentId: a.id })); }
  function deleteApartment(id: string) { if (locked) return; update(p => { const next = p.apartments.filter(a => a.id !== id); return { ...p, apartments: next.length ? next : createDefaultWorkspace(selectedYear, selectedObject ?? undefined).apartments, selectedApartmentId: next[0]?.id ?? null }; }); }
  function addCost() { if (locked) return; update(p => ({ ...p, costs: [...p.costs, { id: createId(), label: `Kostenart ${p.costs.length + 1}`, amount: 0, allocation: "allocationKey", totalKey: 0, apartmentKey: 0, directAmount: 0, prorateByOccupancy: false, note: "" }] })); }
  function deleteCost(id: string) { if (locked) return; update(p => ({ ...p, costs: p.costs.filter(c => c.id !== id) })); }
  function restoreObjectDefaults() { if (locked) return; const fresh = createDefaultWorkspace(selectedYear, selectedObject ?? undefined); update(p => ({ ...p, apartments: p.apartments.length ? p.apartments.map((a, i) => ({ ...a, area: i === 0 ? fresh.apartments[0].area : a.area, allocationKey: i === 0 ? fresh.apartments[0].allocationKey : a.allocationKey })) : fresh.apartments, costs: fresh.costs, heating: fresh.heating, meta: { ...p.meta, attachmentReferences: fresh.meta.attachmentReferences } })); }
  function importNkEntries() { if (locked || nkEntries.length === 0) return; const grouped = new Map<string, { label: string; amount: number; note: string }>(); for (const entry of nkEntries) { if (entry.entry_type !== "expense") continue; const label = entry.category?.trim() || "NK-Buchung"; const current = grouped.get(label) ?? { label, amount: 0, note: "Automatisch aus markierten Buchungen übernommen." }; current.amount += Math.abs(entry.amount); grouped.set(label, current); } const nextRows = Array.from(grouped.values()).map(row => ({ id: createId(), label: row.label, amount: roundMoney(row.amount), allocation: "allocationKey" as AllocationType, totalKey: selectedConfig.defaultTotalKey || 1000, apartmentKey: selectedConfig.defaultApartmentKey || 0, directAmount: 0, prorateByOccupancy: false, note: row.note })); if (!nextRows.length) return; update(p => ({ ...p, costs: [...p.costs, ...nextRows] })); setStatus(`${nextRows.length} NK-Kostenarten aus Buchhaltung übernommen.`); }
  const co2TotalKg = roundMoney(workspace.heating.totalConsumptionKwh * workspace.heating.emissionFactor); const co2PerSqm = workspace.heating.heatedArea > 0 ? co2TotalKg / workspace.heating.heatedArea : 0; const co2Stage = getCo2Stage(co2PerSqm);
  const isHeatingCostRow = (row: CostRow) => {
    const label = row.label.toLowerCase();
    return row.allocation === "heatingDirect" || label.includes("heiz") || label.includes("wärme") || label.includes("waerme") || label.includes("warmwasser") || label.includes("kalo");
  };

  const costBreakdown = useMemo(() => {
    if (!activeApartment) return [];

    const preliminary = workspace.costs.map(row => {
      const isHeating = isHeatingCostRow(row);
      let tenantShareBeforeCo2 = 0;

      if (row.allocation === "directAmount" || row.allocation === "heatingDirect") {
        tenantShareBeforeCo2 = row.directAmount;
      } else {
        const base = row.totalKey > 0 ? row.amount * (row.apartmentKey / row.totalKey) : 0;
        tenantShareBeforeCo2 = row.prorateByOccupancy ? base * (clamp(activeApartment.occupancyMonths, 0, 12) / 12) : base;
      }

      return { row, isHeating, tenantShareBeforeCo2 };
    });

    const heatingBaseForManualCo2 = preliminary.filter(x => x.isHeating).reduce((s, x) => s + x.tenantShareBeforeCo2, 0);
    const manualCo2Deduction = Number.isFinite(activeApartment.co2LandlordDeductionKalo) ? Math.max(0, activeApartment.co2LandlordDeductionKalo) : 0;

    return preliminary.map(({ row, isHeating, tenantShareBeforeCo2 }) => {
      // Standard: CO₂-Automatik aus Gesamtwerten. Wenn KALO für diese Wohnung bereits einen konkreten
      // Vermieteranteil ausweist, hat der eingetragene KALO-Wert Vorrang.
      const heatingQuote = isHeating && workspace.heating.totalHeatingCost > 0 ? tenantShareBeforeCo2 / workspace.heating.totalHeatingCost : 0;
      const co2ShareApartment = roundMoney(workspace.heating.totalCo2Cost * heatingQuote);
      const autoCo2TenantShare = roundMoney(co2ShareApartment * (co2Stage.tenantPercent / 100));
      const autoCo2LandlordShare = roundMoney(co2ShareApartment * (co2Stage.landlordPercent / 100));
      const co2LandlordShare = co2EnabledForSelectedObject && isHeating && manualCo2Deduction > 0 && heatingBaseForManualCo2 > 0
        ? roundMoney(manualCo2Deduction * (tenantShareBeforeCo2 / heatingBaseForManualCo2))
        : autoCo2LandlordShare;
      const co2TenantShare = co2EnabledForSelectedObject && isHeating && manualCo2Deduction > 0 ? Math.max(0, roundMoney(co2ShareApartment - co2LandlordShare)) : (co2EnabledForSelectedObject ? autoCo2TenantShare : 0);
      const tenantShare = co2EnabledForSelectedObject && isHeating ? Math.max(0, tenantShareBeforeCo2 - co2LandlordShare) : tenantShareBeforeCo2;

      return {
        row,
        isHeating,
        tenantShareBeforeCo2: roundMoney(tenantShareBeforeCo2),
        tenantShare: roundMoney(tenantShare),
        landlordShare: roundMoney(Math.max(0, row.amount - tenantShare)),
        co2ShareApartment,
        co2TenantShare,
        co2LandlordShare,
      };
    });
  }, [workspace.costs, activeApartment, workspace.heating.totalHeatingCost, workspace.heating.totalCo2Cost, co2Stage.tenantPercent, co2Stage.landlordPercent, co2EnabledForSelectedObject]);
  const totalCo2LandlordShare = roundMoney(costBreakdown.reduce((s, x) => s + x.co2LandlordShare, 0));
  const totalHeatingBeforeCo2 = roundMoney(costBreakdown.filter(x => x.isHeating).reduce((s, x) => s + x.tenantShareBeforeCo2, 0));
  const totalHeatingCosts = roundMoney(costBreakdown.filter(x => x.isHeating).reduce((s, x) => s + x.tenantShare, 0)); const totalColdCosts = roundMoney(costBreakdown.filter(x => !x.isHeating).reduce((s, x) => s + x.tenantShare, 0)); const totalTenantCosts = roundMoney(totalColdCosts + totalHeatingCosts); const tenantBalance = activeApartment ? roundMoney(activeApartment.advancePayments - totalTenantCosts) : 0;
  function exportOnePager() {
    if (!activeApartment) return;
    const filename = safeFilename(`NK-Abrechnung_${workspace.meta.propertyLabel}_${workspace.meta.billingYear}_${activeApartment.tenantName || activeApartment.label}`);
    const numberedAttachments = (workspace.meta.attachmentReferences || "").split(/\n|;/).map(x => x.trim()).filter(Boolean).map((x, i) => `Anlage ${i + 1}: ${x}`);
    const lines = [
      "Nebenkostenabrechnung Wohnung",
      `Objekt: ${workspace.meta.propertyLabel}`,
      `Objekt-Code: ${workspace.meta.propertyCode}`,
      `Jahr: ${workspace.meta.billingYear}`,
      `Zeitraum: ${formatDate(workspace.meta.periodFrom)} bis ${formatDate(workspace.meta.periodTo)}`,
      "",
      `Wohnung: ${activeApartment.label}`,
      `Mieter: ${activeApartment.tenantName || "—"}`,
      `Vorauszahlungen: ${formatCurrency(activeApartment.advancePayments)}`,
      "",
      "KOSTENAUFSTELLUNG",
      ...costBreakdown.map(x => `${x.row.label} | Gesamt ${formatCurrency(x.row.amount)} | ${x.row.totalKey ? `Gesamtanteile ${formatFlex(x.row.totalKey)} / Wohnungsanteil ${formatFlex(x.row.apartmentKey)}` : "Direktbetrag"} | Mieter ${formatCurrency(x.tenantShare)}`),
      "",
      "HEIZKOSTEN / CO₂-DOKUMENTATION",
      `Heizkosten laut KALO: ${formatCurrency(totalHeatingBeforeCo2)}`,
      `CO₂-Abzug Vermieter laut KALO/automatisch: -${formatCurrency(totalCo2LandlordShare)}`,
      `Heizkosten nach CO₂-Abzug: ${formatCurrency(totalHeatingCosts)}`,
      "",
      `Kalte Betriebskosten: ${formatCurrency(totalColdCosts)}`,
      `Gesamtkosten Mieter: ${formatCurrency(totalTenantCosts)}`,
      `Vorauszahlungen: ${formatCurrency(activeApartment.advancePayments)}`,
      `Saldo: ${formatCurrency(tenantBalance)}`,
      "",
      "ANLAGEN / REFERENZEN",
      ...numberedAttachments,
    ];
    downloadText(`${filename}.txt`, lines.join("\n"));
  }

  function escapeHtml(value: unknown) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function printBillingDocument() {
    if (!activeApartment) return;

    const rows = costBreakdown.map(x => `
      <tr>
        <td>${escapeHtml(x.row.label)}</td>
        <td class="right">${escapeHtml(formatCurrency(x.row.amount))}</td>
        <td class="right">${escapeHtml(x.row.totalKey ? formatFlex(x.row.totalKey) : "Direkt")}</td>
        <td class="right">${escapeHtml(x.row.totalKey ? formatFlex(x.row.apartmentKey) : "—")}</td>
        <td>${escapeHtml(calculationText(x))}${x.co2LandlordShare > 0 ? `; abzgl. CO₂-Vermieteranteil ${escapeHtml(formatCurrency(x.co2LandlordShare))}` : ""}</td>
        <td class="right strong">${escapeHtml(formatCurrency(x.tenantShare))}</td>
      </tr>`).join("");

    const serviceTableRows = serviceRows.length
      ? serviceRows.map(x => `
        <tr>
          <td>${escapeHtml(x.row.label)}</td>
          <td class="right">${escapeHtml(formatCurrency(x.row.amount))}</td>
          <td>${escapeHtml(calculationText(x))}</td>
          <td class="right strong">${escapeHtml(formatCurrency(x.tenantShare))}</td>
        </tr>`).join("")
      : `<tr><td colspan="4">Keine § 35a-relevanten Kostenarten eingetragen.</td></tr>`;

    const attachments = attachmentList.length
      ? attachmentList.map((x, i) => `<li><strong>Anlage ${i + 1}:</strong> ${escapeHtml(x)}</li>`).join("")
      : `<li>Keine Anlagen eingetragen.</li>`;

    const maxTotalKey = Math.max(...costBreakdown.map(x => x.row.totalKey || 0), 0);
    const residentialTotalKey = costBreakdown.find(x => x.row.label.toLowerCase().includes("wasser"))?.row.totalKey || 0;
    const totalPersons = costBreakdown.find(x => x.row.allocation === "persons")?.row.totalKey || activeApartment.persons;
    const printFilename = safeFilename(`NK-Abrechnung_${workspace.meta.propertyLabel}_${workspace.meta.billingYear}_${activeApartment.tenantName || activeApartment.label}`);

    const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(printFilename)}</title>
<style>
  @page { size: A4 portrait; margin: 9mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 8.8pt; line-height: 1.22; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 100%; min-height: 0; page-break-after: always; break-after: page; overflow: hidden; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .box { border-top: 3px double #000; border-bottom: 3px double #000; padding: 7px 9px; margin-bottom: 7px; break-inside: avoid; }
  h1 { font-size: 16pt; margin: 0 0 4px; }
  h2 { font-size: 11.5pt; margin: 8px 0 5px; }
  .sub { font-size: 10.2pt; margin-bottom: 5px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 18px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; margin: 6px 0; }
  .kpi { border: 1px solid #000; padding: 5px; min-height: 37px; }
  .kpi .label { font-size: 7pt; text-transform: uppercase; letter-spacing: .06em; font-weight: 700; }
  .kpi .value { font-size: 12pt; font-weight: 800; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 7.8pt; table-layout: fixed; }
  th { border-bottom: 1.5px solid #000; text-align: left; padding: 3px 4px; font-weight: 800; }
  td { border-bottom: .5px solid #999; padding: 2.2px 4px; vertical-align: top; overflow-wrap: anywhere; }
  th:nth-child(1), td:nth-child(1) { width: 19%; }
  th:nth-child(2), td:nth-child(2) { width: 14%; }
  th:nth-child(3), td:nth-child(3) { width: 11%; }
  th:nth-child(4), td:nth-child(4) { width: 11%; }
  th:nth-child(5), td:nth-child(5) { width: 32%; }
  th:nth-child(6), td:nth-child(6) { width: 13%; }
  .right { text-align: right; white-space: nowrap; }
  .strong { font-weight: 800; }
  ul { margin: 4px 0 0 16px; padding: 0; }
  .small { font-size: 8pt; }
</style>
</head>
<body>
  <section class="page">
    <div class="box">
      <h1>Nebenkostenabrechnung ${escapeHtml(workspace.meta.billingYear)}</h1>
      <div class="sub">${escapeHtml(workspace.meta.propertyLabel)} · ${escapeHtml(formatDate(workspace.meta.periodFrom))} bis ${escapeHtml(formatDate(workspace.meta.periodTo))}</div>
      <div class="grid">
        <div><strong>Vermieter:</strong> ${escapeHtml(workspace.meta.landlordName || "—")}</div>
        <div><strong>Wohnung / Mieter:</strong> ${escapeHtml(activeApartment.label)} / ${escapeHtml(activeApartment.tenantName || "—")}</div>
        <div><strong>Vermieteradresse:</strong> ${escapeHtml(workspace.meta.landlordAddress || "—")}</div>
        <div><strong>Wohnfläche / MEA / Personen:</strong> ${escapeHtml(formatFlex(activeApartment.area))} m² / ${escapeHtml(formatFlex(activeApartment.allocationKey))} / ${escapeHtml(formatFlex(activeApartment.persons))}</div>
      </div>
    </div>

    <div class="box">
      <strong>Kostenverteilung</strong>
      <div class="grid" style="margin-top:4px">
        <div>Miteigentumsanteile gesamt: <strong>${escapeHtml(formatFlex(maxTotalKey))} MEA</strong></div>
        <div>Ihre MEA: <strong>${escapeHtml(formatFlex(activeApartment.allocationKey))}</strong></div>
        <div>Miteigentumsanteile Wohnungen: <strong>${escapeHtml(formatFlex(residentialTotalKey))}</strong></div>
        <div>Ihre Einheiten: <strong>1</strong></div>
        <div>Gesamtpersonen: <strong>${escapeHtml(formatFlex(totalPersons))}</strong></div>
        <div>Ihre Personen / Monate: <strong>${escapeHtml(formatFlex(activeApartment.persons))} / ${escapeHtml(formatFlex(activeApartment.occupancyMonths))}</strong></div>
      </div>
    </div>

    <h2>Kostenarten und Anteilsberechnung</h2>
    <table>
      <thead><tr><th>Kostenart</th><th class="right">Gesamtkosten</th><th class="right">Gesamt</th><th class="right">Wohnung</th><th>Anteilsberechnung</th><th class="right">Betrag</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="kpis">
      <div class="kpi"><div class="label">Kalte Betriebskosten</div><div class="value">${escapeHtml(formatCurrency(totalColdCosts))}</div></div>
      <div class="kpi"><div class="label">Heizkosten nach CO₂</div><div class="value">${escapeHtml(formatCurrency(totalHeatingCosts))}</div></div>
      <div class="kpi"><div class="label">Vorauszahlungen</div><div class="value">${escapeHtml(formatCurrency(activeApartment.advancePayments))}</div></div>
      <div class="kpi"><div class="label">${escapeHtml(balanceLabel)}</div><div class="value">${escapeHtml(formatCurrency(Math.abs(tenantBalance)))}</div></div>
    </div>
    <div class="box small"><strong>Summe umlagefähige Kosten Mieter:</strong> ${escapeHtml(formatCurrency(totalTenantCosts))} · <strong>CO₂-Vermieteranteil:</strong> -${escapeHtml(formatCurrency(totalCo2LandlordShare))}</div>
    <div class="box small"><strong>Dokumentation Heizkosten/CO₂:</strong> Heizkosten laut Einzelabrechnung ${escapeHtml(formatCurrency(totalHeatingBeforeCo2))}; abzüglich Vermieteranteil CO₂ ${escapeHtml(formatCurrency(totalCo2LandlordShare))}; umlagefähige Heizkosten nach CO₂-Abzug ${escapeHtml(formatCurrency(totalHeatingCosts))}.</div>
  </section>

  <section class="page">
    <div class="box">
      <h1>ANLAGE</h1>
      <div class="sub">Heizkosten / CO₂-Anlage für das Jahr ${escapeHtml(workspace.meta.billingYear)}</div>
      <div class="kpis">
        <div class="kpi"><div class="label">Heizkosten gesamt KALO</div><div class="value">${escapeHtml(formatCurrency(workspace.heating.totalHeatingCost))}</div></div>
        <div class="kpi"><div class="label">CO₂-Kosten gesamt</div><div class="value">${escapeHtml(formatCurrency(workspace.heating.totalCo2Cost))}</div></div>
        <div class="kpi"><div class="label">CO₂ gesamt</div><div class="value">${escapeHtml(formatNumber(co2TotalKg,0))} kg</div></div>
        <div class="kpi"><div class="label">Stufe / Aufteilung</div><div class="value">${escapeHtml(co2Stage.stage)} · ${escapeHtml(co2Stage.tenantPercent)}%/${escapeHtml(co2Stage.landlordPercent)}%</div></div>
      </div>
      <div class="grid small">
        <div>Gesamtverbrauch: <strong>${escapeHtml(formatNumber(workspace.heating.totalConsumptionKwh, 2))} kWh</strong></div>
        <div>Emissionsfaktor: <strong>${escapeHtml(formatFlex(workspace.heating.emissionFactor))}</strong></div>
        <div>Beheizte Fläche: <strong>${escapeHtml(formatNumber(workspace.heating.heatedArea, 2))} m²</strong></div>
        <div>CO₂ je m²/Jahr: <strong>${escapeHtml(formatNumber(co2PerSqm, 1))}</strong></div>
      </div>
    </div>

    <div class="box">
      <h2>Aufwände gem. § 35a Abs. 2 Satz 1 EStG haushaltsnahe Dienstleistungen und § 35a Abs. 3 EStG Handwerkerleistungen</h2>
      <table><thead><tr><th>Kostenart</th><th class="right">Gesamtkosten</th><th>Anteilsberechnung</th><th class="right">Betrag</th></tr></thead><tbody>${serviceTableRows}</tbody></table>
    </div>

    <div class="box">
      <strong>Anlagen / Referenzen</strong>
      <ul>${attachments}</ul>
    </div>
  </section>
</body>
</html>`;

    const oldFrame = document.getElementById("nk-print-frame");
    if (oldFrame) oldFrame.remove();

    const frame = document.createElement("iframe");
    frame.id = "nk-print-frame";
    frame.title = "NK-Abrechnung Druck";
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.style.opacity = "0";
    frame.setAttribute("aria-hidden", "true");
    document.body.appendChild(frame);

    const doc = frame.contentWindow?.document;
    if (!doc || !frame.contentWindow) {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    const doPrint = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 15000);
    };

    if (doc.readyState === "complete") {
      setTimeout(doPrint, 200);
    } else {
      frame.onload = () => setTimeout(doPrint, 200);
    }
  }


  const attachmentList = (workspace.meta.attachmentReferences || "").split(/\n|;/).map(x => x.trim()).filter(Boolean);
  const serviceKeywords = ["reinigung", "garten", "wartung", "pumpe", "hebeanlage", "dachrinne", "hausmeister", "schornstein", "handwerker"];
  const serviceRows = costBreakdown.filter(x => serviceKeywords.some(k => x.row.label.toLowerCase().includes(k)));
  function calculationText(x: typeof costBreakdown[number]) {
    if (x.row.allocation === "directAmount" || x.row.allocation === "heatingDirect") return "Direkt laut Einzelabrechnung";
    const base = `${formatCurrency(x.row.amount)} × ${formatFlex(x.row.apartmentKey)} / ${formatFlex(x.row.totalKey)}`;
    return x.row.prorateByOccupancy ? `${base} × ${formatFlex(activeApartment?.occupancyMonths ?? 0)} / 12` : base;
  }
  const balanceLabel = tenantBalance >= 0 ? "Guthaben" : "Nachzahlung";

  const validationWarnings = useMemo(() => {
    const warnings: string[] = [];
    const from = new Date(`${workspace.meta.periodFrom}T00:00:00`);
    const to = new Date(`${workspace.meta.periodTo}T00:00:00`);
    if (!workspace.meta.propertyCode) warnings.push("Kein Objekt ausgewählt.");
    if (!workspace.meta.billingYear || workspace.meta.billingYear < 2000) warnings.push("Abrechnungsjahr prüfen.");
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) warnings.push("Zeitraum von/bis ist unvollständig oder unplausibel.");
    if (!activeApartment?.tenantName?.trim()) warnings.push("Mietername fehlt.");
    if ((activeApartment?.advancePayments ?? 0) <= 0) warnings.push("Vorauszahlungen sind 0 € oder fehlen.");
    if ((activeApartment?.occupancyMonths ?? 0) <= 0 || (activeApartment?.occupancyMonths ?? 0) > 12) warnings.push("Belegungsmonate müssen zwischen 1 und 12 liegen.");
    if ((activeApartment?.area ?? 0) <= 0) warnings.push("Wohnfläche fehlt oder ist 0.");
    if ((activeApartment?.allocationKey ?? 0) <= 0) warnings.push("MEA/Wohnungsanteil fehlt oder ist 0.");
    if (costBreakdown.some(x => x.row.amount > 0 && x.row.totalKey <= 0 && x.row.allocation !== "directAmount" && x.row.allocation !== "heatingDirect")) warnings.push("Mindestens eine Kostenart hat Gesamtkosten, aber keinen Gesamt-Schlüssel.");
    if (costBreakdown.some(x => x.row.amount > 0 && x.row.apartmentKey <= 0 && x.row.allocation !== "directAmount" && x.row.allocation !== "heatingDirect")) warnings.push("Mindestens eine Kostenart hat Gesamtkosten, aber keinen Wohnungs-Schlüssel.");
    if (co2EnabledForSelectedObject && totalHeatingBeforeCo2 > 0 && workspace.heating.totalCo2Cost > 0 && totalCo2LandlordShare <= 0) warnings.push("Heizkosten vorhanden, aber kein CO₂-Vermieteranteil berechnet/eingetragen.");
    if (co2EnabledForSelectedObject && workspace.heating.totalConsumptionKwh > 0 && (workspace.heating.emissionFactor <= 0 || workspace.heating.heatedArea <= 0)) warnings.push("CO₂-Werte prüfen: Emissionsfaktor oder beheizte Fläche fehlt.");
    if (!attachmentList.length) warnings.push("Keine Anlagen/Referenzen für den Druck eingetragen.");
    return warnings;
  }, [workspace.meta.propertyCode, workspace.meta.billingYear, workspace.meta.periodFrom, workspace.meta.periodTo, workspace.heating.totalCo2Cost, workspace.heating.totalConsumptionKwh, workspace.heating.emissionFactor, workspace.heating.heatedArea, activeApartment, costBreakdown, totalHeatingBeforeCo2, totalCo2LandlordShare, attachmentList.length, co2EnabledForSelectedObject]);

  function finishBilling() {
    if (validationWarnings.length > 0) {
      const ok = window.confirm(`Vor dem Abschluss bitte prüfen:\n\n${validationWarnings.map((w, i) => `${i + 1}. ${w}`).join("\n")}\n\nTrotzdem abschließen?`);
      if (!ok) return;
    }
    update(p => ({ ...p, meta: { ...p.meta, workflowStatus: "Freigegeben", locked: true } }));
  }


  const archivedBillings = useMemo(
    () => billingRecords.filter((record) => record.workspace.meta.locked),
    [billingRecords],
  );

  function summarizeBilling(target: BillingWorkspace) {
    const apartment = target.apartments.find(a => a.id === target.selectedApartmentId) ?? target.apartments[0];
    if (!apartment) {
      return { apartment: null as ApartmentRow | null, cold: 0, heatingBeforeCo2: 0, co2Deduction: 0, tenantTotal: 0, advance: 0, balance: 0, label: "Guthaben" };
    }
    let cold = 0;
    let heatingBeforeCo2 = 0;
    for (const row of target.costs) {
      const isHeating = row.allocation === "heatingDirect" || /heiz|wärme|waerme|warmwasser|kalo/i.test(row.label);
      let amount = 0;
      if (row.allocation === "directAmount" || row.allocation === "heatingDirect") amount = row.directAmount;
      else {
        const base = row.totalKey > 0 ? row.amount * (row.apartmentKey / row.totalKey) : 0;
        amount = row.prorateByOccupancy ? base * (clamp(apartment.occupancyMonths, 0, 12) / 12) : base;
      }
      if (isHeating) heatingBeforeCo2 += amount;
      else cold += amount;
    }
    const co2Deduction = Math.min(Math.max(apartment.co2LandlordDeductionKalo || 0, 0), Math.max(heatingBeforeCo2, 0));
    const tenantTotal = roundMoney(cold + Math.max(heatingBeforeCo2 - co2Deduction, 0));
    const balance = roundMoney(apartment.advancePayments - tenantTotal);
    return { apartment, cold: roundMoney(cold), heatingBeforeCo2: roundMoney(heatingBeforeCo2), co2Deduction: roundMoney(co2Deduction), tenantTotal, advance: apartment.advancePayments, balance, label: balance >= 0 ? "Guthaben" : "Nachzahlung" };
  }

  function archivedBillingHtml(target: BillingWorkspace) {
    const summary = summarizeBilling(target);
    const apartment = summary.apartment;
    const safeTenant = escapeHtml(apartment?.tenantName || "—");
    const safeObject = escapeHtml(target.meta.propertyLabel || "—");
    const rows = target.costs.map((row) => {
      const isHeating = row.allocation === "heatingDirect" || /heiz|wärme|waerme|warmwasser|kalo/i.test(row.label);
      let amount = 0;
      if (apartment) {
        if (row.allocation === "directAmount" || row.allocation === "heatingDirect") amount = row.directAmount;
        else {
          const base = row.totalKey > 0 ? row.amount * (row.apartmentKey / row.totalKey) : 0;
          amount = row.prorateByOccupancy ? base * (clamp(apartment.occupancyMonths, 0, 12) / 12) : base;
        }
      }
      const shown = isHeating && summary.co2Deduction > 0 && summary.heatingBeforeCo2 > 0
        ? Math.max(amount - (amount / summary.heatingBeforeCo2) * summary.co2Deduction, 0)
        : amount;
      return `<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(allocationLabel(row.allocation))}</td><td class="right">${escapeHtml(formatCurrency(shown))}</td></tr>`;
    }).join("");
    const attachments = (target.meta.attachmentReferences || "").split(/\n|;/).map(x => x.trim()).filter(Boolean).map((x, i) => `<li><strong>Anlage ${i + 1}:</strong> ${escapeHtml(x)}</li>`).join("") || "<li>Keine Anlagen hinterlegt.</li>";
    return `<!doctype html><html><head><meta charset="utf-8"/><title>Archivierte NK-Abrechnung ${safeObject}</title><style>
      body{font-family:Arial,Helvetica,sans-serif;background:#f8fafc;color:#0f172a;padding:28px} .page{max-width:860px;margin:0 auto;background:white;border:1px solid #dbe3f0;border-radius:24px;padding:32px}.brand-logo{display:block;width:240px;height:auto;max-height:96px;object-fit:contain;object-position:left center;margin:0 0 18px} h1{margin:0;font-size:24px}.sub{margin-top:8px;color:#475569}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:22px 0}.box{border:1px solid #e2e8f0;border-radius:16px;padding:14px;background:#f8fafc}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}.kpi{border:1px solid #e2e8f0;border-radius:14px;padding:12px}.label{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#64748b;font-weight:700}.value{font-size:18px;font-weight:800;margin-top:6px}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{padding:10px;border-bottom:1px solid #e2e8f0;text-align:left}.right{text-align:right}.status{display:inline-block;border-radius:999px;background:#dcfce7;color:#166534;padding:6px 12px;font-weight:800;font-size:12px}@media print{body{background:white;padding:0}.page{border:0;border-radius:0;padding:0}.no-print{display:none}.kpis{grid-template-columns:repeat(2,1fr)}}
    </style></head><body><main class="page"><img class="brand-logo" src="${brandLogo}" alt="Koenen Property Management Logo" /><div class="status">Freigegeben / abgeschlossen</div><h1>Nebenkostenabrechnung ${escapeHtml(String(target.meta.billingYear))}</h1><div class="sub">${safeObject} · ${escapeHtml(formatDate(target.meta.periodFrom))} bis ${escapeHtml(formatDate(target.meta.periodTo))}</div><div class="grid"><div class="box"><div class="label">Mieter</div><strong>${safeTenant}</strong><br/>${escapeHtml(apartment?.label || "—")}</div><div class="box"><div class="label">Vermieter</div><strong>${escapeHtml(target.meta.landlordName || "—")}</strong><br/>${escapeHtml(target.meta.landlordAddress || "")}</div></div><div class="kpis"><div class="kpi"><div class="label">Kalte Betriebskosten</div><div class="value">${escapeHtml(formatCurrency(summary.cold))}</div></div><div class="kpi"><div class="label">Heizkosten nach CO₂</div><div class="value">${escapeHtml(formatCurrency(Math.max(summary.heatingBeforeCo2-summary.co2Deduction,0)))}</div></div><div class="kpi"><div class="label">Vorauszahlungen</div><div class="value">${escapeHtml(formatCurrency(summary.advance))}</div></div><div class="kpi"><div class="label">${escapeHtml(summary.label)}</div><div class="value">${escapeHtml(formatCurrency(Math.abs(summary.balance)))}</div></div></div><h2>Kostenpositionen</h2><table><thead><tr><th>Kostenart</th><th>Schlüssel</th><th class="right">Betrag</th></tr></thead><tbody>${rows}</tbody></table><h2>Anlagen / Referenzen</h2><ul>${attachments}</ul><p class="sub">Archivnachweis: Diese Abrechnung wurde in der App abgeschlossen und ist gegen Bearbeitung gesperrt. Zum PDF-Speichern im Browser „Drucken“ → „Als PDF speichern“ wählen.</p></main></body></html>`;
  }

  function openArchivedBillingPdf(target: BillingWorkspace) {
    const win = window.open("", "_blank", "width=960,height=1200");
    if (!win) return;
    win.document.open();
    win.document.write(archivedBillingHtml(target));
    win.document.write(`<script>window.onload=function(){setTimeout(function(){window.print();},250)};</script>`);
    win.document.close();
  }

  function downloadArchivedBillingHtml(record: BillingRecord) {
    const summary = summarizeBilling(record.workspace);
    const tenant = summary.apartment?.tenantName || "ohne-Mieter";
    const filename = safeFilename(`NK-Archiv_${record.workspace.meta.billingYear}_${record.workspace.meta.propertyLabel}_${tenant}.html`);
    const blob = new Blob([archivedBillingHtml(record.workspace)], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-950 md:p-6 print:bg-white">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          html, body, #root { background: white !important; }
          body * { visibility: hidden !important; }
          #print-area, #print-area * { visibility: visible !important; }
          #print-area { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; display: block !important; font-family: Arial, Helvetica, sans-serif !important; color: #000 !important; }
          .no-print { display: none !important; }
          .print-page { page-break-after: always; break-after: page; }
          .print-page:last-child { page-break-after: auto; break-after: auto; }
          .avoid-break { break-inside: avoid; page-break-inside: avoid; }
          .print-table { width: 100%; border-collapse: collapse; font-size: 9.2pt; }
          .print-table th { border-bottom: 1.6px solid #000; text-align: left; font-weight: 700; padding: 4px 5px; }
          .print-table td { border-bottom: 0.6px solid #999; padding: 3.5px 5px; vertical-align: top; }
          .print-box { border-top: 3px double #000; border-bottom: 3px double #000; padding: 8px 10px; margin-top: 8px; }
          .print-title { font-size: 16pt; font-weight: 800; margin: 0 0 5px; }
          .print-subtitle { font-size: 11pt; margin: 0 0 7px; }
          .print-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 20px; font-size: 9.5pt; }
          .print-kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; }
          .print-kpi { border: 1px solid #000; padding: 6px; min-height: 42px; }
          .print-kpi-label { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; }
          .print-kpi-value { font-size: 13pt; font-weight: 800; margin-top: 3px; }
        }
      `}</style>

      <div className="mx-auto max-w-[1500px] space-y-6 no-print">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-500">Koenen Property Management</div>
              <h1 className="mt-1 text-2xl font-bold">NK-Abrechnungen Wohnungen</h1>
              <p className="mt-1 text-sm text-slate-500">Bearbeitung links, Ergebnis und Druckansicht unten. Der Druck gibt nur die fertige Abrechnung aus.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <SelectInput value={selectedBillingId ?? ""} onChange={e => selectBilling(e.target.value)} className="min-w-[260px]"><option value="">Abrechnung wählen</option>{billingRecords.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</SelectInput>
              <button onClick={createNewPartialBilling} className="inline-flex items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700"><Plus className="h-4 w-4"/> Teilabrechnung</button>
              <SelectInput value={selectedObjectCode} onChange={e => setSelectedObjectCode(e.target.value)}><option value="">Objekt wählen</option>{objects.map(o => <option key={o.objekt_code} value={o.objekt_code}>{o.label}</option>)}</SelectInput>
              <YearInput value={selectedYear} onChange={setSelectedYear} disabled={locked} />
              <SelectInput value={workspace.meta.workflowStatus ?? (locked ? "Freigegeben" : "offen")} onChange={e => updateMeta("workflowStatus", e.target.value as NkWorkflowStatus)} disabled={locked}>
                <option value="offen">offen</option>
                <option value="In Arbeit">In Arbeit</option>
                <option value="in Prüfung">in Prüfung</option>
                <option value="Freigegeben">Freigegeben</option>
                <option value="Korrigiert">Korrigiert</option>
              </SelectInput>
              <button onClick={() => updateMeta("locked", !locked)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium hover:bg-slate-50">{locked ? <Pencil className="h-4 w-4"/> : <Lock className="h-4 w-4"/>}{locked ? "Bearbeiten" : "Sperren"}</button>
            </div>
          </div>
          <div className="mt-5 flex gap-4 overflow-x-auto pb-1">
            {objects.map(o => {
              const active = o.objekt_code === selectedObjectCode;
              return (
                <button
                  key={o.objekt_code}
                  onClick={() => setSelectedObjectCode(o.objekt_code)}
                  className={`shrink-0 rounded-[999px] border px-7 py-4 text-lg font-extrabold transition ${active ? "border-indigo-400 bg-indigo-50 text-indigo-700 shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 text-sm text-slate-700">
            <div className="font-semibold text-slate-950">Objekt-Konfiguration: {selectedConfig.displayName}</div>
            <div className="mt-1">{selectedConfig.note}</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-white px-3 py-1 text-slate-700">Standardfläche: {formatFlex(selectedConfig.defaultArea)} m²</span>
              <span className="rounded-full bg-white px-3 py-1 text-slate-700">Standard-Schlüssel: {formatFlex(selectedConfig.defaultApartmentKey)} / {formatFlex(selectedConfig.defaultTotalKey)}</span>
              <span className="rounded-full bg-white px-3 py-1 text-slate-700">CO₂: {co2EnabledForSelectedObject ? "aktiv" : "nicht aktiv"}</span>
              <button type="button" onClick={restoreObjectDefaults} disabled={locked} className="rounded-full border border-indigo-200 bg-white px-3 py-1 text-indigo-700 disabled:opacity-50">Objekt-Defaults laden</button>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm text-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-950">NK-Automatik aus Buchhaltung</div>
                <div className="mt-1">
                  {nkLoading ? "Lade markierte NK-Buchungen..." : `${nkEntries.length} markierte Buchungen · Ausgaben ${formatCurrency(nkEntries.filter(e => e.entry_type === "expense").reduce((s, e) => s + Math.abs(e.amount), 0))} · Vorauszahlungen/Erstattungen ${formatCurrency(nkEntries.filter(e => e.entry_type === "income").reduce((s, e) => s + Math.abs(e.amount), 0))}`}
                </div>
              </div>
              <button type="button" onClick={importNkEntries} disabled={locked || nkEntries.length === 0} className="rounded-2xl border border-emerald-200 bg-white px-4 py-2 text-sm font-bold text-emerald-800 disabled:opacity-50">
                NK-Buchungen übernehmen
              </button>
            </div>
          </div>
          {(status || error || loading || saving) && <div className="mt-4 text-sm"><span className="text-slate-500">{loading ? "Lade… " : saving ? "Speichere… " : status}</span>{error && <span className="ml-3 text-rose-600">{error}</span>}</div>}
        </section>

        <Card title="Archiv abgeschlossener NK-Abrechnungen" icon={<FileText className="h-5 w-5"/>}>
          <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            Hier erscheinen alle freigegebenen/gesperrten Abrechnungen für das gewählte Objekt und Jahr. Die Einträge bleiben objektbezogen gespeichert und können jederzeit wieder als PDF geöffnet oder als Archivdatei heruntergeladen werden.
          </div>
          {archivedBillings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
              Noch keine abgeschlossene Abrechnung im Archiv. Nach dem Klick auf <strong>„Abschließen“</strong> wird die Abrechnung hier automatisch aufgeführt.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {archivedBillings.map((record) => {
                const summary = summarizeBilling(record.workspace);
                const tenant = summary.apartment?.tenantName || "ohne Mieter";
                return (
                  <div key={record.id} className="rounded-[24px] border border-emerald-100 bg-emerald-50/50 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">Freigegeben</div>
                        <h3 className="mt-3 text-base font-semibold text-slate-950">{record.workspace.meta.propertyLabel}</h3>
                        <p className="mt-1 text-sm text-slate-600">{formatDate(record.workspace.meta.periodFrom)} bis {formatDate(record.workspace.meta.periodTo)}</p>
                        <p className="mt-1 text-sm text-slate-600">{tenant}</p>
                      </div>
                      <div className="text-right text-sm font-semibold text-slate-950">{record.workspace.meta.billingYear}</div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-2xl bg-white p-3"><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Kosten</div><div className="mt-1 font-semibold">{formatCurrency(summary.tenantTotal)}</div></div>
                      <div className="rounded-2xl bg-white p-3"><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{summary.label}</div><div className={`mt-1 font-semibold ${summary.balance >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{formatCurrency(Math.abs(summary.balance))}</div></div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button onClick={() => openArchivedBillingPdf(record.workspace)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"><Printer className="h-4 w-4"/> PDF öffnen</button>
                      <button onClick={() => downloadArchivedBillingHtml(record)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"><FileText className="h-4 w-4"/> Archivdatei</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card title="Grunddaten" icon={<Home className="h-5 w-5"/>}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Abrechnungsjahr"><YearInput value={workspace.meta.billingYear} onChange={v => updateMeta("billingYear", v)} disabled={locked}/></Field>
              <Field label="Zeitraum von"><TextInput type="date" value={workspace.meta.periodFrom} onChange={e => updateMeta("periodFrom", e.target.value)} disabled={locked}/></Field>
              <Field label="Zeitraum bis"><TextInput type="date" value={workspace.meta.periodTo} onChange={e => updateMeta("periodTo", e.target.value)} disabled={locked}/></Field>
              <Field label="Vermieter"><TextInput value={workspace.meta.landlordName} onChange={e => updateMeta("landlordName", e.target.value)} disabled={locked}/></Field>
              <Field label="Vermieteradresse"><TextAreaInput value={workspace.meta.landlordAddress} onChange={e => updateMeta("landlordAddress", e.target.value)} disabled={locked} className="min-h-[118px]"/></Field>
              <Field label="Anlagen / Referenzen für Druck"><TextAreaInput value={workspace.meta.attachmentReferences} onChange={e => updateMeta("attachmentReferences", e.target.value)} disabled={locked} className="min-h-[118px]"/></Field>
            </div>
          </Card>

          <Card title="Wohnungen / Mieter" icon={<UserSquare2 className="h-5 w-5"/>} actions={<button onClick={addApartment} disabled={locked} className="inline-flex items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700"><Plus className="h-4 w-4"/> Wohnung hinzufügen</button>}>
            <div className="space-y-4">{workspace.apartments.map(a => <div key={a.id} className={`overflow-visible rounded-[24px] border p-5 ${workspace.selectedApartmentId === a.id ? "border-indigo-300 bg-indigo-50/50" : "border-slate-200 bg-white"}`}>
              <div className="mb-4 flex items-start justify-between gap-3"><button onClick={() => update(p => ({...p, selectedApartmentId: a.id}))} className="text-left"><div className="font-semibold">{a.label}</div><div className="text-sm text-slate-500">{a.tenantName || "Noch kein Mieter"}</div></button><div className="flex shrink-0 gap-2"><label className="rounded-full border bg-white px-3 py-2 text-sm"><input type="checkbox" className="mr-2" checked={a.active} disabled={locked} onChange={e => updateApartment(a.id, { active: e.target.checked })}/>belegt</label><button onClick={() => deleteApartment(a.id)} disabled={locked} className="h-10 w-10 rounded-2xl border border-rose-200 bg-rose-50 text-rose-700"><Trash2 className="mx-auto h-4 w-4"/></button></div></div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"><Field label="Wohnungsname"><TextInput value={a.label} onChange={e => updateApartment(a.id, { label: e.target.value })} disabled={locked}/></Field><Field label="Mietername"><TextInput value={a.tenantName} onChange={e => updateApartment(a.id, { tenantName: e.target.value })} disabled={locked}/></Field><Field label="Wohnfläche (m²)"><NumberInput value={a.area} onCommit={v => updateApartment(a.id, { area: v })} disabled={locked}/></Field><Field label="Standard-MEA / Info"><NumberInput value={a.allocationKey} onCommit={v => updateApartment(a.id, { allocationKey: v })} disabled={locked} decimals={4}/></Field><Field label="Personen"><NumberInput value={a.persons} onCommit={v => updateApartment(a.id, { persons: v })} disabled={locked} decimals={0}/></Field><Field label="Belegungsmonate"><NumberInput value={a.occupancyMonths} onCommit={v => updateApartment(a.id, { occupancyMonths: clamp(v,0,12) })} disabled={locked} decimals={0}/></Field><Field label="Vorauszahlungen (€)"><NumberInput value={a.advancePayments} onCommit={v => updateApartment(a.id, { advancePayments: v })} disabled={locked}/></Field>{co2EnabledForSelectedObject && <Field label="CO₂-Abzug Vermieter laut KALO (€)"><NumberInput value={a.co2LandlordDeductionKalo} onCommit={v => updateApartment(a.id, { co2LandlordDeductionKalo: v })} disabled={locked}/></Field>}</div>
            </div>)}</div>
          </Card>
        </div>

        <Card title="Kostenarten" icon={<Warehouse className="h-5 w-5"/>} actions={<button onClick={addCost} disabled={locked} className="inline-flex items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700"><Plus className="h-4 w-4"/> Kostenart hinzufügen</button>}>
          <div className="space-y-4">{workspace.costs.map(row => <div key={row.id} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><div><h3 className="text-lg font-semibold">{row.label}</h3><p className="text-sm text-slate-500">{allocationLabel(row.allocation)}</p></div><button onClick={() => deleteCost(row.id)} disabled={locked} className="h-10 w-10 rounded-2xl border border-rose-200 bg-rose-50 text-rose-700"><Trash2 className="mx-auto h-4 w-4"/></button></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6"><Field label="Bezeichnung"><TextInput value={row.label} onChange={e => updateCost(row.id, { label: e.target.value })} disabled={locked}/></Field><Field label="Gesamtbetrag (€)"><NumberInput value={row.amount} onCommit={v => updateCost(row.id, { amount: v })} disabled={locked}/></Field><Field label="Verteilung"><SelectInput value={row.allocation} onChange={e => updateCost(row.id, { allocation: e.target.value as AllocationType })} disabled={locked}><option value="allocationKey">Umlageschlüssel</option><option value="persons">Personen/Tage</option><option value="directAmount">Direktbetrag</option><option value="heatingDirect">KALO-Heizkosten direkt</option></SelectInput></Field>{(row.allocation === "allocationKey" || row.allocation === "persons") && <><Field label="Gesamt-Schlüssel"><NumberInput value={row.totalKey} onCommit={v => updateCost(row.id, { totalKey: v })} disabled={locked} decimals={4}/></Field><Field label="Wohnungs-Schlüssel"><NumberInput value={row.apartmentKey} onCommit={v => updateCost(row.id, { apartmentKey: v })} disabled={locked} decimals={4}/></Field></>}{(row.allocation === "directAmount" || row.allocation === "heatingDirect") && <Field label="Direktbetrag Mieter (€)"><NumberInput value={row.directAmount} onCommit={v => updateCost(row.id, { directAmount: v })} disabled={locked}/></Field>}<label className="flex min-h-[72px] items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700"><input type="checkbox" checked={row.prorateByOccupancy} disabled={locked || row.allocation === "directAmount" || row.allocation === "heatingDirect"} onChange={e => updateCost(row.id, { prorateByOccupancy: e.target.checked })}/><span>nach Belegungsmonaten kürzen</span></label></div><div className="mt-3 grid gap-4 md:grid-cols-[1fr_180px]"><Field label="Notiz"><TextInput value={row.note} onChange={e => updateCost(row.id, { note: e.target.value })} disabled={locked} /></Field><div className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Mieteranteil</div><div className="mt-1 text-xl font-semibold">{formatCurrency(costBreakdown.find(x => x.row.id === row.id)?.tenantShare ?? 0)}</div></div></div></div>)}</div>
        </Card>

        {co2EnabledForSelectedObject ? <Card title="Heizkosten / CO₂-Anlage" icon={<Calculator className="h-5 w-5"/>}><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Field label="Heizkosten gesamt KALO"><NumberInput value={workspace.heating.totalHeatingCost} onCommit={v => updateHeating("totalHeatingCost", v)} disabled={locked}/></Field><Field label="Warmwasser gesamt"><NumberInput value={workspace.heating.totalWarmWaterCost} onCommit={v => updateHeating("totalWarmWaterCost", v)} disabled={locked}/></Field><Field label="CO₂-Kosten gesamt"><NumberInput value={workspace.heating.totalCo2Cost} onCommit={v => updateHeating("totalCo2Cost", v)} disabled={locked}/></Field><Field label="Gesamtverbrauch kWh"><NumberInput value={workspace.heating.totalConsumptionKwh} onCommit={v => updateHeating("totalConsumptionKwh", v)} disabled={locked}/></Field><Field label="Emissionsfaktor"><NumberInput value={workspace.heating.emissionFactor} onCommit={v => updateHeating("emissionFactor", v)} disabled={locked} decimals={4}/></Field><Field label="Beheizte Fläche m²"><NumberInput value={workspace.heating.heatedArea} onCommit={v => updateHeating("heatedArea", v)} disabled={locked}/></Field></div><div className="mt-4 grid gap-4 md:grid-cols-4"><Stat title="CO₂ gesamt" value={`${formatNumber(co2TotalKg,0)} kg`}/><Stat title="CO₂ je m²/Jahr" value={formatNumber(co2PerSqm,1)}/><Stat title="Stufe" value={String(co2Stage.stage)}/><Stat title="Mieter / Vermieter" value={`${co2Stage.tenantPercent}% / ${co2Stage.landlordPercent}%`}/></div></Card> : <Card title="Heizkosten / CO₂" icon={<Calculator className="h-5 w-5"/>}><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"><strong>Für dieses Objekt ist keine automatische Heizkosten-/CO₂-Berechnung aktiv.</strong><br />{selectedConfig.heatingMode === "separate_contract" ? "Der Mieter hat einen separaten Energieversorgervertrag; Heizkosten werden nicht über diese NK-Abrechnung verteilt." : "Kosten können bei Bedarf als normale Direktbeträge oder Bescheid-Positionen erfasst werden."}</div></Card>}

        <Card title="Ergebnis / Druck" icon={<FileText className="h-5 w-5"/>} actions={<div className="flex gap-2"><button onClick={exportOnePager} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium"><FileText className="h-4 w-4"/> Export</button><button onClick={printBillingDocument} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium"><Printer className="h-4 w-4"/> Drucken</button><button onClick={finishBilling} className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-600 px-4 py-2 text-sm font-medium text-white"><CheckCircle2 className="h-4 w-4"/> Abschließen</button></div>}><div className="grid gap-4 md:grid-cols-4"><Stat title="Kalte Betriebskosten" value={formatCurrency(totalColdCosts)}/><Stat title="Heizkosten vor CO₂" value={formatCurrency(totalHeatingBeforeCo2)}/><Stat title="CO₂-Abzug Vermieter" value={`-${formatCurrency(totalCo2LandlordShare)}`} accent="success"/><Stat title="Gesamtkosten Mieter" value={formatCurrency(totalTenantCosts)}/><Stat title="Vorauszahlungen" value={formatCurrency(activeApartment?.advancePayments ?? 0)}/><Stat title={balanceLabel} value={formatCurrency(Math.abs(tenantBalance))} accent={tenantBalance >= 0 ? "success" : "danger"}/></div><div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"><div className="font-semibold text-slate-950">Dokumentation Heizkosten / CO₂</div><div className="mt-1">Heizkosten laut Einzelabrechnung: <strong>{formatCurrency(totalHeatingBeforeCo2)}</strong> · CO₂-Abzug Vermieter: <strong>-{formatCurrency(totalCo2LandlordShare)}</strong> · Umlagefähig nach CO₂-Abzug: <strong>{formatCurrency(totalHeatingCosts)}</strong></div><div className="mt-2 text-xs text-slate-500">Druckhinweis: Im Browser beim PDF-Speichern am besten Kopf- und Fußzeilen deaktivieren.</div></div>{validationWarnings.length > 0 ? <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><div className="font-semibold">Plausibilitätsprüfung vor Abschluss</div><ul className="mt-2 list-disc pl-5">{validationWarnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div> : <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900">Plausibilitätsprüfung: keine Warnungen.</div>}</Card>
      </div>

      <section id="print-area" className="hidden print:block">
        <div className="print-page">
          <div className="print-box avoid-break">
            <p className="print-title">Nebenkostenabrechnung {workspace.meta.billingYear}</p>
            <p className="print-subtitle">{workspace.meta.propertyLabel} · {formatDate(workspace.meta.periodFrom)} bis {formatDate(workspace.meta.periodTo)}</p>
            <div className="print-grid"><span><strong>Vermieter:</strong> {workspace.meta.landlordName || "—"}</span><span><strong>Wohnung/Mieter:</strong> {activeApartment?.label || "—"} / {activeApartment?.tenantName || "—"}</span><span><strong>Vermieteradresse:</strong> {workspace.meta.landlordAddress || "—"}</span><span><strong>Wohnfläche / MEA / Personen:</strong> {formatFlex(activeApartment?.area ?? 0)} m² / {formatFlex(activeApartment?.allocationKey ?? 0)} / {formatFlex(activeApartment?.persons ?? 0)}</span><span><strong>CO₂-Abzug Vermieter laut KALO:</strong> {formatCurrency(activeApartment?.co2LandlordDeductionKalo ?? 0)}</span></div>
          </div>
          <div className="print-box avoid-break"><strong>Kostenverteilung</strong><div className="print-grid" style={{marginTop: 6}}><span>Miteigentumsanteile gesamt: <strong>{formatFlex(Math.max(...costBreakdown.map(x => x.row.totalKey || 0), 0))} MEA</strong></span><span>Ihre MEA: <strong>{formatFlex(activeApartment?.allocationKey ?? 0)}</strong></span><span>Miteigentumsanteile Wohnungen: <strong>{formatFlex(costBreakdown.find(x => x.row.label.toLowerCase().includes("wasser"))?.row.totalKey || 0)}</strong></span><span>Ihre Einheiten: <strong>1</strong></span><span>Gesamtpersonen: <strong>{formatFlex(costBreakdown.find(x => x.row.allocation === "persons")?.row.totalKey || 0)}</strong></span><span>Ihre Personen / Monate: <strong>{formatFlex(activeApartment?.persons ?? 0)} / {formatFlex(activeApartment?.occupancyMonths ?? 0)}</strong></span></div></div>
          <h2 style={{fontSize: "12pt", margin: "10px 0 5px"}}>Kostenarten und Anteilsberechnung</h2>
          <table className="print-table"><thead><tr><th>Kostenart</th><th>Gesamtkosten</th><th>Gesamt</th><th>Wohnung</th><th>Anteilsberechnung</th><th style={{textAlign:"right"}}>Betrag</th></tr></thead><tbody>{costBreakdown.map(x => <tr key={`p-${x.row.id}`}><td>{x.row.label}</td><td>{formatCurrency(x.row.amount)}</td><td>{x.row.totalKey ? formatFlex(x.row.totalKey) : "Direkt"}</td><td>{x.row.totalKey ? formatFlex(x.row.apartmentKey) : "—"}</td><td>{calculationText(x)}{x.co2LandlordShare > 0 ? ` abzüglich CO₂ ${formatCurrency(x.co2LandlordShare)}` : ""}</td><td style={{textAlign:"right", fontWeight:700}}>{formatCurrency(x.tenantShare)}</td></tr>)}</tbody></table>
          <div className="print-kpi-grid avoid-break" style={{marginTop: 8}}><div className="print-kpi"><div className="print-kpi-label">Kalte Betriebskosten</div><div className="print-kpi-value">{formatCurrency(totalColdCosts)}</div></div><div className="print-kpi"><div className="print-kpi-label">Heizkosten nach CO₂</div><div className="print-kpi-value">{formatCurrency(totalHeatingCosts)}</div></div><div className="print-kpi"><div className="print-kpi-label">Gesamtkosten</div><div className="print-kpi-value">{formatCurrency(totalTenantCosts)}</div></div><div className="print-kpi"><div className="print-kpi-label">{balanceLabel}</div><div className="print-kpi-value">{formatCurrency(Math.abs(tenantBalance))}</div></div></div><div className="print-box avoid-break" style={{marginTop: 8}}><strong>Dokumentation Heizkosten/CO₂:</strong> Heizkosten laut Einzelabrechnung {formatCurrency(totalHeatingBeforeCo2)}; abzüglich Vermieteranteil CO₂ {formatCurrency(totalCo2LandlordShare)}; umlagefähige Heizkosten nach CO₂-Abzug {formatCurrency(totalHeatingCosts)}.</div>
        </div>
        <div className="print-page">
          <div className="print-box avoid-break"><p className="print-title">ANLAGE</p><p className="print-subtitle">Heizkosten / CO₂-Anlage für das Jahr {workspace.meta.billingYear}</p><div className="print-kpi-grid"><div className="print-kpi"><div className="print-kpi-label">Heizkosten gesamt KALO</div><div className="print-kpi-value">{formatCurrency(workspace.heating.totalHeatingCost)}</div></div><div className="print-kpi"><div className="print-kpi-label">CO₂-Kosten gesamt</div><div className="print-kpi-value">{formatCurrency(workspace.heating.totalCo2Cost)}</div></div><div className="print-kpi"><div className="print-kpi-label">CO₂ gesamt</div><div className="print-kpi-value">{formatNumber(co2TotalKg,0)} kg</div></div><div className="print-kpi"><div className="print-kpi-label">Stufe / Aufteilung</div><div className="print-kpi-value">{co2Stage.stage} · {co2Stage.tenantPercent}%/{co2Stage.landlordPercent}%</div></div></div></div>
          <div className="print-box avoid-break"><h2 style={{fontSize: "12pt", margin: 0}}>Aufwände gem. § 35a Abs. 2 Satz 1 EStG haushaltsnahe Dienstleistungen und § 35a Abs. 3 EStG Handwerkerleistungen</h2><table className="print-table" style={{marginTop: 8}}><thead><tr><th>Kostenart</th><th>Gesamtkosten</th><th>Anteilsberechnung</th><th style={{textAlign:"right"}}>Betrag</th></tr></thead><tbody>{serviceRows.length ? serviceRows.map(x => <tr key={`s-${x.row.id}`}><td>{x.row.label}</td><td>{formatCurrency(x.row.amount)}</td><td>{calculationText(x)}</td><td style={{textAlign:"right", fontWeight:700}}>{formatCurrency(x.tenantShare)}</td></tr>) : <tr><td colSpan={4}>Keine § 35a-relevanten Kostenarten markiert/eingetragen.</td></tr>}</tbody></table></div>
          <div className="print-box avoid-break"><strong>Anlagen / Referenzen</strong><ul style={{margin: "6px 0 0 18px", padding: 0}}>{attachmentList.length ? attachmentList.map((x, i) => <li key={i}><strong>Anlage {i + 1}:</strong> {x}</li>) : <li>Keine Anlagen eingetragen.</li>}</ul></div>
        </div>
      </section>
    </main>
  );
}
