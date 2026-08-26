import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const dryRun = !process.argv.includes("--apply");

function loadEnvFile(fileName) {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Supabase URL/Key fehlt. Erwartet VITE_SUPABASE_URL und einen Supabase Key.");
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll("ß", "ss")
    .replace(/[ä]/g, "ae")
    .replace(/[ö]/g, "oe")
    .replace(/[ü]/g, "ue")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(normalize(term)));
}

function canonicalCategory(category, entryType) {
  const raw = String(category ?? "").trim();
  const text = normalize(raw);
  if (!text) return "";
  const aliases = [
    ["mietbestandteil nk", "Mietbestandteil-NK"],
    ["nebenkosten", "Mietbestandteil-NK"],
    ["betriebskosten", "Mietbestandteil-NK"],
    ["miete garage", "Miete Garage"],
    ["garage", "Miete Garage"],
    ["stellplatz", "Miete Garage"],
    ["miete", "Miete"],
    ["kaltmiete", "Miete"],
    ["warmmiete", "Miete"],
    ["kaution", "Kaution"],
    ["kreditrate", "Kreditrate"],
    ["monatsrate", "Kreditrate"],
    ["darlehensrate", "Kreditrate"],
    ["darlehen", "Kreditrate"],
    ["tilgung", "Kreditrate"],
    ["bewirtungskosten", "Bewirtungskosten"],
    ["bewirtung", "Bewirtungskosten"],
    ["geschaeftsessen", "Bewirtungskosten"],
    ["geschaeftsessen", "Bewirtungskosten"],
    ["restaurant", "Bewirtungskosten"],
    ["anschaffungskosten", "Erwerbsnebenkosten / Anschaffungskosten"],
    ["anschaffungsnebenkosten", "Erwerbsnebenkosten / Anschaffungskosten"],
    ["erwerbsnebenkosten", "Erwerbsnebenkosten / Anschaffungskosten"],
    ["kaufnebenkosten", "Erwerbsnebenkosten / Anschaffungskosten"],
    ["eigentrumumschreibung", "Erwerbsnebenkosten / Anschaffungskosten"],
    ["eigentumsumschreibung", "Erwerbsnebenkosten / Anschaffungskosten"],
    ["eigentrumsumschreibung", "Erwerbsnebenkosten / Anschaffungskosten"],
    ["eigentumsueberschreibung", "Erwerbsnebenkosten / Anschaffungskosten"],
    ["eigentumsuebertragung", "Erwerbsnebenkosten / Anschaffungskosten"],
    ["notar", "Erwerbsnebenkosten / Anschaffungskosten"],
    ["notarkosten", "Erwerbsnebenkosten / Anschaffungskosten"],
    ["grundbuch", "Erwerbsnebenkosten / Anschaffungskosten"],
    ["grundbuchamt", "Erwerbsnebenkosten / Anschaffungskosten"],
    ["grundbuchkosten", "Erwerbsnebenkosten / Anschaffungskosten"],
    ["grunderwerbsteuer", "Erwerbsnebenkosten / Anschaffungskosten"],
    ["grunderwerbssteuer", "Erwerbsnebenkosten / Anschaffungskosten"],
    ["makler", "Erwerbsnebenkosten / Anschaffungskosten"],
    ["maklerkosten", "Erwerbsnebenkosten / Anschaffungskosten"],
    ["kaufvertrag", "Erwerbsnebenkosten / Anschaffungskosten"],
    ["handy internet", "Handy & Internet"],
    ["handy und internet", "Handy & Internet"],
    ["handy", "Handy & Internet"],
    ["internet", "Handy & Internet"],
    ["telefon", "Handy & Internet"],
    ["mobilfunk", "Handy & Internet"],
    ["hausverwaltung", "Verwaltungskosten"],
    ["verwaltungskosten", "Verwaltungskosten"],
    ["verwaltung", "Verwaltungskosten"],
    ["weg hausgeld", "Verwaltungskosten"],
    ["hausgeld", "Verwaltungskosten"],
    ["reparatur", "Reparatur"],
    ["handwerker", "Reparatur"],
    ["instandhaltung", "Reparatur"],
    ["sanierung", "Reparatur"],
    ["modernisierung", "Reparatur"],
    ["capex", "Capex"],
    ["grundsteuer", "Grundsteuer"],
    ["abfallgebuehr", "Abfallgebühr"],
    ["abfallgebuehr", "Abfallgebühr"],
    ["abfall", "Abfallgebühr"],
    ["muell", "Abfallgebühr"],
    ["kontofuehrungsgebuehr", "Kontoführungsgebühr"],
    ["kontofuehrung", "Kontoführungsgebühr"],
    ["bankgebuehren", "Kontoführungsgebühr"],
    ["schonsteinfeger", "Schonsteinfeger"],
    ["schornsteinfeger", "Schonsteinfeger"],
    ["versicherung", "Versicherung"],
    ["wartung", "Wartung"],
    ["software", "Software"],
    ["buero", "Büro / Porto"],
    ["porto", "Büro / Porto"],
    ["steuer", "Steuer"],
    ["fahrtkosten", "Fahrtkosten"],
    ["allgemein", "Allgemein"],
  ];
  const exact = aliases.find(([alias]) => alias === text);
  if (exact) return exact[1];
  const contained = aliases.find(([alias]) => text.includes(alias));
  if (contained) return contained[1];
  if (entryType === "income") return "Miete";
  return raw;
}

