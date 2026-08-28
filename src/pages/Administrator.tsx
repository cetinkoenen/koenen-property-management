import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  ChevronDown,
  Edit3,
  Home,
  Landmark,
  PlusCircle,
  Save,
  ShieldCheck,
  Trash2,
  UserPlus,
  Warehouse,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { isAdminEmail } from "../auth/accessControl";
import { supabase } from "../lib/supabaseClient";

type PropertyKind = "multi_family" | "house" | "apartment" | "garage" | "land" | "commercial";
type PortfolioDbType = "HOUSE" | "APARTMENT" | "GARAGE";
type UnitDbType = "apartment" | "garage";
type UserRoleInput = "viewer" | "admin";
type AdministratorFocus = "all" | "property" | "tenant" | "users";

type PropertyForm = {
  kind: PropertyKind;
  name: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  state: string;
  unitLabel: string;
  unitCount: string;
  usageType: string;
  rentType: string;
  coldRent: string;
  operatingCosts: string;
  totalRent: string;
  startDate: string;
  endDate: string;
  livingArea: string;
  plotArea: string;
  rooms: string;
  yearBuilt: string;
  purchasePrice: string;
  purchaseDate: string;
  marketValue: string;
  equipment: string;
  notes: string;
};

type UserForm = {
  email: string;
  password: string;
  role: UserRoleInput;
  requiresApproval: boolean;
};

type ManagedPropertyRow = {
  id: string;
  core_property_id: string | null;
  type: PortfolioDbType;
  property_type: string | null;
  name: string;
  description: string | null;
  year_built: number | null;
  living_area_m2: number | null;
  plot_area_m2: number | null;
  sort_index: number;
  rental?: {
    id: string;
    unit_id: string;
    rent_type: string | null;
    rent_monthly: number | null;
    kaltmiete_laut_mietvertrag: number | null;
    nebenkosten: number | null;
    gesamt_mietkosten: number | null;
    start_date: string | null;
    end_date: string | null;
  } | null;
  rentals?: ManagedRentalRow[];
  extra?: {
    living_area?: string | null;
    rooms?: string | null;
    cold_rent?: string | null;
    operating_costs?: string | null;
    total_rent?: string | null;
    market_value?: string | null;
    equipment?: string | null;
  } | null;
};

