import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const PROJECT_REF = "ufqfrotpefxtwczuqrxf";
const START_DATE = "2024-01-01";
const END_DATE = new Date().toISOString().slice(0, 10);

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

function readServiceRoleKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  const output = execFileSync(
    "supabase",
    ["projects", "api-keys", "--project-ref", PROJECT_REF, "-o", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  const keys = JSON.parse(output);
  const row = keys.find((item) => item.name === "service_role" || item.type === "secret");
  const key = row?.api_key ?? row?.key ?? row?.value;
  if (!key) throw new Error("Service-Role-Schlüssel konnte nicht über die angemeldete Supabase CLI gelesen werden.");
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

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function amount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const categoryAliases = new Map([
  ["nebenkosten", "Mietbestandteil-NK"],
  ["betriebskosten", "Mietbestandteil-NK"],
  ["mietbestandteil nk", "Mietbestandteil-NK"],
  ["nk nachzahlung", "NK-Nachzahlung"],
  ["miete", "Miete"],
  ["kaltmiete", "Miete"],
  ["warmmiete", "Miete"],
  ["miete garage", "Miete Garage"],
  ["garage", "Miete Garage"],
  ["stellplatz", "Miete Garage"],
  ["miete nachzahlung", "Miete Nachzahlung"],
  ["mietnachzahlung", "Miete Nachzahlung"],
  ["kaution", "Kaution"],
  ["kreditrate", "Kreditrate"],
  ["monatsrate", "Kreditrate"],
  ["darlehensrate", "Kreditrate"],
  ["darlehensauszahlung", "Darlehensauszahlung"],
  ["kontofuhrungsgebuhr", "Kontoführungsgebühr"],
  ["kontofuhrungsgebuhren", "Kontoführungsgebühr"],
  ["bankgebuhren", "Kontoführungsgebühr"],
  ["grundsteuer", "Grundsteuer"],
  ["abfallgebuhr", "Abfallgebühr"],
  ["mull", "Abfallgebühr"],
  ["hausverwaltung", "Verwaltungskosten"],
  ["verwaltung", "Verwaltungskosten"],
  ["verwaltungskosten", "Verwaltungskosten"],
  ["weg hausgeld", "Verwaltungskosten"],
  ["hausgeld", "Verwaltungskosten"],
  ["reparatur", "Reparatur"],
  ["handwerker", "Reparatur"],
  ["instandhaltung", "Reparatur"],
  ["sanierung", "Reparatur"],
  ["modernisierung", "Reparatur"],
  ["capex", "Capex"],
  ["versicherung", "Versicherung"],
  ["wartung", "Wartung"],
  ["schornsteinfeger", "Schonsteinfeger"],
  ["schonsteinfeger", "Schonsteinfeger"],
  ["software", "Software"],
  ["steuerberater", "Steuerberater"],
  ["steuerberatung", "Steuerberater"],
  ["steuer", "Steuer"],
  ["fahrt", "Fahrtkosten"],
  ["fahrtkosten", "Fahrtkosten"],
  ["handy internet", "Handy & Internet"],
  ["telefon", "Handy & Internet"],
  ["mobilfunk", "Handy & Internet"],
  ["bewirtung", "Bewirtungskosten"],
  ["bewirtungskosten", "Bewirtungskosten"],
  ["buero porto", "Büro / Porto"],
  ["porto", "Büro / Porto"],
  ["allgemein", "Allgemein"],
  ["erwerbsnebenkosten anschaffungskosten", "Erwerbsnebenkosten / Anschaffungskosten"],
]);

const validByType = {
  income: new Set(["Miete", "Miete Garage", "Miete Nachzahlung", "NK-Nachzahlung", "Darlehensauszahlung", "Kaution", "Mietbestandteil-NK", "Verwaltungskosten", "Allgemein"]),
  expense: new Set([
    "Abfallgebühr", "Allgemein", "Verwaltungskosten", "Bewirtungskosten",
    "Erwerbsnebenkosten / Anschaffungskosten", "Fahrtkosten", "Grundsteuer",
    "Handy & Internet", "Kontoführungsgebühr", "Kreditrate", "Büro / Porto",
    "Schonsteinfeger", "Software", "Steuer", "Steuerberater", "Capex", "Reparatur",
    "Versicherung", "Wartung", "Kaution",
  ]),
};

function canonicalCategory(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const key = normalize(raw);
  return categoryAliases.get(key) ?? raw;
}

function expectedTax(entry, objectLabel) {
  const category = canonicalCategory(entry.category);
  const text = normalize(`${category} ${entry.note ?? ""} ${entry.objekt_code ?? ""} ${objectLabel ?? ""}`);
  const hohenloher = /hohenloher|brettach|langenbrettach/.test(text);
  const credit = category === "Kreditrate" || /kreditrate|monatsrate|darlehensrate|zins tilgung|zins und tilgung/.test(text);
  const acquisition = /notar|grundbuch|grunderwerbsteuer|erwerbsnebenkosten|kaufnebenkosten|makler|kaufvertrag|eigentumsumschreibung/.test(text);
  const depositNeutral = category === "Kaution" && !/einbehalten|schadenersatz|verrechnung/.test(text);
  const moving = /umzugskosten|umzug/.test(text) && !/vermietungsbedingt|mieterwechsel|objektbezogen/.test(text);

  if (credit) return { value: false, certainty: "certain", reason: "Kreditrate: nur Zinsanteil wird separat im Steuerbericht verwendet" };
  if (acquisition) return { value: false, certainty: "certain", reason: "Anschaffungs-/Erwerbsnebenkosten sind keine laufenden Werbungskosten" };
  if (depositNeutral) return { value: false, certainty: "certain", reason: "Kaution ohne belegten Einbehalt/Verrechnung" };
  if (moving) return { value: false, certainty: "certain", reason: "Umzugskosten ohne belegten direkten Vermietungsbezug" };
  if (category === "Darlehensauszahlung") return { value: false, certainty: "certain", reason: "Steuerneutraler Finanzierungszufluss" };
  if (hohenloher) {
    if (entry.entry_type === "expense" && /haushaltsnah|hausmeister|reinigung|winterdienst|garten|handwerker|reparatur|wartung|schornsteinfeger|modernisierung|instandhaltung/.test(text)) {
      return { value: true, certainty: "review", reason: "Eigennutzung: nur belegter Arbeits-/Fahrtkostenanteil nach §35a" };
    }
    return { value: false, certainty: "certain", reason: "Hohenloher ist eigengenutzt und von Anlage V ausgeschlossen" };
  }
  if (entry.entry_type === "income" && category === "Verwaltungskosten") {
    return { value: true, certainty: "certain", reason: "Erstattung/Gutschrift mindert Verwaltungskosten" };
  }
  if (entry.entry_type === "income") return { value: true, certainty: "certain", reason: "Vermietungseinnahme" };
  if (!category || category === "Allgemein") return { value: false, certainty: "review", reason: "Unklare Ausgabe benötigt Belegprüfung" };
  return { value: true, certainty: "review", reason: "Objektbezogene Ausgabe; genaue steuerliche Behandlung prüfen" };
}

function expectedNk(entry, objectLabel) {
  const category = canonicalCategory(entry.category);
  const text = normalize(`${category} ${entry.note ?? ""} ${objectLabel ?? ""}`);
  if (/hohenloher|brettach|langenbrettach/.test(text)) return false;
  if (/rucklage|reparatur|instandsetzung|sanierung|modernisierung|verwaltung|steuerberater|software|bankgebuhr|kontofuhrung|porto|tilgung|kreditrate|darlehen|anschaffungskosten|erwerbsnebenkosten|kaufnebenkosten|notar|grundbuch|grunderwerbsteuer|makler/.test(text)) return false;
  if (entry.entry_type === "income") return /nebenkosten|betriebskosten|vorauszahlung|abschlag|\bnk\b|erstattung|guthaben|ruckzahlung/.test(text);
  if (category === "Steuer" && /\b[1-4]\s*(jv|vj)\s*20\d{2}\s*steuer\s*\d/.test(text)) return true;
  return /grundsteuer|wasser|abwasser|kanal|heizung|warmwasser|aufzug|strassenreinigung|winterdienst|mull|abfall|reinigung|garten|beleuchtung|hausstrom|allgemeinstrom|schornstein|versicherung|hauswart|hausmeister|kabel|rauchwarn|betriebskosten|nebenkosten|kalo|techem/.test(text);
}

async function fetchAll(supabase, table, select, configure = (query) => query) {
  const result = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await configure(supabase.from(table).select(select).range(from, from + 999));
    if (error) throw new Error(`${table}: ${error.message}`);
    result.push(...(data ?? []));
    if (!data || data.length < 1000) return result;
  }
}

loadEnv(".env.local");
loadEnv(".env");
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
if (!supabaseUrl) throw new Error("VITE_SUPABASE_URL fehlt.");
const supabase = createClient(supabaseUrl, readServiceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } });

