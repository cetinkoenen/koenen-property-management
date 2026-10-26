import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const PROJECT_REF = "ufqfrotpefxtwczuqrxf";
const YEAR = Number(process.env.TAX_YEAR || 2025);
if (!Number.isInteger(YEAR) || YEAR < 2000 || YEAR > 2100) throw new Error("TAX_YEAR ist ungültig.");

const from = `${YEAR}-01-01`;
const to = `${YEAR}-12-31`;
const normalize = (value) => String(value ?? "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replaceAll("ß", "ss")
  .replace(/straße|strasse/g, "str")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();
const money = (value) => Math.round((Number(value ?? 0) + Number.EPSILON) * 100) / 100;

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

async function fetchAll(supabase, table, select, configure = (query) => query) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await configure(supabase.from(table).select(select).range(offset, offset + 999));
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
if (!supabaseUrl) throw new Error("VITE_SUPABASE_URL fehlt.");
const supabase = createClient(supabaseUrl, serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } });

const [objects, entries, rules] = await Promise.all([
  fetchAll(supabase, "v_object_dropdown", "value,object_id,property_id,objekt_code,label"),
  fetchAll(
    supabase,
    "finance_entry",
    "id,object_id,objekt_code,entry_type,booking_date,amount,category,note,tax_relevant,nk_relevant,is_deleted,loan_interest_amount,loan_principal_amount,loan_rate_plan_id,loan_split_source",
    (query) => query.eq("is_deleted", false).gte("booking_date", from).lte("booking_date", to).order("booking_date"),
  ),
  fetchAll(supabase, "transaction_rules", "id,name,match_text,property_id,object_code,unit_label,entry_type,category,tax_relevant,priority,is_active"),
]);

const objectById = new Map();
const objectByCode = new Map();
for (const object of objects) {
  const label = object.label || object.objekt_code || object.value || "Ohne Objekt";
  for (const id of [object.value, object.object_id, object.property_id]) if (id) objectById.set(String(id), label);
  if (object.objekt_code) objectByCode.set(String(object.objekt_code), label);
}
const objectLabel = (entry) => objectById.get(String(entry.object_id ?? "")) || objectByCode.get(String(entry.objekt_code ?? "")) || entry.objekt_code || "Ohne Objekt";

const totals = new Map();
for (const entry of entries) {
  const label = objectLabel(entry);
  const row = totals.get(label) ?? { object: label, bookings: 0, income: 0, expense: 0, taxIncome: 0, taxExpense: 0, creditRates: 0, interest: 0, principal: 0 };
  const value = Math.abs(money(entry.amount));
  row.bookings += 1;
  if (entry.entry_type === "income") row.income += value;
  else row.expense += value;
  if (entry.tax_relevant === true && entry.entry_type === "income") row.taxIncome += value;
  if (entry.tax_relevant === true && entry.entry_type === "expense") row.taxExpense += value;
  if (normalize(entry.category) === "kreditrate") {
    row.creditRates += value;
    row.interest += money(entry.loan_interest_amount);
    row.principal += money(entry.loan_principal_amount);
  }
  totals.set(label, row);
}

const openRuleChanges = [];
for (const entry of entries) {
  const haystack = normalize(`${entry.category ?? ""} ${entry.note ?? ""} ${entry.objekt_code ?? ""}`);
  const matching = rules.filter((rule) => {
    if (!rule.is_active) return false;
    const needle = normalize(rule.match_text);
    if (!needle || !haystack.includes(needle)) return false;
    if (rule.object_code && normalize(rule.object_code) !== normalize(entry.objekt_code)) return false;
    if (rule.property_id && String(rule.property_id) !== String(entry.object_id ?? "")) return false;
    return true;
  });
  for (const rule of matching) {
    const changes = [];
    if (rule.entry_type && rule.entry_type !== entry.entry_type) changes.push(`Typ ${entry.entry_type} -> ${rule.entry_type}`);
    if (rule.category && normalize(rule.category) !== normalize(entry.category)) changes.push(`Kategorie ${entry.category || "leer"} -> ${rule.category}`);
    if (typeof rule.tax_relevant === "boolean" && rule.tax_relevant !== entry.tax_relevant) changes.push(`St ${entry.tax_relevant} -> ${rule.tax_relevant}`);
    if (changes.length) openRuleChanges.push({
      id: entry.id,
      date: entry.booking_date,
      object: objectLabel(entry),
      amount: money(entry.amount),
      category: entry.category,
      note: entry.note,
      rule: rule.name,
      changes: changes.join("; "),
    });
  }
}

const exceptions = {
  missingCategory: entries.filter((entry) => !String(entry.category ?? "").trim()),
  missingObject: entries.filter((entry) => entry.objekt_code !== "PORTFOLIO_GENERAL" && !entry.object_id),
  missingTaxFlag: entries.filter((entry) => typeof entry.tax_relevant !== "boolean"),
  missingNkFlag: entries.filter((entry) => typeof entry.nk_relevant !== "boolean"),
  rentNotTaxedOutsideOwnerOccupied: entries.filter((entry) => normalize(entry.category).startsWith("miete") && entry.tax_relevant !== true && !normalize(objectLabel(entry)).includes("hohenloher")),
  ownerOccupiedTaxed: entries.filter((entry) => normalize(objectLabel(entry)).includes("hohenloher") && entry.tax_relevant === true),
  creditRateTaxed: entries.filter((entry) => normalize(entry.category) === "kreditrate" && entry.tax_relevant !== false),
  creditRateSplitMismatch: entries.filter((entry) => normalize(entry.category) === "kreditrate" && Math.abs(Math.abs(money(entry.amount)) - money(entry.loan_interest_amount) - money(entry.loan_principal_amount)) > 0.01),
  openRuleChanges,
};

const exceptionCounts = Object.fromEntries(Object.entries(exceptions).map(([key, rows]) => [key, rows.length]));
console.log(`STEUERJAHR-BEREITSCHAFT ${YEAR}`);
console.log(`Aktive Buchungen: ${entries.length}; Vorsortierungsregeln: ${rules.length} (${rules.filter((rule) => rule.is_active).length} aktiv)`);
console.log("\nVORSORTIERUNGSREGELN");
console.table(rules.map((rule) => ({
  id: rule.id,
  name: rule.name,
  matchText: rule.match_text,
  objectCode: rule.object_code,
  propertyId: rule.property_id,
  entryType: rule.entry_type,
  category: rule.category,
  taxRelevant: rule.tax_relevant,
  priority: rule.priority,
  active: rule.is_active,
})));
console.log("\nOBJEKTSUMMEN");
console.table([...totals.values()].map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "number" ? money(value) : value]))));
console.log("\nAUSNAHMEN");
console.table(exceptionCounts);
for (const [key, rows] of Object.entries(exceptions)) {
  if (!rows.length) continue;
  console.log(`\n${key}`);
  console.table(rows.map((row) => ({ id: row.id, date: row.booking_date ?? row.date, object: row.object ?? objectLabel(row), amount: row.amount, category: row.category, note: row.note, rule: row.rule, changes: row.changes })));
}
console.log(JSON.stringify({ year: YEAR, entries: entries.length, rules: { total: rules.length, active: rules.filter((rule) => rule.is_active).length }, totals: [...totals.values()], exceptionCounts }, null, 2));

if (Object.values(exceptionCounts).some((count) => count > 0)) process.exitCode = 1;
