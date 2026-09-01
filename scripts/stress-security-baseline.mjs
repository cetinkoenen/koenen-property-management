import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [rlsMigration, storageMigration, aliasMigration, invokerViewMigration] = await Promise.all([
  readFile(new URL("../supabase/migrations/20260826090000_lock_down_public_tables_without_rls.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260827153000_private_exposes_storage.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260827163000_property_id_aliases.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260901143500_secure_object_bridge_view.sql", import.meta.url), "utf8"),
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

console.log("15 Stressfaelle fuer RLS-, Rollen-, View- und Storage-Grundschutz bestanden.");