const [objects, entries, plans] = await Promise.all([
  fetchAll(supabase, "v_object_dropdown", "value,objekt_code,label,object_id,property_id"),
  fetchAll(
    supabase,
    "finance_entry",
    "id,object_id,objekt_code,user_id,entry_type,booking_date,amount,category,note,tax_relevant,nk_relevant,is_deleted,loan_interest_amount,loan_principal_amount,loan_rate_plan_id,loan_split_source",
    (query) => query.eq("is_deleted", false).gte("booking_date", START_DATE).lte("booking_date", END_DATE).order("booking_date"),
  ),
  fetchAll(supabase, "property_loan_rate_plan", "id,property_id,property_key,plan_date,plan_year,plan_month,payment_amount,interest_amount,principal_amount,fee_amount,source_file"),
]);

const objectById = new Map();
const objectByCode = new Map();
for (const object of objects) {
  const label = object.label || object.objekt_code || object.value || "";
  for (const id of [object.value, object.object_id, object.property_id]) if (id) objectById.set(String(id), label);
  if (object.objekt_code) objectByCode.set(String(object.objekt_code), label);
}
const objectLabel = (entry) => objectById.get(String(entry.object_id ?? "")) || objectByCode.get(String(entry.objekt_code ?? "")) || entry.objekt_code || "Ohne Objekt";

