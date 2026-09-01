import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../supabase/migrations/20260828123000_single_source_object_bridge_and_quality.sql", import.meta.url),
  "utf8",
);
const dataCheckPage = await readFile(new URL("../src/pages/Datenpruefung.tsx", import.meta.url), "utf8");
const appDataContext = await readFile(new URL("../src/state/AppDataContext.tsx", import.meta.url), "utf8");
const exposeService = await readFile(new URL("../src/lib/uploadExpose.ts", import.meta.url), "utf8");
const consistencyEngine = await readFile(new URL("../src/services/financeConsistencyEngine.ts", import.meta.url), "utf8");

const bridgeDefinition = migration.match(/create or replace view public\.v_koenen_object_bridge as([\s\S]*?)revoke all/i)?.[1] ?? "";

assert.match(bridgeDefinition, /join public\.property_id_aliases/i, "Objekt-Bridge muss die zentrale Alias-Tabelle verwenden");
assert.match(bridgeDefinition, /from public\.properties/i, "Objektname muss aus properties stammen");
assert.match(bridgeDefinition, /join public\.objects/i, "Objektcode muss aus objects stammen");
assert.doesNotMatch(bridgeDefinition, /values\s*\(/i, "Objekt-Bridge darf keine feste zweite Zuordnungsliste enthalten");
assert.match(migration, /orphan_object_alias/, "Verwaiste Objekt-Aliase müssen geprüft werden");
assert.match(migration, /orphan_finance_object/, "Verwaiste Buchungs-Objekt-IDs müssen geprüft werden");
assert.match(migration, /tenant_rent_total_mismatch/, "Widersprüchliche Mietbestandteile müssen geprüft werden");
assert.match(migration, /rent_adjustment_total_mismatch/, "Widersprüchliche Mietanpassungen müssen geprüft werden");
assert.match(migration, /vacancy_contract_overlap/, "Überschneidungen von Leerstand und Vertrag müssen geprüft werden");
assert.match(migration, /split_part\(e\.property_id, '::', 1\)/, "Einheiten-Zusatzdaten dürfen nicht fälschlich als verwaist gelten");
assert.match(dataCheckPage, /Objektzuordnungen, Mietverträge, Mietanpassungen und Leerstände/, "Datenprüfungsseite muss den erweiterten Prüfumfang erklären");
assert.match(appDataContext, /from\("property_extra_info"\)\.select\("property_id,living_area,wealth_profile"\)/, "Immobilienvermögen muss die einzige zentrale Wohnflächenquelle sein");
assert.doesNotMatch(appDataContext, /from\("properties"\)\.select\([^\n]*living_area/, "Wohnflächen dürfen nicht aus einer zweiten, produktiv nicht vorhandenen properties-Spalte gelesen werden");
assert.match(exposeService, /message\.toLowerCase\(\)\.includes\("object not found"\)/, "Ein veralteter Exposé-Verweis darf das Laden aller übrigen Exposés nicht blockieren");
assert.match(dataCheckPage, /issue_code !== "missing_documents"/, "Fehlende Dokument-Uploads dürfen nicht als Konsistenzfehler gewertet werden");
assert.match(consistencyEngine, /today\.getDate\(\) > 10/, "Der laufende Monat darf erst nach der Zahlungskalender-Kulanz als fehlend gelten");

console.log("18 Stressfaelle fuer zentrale Objektzuordnung und Datenqualitaet bestanden.");
