import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const explicitGrantMigrationName = "20260923150000_explicit_data_api_table_grants.sql";
const migrationsDirectory = new URL("../supabase/migrations/", import.meta.url);

const [rlsMigration, storageMigration, aliasMigration, invokerViewMigration, explicitGrantMigration, garageBillingPage, supabaseClient, vercelConfig] = await Promise.all([
  readFile(new URL("../supabase/migrations/20260826090000_lock_down_public_tables_without_rls.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260827153000_private_exposes_storage.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260827163000_property_id_aliases.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260901143500_secure_object_bridge_view.sql", import.meta.url), "utf8"),
  readFile(new URL(`../supabase/migrations/${explicitGrantMigrationName}`, import.meta.url), "utf8"),
  readFile(new URL("../src/pages/NebenkostenTiefgarage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/supabase.ts", import.meta.url), "utf8"),
  readFile(new URL("../vercel.json", import.meta.url), "utf8"),
]);

assert.match(rlsMigration, /relation\.relrowsecurity = false/, "Die Sicherheitsmigration muss alle öffentlichen Tabellen ohne RLS finden");
assert.match(rlsMigration, /enable row level security/i, "Gefundene Tabellen müssen RLS erhalten");
assert.match(rlsMigration, /revoke all privileges[\s\S]*from anon, authenticated/i, "Ungeschützte Tabellen müssen für Browserrollen gesperrt werden");
assert.match(rlsMigration, /create event trigger koenen_ensure_public_table_rls/i, "Neue öffentliche Tabellen müssen automatisch RLS erhalten");
assert.match(rlsMigration, /raise exception 'RLS is still disabled for:/, "Die Migration muss fehlschlagen, falls eine Tabelle ungeschützt bleibt");
assert.match(storageMigration, /update storage\.buckets[\s\S]*public = false/i, "Der exposes-Bucket muss privat geschaltet werden");
assert.match(storageMigration, /drop policy if exists[\s\S]*storage\.objects/i, "Alte Storage-Richtlinien müssen vor der sicheren Neuerstellung entfernt werden");
assert.match(aliasMigration, /enable row level security/i, "Die zentrale Alias-Tabelle muss RLS verwenden");
assert.match(aliasMigration, /revoke all on public\.property_id_aliases from anon/i, "Anonyme Zugriffe auf Objekt-Aliase müssen entzogen bleiben");
assert.match(invokerViewMigration, /relation\.relkind = 'v'[\s\S]*alter view %s set \(security_invoker = true\)/i, "Alle browserexponierten Public-Views müssen die RLS-Regeln des angemeldeten Nutzers verwenden");
assert.match(invokerViewMigration, /revoke all on %s from public, anon/i, "Anonyme View-Zugriffe müssen schemaweit entzogen werden");
assert.match(invokerViewMigration, /revoke all on public\.v_koenen_object_bridge from public, anon, authenticated/i, "Die View darf keine impliziten Browserrechte behalten");
assert.match(invokerViewMigration, /grant select on public\.v_koenen_object_bridge to authenticated/i, "Angemeldete Nutzer brauchen ausschließlich Lesezugriff auf die View");
assert.match(invokerViewMigration, /relation\.relrowsecurity = false/i, "Die Sicherheitsmigration muss weiterhin jede öffentliche Tabelle ohne RLS blockieren");
assert.match(invokerViewMigration, /has_table_privilege\('anon'[\s\S]*has_table_privilege\('authenticated'/i, "Browserlesbare Views müssen vollständig auf SECURITY DEFINER geprüft werden");
assert.match(invokerViewMigration, /security_invoker=true/i, "Browserlesbare Views müssen als SECURITY INVOKER nachgewiesen werden");
assert.match(explicitGrantMigration, /revoke all privileges on table[\s\S]*from anon/i, "Private App-Tabellen dürfen keine anonymen Data-API-Rechte behalten");
assert.match(explicitGrantMigration, /grant select, insert, update, delete on table[\s\S]*to authenticated/i, "Angemeldete App-Nutzer brauchen explizite Data-API-Rechte");
assert.match(explicitGrantMigration, /grant select, insert, update, delete on table[\s\S]*to service_role/i, "Der Service-Role-Zugriff muss explizit reproduzierbar sein");
assert.match(explicitGrantMigration, /relation\.relrowsecurity = true/i, "Explizit freigegebene Data-API-Tabellen müssen weiterhin RLS erzwingen");
assert.doesNotMatch(explicitGrantMigration, /finance_entry_backup_acquisition_side_cost_20260803/i, "Interne Sicherungstabellen dürfen nicht für die Data API freigegeben werden");

const migrationFiles = (await readdir(migrationsDirectory))
  .filter((fileName) => fileName.endsWith(".sql") && fileName > explicitGrantMigrationName)
  .sort();

for (const fileName of migrationFiles) {
  const migration = await readFile(new URL(fileName, migrationsDirectory), "utf8");
  if (!/create\s+table(?:\s+if\s+not\s+exists)?\s+public\./i.test(migration)) continue;

  assert.match(migration, /enable row level security/i, `${fileName}: Neue public-Tabelle muss RLS im selben Migrationsschritt aktivieren`);
  assert.match(migration, /grant[\s\S]*to authenticated/i, `${fileName}: Neue public-Tabelle braucht explizite authenticated-Rechte`);
  assert.match(migration, /grant[\s\S]*to service_role/i, `${fileName}: Neue public-Tabelle braucht explizite service_role-Rechte`);
  assert.match(migration, /revoke[\s\S]*from (?:public, )?anon/i, `${fileName}: Neue private public-Tabelle muss anon explizit sperren`);
}
assert.match(garageBillingPage, /function escapeHtml[\s\S]*\.replace\(\/&\/g, "&amp;"\)/, "Frei editierbare TG-Abrechnungsdaten müssen vor HTML-Export maskiert werden");
for (const field of ["propertyLabel", "unitLabel", "landlordName", "tenantName", "landlordIban"]) {
  assert.match(garageBillingPage, new RegExp(`escapeHtml\\(record\\.${field}`), `${field} darf nicht unmaskiert in die TG-Druckausgabe gelangen`);
}
assert.match(garageBillingPage, /escapeHtml\(salutation\)/, "Die frei editierbare Briefanrede muss vor dem HTML-Export maskiert werden");
assert.match(garageBillingPage, /safeAttachmentNotes = escapeHtml\(record\.attachmentNotes/, "Die Anlagenliste muss vor dem HTML-Export maskiert werden");
assert.match(supabaseClient, /fetch: resilientSupabaseFetch/, "Der Supabase-Client muss den resilienten Netzwerkzugriff verwenden");
assert.match(supabaseClient, /window\.location\.origin}\/supabase\//, "Fehlgeschlagene direkte Zugriffe müssen über dieselbe App-Domain wiederholt werden");
assert.match(supabaseClient, /new Request\(proxyUrl, request\)/, "Der Fallback muss Methode, Body und Auth-Header unverändert übernehmen");
const parsedVercel = JSON.parse(vercelConfig);
assert.deepEqual(parsedVercel.rewrites[0], { source: "/supabase/:path*", destination: "https://ufqfrotpefxtwczuqrxf.supabase.co/:path*" }, "Der Supabase-Proxy muss vor dem SPA-Fallback ausgewertet werden");

console.log("30 Stressfaelle fuer RLS-, Data-API-, Rollen-, View-, Storage-, Netzwerk- und HTML-Export-Grundschutz bestanden.");
