import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const PROJECT_REF = "ufqfrotpefxtwczuqrxf";
const APPLY = process.argv.includes("--apply");
const EXPECTED = [
  {
    id: 1508,
    booking_date: "2026-09-28",
    amount: 270,
    category: "Verwaltungskosten",
    note: "Objekt 195",
    update: { tax_relevant: false },
  },
  {
    id: 1510,
    booking_date: "2026-09-28",
    amount: 270,
    category: "Mietbestandteil-NK",
    note: "Objekt 195 Mietbestandteil-NK",
    update: { tax_relevant: false, nk_relevant: false },
  },
];

function serviceRoleKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  const output = execFileSync(
    "supabase",
    ["projects", "api-keys", "--project-ref", PROJECT_REF, "-o", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  const keys = JSON.parse(output);
  const row = keys.find((item) => item.name === "service_role" || item.type === "secret");
  const key = row?.api_key ?? row?.key ?? row?.value;
  if (!key) throw new Error("Service-Role-Schlüssel konnte nicht gelesen werden.");
  return key;
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
if (!supabaseUrl) throw new Error("VITE_SUPABASE_URL fehlt. Skript mit --env-file=.env.local starten.");
const supabase = createClient(supabaseUrl, serviceRoleKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const columns = "id,booking_date,amount,category,note,tax_relevant,nk_relevant,is_deleted";
const { data: beforeRows, error: beforeError } = await supabase
  .from("finance_entry")
  .select(columns)
  .in("id", EXPECTED.map((row) => row.id))
  .order("id");
if (beforeError) throw beforeError;

for (const expected of EXPECTED) {
  const actual = beforeRows?.find((row) => row.id === expected.id);
  if (!actual) throw new Error(`Buchung ${expected.id} wurde nicht gefunden.`);
  for (const key of ["booking_date", "amount", "category", "note"]) {
    if (String(actual[key]) !== String(expected[key])) {
      throw new Error(`Buchung ${expected.id} stimmt bei ${key} nicht mit dem belegten Ziel überein.`);
    }
  }
  if (actual.is_deleted) throw new Error(`Buchung ${expected.id} ist bereits gelöscht.`);
}

if (!APPLY) {
  console.table(beforeRows);
  console.log("Trockenlauf: keine Daten geändert. Für die bestätigte Korrektur --apply ergänzen.");
  process.exit(0);
}

for (const expected of EXPECTED) {
  const { data, error } = await supabase
    .from("finance_entry")
    .update(expected.update)
    .eq("id", expected.id)
    .eq("booking_date", expected.booking_date)
    .eq("amount", expected.amount)
    .eq("category", expected.category)
    .eq("note", expected.note)
    .eq("is_deleted", false)
    .select(columns);
  if (error) throw error;
  if (data?.length !== 1) throw new Error(`Buchung ${expected.id} wurde nicht eindeutig aktualisiert.`);
}

const { data: afterRows, error: afterError } = await supabase
  .from("finance_entry")
  .select(columns)
  .in("id", EXPECTED.map((row) => row.id))
  .order("id");
if (afterError) throw afterError;

for (const expected of EXPECTED) {
  const actual = afterRows?.find((row) => row.id === expected.id);
  for (const [key, value] of Object.entries(expected.update)) {
    if (actual?.[key] !== value) throw new Error(`Nachprüfung für Buchung ${expected.id}/${key} fehlgeschlagen.`);
  }
}

console.table(afterRows);
console.log("Hohenloher-Steuerkennzeichen wurden eindeutig korrigiert und nachgeprüft.");
