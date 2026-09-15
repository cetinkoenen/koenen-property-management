import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const PROJECT_REF = "ufqfrotpefxtwczuqrxf";

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

function table(label, rows) {
  console.log(`\n${label}`);
  if (rows.length) console.table(rows);
  else console.log("(keine Datensätze)");
}

loadEnv(".env.local");
const supabase = createClient(process.env.VITE_SUPABASE_URL, serviceRoleKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const [{ data: objects, error: objectError }, { data: properties, error: propertyError }, { data: units, error: unitError }, { data: unitMap, error: unitMapError }] = await Promise.all([
  supabase.from("v_object_dropdown").select("value,objekt_code,label,object_id,property_id"),
  supabase.from("portfolio_properties").select("id,name,core_property_id,is_test,created_at"),
  supabase.from("portfolio_units").select("id,property_id,name,unit_type,is_active"),
  supabase.from("portfolio_unit_map").select("*"),
]);
if (objectError) throw objectError;
if (propertyError) throw propertyError;
if (unitError) throw unitError;
if (unitMapError) throw unitMapError;

const rosenObjects = (objects ?? []).filter((row) => normalize(row.label).includes("rosenstein"));
const rosenProperties = (properties ?? []).filter((row) => normalize(row.name).includes("rosenstein"));
const ids = new Set(
  [...rosenObjects.flatMap((row) => [row.value, row.object_id, row.property_id]), ...rosenProperties.flatMap((row) => [row.id, row.core_property_id])]
    .filter(Boolean)
    .map(String),
);

const [{ data: contracts, error: contractError }, { data: rentals, error: rentalError }, { data: adjustments, error: adjustmentError }] = await Promise.all([
  supabase.from("tenant_contracts").select("id,tenant_id,property_id,object_code,unit_label,start_date,end_date,status,cold_rent,operating_costs,total_rent,is_deleted,tenant_profiles(first_name,last_name,company_name)").order("start_date"),
  supabase.from("portfolio_property_rentals").select("id,property_id,unit_id,rent_type,rent_monthly,start_date,end_date,created_at,updated_at").order("start_date"),
  supabase.from("rent_adjustments").select("id,property_id,object_label,tenant_name,effective_date,effective_end_date,old_total_rent,new_total_rent,note,is_deleted").order("effective_date"),
]);
for (const error of [contractError, rentalError, adjustmentError]) if (error) throw error;

const matches = (row) =>
  ids.has(String(row.property_id ?? "")) ||
  normalize(`${row.object_code ?? ""} ${row.object_label ?? ""} ${row.note ?? ""}`).includes("rosenstein");

table("ROSENSTEIN-OBJEKTBRÜCKE", rosenObjects);
table("ROSENSTEIN-PORTFOLIOOBJEKTE", rosenProperties);
table("ROSENSTEIN-EINHEITEN", (units ?? []).filter((row) => ids.has(String(row.property_id))));
table("ROSENSTEIN-EINHEITEN-MAP", (unitMap ?? []).filter((row) => ids.has(String(row.property_id)) || (units ?? []).some((unit) => unit.id === row.portfolio_unit_id && ids.has(String(unit.property_id)))));
table("MIETVERTRÄGE", (contracts ?? []).filter(matches));
table("VERMIETUNGSZEITRÄUME", (rentals ?? []).filter(matches));
table("MIETANPASSUNGEN", (adjustments ?? []).filter(matches));
