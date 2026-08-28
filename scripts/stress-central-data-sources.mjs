import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [app, investment, audit, resolver, rentOverview, migration] = await Promise.all([
  read("src/App.tsx"),
  read("src/pages/InvestmentBericht.tsx"),
  read("src/services/auditLogService.ts"),
  read("src/services/property/resolvePropertyContext.ts"),
  read("src/pages/Mietuebersicht.tsx"),
  read("supabase/migrations/20260827163000_property_id_aliases.sql"),
]);

assert.doesNotMatch(investment, /localStorage/, "Investment-Bericht darf Vermögensdaten nicht mehr aus localStorage laden");
assert.match(investment, /fetchPropertyWealthProfiles/, "Investment-Bericht muss die zentrale Supabase-Quelle verwenden");
assert.doesNotMatch(audit, /localStorage/, "Audit-Protokolle dürfen keine zweite lokale Datenquelle führen");
assert.match(resolver, /property_id_aliases/, "Historische Objekt-IDs müssen zentral geladen werden");
assert.doesNotMatch(resolver, /f8a86965-07e4-4b6a-a97a-779dbe97a3fd/, "Historische IDs dürfen nicht im Resolver fest codiert sein");
assert.match(migration, /enable row level security/i, "Alias-Tabelle muss RLS aktivieren");
assert.match(migration, /revoke all on public\.property_id_aliases from anon/i, "Alias-Tabelle darf für anon nicht freigegeben sein");
assert.match(app, /path="\/exports" element={<Navigate to="\/buchhaltung\/berichte-exporte" replace \/>}/, "Alter Exportpfad muss zur zentralen Berichteseite führen");
assert.match(app, /path="\/portfolio" element={<Navigate to="\/immobilienvermoegen" replace \/>}/, "Alter Portfoliopfad muss zur zentralen Immobilienseite führen");
const rentAdjustmentQuery = rentOverview.match(/\.from\("rent_adjustments"\)[\s\S]{0,500}?\.order\("effective_date"/)?.[0] ?? "";
assert.doesNotMatch(rentAdjustmentQuery, /object_code/, "Mieteingang darf keine nicht vorhandene rent_adjustments.object_code-Spalte abfragen");
assert.doesNotMatch(rentAdjustmentQuery, /unit_label/, "Mieteingang darf keine nicht vorhandene rent_adjustments.unit_label-Spalte abfragen");
assert.match(rentOverview, /tenantContractsLoading/, "Mietkonto-Exporte müssen den Ladezustand der Sollmieten kennen");
assert.match(rentOverview, /if \(!onAnnualReportChange \|\| tenantContractsLoading\) return;/, "Ein noch leerer Jahresreport darf nicht als exportbereit gemeldet werden");
assert.match(rentOverview, /disabled=\{tenantContractsLoading\}/, "PDF-Export muss während der Sollmieten-Ladephase deaktiviert sein");

console.log("14 Stressfaelle fuer zentrale Datenquellen und Navigationspfade bestanden.");
