import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [app, investment, audit, resolver, rentOverview, cashflow, loanOverview, utilitiesKpi, utilitiesPage, billingService, wealth, migration, vercelConfig] = await Promise.all([
  read("src/App.tsx"),
  read("src/pages/InvestmentBericht.tsx"),
  read("src/services/auditLogService.ts"),
  read("src/services/property/resolvePropertyContext.ts"),
  read("src/pages/Mietuebersicht.tsx"),
  read("src/pages/WealthCashflowDashboard.tsx"),
  read("src/pages/Darlehensuebersicht.tsx"),
  read("src/components/PropertyUtilitiesKpiDashboard.tsx"),
  read("src/pages/NebenkostenWohnungen.tsx"),
  read("src/services/billingWorkspaceService.ts"),
  read("src/pages/ImmobilienVermoegen.tsx"),
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
assert.match(rentOverview, /if \(!onAnnualReportChange \|\| reportDataLoading \|\| reportSourceError\) return;/, "Ein noch unvollständiger Jahresreport darf nicht als exportbereit gemeldet werden");
assert.match(rentOverview, /disabled=\{reportDataLoading\}/, "PDF-Export muss bis zum Laden aller Reportquellen deaktiviert sein");
assert.match(rentOverview, /Buchungen, Mietverträge, Mietanpassungen und Leerstände werden geladen/, "Die Oberfläche muss den gemeinsamen Ladezustand verständlich anzeigen");
assert.match(rentOverview, /if \(adjustmentLabel\) \{[\s\S]{0,500}?enoughAddressOverlap\(adjustmentLabel, objectLabel\)/, "Mieteingang muss bei Mietanpassungen die konkrete Objektbezeichnung vor historischen Alias-IDs priorisieren");
assert.match(rentOverview, /if \(propertyId\) return propertyId === object\.id \|\| candidateIds\.includes\(propertyId\);/, "Eine abweichende Objekt-ID darf nicht über eine unscharfe Notizsuche auf ein anderes Objekt fallen");
assert.match(wealth, /const CentralRentOverview = lazy\(\(\) => import\("\.\/Mietuebersicht"\)\)/, "Der Lilienthaler-Pilot muss die zentrale Mieteingang-Auswertung wiederverwenden");
assert.match(wealth, /<CentralRentOverview[\s\S]{0,350}?embeddedAnnualReport[\s\S]{0,350}?reportObjectId=\{rentObjectId\}/, "Der Pilot muss nach der zentral aufgelösten Objekt-ID filtern");
assert.match(wealth, /const \[amountMode, setAmountMode\] = useState\(false\)/, "Die Symbolansicht muss in jeder Immobilienakte standardmäßig aktiv sein");
assert.match(wealth, /<PropertyRentReceiptOverview[\s\S]{0,300}?rentObjectId=\{centralRentObjectId\(card, objects\)\}/, "Jede Immobilienakte muss die zentrale Mieteingang-Ansicht verwenden");
assert.doesNotMatch(wealth, /function isLilienthalerCard/, "Die Mieteingang-Ansicht darf nicht mehr auf Lilienthaler beschränkt sein");
assert.match(wealth, /<CentralWealthCashflowDashboard[\s\S]{0,300}?lockedPropertyId=\{centralRentObjectId\(card, objects\)\}/, "Jede Immobilienakte muss das zentrale Vermögen-und-Cashflow-Dashboard wiederverwenden");
assert.match(cashflow, /propertyLocked \? lockedObject\?\.id \?\? lockedPropertyId/, "Der Einzelobjekt-Cashflow muss dauerhaft auf das ausgewählte Objekt gesperrt sein");
assert.match(cashflow, /object \? entryMatches\(e, object, getPropertyName\) : !propertyLocked/, "Eine noch nicht aufgelöste Objekt-ID darf niemals globale Buchungen im Einzelobjekt-Cashflow anzeigen");
assert.match(wealth, /<CentralLoanOverview[\s\S]{0,300}?lockedPropertyId=\{centralRentObjectId\(card, objects\)\}/, "Jede Immobilienakte muss die zentrale Darlehensübersicht wiederverwenden");
assert.match(loanOverview, /const propertyLocked = Boolean\(fixedPropertyId \|\| lockedPropertyLabel\)/, "Die zentrale Darlehensübersicht muss einen fest gebundenen Objektmodus unterstützen");
assert.match(loanOverview, /if \(propertyLocked\) \{[\s\S]{0,500}?return rows\.filter/, "Eine Immobilienakte darf nur die Darlehensdaten ihres fest gewählten Objekts anzeigen");
assert.match(wealth, /<PropertyUtilitiesKpiDashboard[\s\S]{0,300}?propertyId=\{centralRentObjectId\(card, objects\)\}/, "Jede Immobilienakte muss das zentrale Nebenkosten-KPI-Dashboard verwenden");
assert.match(utilitiesKpi, /from\("apartment_billing_workspaces"\)/, "Nebenkosten-KPIs müssen die zentrale Abrechnungsquelle laden");
assert.match(utilitiesKpi, /filter\(\(row\) => row\.object_id === canonicalBillingObjectId\)/, "Nebenkosten-KPIs müssen strikt auf den Objektcode der zentralen Hauptseite begrenzt sein");
assert.match(utilitiesKpi, /selectedYear === "all" \? records : records\.filter/, "Der Jahresfilter muss einzelne Jahre und die Gesamthistorie unterstützen");
assert.match(utilitiesKpi, /status\.pdfEnabled \? billingUrl\(record, "pdf"\)/, "PDF-Aufruf darf nur für freigegebene oder korrigierte Abrechnungen aktiv sein");
assert.match(utilitiesKpi, /getPropertyDocumentSignedUrl/, "Archivdateien müssen über zeitlich begrenzte URLs aus dem privaten Dokumentenspeicher geöffnet werden");
assert.match(utilitiesKpi, /const canonicalBillingObjectId = matchingObject\?\.objekt_code \?\? propertyId/, "Der Hauptseiten-Link muss den kanonischen Nebenkosten-Objektcode statt einer unverbundenen Portfolio-ID verwenden");
assert.match(utilitiesPage, /requestedObjectCode[\s\S]{0,1500}?requestedBillingId/, "Die Nebenkosten-Hauptseite muss Objekt, Jahr und Abrechnung aus dem KPI-Link übernehmen");
assert.match(utilitiesPage, /return summarizeBillingWorkspace\(target\)/, "Hauptseite und KPI-Dashboard müssen dieselbe Kosten-/Saldoformel verwenden");
assert.match(billingService, /const balance = roundMoney\(advance - tenantTotal\)/, "Die zentrale Nebenkostenformel muss Guthaben und Nachzahlung centgenau aus Vorauszahlung minus Kosten berechnen");
assert.equal(JSON.parse(vercelConfig).buildCommand, "npm run verify", "Jede Vercel-Veröffentlichung muss die vollständige Qualitätsprüfung ausführen");

console.log("44 Stressfaelle fuer zentrale Datenquellen und Navigationspfade bestanden.");
