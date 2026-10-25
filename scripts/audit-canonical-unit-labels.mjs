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

const supabaseUrl = process.env.VITE_SUPABASE_URL;
if (!supabaseUrl) throw new Error("VITE_SUPABASE_URL fehlt.");
const client = createClient(supabaseUrl, serviceRoleKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function read(table, select) {
  const { data, error } = await client.from(table).select(select).limit(1_000);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
}

const [directory, properties, units, contracts, vacancies, moves, reminders] = await Promise.all([
  read("v_object_dropdown", "value,object_id,property_id,objekt_code,label"),
  read("portfolio_properties", "id,core_property_id,name"),
  read("portfolio_units", "id,property_id,name,unit_type,is_active"),
  read("tenant_contracts", "id,property_id,object_code,unit_label,rent_type,start_date,end_date,status,is_deleted"),
  read("unit_vacancies", "id,property_id,object_code,object_label,unit_label,status,is_deleted"),
  read("move_processes", "id,property_id,object_code,unit_label,process_type,status"),
  read("payment_reminders", "id,property_id,object_code,unit_label,status"),
]);

console.log(JSON.stringify({ directory, properties, units, contracts, vacancies, moves, reminders }, null, 2));