const findings = [];
const add = (severity, code, entry, detail, recommendation, proposed = null) => findings.push({
  severity,
  code,
  id: entry?.id ?? null,
  date: entry?.booking_date ?? null,
  object: entry ? objectLabel(entry) : null,
  amount: entry ? amount(entry.amount) : null,
  category: entry?.category ?? null,
  note: entry?.note ?? null,
  detail,
  recommendation,
  proposed,
});

const fingerprint = new Map();
for (const entry of entries) {
  const category = canonicalCategory(entry.category);
  const label = objectLabel(entry);
  const portfolio = entry.objekt_code === "PORTFOLIO_GENERAL";
  const key = [entry.booking_date, entry.entry_type, round2(Math.abs(amount(entry.amount))), normalize(label), normalize(entry.category), normalize(entry.note)].join("|");
  fingerprint.set(key, [...(fingerprint.get(key) ?? []), entry]);

  if (!entry.category || !category) add("high", "missing_category", entry, "Kategorie fehlt.", "Beleg/Buchungstext prüfen und eine eindeutige Kategorie setzen.");
  if (category && category !== entry.category) add("medium", "noncanonical_category", entry, `Nicht normalisierte Kategorie: ${entry.category}`, `Auf ${category} normalisieren.`, { category });
  if (!validByType[entry.entry_type]?.has(category)) add("medium", "type_category_mismatch", entry, `${entry.entry_type} ist für Kategorie ${category || "leer"} ungewöhnlich.`, "Buchungsart und Kategorie anhand des Belegs prüfen.");
  if (!portfolio && (!entry.object_id || label === "Ohne Objekt" || label === entry.objekt_code)) add("high", "unresolved_object", entry, "Objektzuordnung ist nicht eindeutig auflösbar.", "Mit dem richtigen Objekt aus der Stammdatenquelle verknüpfen.");

  const tax = expectedTax(entry, label);
  if (tax.certainty === "certain" && entry.tax_relevant !== tax.value) {
    add("high", "tax_flag_mismatch", entry, `St ist ${entry.tax_relevant}; erwartet ${tax.value}. ${tax.reason}`, "St-Kennzeichen korrigieren.", { tax_relevant: tax.value });
  } else if (tax.certainty === "review" && entry.tax_relevant !== tax.value) {
    add("review", "tax_review", entry, `${tax.reason}; aktuelles St=${entry.tax_relevant}.`, "Nur nach Belegprüfung ändern.");
  }

  const nk = expectedNk(entry, label);
  if (entry.nk_relevant !== nk) add("medium", "nk_flag_mismatch", entry, `NK-Abr. ist ${entry.nk_relevant}; regelbasiert erwartet ${nk}.`, "Umlagefähigkeit anhand Beleg/Abrechnung prüfen.", { nk_relevant: nk });

  if (category === "Kreditrate") {
    const interest = amount(entry.loan_interest_amount);
    const principal = amount(entry.loan_principal_amount);
    const rate = Math.abs(amount(entry.amount));
    const split = round2(interest + principal);
    const linkedPlan = plans.find((plan) => plan.id === entry.loan_rate_plan_id);
    const confirmedChfRule = String(entry.loan_split_source ?? "").startsWith("rule:CHF-fixed-principal:");
    if ((!entry.loan_rate_plan_id || !linkedPlan) && !confirmedChfRule) add("high", "loan_plan_missing", entry, "Kreditrate ist nicht mit einem Monatsplan verknüpft.", "Passenden Tilgungsplan anhand Objekt, Monat, Betrag und Darlehensreferenz zuordnen.");
    if (entry.loan_interest_amount == null || entry.loan_principal_amount == null) {
      add(
        "high",
        "loan_split_missing",
        entry,
        `Zins- oder Tilgungsanteil fehlt (Zins=${entry.loan_interest_amount ?? "leer"}, Tilgung=${entry.loan_principal_amount ?? "leer"}; Plan=${linkedPlan ? `${linkedPlan.interest_amount}/${linkedPlan.principal_amount}` : "nicht verknüpft"}).`,
        "Werte aus dem belegten Tilgungsplan übernehmen.",
      );
    }
    if (Math.abs(rate - split) > 0.01) add("high", "loan_split_sum", entry, `Rate ${rate.toFixed(2)} € weicht von Zins + Tilgung ${split.toFixed(2)} € ab.`, "Nur bei identischem Monatsplan/Betrag korrigieren.");
    if (entry.tax_relevant !== false) add("high", "loan_tax_flag", entry, "Gesamte Kreditrate ist als steuerrelevant markiert.", "St für Rate entfernen; Steuerbericht nutzt ausschließlich den Zinsanteil.", { tax_relevant: false });
  }
}