function classify(entry, objectLabel) {
  const entryType = entry.entry_type === "expense" ? "expense" : "income";
  const category = canonicalCategory(entry.category, entryType);
  const text = normalize(`${category} ${entry.category ?? ""} ${entry.note ?? ""} ${entry.objekt_code ?? ""} ${objectLabel ?? ""}`);
  const isHohenloher = includesAny(text, ["hohenloher", "brettach", "langenbrettach"]);

  if (entryType === "income") {
    if (isHohenloher) return { expected: false, action: "update", reason: "Selbstgenutzt / WEG: keine Anlage V" };
    if (category === "Kaution" && !includesAny(text, ["einbehalten", "schadenersatz", "verrechnung"])) {
      return { expected: false, action: "review", reason: "Kaution nur bei Einbehalt/Verrechnung steuerlich prüfen" };
    }
    return { expected: true, action: "update", reason: "Vermietungseinnahme / Warmmiete / Garage" };
  }

  if (category === "Kreditrate" || includesAny(text, ["kreditrate", "monatsrate", "darlehensrate", "zins tilgung", "zins und tilgung", "tilgung"])) {
    return { expected: false, action: "update", reason: "Kreditrate enthält Zins+Tilgung; St kommt aus Darlehens-Jahreswerten" };
  }

  if (includesAny(text, ["notar", "grundbuch", "grundbuchamt", "grunderwerbsteuer", "grunderwerbssteuer", "erwerbsnebenkosten", "kaufnebenkosten", "eigentrumumschreibung", "eigentumsumschreibung", "eigentrumsumschreibung", "eigentumsueberschreibung", "eigentumsuebertragung", "makler", "kaufvertrag"])) {
    return { expected: false, action: "update", reason: "Erwerbsnebenkosten dokumentieren, nicht als laufendes St-Häkchen" };
  }

  if (isHohenloher && includesAny(text, ["haushaltsnah", "hausmeister", "reinigung", "winterdienst", "garten", "handwerker", "reparatur", "wartung", "schornsteinfeger", "schonsteinfeger", "modernisierung", "instandhaltung"])) {
    return { expected: true, action: "update", reason: "Selbstgenutzt / WEG: §35a-Arbeits-/Fahrtkosten prüfen" };
  }

  if (isHohenloher) {
    return { expected: false, action: "review", reason: "Hohenloher Sonderfall: §35a/Homeoffice/privat prüfen" };
  }

  if (category === "Allgemein" || !category) {
    return { expected: false, action: "review", reason: "Allgemein/unklar: manuell prüfen" };
  }

  const taxExpenseCategories = new Set([
    "Reparatur",
    "Capex",
    "Grundsteuer",
    "Abfallgebühr",
    "Schonsteinfeger",
    "Versicherung",
    "Wartung",
    "Kontoführungsgebühr",
    "Verwaltungskosten",
    "Fahrtkosten",
    "Software",
    "Büro / Porto",
    "Bewirtungskosten",
    "Handy & Internet",
    "Steuer",
  ]);

  if (taxExpenseCategories.has(category)) {
    return { expected: true, action: "update", reason: `${category}: objektbezogene Werbungskosten/Sonderlogik` };
  }

  return { expected: true, action: "review", reason: `${category}: Kategorie prüfen` };
}

