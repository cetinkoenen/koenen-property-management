import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const PROJECT_REF = "ufqfrotpefxtwczuqrxf";
const FROM = "2025-01-01";
const TO = "2026-12-31";

function loadEnv(fileName) {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function serviceRoleKey() {
  const output = execFileSync(
    "supabase",
    ["projects", "api-keys", "--project-ref", PROJECT_REF, "-o", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  const keys = JSON.parse(output);
  const row = keys.find((item) => item.name === "service_role" || item.type === "secret");
  const key = row?.api_key ?? row?.key ?? row?.value;
  if (!key) throw new Error("Service-Role-Schlüssel konnte nicht sicher über die Supabase CLI gelesen werden.");
  return key;
}

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ß", "ss")
    .replace(/straße|strasse/g, "str")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function table(rows) {
  if (rows.length) console.table(rows);
  else console.log("(keine Datensätze)");
}

loadEnv(".env.local");
const supabase = createClient(process.env.VITE_SUPABASE_URL, serviceRoleKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: objects, error: objectError } = await supabase
  .from("v_object_dropdown")
  .select("value,objekt_code,label,object_id,property_id");
if (objectError) throw objectError;
const hohenloherObjects = (objects ?? []).filter((row) => normalize(row.label).includes("hohenloher"));
const ids = new Set(hohenloherObjects.flatMap((row) => [row.value, row.object_id, row.property_id]).filter(Boolean).map(String));
const codes = new Set(hohenloherObjects.map((row) => row.objekt_code).filter(Boolean).map(String));
const { data: coreProperties, error: corePropertyError } = await supabase.from("properties").select("id,name").in("id", [...ids]);
if (corePropertyError) throw corePropertyError;

const [{ data: entries, error: entryError }, { data: contracts, error: contractError }, { data: rentals, error: rentalError }, { data: adjustments, error: adjustmentError }, { data: portfolioProperties, error: portfolioPropertyError }] = await Promise.all([
  supabase.from("finance_entry").select("id,object_id,objekt_code,booking_date,entry_type,category,amount,note,is_deleted").gte("booking_date", FROM).lte("booking_date", TO).order("booking_date"),
  supabase.from("tenant_contracts").select("id,tenant_id,property_id,object_code,unit_label,start_date,end_date,status,cold_rent,operating_costs,total_rent,is_deleted,tenant_profiles(first_name,last_name,company_name)").order("start_date"),
  supabase.from("portfolio_property_rentals").select("id,property_id,unit_id,rent_type,rent_monthly,start_date,end_date,created_at,updated_at").order("start_date"),
  supabase.from("rent_adjustments").select("id,property_id,object_label,tenant_name,effective_date,effective_end_date,old_total_rent,new_total_rent,note,is_deleted").order("effective_date"),
  supabase.from("portfolio_properties").select("id,name,core_property_id,is_test"),
]);
for (const error of [entryError, contractError, rentalError, adjustmentError, portfolioPropertyError]) if (error) throw error;

const hohenloherPortfolioProperties = (portfolioProperties ?? []).filter((row) => normalize(row.name).includes("hohenloher"));
for (const row of hohenloherPortfolioProperties) {
  ids.add(String(row.id));
  if (row.core_property_id) ids.add(String(row.core_property_id));
}

const matches = (row) => ids.has(String(row.object_id ?? row.property_id ?? "")) || codes.has(String(row.objekt_code ?? row.object_code ?? "")) || normalize(`${row.object_label ?? ""} ${row.note ?? ""}`).includes("hohenloher");
const hohenloherEntries = (entries ?? []).filter(matches);
const rentEntries = hohenloherEntries.filter((row) => row.entry_type === "income" && /miete|nebenkosten|mietbestandteil/i.test(`${row.category ?? ""} ${row.note ?? ""}`));

console.log("HOHENLOHER-QUELLEN");
table(hohenloherObjects);
console.log("\nPROPERTIES");
table(coreProperties ?? []);
console.log("\nPORTFOLIO_PROPERTIES");
table(hohenloherPortfolioProperties);
console.log("\nMIETVERTRAEGE");
table((contracts ?? []).filter(matches));
console.log("\nVERMIETUNGSZEITRAEUME");
table((rentals ?? []).filter(matches));
console.log("\nMIETANPASSUNGEN");
table((adjustments ?? []).filter(matches));
console.log("\nMIETEINGAENGE 2025-2026");
table(rentEntries.map(({ id, booking_date, category, amount, note, is_deleted, object_id, objekt_code }) => ({ id, booking_date, category, amount, note, is_deleted, object_id, objekt_code })));

const monthly = new Map();
for (const entry of rentEntries.filter((row) => !row.is_deleted)) {
  const key = String(entry.booking_date).slice(0, 7);
  monthly.set(key, Math.round(((monthly.get(key) ?? 0) + Number(entry.amount ?? 0) + Number.EPSILON) * 100) / 100);
}
console.log("\nMONATSSUMMEN NACH BUCHUNGSDATUM");
table([...monthly].map(([month, amount]) => ({ month, amount })));

const effectiveMonthly = new Map();
for (const entry of rentEntries.filter((row) => !row.is_deleted)) {
  const booked = new Date(`${entry.booking_date}T00:00:00Z`);
  if (booked.getUTCDate() >= 21) booked.setUTCMonth(booked.getUTCMonth() + 1);
  const key = `${booked.getUTCFullYear()}-${String(booked.getUTCMonth() + 1).padStart(2, "0")}`;
  effectiveMonthly.set(key, Math.round(((effectiveMonthly.get(key) ?? 0) + Number(entry.amount ?? 0) + Number.EPSILON) * 100) / 100);
}
console.log("\nMIETMONATSSUMMEN NACH ZENTRALER HOHENLOHER-REGEL");
table([...effectiveMonthly].map(([month, amount]) => ({ month, amount })));

const coreObjectIds = hohenloherObjects.map((row) => row.object_id).filter(Boolean);
const { data: databaseMonthly, error: databaseMonthlyError } = await supabase
  .from("v_mieteingaenge_monat")
  .select("object_id,objekt_code,mietmonat,mieteingang_summe")
  .in("object_id", coreObjectIds)
  .gte("mietmonat", FROM)
  .lte("mietmonat", TO)
  .order("mietmonat");
if (databaseMonthlyError) throw databaseMonthlyError;
console.log("\nPRODUKTIONSVIEW v_mieteingaenge_monat");
table(databaseMonthly ?? []);
