import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const PROJECT_REF = "ufqfrotpefxtwczuqrxf";
const ENTRY_ID = 1526;
const TARGET_CATEGORY = "Inserat / Vermietungswerbung";

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

const url = process.env.VITE_SUPABASE_URL;
if (!url) throw new Error("VITE_SUPABASE_URL fehlt.");
const supabase = createClient(url, serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } });

const { data: current, error: readError } = await supabase
  .from("finance_entry")
  .select("id,entry_type,booking_date,amount,category,note,tax_relevant,nk_relevant,is_deleted")
  .eq("id", ENTRY_ID)
  .single();
if (readError) throw readError;

if (current.category === TARGET_CATEGORY) {
  console.log(`Buchung ${ENTRY_ID} ist bereits korrekt als ${TARGET_CATEGORY} kategorisiert.`);
  process.exit(0);
}

const evidenceMatches = current.entry_type === "expense"
  && current.booking_date === "2026-10-12"
  && Math.abs(Number(current.amount) - 9.9) < 0.001
  && current.category === "Allgemein"
  && /P253/i.test(String(current.note ?? ""))
  && /Inserat/i.test(String(current.note ?? ""))
  && /143R2609703436/i.test(String(current.note ?? ""))
  && current.tax_relevant === true
  && current.nk_relevant === false
  && current.is_deleted === false;

if (!evidenceMatches) {
  throw new Error(`Sicherheitsabbruch: Buchung ${ENTRY_ID} entspricht nicht mehr dem geprüften Inserat-Beleg.`);
}

const { data: updated, error: updateError } = await supabase
  .from("finance_entry")
  .update({ category: TARGET_CATEGORY })
  .eq("id", ENTRY_ID)
  .eq("category", "Allgemein")
  .select("id,booking_date,amount,category,note,tax_relevant,nk_relevant")
  .single();
if (updateError) throw updateError;
if (updated.category !== TARGET_CATEGORY) throw new Error("Kategorie wurde nicht gespeichert.");

console.log(JSON.stringify({
  repaired: true,
  id: updated.id,
  date: updated.booking_date,
  amount: updated.amount,
  category: updated.category,
  taxRelevant: updated.tax_relevant,
  nkRelevant: updated.nk_relevant,
}, null, 2));