function objectLabelFor(entry, objectById, objectByCode) {
  return (
    objectById.get(String(entry.object_id ?? "")) ||
    objectByCode.get(String(entry.objekt_code ?? "")) ||
    entry.objekt_code ||
    ""
  );
}

async function fetchAll(table, select, queryBuilder = (query) => query) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];
  while (true) {
    const query = queryBuilder(supabase.from(table).select(select).range(from, from + pageSize - 1));
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

const objectRows = await fetchAll(
  "v_object_dropdown",
  "value,objekt_code,label,object_id,property_id",
);
const objectById = new Map();
const objectByCode = new Map();
for (const object of objectRows) {
  const label = object.label || object.objekt_code || object.value || "";
  for (const id of [object.object_id, object.property_id, object.value]) {
    if (id) objectById.set(String(id), label);
  }
  if (object.objekt_code) objectByCode.set(String(object.objekt_code), label);
}

const entries = await fetchAll(
  "finance_entry",
  "id,object_id,objekt_code,entry_type,booking_date,amount,category,note,tax_relevant,is_deleted",
  (query) => query.eq("is_deleted", false).order("booking_date", { ascending: true }),
);

const updates = [];
const reviews = [];
for (const entry of entries) {
  const label = objectLabelFor(entry, objectById, objectByCode);
  const decision = classify(entry, label);
  const current = typeof entry.tax_relevant === "boolean" ? entry.tax_relevant : null;
  const canonical = canonicalCategory(entry.category, entry.entry_type);
  const categoryUpdate = canonical && canonical !== entry.category ? canonical : null;
  if (decision.action === "update" && (current !== decision.expected || categoryUpdate)) {
    updates.push({ entry, label, decision, categoryUpdate });
  }
  if (decision.action === "review" && current !== decision.expected) {
    reviews.push({ entry, label, decision });
  }
}

console.log(`${dryRun ? "DRY-RUN" : "APPLY"} Steuerrelevanz`);
console.log(`Buchungen geprüft: ${entries.length}`);
console.log(`Eindeutige Korrekturen: ${updates.length}`);
console.log(`Manuelle Prüffälle: ${reviews.length}`);

const preview = updates.slice(0, 40).map(({ entry, label, decision }) => ({
  id: entry.id,
  datum: entry.booking_date,
  objekt: label || entry.objekt_code,
  typ: entry.entry_type,
  kategorie: entry.category,
  betrag: entry.amount,
  aktuell: entry.tax_relevant,
  neu: decision.expected,
  grund: decision.reason,
}));
console.table(preview);

if (dryRun) {
  process.exit(0);
}

let applied = 0;
for (const { entry, decision, categoryUpdate } of updates) {
  const { error } = await supabase
    .from("finance_entry")
    .update({
      tax_relevant: decision.expected,
      ...(categoryUpdate ? { category: categoryUpdate } : {}),
    })
    .eq("id", entry.id)
    .eq("is_deleted", false);
  if (error) throw error;
  applied += 1;
}

console.log(`Angewendet: ${applied}`);
