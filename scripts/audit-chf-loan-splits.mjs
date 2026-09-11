import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const PROJECT_REF = "ufqfrotpefxtwczuqrxf";

function serviceRoleKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  const output = execFileSync("supabase", ["projects", "api-keys", "--project-ref", PROJECT_REF, "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const keys = JSON.parse(output);
  const row = keys.find((item) => item.name === "service_role" || item.type === "secret");
  const key = row?.api_key ?? row?.key ?? row?.value;
  if (!key) throw new Error("Service-Role-Schlüssel konnte nicht gelesen werden.");
  return key;
}

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ß", "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const url = process.env.VITE_SUPABASE_URL;
if (!url) throw new Error("VITE_SUPABASE_URL fehlt.");
const supabase = createClient(url, serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } });

const [{ data: objects, error: objectError }, { data: entries, error: entryError }] = await Promise.all([
  supabase.from("v_object_dropdown").select("value,object_id,property_id,objekt_code,label"),
  supabase
    .from("finance_entry")
    .select("id,object_id,objekt_code,booking_date,amount,category,loan_interest_amount,loan_principal_amount,loan_rate_plan_id,loan_split_source,is_deleted")
    .eq("is_deleted", false)
    .eq("category", "Kreditrate")
    .order("booking_date"),
]);
if (objectError) throw objectError;
if (entryError) throw entryError;

const rules = [
  { key: "lilienthaler", principal: 1100 },
  { key: "elsasser", principal: 300 },
];

const objectLabels = new Map();
for (const object of objects ?? []) {
  const label = String(object.label ?? object.objekt_code ?? "");
  for (const id of [object.value, object.object_id, object.property_id, object.objekt_code]) {
    if (id) objectLabels.set(String(id), label);
  }
}

const rows = [];
for (const entry of entries ?? []) {
  const label = objectLabels.get(String(entry.object_id ?? ""))
    ?? objectLabels.get(String(entry.objekt_code ?? ""))
    ?? String(entry.objekt_code ?? "");
  const rule = rules.find((candidate) => normalize(label).includes(candidate.key));
  if (!rule) continue;
  const rate = Math.round(Math.abs(Number(entry.amount ?? 0)) * 100) / 100;
  const expectedInterest = Math.round((rate - rule.principal) * 100) / 100;
  rows.push({
    id: entry.id,
    date: entry.booking_date,
    object: label,
    rate,
    currentInterest: entry.loan_interest_amount,
    currentPrincipal: entry.loan_principal_amount,
    expectedInterest,
    expectedPrincipal: rule.principal,
    valid: expectedInterest >= 0,
    needsUpdate: Number(entry.loan_interest_amount) !== expectedInterest || Number(entry.loan_principal_amount) !== rule.principal,
    source: entry.loan_split_source,
  });
}

console.log(`CHF-DARLEHEN-AUDIT · ${rows.length} Kreditraten`);
console.table(rows);
console.log(JSON.stringify({
  count: rows.length,
  invalid: rows.filter((row) => !row.valid).length,
  needsUpdate: rows.filter((row) => row.needsUpdate).length,
  rows,
}, null, 2));

if (rows.some((row) => !row.valid)) process.exitCode = 1;
