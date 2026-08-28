import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [app, investment, audit, resolver, rentOverview, migration, vercelConfig] = await Promise.all([
  read("src/App.tsx"),
  read("src/pages/InvestmentBericht.tsx"),
  read("src/services/auditLogService.ts"),
  read("src/services/property/resolvePropertyContext.ts"),
  read("src/pages/Mietuebersicht.tsx"),
  read("supabase/migrations/20260827163000_property_id_aliases.sql"),
  read("vercel.json"),
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
assert.doesNotMatch(rentOverview, /\.from\("finance_entry"\)/, "Mieteingang darf Buchungen nicht parallel zur zentralen App-Datenquelle laden");
assert.match(rentOverview, /const allKnownBookings = appData\.entries\.filter/, "Mieteingang muss ausschließlich die zentral geladenen Buchungen verwenden");
assert.match(rentOverview, /portfolioRentalsLoading/, "Mietkonto-Exporte müssen den Ladezustand der Vermietungszeiträume kennen");
assert.match(rentOverview, /vacanciesLoading/, "Mietkonto-Exporte müssen den Ladezustand der Leerstände kennen");
assert.match(rentOverview, /tenantContractsLoading/, "Mietkonto-Exporte müssen den Ladezustand der Sollmieten kennen");
assert.match(rentOverview, /rentAdjustmentsLoading/, "Mietkonto-Exporte müssen den Ladezustand der Mietanpassungen kennen");
assert.match(rentOverview, /if \(!onAnnualReportChange \|\| reportDataLoading\) return;/, "Ein noch unvollständiger Jahresreport darf nicht als exportbereit gemeldet werden");
assert.match(rentOverview, /disabled=\{reportDataLoading\}/, "PDF-Export muss bis zum Laden aller Reportquellen deaktiviert sein");
assert.match(rentOverview, /Buchungen, Mietverträge, Mietanpassungen und Leerstände werden geladen/, "Die Oberfläche muss den gemeinsamen Ladezustand verständlich anzeigen");
assert.equal(JSON.parse(vercelConfig).buildCommand, "npm run verify", "Jede Vercel-Veröffentlichung muss die vollständige Qualitätsprüfung ausführen");

console.log("21 Stressfaelle fuer zentrale Datenquellen und Navigationspfade bestanden.");