type ManagedRentalRow = {
  id: string;
  property_id: string;
  unit_id: string | null;
  rent_type: string | null;
  rent_monthly: number | null;
  kaltmiete_laut_mietvertrag: number | null;
  nebenkosten: number | null;
  gesamt_mietkosten: number | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type RentAdjustmentRow = {
  id: string;
  property_id: string | null;
  object_label: string;
  effective_date: string;
  effective_end_date: string | null;
  new_cold_rent: number | null;
  new_operating_costs: number | null;
  new_total_rent: number | null;
  created_at: string | null;
};

type ManagedUserRow = {
  email: string;
  user_id: string | null;
  role: UserRoleInput;
  requires_login_approval: boolean;
  approved_at: string | null;
  is_active: boolean;
  created_at: string | null;
  access_created_at: string | null;
  updated_at: string | null;
  last_sign_in_at: string | null;
};

type PendingMfaAction = {
  title: string;
  description: string;
  confirmLabel: string;
  run: () => Promise<void>;
};

const PROPERTY_KIND_OPTIONS: Array<{ value: PropertyKind; label: string; description: string; icon: typeof Home }> = [
  { value: "multi_family", label: "Mehrfamilienhaus", description: "Mehrere Einheiten, Wohnungen oder gemischte Vermietung.", icon: Building2 },
  { value: "house", label: "Haus", description: "Einfamilienhaus, Reihenhaus oder selbstständiges Objekt.", icon: Home },
  { value: "apartment", label: "Wohnung", description: "Einzelne Wohnung mit Mieter- und Mietdaten.", icon: Building2 },
  { value: "garage", label: "Garage / Stellplatz", description: "Garage, Tiefgarage oder einzelner Stellplatz.", icon: Warehouse },
  { value: "land", label: "Grundstück", description: "Grundstück ohne laufende Wohnungsvermietung.", icon: Landmark },
  { value: "commercial", label: "Gewerbe", description: "Gewerbeeinheit, Laden, Büro oder gemischte Nutzung.", icon: Building2 },
];

const KIND_TO_DB: Record<PropertyKind, { portfolioType: PortfolioDbType; unitType: UnitDbType; unitLabel: string; rentType: string; usageType: string }> = {
  multi_family: { portfolioType: "HOUSE", unitType: "apartment", unitLabel: "Einheit 1", rentType: "Wohnung", usageType: "Vermietet / Mehrfamilienhaus" },
  house: { portfolioType: "HOUSE", unitType: "apartment", unitLabel: "Haus", rentType: "Haus", usageType: "Vermietet / Haus" },
  apartment: { portfolioType: "APARTMENT", unitType: "apartment", unitLabel: "Wohnung", rentType: "Wohnung", usageType: "Vermietete Wohnung" },
  garage: { portfolioType: "GARAGE", unitType: "garage", unitLabel: "Garage", rentType: "Garage", usageType: "Vermietete Garage / Stellplatz" },
  land: { portfolioType: "HOUSE", unitType: "apartment", unitLabel: "Grundstück", rentType: "Grundstück", usageType: "Grundstück" },
  commercial: { portfolioType: "APARTMENT", unitType: "apartment", unitLabel: "Gewerbeeinheit", rentType: "Gewerbe", usageType: "Gewerbliche Vermietung" },
};

const emptyPropertyForm: PropertyForm = {
  kind: "apartment",
  name: "",
  street: "",
  houseNumber: "",
  postalCode: "",
  city: "",
  state: "Deutschland",
  unitLabel: "Wohnung",
  unitCount: "1",
  usageType: "Vermietete Wohnung",
  rentType: "Wohnung",
  coldRent: "",
  operatingCosts: "",
  totalRent: "",
  startDate: "",
  endDate: "",
  livingArea: "",
  plotArea: "",
  rooms: "",
  yearBuilt: "",
  purchasePrice: "",
  purchaseDate: "",
  marketValue: "",
  equipment: "",
  notes: "",
};

const emptyUserForm: UserForm = {
  email: "",
  password: "",
  role: "viewer",
  requiresApproval: true,
};

const headerCopy: Record<AdministratorFocus, { eyebrow: string; title: string; description: string }> = {
  all: {
    eyebrow: "Administration",
    title: "Administrator",
    description: "Zentrale Anlage für neue Immobilien, Mieterstammdaten und Benutzerrechte.",
  },
  property: {
    eyebrow: "Immobilien",
    title: "Immobilie anlegen",
    description: "Neue Immobilien werden hier einmal sauber angelegt und danach in Immobilienvermögen, Vermietung, Mieteingang und Steuer nutzbar.",
  },
  tenant: {
    eyebrow: "Mieter",
    title: "Mieter-Stammdaten",
    description: "Mieter anlegen und Mietverhältnisse im Mieterbereich pflegen.",
  },
  users: {
    eyebrow: "Einstellungen",
    title: "Benutzer- & Rechteverwaltung",
    description: "Benutzer, Rollen und Login-Sicherheit verwalten. Immobilien- und Mieterstammdaten liegen in den Fachbereichen.",
  },
};

function parseMoney(value: string): number | null {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function money(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
  if (value === null || value === undefined || value === "") return 0;
  const parsed = parseMoney(String(value));
  return parsed === null ? 0 : Math.round(parsed * 100) / 100;
}

function numberToInput(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  if (!Number.isFinite(Number(String(value).replace(",", ".")))) return String(value);
  return String(value).replace(".", ",");
}

function parseNumber(value: string): number | null {
  return parseMoney(value);
}

function cleanText(value: string): string | null {
  const cleaned = value.trim();
  return cleaned ? cleaned : null;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Noch kein Login";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Nicht verfuegbar";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function composeAddress(form: PropertyForm): string {
  return [form.street, form.houseNumber].map((part) => part.trim()).filter(Boolean).join(" ");
}

function composePropertyName(form: PropertyForm): string {
  const direct = form.name.trim();
  if (direct) return direct;
  const address = composeAddress(form);
  return [address, form.postalCode, form.city].map((part) => part.trim()).filter(Boolean).join(", ");
}

function buildDescription(form: PropertyForm): string {
  const kindLabel = PROPERTY_KIND_OPTIONS.find((option) => option.value === form.kind)?.label ?? "Immobilie";
  const lines = [
    `Art: ${kindLabel}`,
    form.usageType ? `Nutzung: ${form.usageType}` : "",
    form.purchaseDate ? `Kaufdatum: ${form.purchaseDate}` : "",
    form.purchasePrice ? `Kaufpreis: ${form.purchasePrice} EUR` : "",
    form.equipment ? `Ausstattung: ${form.equipment}` : "",
    form.notes ? `Notiz: ${form.notes}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function formatCurrency(value: number | string | null | undefined): string {
  const parsed = typeof value === "number" ? value : parseMoney(String(value ?? ""));
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(parsed ?? 0);
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function currentMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const endDate = new Date(year, month + 1, 0);
  const end = `${year}-${String(month + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
  return { start, end };
}

function rentalOverlapsRange(rental: ManagedRentalRow, start: string, end: string): boolean {
  if (!rental.start_date || rental.start_date > end) return false;
  if (rental.end_date && rental.end_date < start) return false;
  return money(rental.rent_monthly ?? rental.gesamt_mietkosten) > 0;
}

function adjustmentOverlapsRange(adjustment: RentAdjustmentRow, start: string, end: string): boolean {
  if (!adjustment.effective_date || adjustment.effective_date > end) return false;
  if (adjustment.effective_end_date && adjustment.effective_end_date < start) return false;
  return money((adjustment.new_cold_rent ?? 0) + (adjustment.new_operating_costs ?? 0)) > 0 || money(adjustment.new_total_rent) > 0;
}

function candidateIdsForManagedRow(row: ManagedPropertyRow): Set<string> {
  return new Set([row.id, row.core_property_id].filter(Boolean) as string[]);
}

function labelsReferToSameUnit(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if ((left.includes("p250") || right.includes("p250")) && left.includes("p250") && right.includes("p250")) return true;
  if ((left.includes("p253") || right.includes("p253")) && left.includes("p253") && right.includes("p253")) return true;
  if ((left.includes("p254") || right.includes("p254")) && left.includes("p254") && right.includes("p254")) return true;
  if (left.includes("garage") && right.includes("garage") && left.replace(/\D/g, "") === right.replace(/\D/g, "")) return true;
  return false;
}

function adjustmentTotalFromMietentwicklung(adjustment: RentAdjustmentRow): number {
  const splitTotal = money((adjustment.new_cold_rent ?? 0) + (adjustment.new_operating_costs ?? 0));
  return splitTotal > 0 ? splitTotal : money(adjustment.new_total_rent);
}

function adjustmentUnitKey(rowLabel: string, adjustment: RentAdjustmentRow): string {
  const label = normalizeText(adjustment.object_label);
  for (const unit of ["p250", "p253", "p254"]) {
    if (label.includes(unit)) return unit;
  }
  const garageNumber = label.match(/\bgarage\s*(\d+)\b/)?.[1];
  if (garageNumber) return `garage-${garageNumber}`;
  if (labelsReferToSameUnit(label, rowLabel)) return "object";
  return label || adjustment.id;
}

function monthlyRentFromMietentwicklung(row: ManagedPropertyRow, adjustments: RentAdjustmentRow[]): number {
  const { start, end } = currentMonthRange();
  const candidateIds = candidateIdsForManagedRow(row);
  const rowLabel = normalizeText(row.name);
  const matchingActiveAdjustments = adjustments
    .filter((adjustment) => {
      if (!adjustmentOverlapsRange(adjustment, start, end)) return false;
      if (adjustment.property_id && candidateIds.has(adjustment.property_id)) return true;
      const adjustmentLabel = normalizeText(adjustment.object_label);
      return Boolean(adjustmentLabel && rowLabel && (
        labelsReferToSameUnit(adjustmentLabel, rowLabel) ||
        adjustmentLabel.startsWith(`${rowLabel} `)
      ));
    })
    .sort((a, b) => {
      const aKey = `${a.effective_date ?? ""}|${a.created_at ?? ""}`;
      const bKey = `${b.effective_date ?? ""}|${b.created_at ?? ""}`;
      return bKey.localeCompare(aKey);
    });

  if (matchingActiveAdjustments.length > 0) {
    const hasUnitLevelAdjustments = matchingActiveAdjustments.some((adjustment) => {
      const key = adjustmentUnitKey(rowLabel, adjustment);
      return key !== "object";
    });

    if (hasUnitLevelAdjustments) {
      const latestByUnit = new Map<string, RentAdjustmentRow>();
      for (const adjustment of matchingActiveAdjustments) {
        const key = adjustmentUnitKey(rowLabel, adjustment);
        if (!latestByUnit.has(key)) latestByUnit.set(key, adjustment);
      }
      const unitTotal = [...latestByUnit.values()].reduce((sum, adjustment) => sum + adjustmentTotalFromMietentwicklung(adjustment), 0);
      if (unitTotal > 0) return money(unitTotal);
    }

    const activeAdjustment = matchingActiveAdjustments[0];
    const total = adjustmentTotalFromMietentwicklung(activeAdjustment);
    if (total > 0) return total;
  }

  const activeRentals = (row.rentals ?? []).filter((rental) => rentalOverlapsRange(rental, start, end));
  const rentalTotal = activeRentals.reduce((sum, rental) => sum + money(rental.rent_monthly ?? rental.gesamt_mietkosten), 0);
  if (rentalTotal > 0) return money(rentalTotal);

  return money(row.rental?.rent_monthly ?? row.rental?.gesamt_mietkosten ?? row.extra?.total_rent);
}

function formFromManagedRow(row: ManagedPropertyRow): PropertyForm {
  const kind = (PROPERTY_KIND_OPTIONS.find((option) => option.label === row.property_type)?.value ?? (
    row.type === "GARAGE" ? "garage" : row.type === "HOUSE" ? "house" : "apartment"
  )) as PropertyKind;
  const description = row.description ?? "";
  const purchaseDate = /Kaufdatum:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/.exec(description)?.[1] ?? "";
  const purchasePrice = /Kaufpreis:\s*([0-9.,]+)\s*EUR/.exec(description)?.[1] ?? "";
  const usageType = /Nutzung:\s*([^\n]+)/.exec(description)?.[1] ?? KIND_TO_DB[kind].usageType;
  return {
    ...emptyPropertyForm,
    kind,
    name: row.name,
    unitLabel: "",
    usageType,
    rentType: row.rental?.rent_type ?? KIND_TO_DB[kind].rentType,
    coldRent: numberToInput(row.rental?.kaltmiete_laut_mietvertrag ?? row.extra?.cold_rent),
    operatingCosts: numberToInput(row.rental?.nebenkosten ?? row.extra?.operating_costs),
    totalRent: numberToInput(row.rental?.gesamt_mietkosten ?? row.extra?.total_rent),
    startDate: toDateInput(row.rental?.start_date),
    endDate: toDateInput(row.rental?.end_date),
    livingArea: numberToInput(row.living_area_m2 ?? row.extra?.living_area),
    plotArea: numberToInput(row.plot_area_m2),
    rooms: String(row.extra?.rooms ?? ""),
    yearBuilt: row.year_built ? String(row.year_built) : "",
    purchasePrice,
    purchaseDate,
    marketValue: String(row.extra?.market_value ?? ""),
    equipment: String(row.extra?.equipment ?? ""),
    notes: row.description ?? "",
  };
}

function normalizeExistingRows(payload: unknown[]): ManagedPropertyRow[] {
  const rows = (payload ?? []) as Array<Record<string, unknown>>;
  return rows.map((row) => {
    const rentals = Array.isArray(row.portfolio_property_rentals) ? row.portfolio_property_rentals as Array<Record<string, unknown>> : [];
    const extras = Array.isArray(row.property_extra_info) ? row.property_extra_info as Array<Record<string, unknown>> : [];
    const rental = rentals[0];
    const extra = extras[0];
    return {
      id: String(row.id),
      core_property_id: row.core_property_id ? String(row.core_property_id) : null,
      type: String(row.type ?? "APARTMENT") as PortfolioDbType,
      property_type: row.property_type ? String(row.property_type) : null,
      name: String(row.name ?? "Unbenannt"),
      description: row.description ? String(row.description) : null,
      year_built: row.year_built === null || row.year_built === undefined ? null : Number(row.year_built),
      living_area_m2: row.living_area_m2 === null || row.living_area_m2 === undefined ? null : Number(row.living_area_m2),
      plot_area_m2: row.plot_area_m2 === null || row.plot_area_m2 === undefined ? null : Number(row.plot_area_m2),
      sort_index: Number(row.sort_index ?? 0),
      rental: rental ? {
        id: String(rental.id),
        unit_id: String(rental.unit_id),
        rent_type: rental.rent_type ? String(rental.rent_type) : null,
        rent_monthly: rental.rent_monthly === null || rental.rent_monthly === undefined ? null : Number(rental.rent_monthly),
        kaltmiete_laut_mietvertrag: rental.kaltmiete_laut_mietvertrag === null || rental.kaltmiete_laut_mietvertrag === undefined ? null : Number(rental.kaltmiete_laut_mietvertrag),
        nebenkosten: rental.nebenkosten === null || rental.nebenkosten === undefined ? null : Number(rental.nebenkosten),
        gesamt_mietkosten: rental.gesamt_mietkosten === null || rental.gesamt_mietkosten === undefined ? null : Number(rental.gesamt_mietkosten),
        start_date: rental.start_date ? String(rental.start_date) : null,
        end_date: rental.end_date ? String(rental.end_date) : null,
      } : null,
      rentals: rentals.map((rental) => ({
        id: String(rental.id),
        property_id: String(rental.property_id ?? row.id),
        unit_id: rental.unit_id ? String(rental.unit_id) : null,
        rent_type: rental.rent_type ? String(rental.rent_type) : null,
        rent_monthly: rental.rent_monthly === null || rental.rent_monthly === undefined ? null : Number(rental.rent_monthly),
        kaltmiete_laut_mietvertrag: rental.kaltmiete_laut_mietvertrag === null || rental.kaltmiete_laut_mietvertrag === undefined ? null : Number(rental.kaltmiete_laut_mietvertrag),
        nebenkosten: rental.nebenkosten === null || rental.nebenkosten === undefined ? null : Number(rental.nebenkosten),
        gesamt_mietkosten: rental.gesamt_mietkosten === null || rental.gesamt_mietkosten === undefined ? null : Number(rental.gesamt_mietkosten),
        start_date: rental.start_date ? String(rental.start_date) : null,
        end_date: rental.end_date ? String(rental.end_date) : null,
        created_at: rental.created_at ? String(rental.created_at) : null,
        updated_at: rental.updated_at ? String(rental.updated_at) : null,
      })),
      extra: extra ? {
        living_area: extra.living_area ? String(extra.living_area) : null,
        rooms: extra.rooms ? String(extra.rooms) : null,
        cold_rent: extra.cold_rent ? String(extra.cold_rent) : null,
        operating_costs: extra.operating_costs ? String(extra.operating_costs) : null,
        total_rent: extra.total_rent ? String(extra.total_rent) : null,
        market_value: extra.market_value ? String(extra.market_value) : null,
        equipment: extra.equipment ? String(extra.equipment) : null,
      } : null,
    };
  }).sort((a, b) => a.sort_index - b.sort_index || a.name.localeCompare(b.name, "de"));
}

export default function Administrator({ focus = "all" }: { focus?: AdministratorFocus }) {
  const { user } = useAuth();
  const isAdmin = isAdminEmail(user?.email);
  const showProperty = focus === "all" || focus === "property";
  const showTenant = focus === "all" || focus === "tenant";
  const showUsers = focus === "all" || focus === "users";
  const copy = headerCopy[focus];
  const [propertyForm, setPropertyForm] = useState<PropertyForm>(emptyPropertyForm);
  const [userForm, setUserForm] = useState<UserForm>(emptyUserForm);
  const [propertyStatus, setPropertyStatus] = useState<string | null>(null);
  const [userStatus, setUserStatus] = useState<string | null>(null);
  const [propertyError, setPropertyError] = useState<string | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [savingProperty, setSavingProperty] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [managedUsers, setManagedUsers] = useState<ManagedUserRow[]>([]);
  const [openUserEmail, setOpenUserEmail] = useState<string | null>(null);
  const [savingUserEmail, setSavingUserEmail] = useState<string | null>(null);
  const [deletingUserEmail, setDeletingUserEmail] = useState<string | null>(null);
  const [pendingMfaAction, setPendingMfaAction] = useState<PendingMfaAction | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [managedRows, setManagedRows] = useState<ManagedPropertyRow[]>([]);
  const [rentAdjustments, setRentAdjustments] = useState<RentAdjustmentRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    basis: true,
    miete: true,
    wirtschaft: false,
    notizen: false,
  });

  const propertyName = useMemo(() => composePropertyName(propertyForm), [propertyForm]);
  const selectedKind = PROPERTY_KIND_OPTIONS.find((option) => option.value === propertyForm.kind) ?? PROPERTY_KIND_OPTIONS[2];
  const calculatedTotalRent = useMemo(() => {
    const cold = parseMoney(propertyForm.coldRent) ?? 0;
    const costs = parseMoney(propertyForm.operatingCosts) ?? 0;
    return cold + costs;
  }, [propertyForm.coldRent, propertyForm.operatingCosts]);

  const loadManagedRows = useCallback(async () => {
    if (!isAdmin || !showProperty) return;
    setLoadingRows(true);
    try {
      const { data, error } = await supabase
        .from("portfolio_properties")
        .select(`
          id,
          core_property_id,
          type,
          property_type,
          name,
          description,
          year_built,
          living_area_m2,
          plot_area_m2,
          sort_index,
          portfolio_property_rentals(id, property_id, unit_id, rent_type, rent_monthly, kaltmiete_laut_mietvertrag, nebenkosten, gesamt_mietkosten, start_date, end_date, created_at, updated_at)
        `)
        .eq("is_test", false)
        .order("sort_index", { ascending: true });
      if (error) throw error;
      const rows = normalizeExistingRows(data ?? []);
      const lookupIds = Array.from(new Set(rows.flatMap((row) => [row.id, row.core_property_id].filter(Boolean) as string[])));
      const [{ data: extrasData, error: extrasError }, { data: adjustmentData, error: adjustmentError }] = await Promise.all([
        lookupIds.length
          ? supabase
            .from("property_extra_info")
            .select("property_id, living_area, rooms, cold_rent, operating_costs, total_rent, market_value, equipment")
            .in("property_id", lookupIds)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("rent_adjustments")
          .select("id,property_id,object_label,effective_date,effective_end_date,new_cold_rent,new_operating_costs,new_total_rent,created_at")
          .eq("is_deleted", false)
          .order("effective_date", { ascending: false }),
      ]);
      if (extrasError) throw extrasError;
      if (adjustmentError) throw adjustmentError;
      const extrasById = new Map(
        ((extrasData ?? []) as Array<Record<string, unknown>>).map((extra) => [
          String(extra.property_id),
          {
            living_area: extra.living_area ? String(extra.living_area) : null,
            rooms: extra.rooms ? String(extra.rooms) : null,
            cold_rent: extra.cold_rent ? String(extra.cold_rent) : null,
            operating_costs: extra.operating_costs ? String(extra.operating_costs) : null,
            total_rent: extra.total_rent ? String(extra.total_rent) : null,
            market_value: extra.market_value ? String(extra.market_value) : null,
            equipment: extra.equipment ? String(extra.equipment) : null,
          },
        ]),
      );
      setManagedRows(rows.map((row) => ({
        ...row,
        extra: extrasById.get(row.id) ?? (row.core_property_id ? extrasById.get(row.core_property_id) : null) ?? row.extra ?? null,
      })));
      setRentAdjustments(((adjustmentData ?? []) as Array<Record<string, unknown>>).map((adjustment) => ({
        id: String(adjustment.id),
        property_id: adjustment.property_id ? String(adjustment.property_id) : null,
        object_label: String(adjustment.object_label ?? ""),
        effective_date: String(adjustment.effective_date ?? ""),
        effective_end_date: adjustment.effective_end_date ? String(adjustment.effective_end_date) : null,
        new_cold_rent: adjustment.new_cold_rent === null || adjustment.new_cold_rent === undefined ? null : Number(adjustment.new_cold_rent),
        new_operating_costs: adjustment.new_operating_costs === null || adjustment.new_operating_costs === undefined ? null : Number(adjustment.new_operating_costs),
        new_total_rent: adjustment.new_total_rent === null || adjustment.new_total_rent === undefined ? null : Number(adjustment.new_total_rent),
        created_at: adjustment.created_at ? String(adjustment.created_at) : null,
      })));
    } catch (error) {
      setPropertyError(error instanceof Error ? error.message : "Immobilienbestand konnte nicht geladen werden.");
    } finally {
      setLoadingRows(false);
    }
  }, [isAdmin, showProperty]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadManagedRows(), 0);
    window.addEventListener("koenen:rentals-changed", loadManagedRows);
    window.addEventListener("koenen:rent-adjustments-changed", loadManagedRows);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener("koenen:rentals-changed", loadManagedRows);
      window.removeEventListener("koenen:rent-adjustments-changed", loadManagedRows);
    };
  }, [loadManagedRows]);

  const loadManagedUsers = useCallback(async () => {
    if (!isAdmin || !showUsers) return;
    setLoadingUsers(true);
    setUserError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const response = await fetch("/api/admin-users", {
        method: "GET",
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });
      const payload = (await response.json().catch(() => ({}))) as { users?: ManagedUserRow[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setManagedUsers(payload.users ?? []);
    } catch (error) {
      setUserError(error instanceof Error ? error.message : "Benutzerliste konnte nicht geladen werden.");
    } finally {
      setLoadingUsers(false);
    }
  }, [isAdmin, showUsers]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadManagedUsers(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadManagedUsers]);

  function updatePropertyField(event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = event.target;
    setPropertyForm((current) => {
      const next = { ...current, [name]: value };
      if (name === "kind") {
        const defaults = KIND_TO_DB[value as PropertyKind];
        next.unitLabel = defaults.unitLabel;
        next.rentType = defaults.rentType;
        next.usageType = defaults.usageType;
      }
      if (name === "coldRent" || name === "operatingCosts") {
        const cold = name === "coldRent" ? parseMoney(value) ?? 0 : parseMoney(current.coldRent) ?? 0;
        const costs = name === "operatingCosts" ? parseMoney(value) ?? 0 : parseMoney(current.operatingCosts) ?? 0;
        next.totalRent = cold || costs ? String(Math.round((cold + costs) * 100) / 100).replace(".", ",") : "";
      }
      return next;
    });
  }

  function choosePropertyKind(kind: PropertyKind) {
    const defaults = KIND_TO_DB[kind];
    setPropertyForm((current) => ({
      ...current,
      kind,
      unitLabel: defaults.unitLabel,
      rentType: defaults.rentType,
      usageType: defaults.usageType,
    }));
  }

  function updateUserField(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value, type } = event.target;
    const checked = type === "checkbox" ? (event.target as HTMLInputElement).checked : undefined;
    setUserForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  }

  function requestUserMfa(action: PendingMfaAction) {
    setMfaCode("");
    setMfaError(null);
    setPendingMfaAction(action);
  }

  function closeUserMfaPrompt() {
    if (mfaBusy) return;
    setPendingMfaAction(null);
    setMfaCode("");
    setMfaError(null);
  }

  async function confirmUserMfaAndRun() {
    if (!pendingMfaAction) return;
    const cleanCode = mfaCode.replace(/\s/g, "");
    if (!/^\d{6}$/.test(cleanCode)) {
      setMfaError("Bitte den 6-stelligen Code aus der Authenticator-App eingeben.");
      return;
    }

    setMfaBusy(true);
    setMfaError(null);
    try {
      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;
      const factorId = factors?.totp?.[0]?.id;
      if (!factorId) {
        throw new Error("Kein Authenticator-Faktor gefunden. Bitte 2FA zuerst einrichten.");
      }

      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;
      const challengeId = (challenge as { id?: string; challengeId?: string } | null)?.id
        ?? (challenge as { id?: string; challengeId?: string } | null)?.challengeId;
      if (!challengeId) throw new Error("MFA-Challenge konnte nicht erstellt werden.");

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: cleanCode,
      });
      if (verifyError) throw verifyError;

      await supabase.auth.refreshSession();
      await pendingMfaAction.run();
      setPendingMfaAction(null);
      setMfaCode("");
    } catch (error) {
      setMfaError(error instanceof Error ? error.message : "Authenticator-Bestaetigung fehlgeschlagen.");
    } finally {
      setMfaBusy(false);
    }
  }

  async function handleUpdateUserRole(email: string, role: UserRoleInput) {
    requestUserMfa({
      title: "Rolle aendern bestaetigen",
      description: `Bitte bestaetige per Authenticator, dass die Rolle fuer ${email} geaendert werden darf.`,
      confirmLabel: "Rolle aendern",
      run: async () => {
    setUserStatus(null);
    setUserError(null);
    setSavingUserEmail(email);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const response = await fetch("/api/admin-users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ email, role }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setUserStatus(`Rolle fuer ${email} wurde aktualisiert.`);
      await loadManagedUsers();
    } catch (error) {
      setUserError(error instanceof Error ? error.message : "Rolle konnte nicht aktualisiert werden.");
    } finally {
      setSavingUserEmail(null);
    }
      },
    });
  }

  async function handleDeleteUser(email: string) {
    const ok = window.confirm(`Soll der User "${email}" wirklich geloescht werden? Der Login wird aus Supabase Auth entfernt.`);
    if (!ok) return;
    requestUserMfa({
      title: "User loeschen bestaetigen",
      description: `Bitte bestaetige per Authenticator, dass ${email} geloescht werden darf.`,
      confirmLabel: "User loeschen",
      run: async () => {
    setUserStatus(null);
    setUserError(null);
    setDeletingUserEmail(email);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const response = await fetch("/api/admin-users", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setUserStatus(`User ${email} wurde geloescht.`);
      if (openUserEmail === email) setOpenUserEmail(null);
      await loadManagedUsers();
    } catch (error) {
      setUserError(error instanceof Error ? error.message : "User konnte nicht geloescht werden.");
    } finally {
      setDeletingUserEmail(null);
    }
      },
    });
  }

  function toggleSection(section: string) {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  }

  function resetPropertyForm() {
    setEditingId(null);
    setPropertyForm(emptyPropertyForm);
    setPropertyStatus(null);
    setPropertyError(null);
  }

  async function saveExtraRows(userId: string, portfolioId: string, corePropertyId: string | null, form: PropertyForm) {
    const payload = {
      user_id: userId,
      living_area: form.livingArea,
      rooms: form.rooms,
      cold_rent: form.coldRent,
      operating_costs: form.operatingCosts,
      total_rent: form.totalRent || String(calculatedTotalRent).replace(".", ","),
      market_value: form.marketValue,
      equipment: [form.equipment, form.notes].filter(Boolean).join("\n"),
      updated_at: new Date().toISOString(),
    };
    const rows = [
      { ...payload, property_id: portfolioId },
      ...(corePropertyId ? [{ ...payload, property_id: corePropertyId }] : []),
    ];
    for (const row of rows) {
      const { error } = await supabase.from("property_extra_info").upsert(row, { onConflict: "user_id,property_id" });
      if (error) console.warn("property_extra_info konnte nicht gespeichert werden:", error.message);
    }
  }

  async function handleCreateProperty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPropertyStatus(null);
    setPropertyError(null);

    if (!propertyName) {
      setPropertyError("Bitte Objektname oder Adresse eintragen.");
      return;
    }

    const isRentRelevant = propertyForm.kind !== "land";
    if (isRentRelevant && !propertyForm.startDate) {
      setPropertyError("Bitte Startdatum der Vermietung eintragen. Bei Grundstück ohne Vermietung bitte Art 'Grundstück' wählen.");
      return;
    }

    setSavingProperty(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const userId = authData.user?.id;
      if (!userId) throw new Error("Nicht eingeloggt.");

      const kindConfig = KIND_TO_DB[propertyForm.kind];
      const description = buildDescription(propertyForm);
      const yearBuilt = parseNumber(propertyForm.yearBuilt);
      const livingArea = parseNumber(propertyForm.livingArea);
      const plotArea = parseNumber(propertyForm.plotArea);
      const totalRent = parseMoney(propertyForm.totalRent) ?? calculatedTotalRent;
      const coldRent = parseMoney(propertyForm.coldRent);
      const operatingCosts = parseMoney(propertyForm.operatingCosts) ?? 0;
      const nextSortIndex = Math.max(0, ...managedRows.map((row) => row.sort_index ?? 0)) + 10;

      let portfolioId = editingId;
      let corePropertyId = managedRows.find((row) => row.id === editingId)?.core_property_id ?? null;

      if (!portfolioId) {
        const code = `custom_${Date.now()}`;
        const { data: coreProperty, error: coreError } = await supabase
          .from("properties")
          .insert({
            user_id: userId,
            name: propertyName,
            code,
            is_test: false,
          })
          .select("id")
          .single();
        if (coreError) throw coreError;
        corePropertyId = String((coreProperty as { id: string }).id);

        const { data: portfolioProperty, error: portfolioError } = await supabase
          .from("portfolio_properties")
          .insert({
            user_id: userId,
            type: kindConfig.portfolioType,
            name: propertyName,
            sort_index: nextSortIndex,
            core_property_id: corePropertyId,
            is_test: false,
            property_type: selectedKind.label,
            description,
            year_built: yearBuilt,
            living_area_m2: livingArea,
            plot_area_m2: plotArea,
          })
          .select("id")
          .single();
        if (portfolioError) throw portfolioError;
        portfolioId = String((portfolioProperty as { id: string }).id);
      } else {
        const { error: portfolioUpdateError } = await supabase
          .from("portfolio_properties")
          .update({
            type: kindConfig.portfolioType,
            name: propertyName,
            property_type: selectedKind.label,
            description,
            year_built: yearBuilt,
            living_area_m2: livingArea,
            plot_area_m2: plotArea,
            updated_at: new Date().toISOString(),
          })
          .eq("id", portfolioId);
        if (portfolioUpdateError) throw portfolioUpdateError;

        if (corePropertyId) {
          const { error: coreUpdateError } = await supabase
            .from("properties")
            .update({ name: propertyName })
            .eq("id", corePropertyId);
          if (coreUpdateError) console.warn("Core-Objekt konnte nicht aktualisiert werden:", coreUpdateError.message);
        }
      }

      if (!portfolioId) throw new Error("Portfolio-ID konnte nicht erstellt werden.");

      let unitId = managedRows.find((row) => row.id === portfolioId)?.rental?.unit_id ?? null;
      if (!unitId) {
        const { data: unit, error: unitError } = await supabase
          .from("portfolio_units")
          .insert({
            property_id: portfolioId,
            user_id: userId,
            unit_type: kindConfig.unitType,
            name: propertyForm.unitLabel || kindConfig.unitLabel,
            is_active: true,
          })
          .select("id")
          .single();
        if (unitError) throw unitError;
        unitId = String((unit as { id: string }).id);
      } else {
        const { error: unitUpdateError } = await supabase
          .from("portfolio_units")
          .update({
            unit_type: kindConfig.unitType,
            name: propertyForm.unitLabel || kindConfig.unitLabel,
            updated_at: new Date().toISOString(),
          })
          .eq("id", unitId);
        if (unitUpdateError) console.warn("Einheit konnte nicht aktualisiert werden:", unitUpdateError.message);
      }

      if (isRentRelevant && propertyForm.startDate) {
        const rentalPayload = {
          property_id: portfolioId,
          unit_id: unitId,
          user_id: userId,
          rent_type: propertyForm.rentType || kindConfig.rentType,
          kaltmiete_laut_mietvertrag: coldRent,
          nebenkosten: operatingCosts,
          gesamt_mietkosten: totalRent,
          rent_monthly: totalRent,
          start_date: propertyForm.startDate,
          end_date: cleanText(propertyForm.endDate),
          notes: cleanText(propertyForm.notes),
          is_planned: false,
          updated_at: new Date().toISOString(),
        };
        const existingRentalId = managedRows.find((row) => row.id === portfolioId)?.rental?.id;
        const rentalQuery = existingRentalId
          ? supabase.from("portfolio_property_rentals").update(rentalPayload).eq("id", existingRentalId)
          : supabase.from("portfolio_property_rentals").insert(rentalPayload);
        const { error: rentalError } = await rentalQuery;
        if (rentalError) throw rentalError;
      }

      await saveExtraRows(userId, portfolioId, corePropertyId, propertyForm);

      window.dispatchEvent(new Event("koenen:rentals-changed"));
      window.dispatchEvent(new Event("koenen:finance-entry-changed"));
      setPropertyStatus(editingId ? "Immobilie wurde aktualisiert." : "Immobilie wurde angelegt und in die zentralen Quellen eingepflegt.");
      setPropertyForm(emptyPropertyForm);
      setEditingId(null);
      await loadManagedRows();
    } catch (error) {
      setPropertyError(error instanceof Error ? error.message : "Immobilie konnte nicht gespeichert werden.");
    } finally {
      setSavingProperty(false);
    }
  }

  function handleEditProperty(row: ManagedPropertyRow) {
    setEditingId(row.id);
    setPropertyForm(formFromManagedRow(row));
    setPropertyStatus(null);
    setPropertyError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDeleteProperty(row: ManagedPropertyRow) {
    const ok = window.confirm(`Soll "${row.name}" wirklich gelöscht werden? Bestehende historische Buchungen werden nicht gelöscht.`);
    if (!ok) return;
    setPropertyStatus(null);
    setPropertyError(null);
    setSavingProperty(true);
    try {
      await supabase.from("portfolio_property_rentals").delete().eq("property_id", row.id);
      await supabase.from("portfolio_units").delete().eq("property_id", row.id);
      await supabase.from("property_extra_info").delete().eq("property_id", row.id);
      if (row.core_property_id) await supabase.from("property_extra_info").delete().eq("property_id", row.core_property_id);
      const { error: portfolioError } = await supabase.from("portfolio_properties").delete().eq("id", row.id);
      if (portfolioError) throw portfolioError;
      if (row.core_property_id) {
        const { error: coreError } = await supabase.from("properties").delete().eq("id", row.core_property_id);
        if (coreError) console.warn("Core-Objekt blieb erhalten, weil es noch referenziert ist:", coreError.message);
      }
      setPropertyStatus("Immobilie wurde gelöscht. Historische Buchungen bleiben aus Sicherheitsgründen erhalten.");
      await loadManagedRows();
      window.dispatchEvent(new Event("koenen:rentals-changed"));
      window.dispatchEvent(new Event("koenen:finance-entry-changed"));
    } catch (error) {
      setPropertyError(error instanceof Error ? error.message : "Immobilie konnte nicht gelöscht werden.");
    } finally {
      setSavingProperty(false);
    }
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUserStatus(null);
    setUserError(null);

    if (!userForm.email.trim() || !userForm.password.trim()) {
      setUserError("Bitte E-Mail und Passwort eintragen.");
      return;
    }

    const nextUserForm = {
      ...userForm,
      email: userForm.email.trim().toLowerCase(),
    };

    requestUserMfa({
      title: "User speichern bestaetigen",
      description: `Bitte bestaetige per Authenticator, dass ${nextUserForm.email} angelegt oder aktualisiert werden darf.`,
      confirmLabel: "User speichern",
      run: async () => {
    setSavingUser(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const response = await fetch("/api/admin-create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(nextUserForm),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setUserStatus("User wurde angelegt/aktualisiert.");
      setUserForm(emptyUserForm);
      await loadManagedUsers();
    } catch (error) {
      setUserError(error instanceof Error ? error.message : "User konnte nicht angelegt werden.");
    } finally {
      setSavingUser(false);
    }
      },
    });
  }

  if (!isAdmin) {
    return (
      <section className="admin-page">
        <div className="admin-denied">
          <ShieldCheck size={28} />
          <h1>{copy.title}</h1>
          <p>Der Menuepunkt bleibt sichtbar, die Inhalte sind fuer Nutzer mit Leserechten gesperrt.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-page">
      {pendingMfaAction ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-mfa-title"
          className="admin-mfa-overlay"
        >
          <div className="admin-mfa-dialog">
            <div className="admin-panel-head">
              <ShieldCheck size={24} />
              <div>
                <span className="admin-mfa-eyebrow">2-Fache Zertifizierung</span>
                <h2 id="admin-mfa-title">{pendingMfaAction.title}</h2>
                <p>{pendingMfaAction.description}</p>
              </div>
            </div>
            <label className="admin-mfa-code">
              Authenticator-Code
              <input
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-stelliger Code"
                disabled={mfaBusy}
              />
            </label>
            {mfaError ? <div className="admin-message error">{mfaError}</div> : null}
            <div className="admin-mfa-actions">
              <button type="button" className="admin-primary" onClick={() => void confirmUserMfaAndRun()} disabled={mfaBusy}>
                {mfaBusy ? "Wird bestaetigt..." : pendingMfaAction.confirmLabel}
              </button>
              <button type="button" className="admin-secondary" onClick={closeUserMfaPrompt} disabled={mfaBusy}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <header className="admin-hero">
        <div>
          <span>{copy.eyebrow}</span>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
      </header>

      <div className={["admin-grid", showProperty !== (showTenant || showUsers) ? "admin-grid-single" : ""].filter(Boolean).join(" ")}>
        {showProperty ? (
          <div className="admin-property-workspace">
            <form className="admin-panel admin-property-panel" onSubmit={handleCreateProperty}>
              <div className="admin-panel-head admin-panel-head-spread">
                <div className="admin-panel-title-row">
                  <Building2 size={22} />
                  <div>
                    <h2>{editingId ? "Immobilie bearbeiten" : "Neue Immobilie anlegen"}</h2>
                    <p>Einmal erfassen, danach automatisch in Immobilienvermögen, Vermietung und Steuer nutzbar.</p>
                  </div>
                </div>
                {editingId ? (
                  <button className="admin-secondary" type="button" onClick={resetPropertyForm}>
                    Neu anlegen
                  </button>
                ) : null}
              </div>

              <div className="admin-kind-grid" aria-label="Immobilientyp auswählen">
                {PROPERTY_KIND_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const active = propertyForm.kind === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={active ? "admin-kind-card active" : "admin-kind-card"}
                      onClick={() => choosePropertyKind(option.value)}
                    >
                      <Icon size={18} />
                      <span>{option.label}</span>
                      <small>{option.description}</small>
                    </button>
                  );
                })}
              </div>

              <div className="admin-selected-kind">
                <span>Gewählt</span>
                <b>{selectedKind.label}</b>
              </div>

              <div className="admin-section-stack">
                <div className="admin-collapsible">
                  <button type="button" onClick={() => toggleSection("basis")}>
                    Basisdaten & Adresse <ChevronDown size={18} className={openSections.basis ? "open" : ""} />
                  </button>
                  {openSections.basis ? (
                    <div className="admin-form-grid">
                      <label>
                        Immobilienbezeichnung
                        <input name="name" value={propertyForm.name} onChange={updatePropertyField} placeholder="z. B. Musterstr. 12" />
                      </label>
                      <label>
                        Nutzung
                        <select name="usageType" value={propertyForm.usageType} onChange={updatePropertyField}>
                          <option>Vermietete Wohnung</option>
                          <option>Vermietet / Mehrfamilienhaus</option>
                          <option>Vermietet / Haus</option>
                          <option>Vermietete Garage / Stellplatz</option>
                          <option>Gewerbliche Vermietung</option>
                          <option>Grundstück</option>
                          <option>Selbstgenutzt / WEG</option>
                        </select>
                      </label>
                      <label>
                        Straße
                        <input name="street" value={propertyForm.street} onChange={updatePropertyField} />
                      </label>
                      <label>
                        Hausnummer
                        <input name="houseNumber" value={propertyForm.houseNumber} onChange={updatePropertyField} />
                      </label>
                      <label>
                        PLZ
                        <input name="postalCode" value={propertyForm.postalCode} onChange={updatePropertyField} />
                      </label>
                      <label>
                        Ort
                        <input name="city" value={propertyForm.city} onChange={updatePropertyField} />
                      </label>
                      <label>
                        Bundesland / Land
                        <input name="state" value={propertyForm.state} onChange={updatePropertyField} />
                      </label>
                      <label>
                        Einheit / Stellplatz
                        <input name="unitLabel" value={propertyForm.unitLabel} onChange={updatePropertyField} placeholder="WE 04, P250, Garage 1" />
                      </label>
                    </div>
                  ) : null}
                </div>

                <div className="admin-collapsible">
                  <button type="button" onClick={() => toggleSection("miete")}>
                    Vermietung & Miete <ChevronDown size={18} className={openSections.miete ? "open" : ""} />
                  </button>
                  {openSections.miete ? (
                    <div className="admin-form-grid">
                      <label>
                        Mietart
                        <select name="rentType" value={propertyForm.rentType} onChange={updatePropertyField}>
                          <option>Wohnung</option>
                          <option>Haus</option>
                          <option>Garage</option>
                          <option>Stellplatz</option>
                          <option>Gewerbe</option>
                          <option>Grundstück</option>
                        </select>
                      </label>
                      <label>
                        Anzahl Einheiten
                        <input name="unitCount" value={propertyForm.unitCount} onChange={updatePropertyField} />
                      </label>
                      <label>
                        Kaltmiete
                        <input name="coldRent" value={propertyForm.coldRent} onChange={updatePropertyField} placeholder="0,00" />
                      </label>
                      <label>
                        Nebenkosten
                        <input name="operatingCosts" value={propertyForm.operatingCosts} onChange={updatePropertyField} placeholder="0,00" />
                      </label>
                      <label>
                        Gesamtmiete
                        <input name="totalRent" value={propertyForm.totalRent} onChange={updatePropertyField} placeholder="automatisch aus Kaltmiete + NK" />
                      </label>
                      <label>
                        Vermietung ab
                        <input type="date" name="startDate" value={propertyForm.startDate} onChange={updatePropertyField} />
                      </label>
                      <label>
                        Vermietung bis
                        <input type="date" name="endDate" value={propertyForm.endDate} onChange={updatePropertyField} />
                      </label>
                      <div className="admin-live-total">
                        <span>Warmmiete aus Eingabe</span>
                        <b>{formatCurrency(calculatedTotalRent)}</b>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="admin-collapsible">
                  <button type="button" onClick={() => toggleSection("wirtschaft")}>
                    Wirtschaftliche Daten <ChevronDown size={18} className={openSections.wirtschaft ? "open" : ""} />
                  </button>
                  {openSections.wirtschaft ? (
                    <div className="admin-form-grid">
                      <label>
                        Wohn-/Nutzfläche m²
                        <input name="livingArea" value={propertyForm.livingArea} onChange={updatePropertyField} />
                      </label>
                      <label>
                        Grundstücksfläche m²
                        <input name="plotArea" value={propertyForm.plotArea} onChange={updatePropertyField} />
                      </label>
                      <label>
                        Zimmer
                        <input name="rooms" value={propertyForm.rooms} onChange={updatePropertyField} />
                      </label>
                      <label>
                        Baujahr
                        <input name="yearBuilt" value={propertyForm.yearBuilt} onChange={updatePropertyField} />
                      </label>
                      <label>
                        Kaufpreis
                        <input name="purchasePrice" value={propertyForm.purchasePrice} onChange={updatePropertyField} placeholder="0,00" />
                      </label>
                      <label>
                        Kaufdatum
                        <input type="date" name="purchaseDate" value={propertyForm.purchaseDate} onChange={updatePropertyField} />
                      </label>
                      <label>
                        Marktwert
                        <input name="marketValue" value={propertyForm.marketValue} onChange={updatePropertyField} placeholder="0,00" />
                      </label>
                      <label>
                        Ausstattung
                        <input name="equipment" value={propertyForm.equipment} onChange={updatePropertyField} placeholder="Einbauküche, Balkon, TG..." />
                      </label>
                    </div>
                  ) : null}
                </div>

                <div className="admin-collapsible">
                  <button type="button" onClick={() => toggleSection("notizen")}>
                    Notizen & Besonderheiten <ChevronDown size={18} className={openSections.notizen ? "open" : ""} />
                  </button>
                  {openSections.notizen ? (
                    <div className="admin-form-grid">
                      <label className="admin-wide">
                        Notizen
                        <textarea name="notes" value={propertyForm.notes} onChange={updatePropertyField} rows={4} placeholder="Besonderheiten, Quelle, offene Punkte..." />
                      </label>
                    </div>
                  ) : null}
                </div>
              </div>

              {propertyError ? <div className="admin-message error">{propertyError}</div> : null}
              {propertyStatus ? <div className="admin-message">{propertyStatus}</div> : null}
              <div className="admin-actions">
                <button className="admin-primary" type="submit" disabled={savingProperty}>
                  <Save size={18} />
                  {savingProperty ? "Speichern..." : editingId ? "Änderungen speichern" : "Immobilie speichern"}
                </button>
                <button className="admin-secondary" type="button" onClick={resetPropertyForm}>
                  Leeren
                </button>
              </div>
            </form>

            <section className="admin-panel admin-property-list">
              <div className="admin-panel-head admin-panel-head-spread">
                <div className="admin-panel-title-row">
                  <Building2 size={22} />
                  <div>
                    <h2>Angelegte Immobilien</h2>
                    <p>Bearbeiten oder löschen. Buchungshistorie bleibt beim Löschen geschützt.</p>
                  </div>
                </div>
                <button type="button" className="admin-secondary" onClick={() => void loadManagedRows()}>
                  Neu laden
                </button>
              </div>
              {loadingRows ? <div className="admin-message">Immobilien werden geladen...</div> : null}
              <div className="admin-property-rows">
                {managedRows.map((row) => (
                  <article key={row.id} className="admin-property-row">
                    <div>
                      <strong>{row.name}</strong>
                      <span>{row.property_type ?? row.type} · {row.rental?.rent_type ?? "noch keine Mietdaten"}</span>
                    </div>
                    <div>
                      <span>Warmmiete</span>
                      <b>{formatCurrency(monthlyRentFromMietentwicklung(row, rentAdjustments))}</b>
                      <small>Quelle: Mietentwicklung</small>
                    </div>
                    <div>
                      <span>Marktwert</span>
                      <b>{formatCurrency(row.extra?.market_value)}</b>
                    </div>
                    <div className="admin-row-actions">
                      <button type="button" onClick={() => handleEditProperty(row)}>
                        <Edit3 size={16} />
                        Bearbeiten
                      </button>
                      <button type="button" className="danger" onClick={() => void handleDeleteProperty(row)}>
                        <Trash2 size={16} />
                        Löschen
                      </button>
                    </div>
                  </article>
                ))}
                {!loadingRows && managedRows.length === 0 ? (
                  <div className="admin-empty-state">
                    <PlusCircle size={24} />
                    Noch keine Immobilien gefunden.
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}

        {showTenant || showUsers ? (
          <div className="admin-stack">
            {showTenant ? (
              <div className="admin-panel">
                <div className="admin-panel-head">
                  <UserPlus size={22} />
                  <div>
                    <h2>Mieter anlegen</h2>
                    <p>Mieterstammdaten und Mietverhältnisse zentral im Mieterbereich pflegen.</p>
                  </div>
                </div>
                <Link className="admin-link-button" to="/mieter/stammdaten">Mieter-Stammdaten öffnen</Link>
              </div>
            ) : null}

            {showUsers ? (
              <>
                <form className="admin-panel" onSubmit={handleCreateUser}>
                  <div className="admin-panel-head">
                    <ShieldCheck size={22} />
                    <div>
                      <h2>User anlegen</h2>
                      <p>Neue Nutzer mit Lese- oder Admin-Rechten erstellen.</p>
                    </div>
                  </div>
                  <div className="admin-form-grid one">
                    <label>
                      E-Mail
                      <input name="email" type="email" value={userForm.email} onChange={updateUserField} />
                    </label>
                    <label>
                      Passwort
                      <input name="password" type="password" value={userForm.password} onChange={updateUserField} />
                    </label>
                    <label>
                      Rechte
                      <select name="role" value={userForm.role} onChange={updateUserField}>
                        <option value="viewer">Read</option>
                        <option value="admin">Write / Admin</option>
                      </select>
                    </label>
                    <label className="admin-check">
                      <input name="requiresApproval" type="checkbox" checked={userForm.requiresApproval} onChange={updateUserField} />
                      Login erst nach Admin-Freigabe erlauben
                    </label>
                  </div>
                  {userError ? <div className="admin-message error">{userError}</div> : null}
                  {userStatus ? <div className="admin-message">{userStatus}</div> : null}
                  <button className="admin-primary" type="submit" disabled={savingUser}>
                    {savingUser ? "User wird angelegt..." : "User speichern"}
                  </button>
                </form>

                <section className="admin-panel admin-user-list">
                  <div className="admin-panel-head admin-panel-head-spread">
                    <div className="admin-panel-title-row">
                      <UserPlus size={22} />
                      <div>
                        <h2>Benutzerliste</h2>
                        <p>Erstellt am, Rolle und letzter Login direkt aus Supabase Auth und Rollenverwaltung.</p>
                      </div>
                    </div>
                    <button type="button" className="admin-secondary" onClick={() => void loadManagedUsers()} disabled={loadingUsers}>
                      {loadingUsers ? "Laedt..." : "Neu laden"}
                    </button>
                  </div>

                  {loadingUsers ? <div className="admin-message">Benutzer werden geladen...</div> : null}
                  <div className="admin-user-rows">
                    {managedUsers.map((managedUser) => {
                      const isOpen = openUserEmail === managedUser.email;
                      const isProtectedAdmin = managedUser.email === "info.koenen@gmail.com";
                      return (
                        <article key={managedUser.email} className="admin-user-row">
                          <button
                            type="button"
                            className="admin-user-row-main"
                            onClick={() => setOpenUserEmail(isOpen ? null : managedUser.email)}
                            aria-expanded={isOpen}
                          >
                            <div>
                              <strong>{managedUser.email}</strong>
                              <span>{managedUser.role === "admin" ? "Admin" : "Read"} · {managedUser.is_active ? "Aktiv" : "Gesperrt"}</span>
                            </div>
                            <div>
                              <span>Angelegt</span>
                              <b>{formatDateTime(managedUser.created_at ?? managedUser.access_created_at)}</b>
                            </div>
                            <div>
                              <span>Letzter Login</span>
                              <b>{formatDateTime(managedUser.last_sign_in_at)}</b>
                            </div>
                            <ChevronDown size={18} className={isOpen ? "open" : ""} />
                          </button>

                          {isOpen ? (
                            <div className="admin-user-row-detail">
                              <label>
                                Rolle bearbeiten
                                <select
                                  value={managedUser.role}
                                  disabled={isProtectedAdmin || savingUserEmail === managedUser.email}
                                  onChange={(event) => void handleUpdateUserRole(managedUser.email, event.target.value as UserRoleInput)}
                                >
                                  <option value="viewer">Read</option>
                                  <option value="admin">Write / Admin</option>
                                </select>
                              </label>
                              <div className="admin-user-meta">
                                <span>Freigabe: {managedUser.requires_login_approval ? "Admin-Freigabe aktiv" : "Direkt erlaubt"}</span>
                                <span>Aktualisiert: {formatDateTime(managedUser.updated_at)}</span>
                              </div>
                              <button
                                type="button"
                                className="admin-secondary danger"
                                disabled={isProtectedAdmin || deletingUserEmail === managedUser.email}
                                onClick={() => void handleDeleteUser(managedUser.email)}
                              >
                                <Trash2 size={16} />
                                {deletingUserEmail === managedUser.email ? "Wird geloescht..." : "User loeschen"}
                              </button>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                    {!loadingUsers && managedUsers.length === 0 ? (
                      <div className="admin-empty-state">
                        <UserPlus size={24} />
                        Noch keine Benutzer gefunden.
                      </div>
                    ) : null}
                  </div>
                </section>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
