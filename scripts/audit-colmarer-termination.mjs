import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const PROJECT_REF = "ufqfrotpefxtwczuqrxf";

function serviceRoleKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  const output = execFileSync(
    "supabase",
    ["projects", "api-keys", "--project-ref", PROJECT_REF, "-o", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15_000 },
  );
  const keys = JSON.parse(output);
  const row = keys.find((item) => item.name === "service_role" || item.type === "secret");
  const key = row?.api_key ?? row?.key ?? row?.value;
  if (!key) throw new Error("Service-Role-Schlüssel konnte nicht gelesen werden.");
  return key;
}

function normalize(value) {
  return String(value ?? "")
    .toLocaleLowerCase("de-DE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ß", "ss")
    .replace(/straße|strasse/g, "str")
    .replace(/[^a-z0-9]+/g, "");
}

function dateInMonth(value, year, month) {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  return String(value ?? "").startsWith(prefix);
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
if (!supabaseUrl) throw new Error("VITE_SUPABASE_URL fehlt.");
const supabase = createClient(supabaseUrl, serviceRoleKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const withTimeout = (promise, label, timeoutMs = 20_000) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}: Zeitlimit überschritten`)), timeoutMs)),
]);

const query = async (table, select, limit = 1_000) => {
  console.error(`Prüfe ${table} ...`);
  const { data, error } = await withTimeout(supabase.from(table).select(select).limit(limit), table);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
};

const objects = await query("v_object_dropdown", "value,object_id,property_id,objekt_code,label", 100);
const contracts = await query("tenant_contracts", "id,user_id,tenant_id,property_id,object_code,unit_label,start_date,end_date,status,is_deleted,updated_at", 500);
const vacancies = await query("unit_vacancies", "id,user_id,property_id,object_code,object_label,unit_label,vacancy_type,status,start_date,end_date,reason,notes,is_deleted,created_at,updated_at", 500);
const moves = await query("move_processes", "id,tenant_id,tenant_contract_id,property_id,object_code,unit_label,process_type,status,handover_date,deposit_status,checklist,notes,created_at,updated_at", 500);
const portfolioProperties = await query("portfolio_properties", "id,core_property_id,name", 100);
const rentals = await query("portfolio_property_rentals", "id,property_id,unit_id,start_date,end_date,rent_monthly,kaltmiete_laut_mietvertrag,nebenkosten,gesamt_mietkosten,created_at,updated_at", 500);
const adjustments = await query("rent_adjustments", "id,property_id,object_label,tenant_name,effective_date,effective_end_date,old_total_rent,new_total_rent,note,is_deleted", 500);
console.error("Prüfe finance_entry ...");
const { data: entryRows, error: entryError } = await withTimeout(
  supabase.from("finance_entry")
    .select("id,object_id,objekt_code,booking_date,entry_type,category,amount,note,is_deleted")
    .gte("booking_date", "2026-12-01")
    .lte("booking_date", "2027-03-31")
    .limit(1_000),
  "finance_entry",
);
if (entryError) throw new Error(`finance_entry: ${entryError.message}`);
const entries = entryRows ?? [];

const object = objects.find((row) => normalize(row.label).includes("colmarerstr45"));
if (!object) throw new Error("Colmarer Str. 45 wurde in der zentralen Objektliste nicht gefunden.");
const ids = new Set([object.value, object.object_id, object.property_id].filter(Boolean).map(String));
const codes = new Set([object.objekt_code].filter(Boolean).map(String));
const portfolioRows = portfolioProperties.filter((row) => ids.has(String(row.id)) || ids.has(String(row.core_property_id)) || normalize(row.name).includes("colmarerstr45"));
for (const row of portfolioRows) ids.add(String(row.id));

const matchesObject = (row) => ids.has(String(row.property_id ?? row.object_id ?? ""))
  || codes.has(String(row.object_code ?? row.objekt_code ?? ""))
  || normalize(row.object_label ?? row.object_label ?? row.name).includes("colmarerstr45");

const objectContracts = contracts.filter((row) => !row.is_deleted && matchesObject(row));
const contractIds = new Set(objectContracts.map((row) => String(row.id)));
const tenantIds = new Set(objectContracts.map((row) => String(row.tenant_id)));
const objectVacancies = vacancies.filter((row) => !row.is_deleted && matchesObject(row));
const objectMoves = moves.filter((row) => matchesObject(row) || contractIds.has(String(row.tenant_contract_id)) || tenantIds.has(String(row.tenant_id)));
const objectRentals = rentals.filter((row) => ids.has(String(row.property_id)));
const objectAdjustments = adjustments.filter((row) => !row.is_deleted && (ids.has(String(row.property_id)) || normalize(row.object_label).includes("colmarerstr45")));
const objectEntries = entries.filter((row) => !row.is_deleted && (ids.has(String(row.object_id)) || codes.has(String(row.objekt_code)) || normalize(`${row.note} ${row.objekt_code}`).includes("colmarerstr45")));

const relevantVacancy = objectVacancies.find((row) => row.start_date === "2027-02-01" && row.status !== "ended");
const relevantContract = objectContracts.find((row) => row.end_date === "2027-01-31");
const relevantMove = objectMoves.find((row) => row.process_type === "auszug" && row.handover_date && row.handover_date <= "2027-02-01");
const relevantRental = objectRentals.find((row) => row.start_date === "2025-08-01" && row.end_date === "2027-01-31");
const relevantAdjustment = objectAdjustments.find((row) => row.effective_date === "2025-08-01" && row.effective_end_date === "2027-01-31");
const januaryBookings = objectEntries.filter((row) => dateInMonth(row.booking_date, 2027, 1));
const februaryBookings = objectEntries.filter((row) => dateInMonth(row.booking_date, 2027, 2));

console.log(JSON.stringify({
  object,
  contracts: objectContracts,
  vacancies: objectVacancies,
  moveProcesses: objectMoves,
  rentalTimeline: objectRentals,
  rentAdjustments: objectAdjustments,
  payments: { january2027: januaryBookings, february2027: februaryBookings },
  consistency: {
    contractEndsOn20270131: Boolean(relevantContract),
    vacancyStartsOn20270201: Boolean(relevantVacancy),
    moveOutRecordedBeforeVacancy: Boolean(relevantMove),
    moveReferencesContract: Boolean(relevantMove && contractIds.has(String(relevantMove.tenant_contract_id))),
    rentalTimelineEndsOn20270131: Boolean(relevantRental),
    rentAdjustmentEndsOn20270131: Boolean(relevantAdjustment),
    january2027ExpectedRent: Boolean(relevantContract),
    february2027ExpectedVacancy: Boolean(relevantVacancy),
  },
}, null, 2));