for (const rows of fingerprint.values()) {
  if (rows.length < 2) continue;
  for (const entry of rows) add("high", "exact_duplicate", entry, `Exakte Dublette (${rows.length} identische aktive Buchungen).`, "Nur nach Abgleich mit Kontoauszug eine Dublette löschen.");
}

const counts = entries.reduce((map, entry) => {
  const key = `${entry.entry_type} | ${entry.category ?? "(leer)"} | St=${entry.tax_relevant} | NK=${entry.nk_relevant}`;
  map.set(key, (map.get(key) ?? 0) + 1);
  return map;
}, new Map());

const severities = ["high", "medium", "review"];
console.log(`FINANZ-AUDIT ${START_DATE} bis ${END_DATE}`);
console.log(`Aktive Buchungen: ${entries.length}; Objekte/Quellen: ${objects.length}; Monatspläne: ${plans.length}`);
console.log("\nKATEGORIEBESTAND");
console.table([...counts].map(([group, count]) => ({ group, count })).sort((a, b) => a.group.localeCompare(b.group, "de")));
console.log("\nBEFUNDE");
console.table(severities.map((severity) => ({ severity, count: findings.filter((item) => item.severity === severity).length })));
for (const severity of severities) {
  const rows = findings.filter((item) => item.severity === severity);
  if (!rows.length) continue;
  console.log(`\n${severity.toUpperCase()}`);
  console.table(rows.map(({ proposed: _proposed, ...row }) => row));
}

const certainProposals = findings.filter((item) => item.proposed && item.severity === "high");
console.log(`\nEindeutig belegbare automatische Vorschläge: ${certainProposals.length}`);
console.log(JSON.stringify({
  range: { from: START_DATE, to: END_DATE },
  counts: { entries: entries.length, objects: objects.length, plans: plans.length },
  findingCounts: Object.fromEntries(severities.map((severity) => [severity, findings.filter((item) => item.severity === severity).length])),
  findings,
}, null, 2));
