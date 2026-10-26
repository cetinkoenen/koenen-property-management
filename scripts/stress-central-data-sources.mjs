import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [app, investment, audit, resolver, rentOverview, rentDevelopment, rentMonth, appData, financeEntryRepository, consistency, cockpit, cashflow, loanOverview, utilitiesKpi, utilitiesPage, billingService, wealth, propertyExtraService, garageUtilities, migration, hohenloherMigration, rosensteinRentalMigration, p250JanuaryMigration, rosensteinContractRepair, vercelConfig] = await Promise.all([
  read("src/App.tsx"),
  read("src/pages/InvestmentBericht.tsx"),
  read("src/services/auditLogService.ts"),
  read("src/services/property/resolvePropertyContext.ts"),
  read("src/pages/Mietuebersicht.tsx"),
  read("src/pages/Mietentwicklung.tsx"),
  read("src/lib/rentMonth.ts"),
  read("src/state/AppDataContext.tsx"),
  read("src/services/financeEntryRepository.ts"),
  read("src/services/financeConsistencyEngine.ts"),
  read("src/services/professionalCockpitService.ts"),
  read("src/pages/WealthCashflowDashboard.tsx"),
  read("src/pages/Darlehensuebersicht.tsx"),
  read("src/components/PropertyUtilitiesKpiDashboard.tsx"),
  read("src/pages/NebenkostenWohnungen.tsx"),
  read("src/services/billingWorkspaceService.ts"),
  read("src/pages/ImmobilienVermoegen.tsx"),
  read("src/services/propertyExtraService.ts"),
  read("src/pages/NebenkostenTiefgarage.tsx"),
  read("supabase/migrations/20260827163000_property_id_aliases.sql"),
  read("supabase/migrations/20260915133500_include_rent_component_in_monthly_view.sql"),
  read("supabase/migrations/20260920190000_sync_rosenstein_current_rental_periods.sql"),
  read("supabase/migrations/20260920194500_fix_p250_january_2026_rent.sql"),
  read("supabase/migrations/20260929203000_restore_rosenstein_current_contracts.sql"),
  read("vercel.json"),
]);
const tenantService = await read("src/services/tenantService.ts");
const entryAdd = await read("src/pages/EntryAdd.tsx");
const bookingPage = await read("src/pages/Monate.tsx");
const monthlyEntryHook = await read("src/features/entries/useMonthlyEntries.ts");
const compactEntryForm = await read("src/features/entries/EntryForm.tsx");
const taxCenter = await read("src/pages/SteuerCenter.tsx");
const loanRatePlanService = await read("src/services/loanRatePlanService.ts");
const nkRelevantService = await read("src/services/nkRelevantService.ts");
const transactionRuleService = await read("src/services/transactionRuleService.ts");
const depositService = await read("src/services/depositService.ts");
const reportingPage = await read("src/pages/Auswertung.tsx");
const objectDirectory = await read("src/services/objectDirectoryService.ts");
const overviewPage = await read("src/pages/Uebersicht.tsx");
const moveProcessService = await read("src/services/moveProcessService.ts");
const portfolioRentalRepository = await read("src/services/portfolioRentalRepository.ts");
const vacancyService = await read("src/services/vacancyService.ts");
const rentHistoryHook = await read("src/hooks/useRentHistory24m.ts");
const dataQualityPage = await read("src/pages/Datenpruefung.tsx");
const rentAdjustmentRepository = await read("src/services/rentAdjustmentRepository.ts");
const loanLedgerRepository = await read("src/services/propertyLoanLedgerService.ts");
const legacyLedgerAdapter = await read("src/services/ledgerService.ts");
const propertyDetailPage = await read("src/features/property-detail/PropertyDetailPage.tsx");
const loanEntryAddPage = await read("src/pages/LoanEntryAdd.tsx");
const loanImportPage = await read("src/pages/LoanImport.tsx");
const billingWorkspaceRepository = await read("src/services/billingWorkspaceRepository.ts");
const reportCenterPage = await read("src/pages/ReportCenter.tsx");
const canonicalUnitLabels = await read("src/lib/canonicalUnitLabel.ts");
const canonicalUnitMigration = await read("supabase/migrations/20261025223000_canonical_unit_labels.sql");
const shadowUnitMigration = await read("supabase/migrations/20261025224500_deactivate_duplicate_shadow_units.sql");

assert.doesNotMatch(investment, /localStorage/, "Investment-Bericht darf Vermögensdaten nicht mehr aus localStorage laden");
assert.doesNotMatch(appData, /localStorage\.(?:getItem|setItem)/, "Zentrale App-Daten dürfen keinen browserweiten Fallback als zweite Fachquelle verwenden");
assert.match(financeEntryRepository, /function listFinanceEntries[\s\S]*\.eq\("is_deleted", false\)[\s\S]*\.range\(offset, offset \+ pageSize - 1\)/, "Die zentrale Buchungsquelle muss ausschließlich aktive Datensätze vollständig paginiert laden");
assert.match(financeEntryRepository, /\.order\("booking_date"[\s\S]*\.order\("id"/, "Die zentrale Pagination muss über Buchungsdatum und ID deterministisch sortiert sein");
assert.match(financeEntryRepository, /function softDeleteFinanceEntries[\s\S]*is_deleted: true[\s\S]*deleted_at/, "Buchungen dürfen zentral nur nachvollziehbar soft-gelöscht werden");
assert.match(financeEntryRepository, /function updateFinanceEntries[\s\S]*chunkSize = 500[\s\S]*\.eq\("is_deleted", false\)/, "Zentrale Sammeländerungen müssen vollständig in sicheren Blöcken und nur auf aktive Buchungen angewendet werden");
assert.match(appData, /listFinanceEntries\(\)/, "Der globale App-Datenbestand muss die vollständig paginierte Buchungsquelle verwenden");
assert.doesNotMatch(appData, /\.from\("finance_entry"\)/, "Der globale App-Datenbestand darf finance_entry nicht an der zentralen Buchungsquelle vorbei laden");
assert.match(entryAdd, /insertFinanceEntry\(payload\)/, "Die primäre Buchungserfassung muss über die zentrale Schreibfunktion speichern");
assert.doesNotMatch(entryAdd, /\.from\("finance_entry"\)/, "Die primäre Buchungserfassung darf finance_entry nicht direkt beschreiben");
assert.match(bookingPage, /listFinanceEntries\([\s\S]{0,300}?fromInclusive:[\s\S]{0,300}?toExclusive:/, "Die Buchungsseite muss Zeiträume über die zentrale paginierte Lesefunktion laden");
assert.match(bookingPage, /softDeleteFinanceEntries\(selectedIds\)/, "Sammellöschungen müssen die zentrale Soft-Delete-Funktion verwenden");
assert.match(bookingPage, /updateFinanceEntry\(editRow\.id, payload\)/, "Buchungsänderungen müssen die zentrale Schreibfunktion verwenden");
assert.doesNotMatch(bookingPage, /\.from\("finance_entry"\)/, "Die Buchungsseite darf finance_entry nicht direkt lesen oder schreiben");
assert.match(monthlyEntryHook, /listFinanceEntries\([\s\S]{0,300}?objectId[\s\S]{0,300}?fromInclusive/, "Monatsbuchungen müssen objektbezogen aus derselben zentralen Buchungsquelle kommen");
assert.doesNotMatch(monthlyEntryHook, /\.from\("finance_entry"\)/, "Der Monats-Hook darf keine parallele Buchungsquelle unterhalten");
assert.match(compactEntryForm, /listFinanceEntryCategories\(\)/, "Auch Kategorien müssen über die zentrale Buchungsquelle geladen werden");
assert.match(compactEntryForm, /insertFinanceEntry\(/, "Auch die kompakte Erfassung muss zentral speichern");
assert.doesNotMatch(compactEntryForm, /\.from\("finance_entry"\)/, "Die kompakte Erfassung darf finance_entry nicht direkt lesen oder schreiben");
assert.match(taxCenter, /listFinanceEntries\(\{[\s\S]{0,300}?fromInclusive: range\.from[\s\S]{0,300}?toExclusive: range\.to/, "Der Steuer-Center muss Jahresbuchungen vollständig über die zentrale Quelle laden");
assert.match(taxCenter, /loadAllFinanceEntriesForTaxRules[\s\S]{0,400}?listFinanceEntries\(\{ entryTypes:/, "Auch die Steuerregel-Reparatur muss den vollständigen zentralen Buchungsbestand verwenden");
assert.match(taxCenter, /updateFinanceEntry\(update\.id/, "Steuer- und NK-Korrekturen müssen über die zentrale Schreibfunktion laufen");
assert.doesNotMatch(taxCenter, /\.from\("finance_entry"\)/, "Der Steuer-Center darf finance_entry nicht direkt lesen oder schreiben");
assert.match(taxCenter, /Jahresbuchungen aus Hauptquelle finance_entry[\s\S]{0,300}?advisorTotals\.count[\s\S]{0,200}?advisorTotals\.taxRows/, "Gesamtbestand und steuerrelevante Teilmenge müssen getrennt und nachvollziehbar angezeigt werden");
assert.match(taxCenter, /Status und Suche filtern die Bildschirmtabellen sowie die Buchungs-CSV[\s\S]{0,300}?Steuerberater-Exporte enthalten bewusst die vollständige Jahresakte/, "Die Filterwirkung auf Bildschirm, CSV und Steuerberater-Export muss eindeutig erklärt sein");
assert.match(taxCenter, /Überschuss Jahresakte[\s\S]{0,150}?advisorTotals\.taxNetIncludingLoans/, "Die Jahresakten-Kennzahl darf nicht vom sichtbaren Such- oder Statusfilter abhängen");
for (const [source, label] of [
  [cockpit, "Cockpit"],
  [loanRatePlanService, "Tilgungsplan"],
  [nkRelevantService, "Nebenkosten-Klassifizierung"],
  [transactionRuleService, "Buchungsregeln"],
  [depositService, "Kautionsübersicht"],
  [reportingPage, "Berichtsauswertung"],
]) {
  assert.match(source, /listFinanceEntries\(/, `${label} muss Buchungen über die zentrale vollständig paginierte Quelle laden`);
  assert.doesNotMatch(source, /\.from\("finance_entry"\)/, `${label} darf finance_entry nicht parallel direkt lesen oder schreiben`);
}
assert.match(loanRatePlanService, /updateFinanceEntry\(selected\.id/, "Tilgungsplan-Zuordnungen müssen Buchungen über die zentrale Schreibfunktion aktualisieren");
assert.match(nkRelevantService, /updateFinanceEntries\(idsToSet[\s\S]*updateFinanceEntries\(idsToUnset/, "Nebenkosten-Korrekturen müssen zentral und vollständig gesammelt gespeichert werden");
assert.match(transactionRuleService, /updateFinanceEntry\(row\.entry\.id[\s\S]{0,150}?userId/, "Buchungsregeln müssen die zentrale Schreibfunktion mit Benutzerbegrenzung verwenden");
assert.match(objectDirectory, /function listObjectDirectory[\s\S]*\.from\("v_object_dropdown"\)[\s\S]*\.range\(offset, offset \+ pageSize - 1\)/, "Die zentrale Objektliste muss die kanonische View vollständig paginiert laden");
for (const [source, label] of [
  [appData, "App-Datenquelle"],
  [entryAdd, "Buchungserfassung"],
  [bookingPage, "Buchungsseite"],
  [overviewPage, "Buchungsübersicht"],
  [utilitiesKpi, "Nebenkosten-KPI"],
  [utilitiesPage, "Nebenkostenabrechnung"],
  [cockpit, "Cockpit"],
  [reportingPage, "Berichtsauswertung"],
]) {
  assert.match(source, /listObjectDirectory\(/, `${label} muss Immobilien aus der zentralen Objektliste laden`);
  assert.doesNotMatch(source, /\.from\("v_object_dropdown"\)/, `${label} darf keine parallele Objektliste führen`);
}
assert.match(tenantService, /function listTenantContracts[\s\S]*\.from\("tenant_contracts"\)[\s\S]*\.range\(offset, offset \+ pageSize - 1\)/, "Die zentrale Mietvertragsquelle muss alle aktiven Verträge vollständig paginiert laden");
for (const [source, label] of [
  [cockpit, "Cockpit"],
  [depositService, "Kautionsübersicht"],
  [moveProcessService, "Ein- und Auszug"],
  [rentOverview, "Mieteingang"],
  [garageUtilities, "Tiefgaragen-Nebenkosten"],
]) {
  assert.match(source, /listTenantContracts\(/, `${label} muss Mietverträge aus der zentralen Vertragsquelle laden`);
  assert.doesNotMatch(source, /\.from\("tenant_contracts"\)/, `${label} darf keine parallele Mietvertragsabfrage führen`);
}
assert.match(portfolioRentalRepository, /function listPortfolioRentals[\s\S]*\.from\("portfolio_property_rentals"\)[\s\S]*\.order\("start_date"[\s\S]*\.order\("id"[\s\S]*\.range\(offset, offset \+ pageSize - 1\)/, "Die zentrale Vermietungszeitreihe muss vollständig und deterministisch paginiert laden");
for (const [source, label] of [
  [rentOverview, "Mieteingang"],
  [rentDevelopment, "Mietentwicklung"],
  [vacancyService, "Leerstand"],
  [rentHistoryHook, "24-Monats-Mietverlauf"],
  [dataQualityPage, "Datenprüfung"],
]) {
  assert.match(source, /listPortfolioRentals\(/, `${label} muss Vermietungszeiträume aus der zentralen Zeitreihe laden`);
  assert.doesNotMatch(source, /\.from\("portfolio_property_rentals"\)/, `${label} darf keine parallele Vermietungszeitreihe abfragen`);
}
assert.match(rentOverview, /listPortfolioUnits\(\)/, "Mieteingang muss lesbare Einheiten über die zentrale Einheitenquelle laden");
assert.match(rentOverview, /unitLabel: unit\.title/, "Mieteingang muss die kanonische Einheit auch bei Objekten mit nur einer Einheit sichtbar ausgeben");
assert.doesNotMatch(rentOverview, /\.from\("portfolio_units"\)/, "Mieteingang darf Einheiten nicht parallel direkt abfragen");
assert.match(rentAdjustmentRepository, /function listRentAdjustments[\s\S]*\.from\("rent_adjustments"\)[\s\S]*\.eq\("is_deleted", false\)[\s\S]*\.range\(offset, offset \+ pageSize - 1\)/, "Die zentrale Mietanpassungsquelle muss ausschließlich aktive Datensätze vollständig paginiert laden");
for (const [source, label] of [[rentOverview, "Mieteingang"], [rentDevelopment, "Mietentwicklung"]]) {
  assert.match(source, /listRentAdjustments\(/, `${label} muss Mietanpassungen aus der zentralen Quelle laden`);
  assert.doesNotMatch(source, /\.from\("rent_adjustments"\)/, `${label} darf Mietanpassungen nicht parallel direkt lesen oder schreiben`);
}
assert.match(rentDevelopment, /updateRentAdjustment\(editingAdjustmentId, payload\)/, "Mietanpassungen müssen über die zentrale Schreibfunktion aktualisiert werden");
assert.match(rentDevelopment, /insertRentAdjustment\(\{/, "Neue Mietanpassungen müssen über die zentrale Schreibfunktion gespeichert werden");
assert.match(loanLedgerRepository, /function listPropertyLoanLedgerRows[\s\S]*\.range\(from, from \+ LEDGER_PAGE_SIZE - 1\)/, "Die Darlehens-Hauptquelle muss das vollständige Ledger paginiert laden");
assert.match(loanLedgerRepository, /\.order\("property_id"[\s\S]*\.order\("year"[\s\S]*\.order\("id"/, "Darlehenszeilen müssen objekt-, jahr- und ID-stabil sortiert sein");
assert.match(appData, /listPropertyLoanLedgerRows\(\{ propertyIds: ids \}\)/, "Globale Darlehensdiagramme müssen das zentrale Ledger verwenden");
assert.doesNotMatch(appData, /\.from\("property_loan_ledger"\)/, "Globale App-Daten dürfen das Darlehens-Ledger nicht direkt abfragen");
assert.match(app, /listPropertyLoanLedgerRows\(\{ year: selectedYear \}\)/, "Steuerreport-Darlehenswerte müssen jahrbezogen aus dem zentralen Ledger kommen");
assert.doesNotMatch(app, /\.from\("property_loan_ledger"\)/, "Die Berichtszentrale darf das Darlehens-Ledger nicht direkt abfragen");
assert.match(taxCenter, /listPropertyLoanLedgerRows\(\{ year \}\)/, "Der Steuer-Center muss seine Darlehenswerte aus dem zentralen Ledger laden");
assert.doesNotMatch(taxCenter, /\.from\("property_loan_ledger"\)/, "Der Steuer-Center darf keine parallele Darlehensquelle führen");
assert.match(reportingPage, /listPropertyLoanLedgerRows\(\)/, "Portfolio-Auswertungen müssen Darlehensverläufe aus der zentralen Quelle laden");
assert.doesNotMatch(reportingPage, /\.from\("property_loan_ledger"\)/, "Portfolio-Auswertungen dürfen das Ledger nicht direkt abfragen");
assert.match(dataQualityPage, /listPropertyLoanLedgerRows\(\)/, "Die Datenprüfung muss dieselbe vollständige Darlehensquelle prüfen");
assert.doesNotMatch(dataQualityPage, /\.from\("property_loan_ledger"\)/, "Die Datenprüfung darf keine abweichende Darlehensabfrage verwenden");
assert.match(propertyDetailPage, /listPropertyLoanLedgerRows\(\{ propertyIds: \[ledgerPropertyId\] \}\)/, "Immobilienakten müssen Ledger-Zeilen objektbezogen zentral laden");
assert.match(propertyDetailPage, /updatePropertyLoanLedgerRow\(Number\(row\.dbId\), payload\)/, "Immobilienakten müssen Darlehensänderungen zentral speichern");
assert.doesNotMatch(propertyDetailPage, /\.from\("property_loan_ledger"\)/, "Immobilienakten dürfen das Darlehens-Ledger nicht direkt lesen oder schreiben");
assert.match(loanEntryAddPage, /insertPropertyLoanLedgerRow\(safePropertyId, payload\)/, "Manuelle Darlehensjahre müssen über die zentrale Schreibfunktion gespeichert werden");
assert.match(loanImportPage, /insertPropertyLoanLedgerRow\(row\.property!\.id/, "Darlehensimporte müssen über die zentrale Schreibfunktion gespeichert werden");
assert.doesNotMatch(legacyLedgerAdapter, /from\(TABLE_NAME\)/, "Der Kompatibilitätsadapter darf keine zweite Darlehens-Datenquelle unterhalten");
assert.match(legacyLedgerAdapter, /listPropertyLoanLedgerRows[\s\S]*insertPropertyLoanLedgerRow[\s\S]*updatePropertyLoanLedgerRow/, "Alte Darlehens-Hooks müssen vollständig auf den zentralen Service delegieren");
assert.match(loanRatePlanService, /insertPropertyLoanLedgerRow\(propertyId, row\)/, "Tilgungsplanimporte müssen Jahreswerte über das zentrale Ledger synchronisieren");
assert.match(entryAdd, /Objekte werden geladen…[\s\S]*Objektliste konnte nicht geladen werden[\s\S]*Keine Objekte vorhanden/, "Die Buchungserfassung muss Laden, Fehler und einen wirklich leeren Objektbestand eindeutig unterscheiden");
assert.match(entryAdd, /setObjectLoadRevision\(\(value\) => value \+ 1\)/, "Ein fehlgeschlagener Objektabruf muss direkt wiederholt werden können");
assert.match(entryAdd, /classifyTaxRelevance\([\s\S]{0,250}?selectedObjectLabel\)/, "Steuerregeln müssen das konkret ausgewählte Objekt berücksichtigen");
assert.match(entryAdd, /classifyNkRelevance\([\s\S]{0,250}?objectLabel: selectedObjectLabel/, "Nebenkostenregeln müssen das konkret ausgewählte Objekt berücksichtigen");
assert.match(entryAdd, /disabled=\{isOwnerOccupiedSelected\}[\s\S]{0,180}?setNkRelevant\(isOwnerOccupiedSelected \? false/, "Eigennutzung muss das Mieter-Nebenkostenkennzeichen in der Erfassung sperren");
assert.match(entryAdd, /Buchung wirklich speichern\?[\s\S]*Geprüft und speichern/, "Vor dem Datenbankeintrag muss eine sichtbare Buchungsprüfung erfolgen");
assert.doesNotMatch(propertyExtraService, /localStorage\.(?:getItem|setItem)/, "Objekt-Stammdaten dürfen nicht parallel aus localStorage gelesen werden");
assert.doesNotMatch(wealth, /function loadExposes/, "Exposés dürfen nicht parallel aus einem lokalen Browserbestand angezeigt werden");
assert.match(garageUtilities, /migrationError[\s\S]{0,500}?setRecords\(legacyRecords\)/, "TG-Altdaten dürfen erst nach erfolgreicher Übernahme in die zentrale Quelle angezeigt werden");
assert.match(investment, /fetchPropertyWealthProfiles/, "Investment-Bericht muss die zentrale Supabase-Quelle verwenden");
assert.doesNotMatch(audit, /localStorage/, "Audit-Protokolle dürfen keine zweite lokale Datenquelle führen");
assert.match(resolver, /property_id_aliases/, "Historische Objekt-IDs müssen zentral geladen werden");
assert.doesNotMatch(resolver, /f8a86965-07e4-4b6a-a97a-779dbe97a3fd/, "Historische IDs dürfen nicht im Resolver fest codiert sein");
assert.match(migration, /enable row level security/i, "Alias-Tabelle muss RLS aktivieren");
assert.match(migration, /revoke all on public\.property_id_aliases from anon/i, "Alias-Tabelle darf für anon nicht freigegeben sein");
assert.match(app, /path="\/exports" element={<Navigate to="\/buchhaltung\/berichte-exporte" replace \/>}/, "Alter Exportpfad muss zur zentralen Berichteseite führen");
assert.match(app, /path="\/portfolio" element={<Navigate to="\/immobilienvermoegen" replace \/>}/, "Alter Portfoliopfad muss zur zentralen Immobilienseite führen");
assert.doesNotMatch(rentAdjustmentRepository, /["']object_code["']/, "Die zentrale Mietanpassungsquelle darf keine nicht vorhandene object_code-Spalte abfragen");
assert.doesNotMatch(rentAdjustmentRepository, /["']unit_label["']/, "Die zentrale Mietanpassungsquelle darf keine nicht vorhandene unit_label-Spalte abfragen");
assert.doesNotMatch(rentOverview, /\.from\("finance_entry"\)/, "Mieteingang darf Buchungen nicht parallel zur zentralen App-Datenquelle laden");
assert.match(rentOverview, /const allKnownBookings = useMemo\(\(\) => uniqueFinanceEntries\(appData\.entries\), \[appData\.entries\]\)/, "Mieteingang muss ausschließlich die zentral geladenen Buchungen verwenden und Dubletten einmal pro Datenstand entfernen");
assert.match(rentOverview, /portfolioRentalsLoading/, "Mietkonto-Exporte müssen den Ladezustand der Vermietungszeiträume kennen");
assert.match(portfolioRentalRepository, /function listPortfolioUnits[\s\S]*\.from\("portfolio_units"\)[\s\S]*\.range\(offset, offset \+ pageSize - 1\)/, "Die zentrale Einheitenquelle muss technische unit_id-Werte vollständig und paginiert auflösen");
assert.match(rentOverview, /rental\.unit_name/, "Die Zuordnung P250, P253 und P254 darf nicht nur gegen technische UUIDs prüfen");
assert.match(rentOverview, /vacanciesLoading/, "Mietkonto-Exporte müssen den Ladezustand der Leerstände kennen");
assert.match(rentOverview, /tenantContractsLoading/, "Mietkonto-Exporte müssen den Ladezustand der Sollmieten kennen");
assert.match(rentOverview, /rentAdjustmentsLoading/, "Mietkonto-Exporte müssen den Ladezustand der Mietanpassungen kennen");
assert.match(rentOverview, /if \(!onAnnualReportChange \|\| reportDataLoading \|\| reportSourceError\) return;/, "Ein noch unvollständiger Jahresreport darf nicht als exportbereit gemeldet werden");
assert.match(rentOverview, /disabled=\{reportDataLoading\}/, "PDF-Export muss bis zum Laden aller Reportquellen deaktiviert sein");
assert.match(rentOverview, /Buchungen, Mietverträge, Mietanpassungen und Leerstände werden geladen/, "Die Oberfläche muss den gemeinsamen Ladezustand verständlich anzeigen");
assert.match(rentOverview, /if \(adjustmentLabel\) \{[\s\S]{0,500}?enoughAddressOverlap\(adjustmentLabel, objectLabel\)/, "Mieteingang muss bei Mietanpassungen die konkrete Objektbezeichnung vor historischen Alias-IDs priorisieren");
assert.match(rentOverview, /if \(propertyId\) return propertyId === object\.id \|\| candidateIds\.includes\(propertyId\);/, "Eine abweichende Objekt-ID darf nicht über eine unscharfe Notizsuche auf ein anderes Objekt fallen");
assert.match(rentMonth, /normalized\.includes\("hohenloher"\) \? 21 : 25/, "Die zentrale Mietmonatsregel muss Hohenloher-Zahlungen ab dem 21. dem Folgemonat zuordnen");
assert.match(rentMonth, /export function explicitRentYearMonth/, "Ein ausdrücklich dokumentierter Mietmonat muss zentral ausgewertet werden");
assert.match(rentOverview, /explicitRentYearMonth\(bookingReferenceText\(booking\)\)/, "Mieteingang muss nachträglich eingegangene Mieten dem dokumentierten Mietmonat zuordnen");
assert.match(rentOverview, /daysInMonth - startDay \+ 1/, "Der erste untermonatige Mietzeitraum muss taggenau statt als voller Monat berechnet werden");
assert.match(rentOverview, /activeAdjustmentAmount \?\? contractExpectedAmount \?\? rentalReference\.expectedAmount \?\? inferredOldAdjustmentAmount/, "Ein spaeterer Mietanpassungs-Altwert darf einen exakt datierten Vermietungszeitraum nicht uebersteuern");
assert.match(rentOverview, /Mietkosten[\s\S]{0,500}?Gesamtmiete[\s\S]{0,300}?Kaltmiete[\s\S]{0,300}?Nebenkosten/, "Die Jahresübersicht muss Gesamtmiete, Kaltmiete und Nebenkosten filtern können");
assert.match(rentOverview, /projectOverviewRowByRentCost[\s\S]{0,1800}?expectedColdRent[\s\S]{0,600}?expectedOperatingCosts/, "Der Mietkostenfilter muss Soll und Ist aus denselben zentralen Mietbestandteilen ableiten");
assert.match(portfolioRentalRepository, /PORTFOLIO_RENTAL_SELECT[\s\S]*kaltmiete_laut_mietvertrag[\s\S]*nebenkosten[\s\S]*gesamt_mietkosten/, "Die zentrale Vermietungszeitreihe muss alle historischen Mietbestandteile laden");
for (const [source, label] of [[rentOverview, "Mieteingang"], [rentDevelopment, "Mietentwicklung"], [appData, "App-Datenquelle"], [consistency, "Konsistenzprüfung"], [cockpit, "Cockpit"]]) {
  assert.match(source, /rentPaymentCutoffDay/, `${label} muss die zentrale Mietmonatsregel verwenden`);
}
assert.doesNotMatch(rentOverview, /if \(normalized\.includes\("hohenloher"\)\) return "2025-04-01"/, "Der Hohenloher-Mietbeginn darf nicht parallel im Frontend fest codiert sein");
assert.match(rentOverview, /Mietbeginn laut zentraler Stammdatenquelle/, "Monate vor Vertragsbeginn müssen aus den zentralen Stammdaten neutralisiert werden");
assert.match(rentOverview, /adjustmentStartDates\[0\] \?\? contractStartDates\[0\] \?\? rentalStartDates\[0\]/, "Ein veralteter Vermietungszeitraum darf Mietanpassung oder Mietvertrag beim Mietbeginn nicht übersteuern");
assert.match(rentOverview, /isRosensteinObject\(object\.label\)[\s\S]*rosensteinStartDates\[0\]/, "Rosenstein muss die Vorperiode aus dem frühesten zentralen Objekt-Vermietungsbeginn neutralisieren");
assert.match(cockpit, /text\.includes\("mietbestandteil"\)/, "Das Cockpit muss separat gebuchte Mietbestandteile in der Gesamtmiete berücksichtigen");
assert.match(cockpit, /isFuertherLabel\(objectLabel\)[\s\S]{0,300}?isGarageReference\(contractText\) === isGarageReference\(bookingText\)/, "Das Cockpit muss Fürther Wohnung und Garage bei Zahlungen strikt trennen");
assert.match(cockpit, /cockpitUnitLabel[\s\S]{0,400}?canonicalUnitLabel/, "Das Cockpit muss Einheiten über die zentrale Bezeichnungsregel anzeigen");
for (const label of ["Haus 01", "Wohnung 01", "Wohnung 02", "Wohnung 03", "Wohnung 04", "Garage 01"]) {
  assert.match(canonicalUnitLabels, new RegExp(label), `${label} muss in der zentralen Einheitenbezeichnung definiert sein`);
  assert.match(canonicalUnitMigration, new RegExp(label), `${label} muss auch in der verbindlichen Datenbankmigration enthalten sein`);
}
for (const label of ["P250", "P253", "P254"]) {
  assert.match(canonicalUnitMigration, new RegExp(label), `${label} muss in der verbindlichen Datenbankmigration enthalten sein`);
  assert.match(rentOverview, new RegExp(`title: "${label}"`), `${label} muss in der Mieteingang-Übersicht kanonisch angezeigt werden`);
}
assert.match(tenantService, /rows\.map\(\(row\) => canonicalizeUnitRow\(row\)\)/, "Alle Mietvertragskonsumenten müssen dieselbe zentrale Einheitenbezeichnung erhalten");
assert.match(canonicalUnitMigration, /before insert or update of object_code, unit_label, rent_type on public\.tenant_contracts/, "Neue und geänderte Mietverträge müssen serverseitig automatisch normalisiert werden");
assert.match(canonicalUnitMigration, /before insert or update of object_code, object_label, unit_label on public\.unit_vacancies/, "Neue und geänderte Leerstände müssen serverseitig automatisch normalisiert werden");
assert.match(canonicalUnitMigration, /update public\.portfolio_units unit[\s\S]*from public\.portfolio_properties property/, "Die zentrale Portfolio-Einheitenquelle muss auf dieselben Namen migriert werden");
assert.match(shadowUnitMigration, /is_active = false[\s\S]*core-shadow/, "Technische Schatteneinheiten dürfen nicht als zweite sichtbare Einheitenquelle aktiv bleiben");
const cockpitContractQuery = cockpit.match(/\.from\("tenant_contracts"\)[\s\S]{0,300}?\.eq\("is_deleted", false\)/)?.[0] ?? "";
assert.doesNotMatch(cockpitContractQuery, /\.in\("status"/, "Das Cockpit darf einen im Berichtsmonat gültigen Vertrag nicht wegen eines vorzeitig gepflegten Status ausblenden");
assert.match(cockpit, /contract\.start_date && contract\.start_date > end[\s\S]{0,350}?effectiveEndDate && effectiveEndDate < start/, "Das Cockpit muss die Monatsgültigkeit jedes Vertrags aus den zentralen Start- und Enddaten bestimmen");
assert.match(cockpit, /const requiresUnitMatch = \(contractCountByObject\[objectGroupKey\] \?\? 0\) > 1/, "Mehrere Einheiten eines Objekts müssen im Cockpit getrennte Soll-Ist-Zeilen erhalten");
assert.match(cockpit, /contract\.start_date && contract\.end_date && contract\.end_date < contract\.start_date[\s\S]{0,120}?\? null/, "Ein ungueltiges Enddatum vor Vertragsbeginn darf die Cockpit-Sollmiete nicht ausblenden");
assert.match(tenantService, /contractStartDate && contractStartDate > tenantEndDate[\s\S]{0,120}?return false/, "Ein frueherer Leerstand darf keinen spaeter beginnenden Anschlussvertrag beenden");
assert.match(rosensteinContractRepair, /P250[\s\S]*2026-03-01[\s\S]*P254[\s\S]*2026-08-01[\s\S]*end_date < start_date/, "P250 und P254 muessen als laufende Anschlussvertraege wiederhergestellt und gegen inverse Zeitraeume geprueft werden");
assert.match(app, /Buchungsanzahl[\s\S]{0,500}?yearEntries\.length/, "Die Buchungsseite muss die Gesamtanzahl des gewählten Jahres direkt neben dem Jahresfilter ausweisen");
assert.match(app, /Gesamte Buchungszahl[\s\S]{0,500}?entries\.length/, "Die Buchungsseite muss zusätzlich die Buchungszahl über alle Jahre aus derselben zentralen Quelle anzeigen");
assert.match(app, /aria-label="Buchungsjahr"[\s\S]{0,500}?availableBookingYears/, "Die Gesamtanzahl der Buchungen muss über den zentralen Jahresfilter steuerbar sein");
assert.match(app, /Gesamt-Buchungssumme[\s\S]{0,700}?yearBookingVolume/, "Die Buchungsseite muss das betragliche Jahres-Buchungsvolumen neben der Anzahl anzeigen");
assert.match(app, /yearEntries\.reduce\(\(sum, entry\) => sum \+ Math\.abs\(entry\.amount\), 0\)/, "Das Jahres-Buchungsvolumen muss Einnahmen und Ausgaben ohne Vorzeichenaufhebung summieren");
assert.match(hohenloherMigration, /v_koenen_object_bridge/, "Die Backend-Mietmonatsquelle muss die zentrale Objekt-Bridge verwenden");
assert.match(hohenloherMigration, /mietbestandteil\[- _\]\?nk/, "Die Backend-Mietmonatsquelle muss den Mietbestandteil-NK summieren");
assert.match(hohenloherMigration, /with \(security_invoker = true\)/, "Die korrigierte Monatsview muss RLS mit den Rechten des aufrufenden Benutzers anwenden");
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
assert.match(wealth, /Vereinbarte Kaution/, "Die Mietkosten jeder Immobilienakte müssen die vereinbarte Kaution anzeigen");
assert.match(wealth, /ownerOccupied[\s\S]{0,800}?Schreibgeschützt, solange der Nutzungstyp „Eigennutzung“ ist/, "Die Kaution muss bei Eigennutzung sichtbar und schreibgeschützt bleiben");
assert.match(wealth, /depositContractsForCard[\s\S]{0,1800}?contract\.deposit_amount/, "Die Immobilienakte muss Kautionen direkt aus dem passenden aktiven Mietvertrag lesen");
assert.match(tenantService, /updateTenantContractDepositAmount[\s\S]{0,900}?\.from\("tenant_contracts"\)[\s\S]{0,500}?deposit_amount/, "Kautionsänderungen müssen ausschließlich in der zentralen Mietvertragsquelle gespeichert werden");
assert.match(wealth, /function activeParkingContract[\s\S]{0,1500}?startComparison[\s\S]{0,500}?updatedComparison/, "Bei ueberlappenden Stellplatzvertraegen muss der fachlich neueste Vertrag deterministisch gewinnen");
assert.match(wealth, /Mieter · Stand \$\{tenantReferenceDate\}/, "Aktuelle Mieter muessen sichtbar von historischen Abrechnungszeitraeumen getrennt sein");
assert.match(rosensteinRentalMigration, /tenant_contracts\) ist die fachliche Quelle/, "Die Rosenstein-Zeitreihe muss ihre fuehrende Mieterquelle dokumentieren");
assert.match(rosensteinRentalMigration, /p250_unit_id[\s\S]*2026-03-01[\s\S]*85/, "P250 muss ab Maerz 2026 mit 85 EUR in der zentralen Mietzeitreihe stehen");
assert.match(rosensteinRentalMigration, /p254_unit_id[\s\S]*2026-08-01[\s\S]*94/, "P254 muss ab August 2026 mit 94 EUR in der zentralen Mietzeitreihe stehen");
assert.match(p250JanuaryMigration, /kaltmiete_laut_mietvertrag = 75[\s\S]*2026-01-01[\s\S]*2026-01-31/, "P250 muss im Januar 2026 mit der vertraglichen Miete von 75 EUR gespeichert sein");
assert.match(wealth, /function PropertySpecialistAreaNotice/, "Alle Fachbereiche der Immobilienakte müssen denselben Read-only-Hinweis verwenden");
assert.match(wealth, /Dies ist eine gefilterte Informationsübersicht für dieses Objekt\. Für Detailbearbeitungen oder die Gesamtübersicht nutzen Sie die Hauptseite\./, "Der vorgeschriebene Hinweistext muss vollständig angezeigt werden");
assert.match(wealth, /mainPagePath="\/mieter\/mieteingang" mainPageLabel="Hauptseite Mieteingang"/, "Der Mietbereich muss auf die zentrale Mieteingang-Hauptseite verweisen");
assert.match(wealth, /mainPagePath="\/dashboard\/vermoegen-cashflow" mainPageLabel="Hauptseite Vermögen & Cashflow"/, "Der Cashflow-Bereich muss auf die zentrale Cashflow-Hauptseite verweisen");
assert.match(wealth, /mainPagePath="\/darlehen" mainPageLabel="Hauptseite Darlehen"/, "Der Darlehensbereich muss auf die zentrale Darlehen-Hauptseite verweisen");
assert.match(wealth, /mainPagePath="\/nebenkosten\/wohnungen" mainPageLabel="Hauptseite Nebenkosten"/, "Der Nebenkostenbereich muss auf die zentrale Nebenkosten-Hauptseite verweisen");
assert.equal((wealth.match(/<PropertySpecialistAreaNotice /g) ?? []).length, 4, "Der Fachbereichshinweis muss genau einmal in jedem der vier Fachbereiche erscheinen");
assert.match(wealth, /type PropertyDetailTab = "overview" \| "rent" \| "cashflow" \| "loan" \| "utilities"/, "Die Immobilienakte muss fünf fachlich getrennte Tabs führen");
assert.match(wealth, /role="tablist"/, "Die Bereichsnavigation muss als barrierefreie Tab-Liste umgesetzt sein");
assert.equal((wealth.match(/role="tabpanel"/g) ?? []).length, 5, "Jeder Immobilienbereich muss ein eigenes Tab-Panel besitzen");
assert.match(wealth, /activeTab === "overview"[\s\S]{0,9000}?<StandardRentInfoPanel[\s\S]{0,9000}?DETAIL_TEMPLATE_SECTIONS\.map/, "Mietstammdaten und Vorlagen S. 2–6 müssen ausschließlich in der Objektübersicht bleiben");
assert.match(wealth, /activeTab === "rent"[\s\S]{0,1000}?<PropertyRentReceiptOverview/, "Der Mieteingang-Tab muss ausschließlich die zentrale Mieteingang-Ansicht laden");
assert.match(wealth, /activeTab === "cashflow"[\s\S]{0,1000}?<CentralWealthCashflowDashboard/, "Der Cashflow-Tab muss ausschließlich das zentrale Cashflow-Dashboard laden");
assert.match(wealth, /activeTab === "loan"[\s\S]{0,1000}?<CentralLoanOverview/, "Der Darlehen-Tab muss ausschließlich die zentrale Darlehensübersicht laden");
assert.match(wealth, /activeTab === "utilities"[\s\S]{0,1000}?<PropertyUtilitiesKpiDashboard/, "Der Nebenkosten-Tab muss ausschließlich das zentrale Nebenkosten-KPI-Dashboard laden");
assert.doesNotMatch(wealth, /href="#(?:objektuebersicht|miete|cashflow|darlehen|nebenkosten)"/, "Die Fachnavigation darf nicht mehr nur als Sprungmarke auf eine lange Mischseite arbeiten");
assert.match(billingWorkspaceRepository, /function listBillingWorkspaces[\s\S]*\.from\(TABLE_NAME\)[\s\S]*\.range\(offset, offset \+ PAGE_SIZE - 1\)/, "Die zentrale Nebenkostenquelle muss alle Arbeitsbereiche vollständig paginiert laden");
assert.match(billingWorkspaceRepository, /function getBillingWorkspace[\s\S]*\.eq\("object_id", objectId\)[\s\S]*\.eq\("year", String\(year\)\)/, "Einzelne Nebenkosten-Arbeitsbereiche müssen eindeutig nach Objekt und Jahr gelesen werden");
assert.match(billingWorkspaceRepository, /function upsertBillingWorkspace[\s\S]*onConflict: "object_id,year"/, "Nebenkosten-Arbeitsbereiche müssen zentral und konfliktstabil gespeichert werden");
assert.match(utilitiesKpi, /listBillingWorkspaces\(\)/, "Nebenkosten-KPIs müssen die zentrale Abrechnungsquelle laden");
assert.doesNotMatch(utilitiesKpi, /\.from\("apartment_billing_workspaces"\)/, "Nebenkosten-KPIs dürfen die Arbeitsbereiche nicht direkt abfragen");
assert.match(utilitiesPage, /getBillingWorkspace\(selectedObjectCode, selectedYear\)[\s\S]*upsertBillingWorkspace\(selectedObjectCode, selectedYear, payload\)/, "Wohnungsabrechnungen müssen zentral gelesen und gespeichert werden");
assert.doesNotMatch(utilitiesPage, /\.from\("apartment_billing_workspaces"\)/, "Wohnungsabrechnungen dürfen keine parallele Datenquelle führen");
assert.match(garageUtilities, /getBillingWorkspace\(BILLING_OBJECT_ID, BILLING_SCOPE\)[\s\S]*upsertBillingWorkspace\(BILLING_OBJECT_ID, BILLING_SCOPE/, "Tiefgaragenabrechnungen müssen zentral gelesen und gespeichert werden");
assert.doesNotMatch(garageUtilities, /\.from\(BILLING_TABLE\)|apartment_billing_workspaces/, "Tiefgaragenabrechnungen dürfen keine parallele Datenquelle führen");
assert.match(app, /listBillingWorkspaces\(\)/, "Die globale Nebenkostenübersicht muss dieselbe zentrale Arbeitsbereichsquelle verwenden");
assert.doesNotMatch(app, /\.from\("apartment_billing_workspaces"\)/, "Die globale Nebenkostenübersicht darf Arbeitsbereiche nicht direkt abfragen");
assert.match(reportCenterPage, /listBillingWorkspaces\(\)[\s\S]*billing_workspaces:billingWorkspaces/, "Berichtsexporte müssen Nebenkosten-Arbeitsbereiche aus derselben zentralen Quelle übernehmen");
assert.doesNotMatch(reportCenterPage, /apartment_billing_workspaces/, "Das Report-Center darf keine parallele Nebenkostenquelle definieren");
assert.match(utilitiesKpi, /recordMatchesProperty\(record, propertyId, canonicalObjectCode, propertyLabel\)/, "Nebenkosten-KPIs müssen Abrechnungen strikt über Objekt-ID und kanonische Objektbezeichnung begrenzen");
assert.match(utilitiesKpi, /selectedYear === "all" \? records : records\.filter/, "Der Jahresfilter muss einzelne Jahre und die Gesamthistorie unterstützen");
assert.match(utilitiesKpi, /setSelectedYear\(String\(currentYear\)\)[\s\S]{0,200}?void load\(\)/, "Beim Objektwechsel muss der Jahresfilter vollständig zurückgesetzt und neu geladen werden");
assert.match(utilitiesKpi, /nextRecords\[0\]\?\.sourceObjectId \?\? canonicalObjectCode/, "Spezielle Abrechnungsobjekte wie Rosenstein-Tiefgarage müssen ihren zentralen Abrechnungsschlüssel beibehalten");
assert.match(utilitiesKpi, /record\?\.sourceObjectId \?\? selectedYearRecord\?\.sourceObjectId \?\? billingObjectId/, "Jede KPI-Karte und jedes ausgewählte Jahr muss auf seine eigene zentrale Abrechnungsquelle verlinken");
assert.match(utilitiesKpi, /targetObjectId === "rosenstein-str-25-tiefgarage"/, "Rosenstein-Tiefgaragenabrechnungen müssen auf die Tiefgaragen-Hauptseite verweisen");
assert.match(utilitiesKpi, /status\.pdfEnabled \? billingUrl\(record, "pdf"\)/, "PDF-Aufruf darf nur für freigegebene oder korrigierte Abrechnungen aktiv sein");
assert.match(utilitiesKpi, /getPropertyDocumentSignedUrl/, "Archivdateien müssen über zeitlich begrenzte URLs aus dem privaten Dokumentenspeicher geöffnet werden");
assert.match(billingService, /Array\.isArray\(candidate\.records\)/, "Die zentrale Nebenkostenquelle muss auch Tiefgaragen-Jahresdatensätze auswerten");
assert.match(billingService, /garageRecordToWorkspaceRecord/, "Tiefgaragen-Abrechnungen müssen zentral in das gemeinsame KPI-Datenmodell überführt werden");
assert.match(utilitiesPage, /requestedObjectCode[\s\S]{0,1500}?requestedBillingId/, "Die Nebenkosten-Hauptseite muss Objekt, Jahr und Abrechnung aus dem KPI-Link übernehmen");
assert.match(utilitiesPage, /return summarizeBillingWorkspace\(target\)/, "Hauptseite und KPI-Dashboard müssen dieselbe Kosten-/Saldoformel verwenden");
assert.match(billingService, /const balance = roundMoney\(advance - tenantTotal\)/, "Die zentrale Nebenkostenformel muss Guthaben und Nachzahlung centgenau aus Vorauszahlung minus Kosten berechnen");
assert.match(app, /extractBillingWorkspaceRecords\(row\.data, fallbackYear\)/, "Die Nebenkosten-Übersicht muss Wohnungen und Tiefgaragen aus derselben zentralen Abrechnungsquelle auswerten");
assert.match(app, /selectedYear === "all" \? workflowRecords : workflowRecords\.filter/, "Die Nebenkosten-Übersicht muss ihre KPIs nach Abrechnungsjahr filtern");
assert.match(app, /"Offen" \| "In Arbeit" \| "In Prüfung" \| "Freigegeben" \| "Korrigiert"/, "Der NK-Workflow muss alle fünf fachlichen Statuswerte vollständig abbilden");
assert.match(app, /Statusverteilung/, "Die gefilterten NK-Statuswerte müssen zusätzlich professionell visualisiert werden");
assert.match(app, /Immobilien und Einheiten je Status/, "Jeder NK-Status muss die betroffenen Immobilien und Einheiten nachvollziehbar benennen");
assert.match(app, /recordDetailUrl\(record\)/, "Jede Immobilie in der NK-Statusübersicht muss direkt zu ihrer zentralen Abrechnung führen");
assert.match(app, /fetchPropertyWealthProfiles\(\)/, "Die NK-Übersicht muss das Kaufjahr aus der zentralen Immobilienvermögen-Quelle laden");
assert.match(app, /purchaseYear !== null && billingYear < purchaseYear/, "NK-Abrechnungen vor dem Kaufjahr dürfen nicht in die KPI-Zahlen einfließen");
assert.match(app, /Erwerbsprüfung aktiv/, "Vor dem Kaufjahr ausgeschlossene NK-Altdaten müssen nachvollziehbar ausgewiesen werden");
assert.match(app, /Bearbeitungsfortschritt/, "Die NK-KPIs müssen den professionellen Gesamtfortschritt darstellen");
assert.match(await readFile("src/pages/NebenkostenWohnungen.tsx", "utf8"), /Vorauszahlungen im Abrechnungszeitraum \(€\)[\s\S]*monatliche NK-Vorauszahlung × Belegungsmonate/, "Die Eingabe muss eindeutig den Periodengesamtbetrag statt eines Monatswerts verlangen");
assert.match(await readFile("src/pages/NebenkostenWohnungen.tsx", "utf8"), /settlementStatus[\s\S]*Nachzahlung ausgeglichen[\s\S]*settlementReference/, "Ausgeglichene NK-Nachzahlungen müssen mit Buchungsreferenz sichtbar bleiben");
assert.match(await readFile("src/pages/Mietuebersicht.tsx", "utf8"), /prorateMonthlyRentFromStart[\s\S]*occupiedDays[\s\S]*zeitanteilig ab/, "Untermonatiger Mietbeginn muss das Monats-Soll taggenau reduzieren");
assert.match(await readFile("src/pages/Mietuebersicht.tsx", "utf8"), /vacancyCandidate && bookingAmount <= 0/, "Eine belegte Teilmonatsmiete darf nicht durch einen historischen Teil-Leerstand uebersteuert werden");
assert.match(await readFile("src/pages/Mietuebersicht.tsx", "utf8"), /exactLateMonthTopUpBooking[\s\S]*openAmount[\s\S]*candidates\.length === 1/, "Eine eindeutige centgenaue Restzahlung am Monatsende muss zur offenen Monatsmiete addiert werden");
assert.equal(JSON.parse(vercelConfig).buildCommand, "npm run verify", "Jede Vercel-Veröffentlichung muss die vollständige Qualitätsprüfung ausführen");

const migrationFiles = (await readdir(new URL("../supabase/migrations", import.meta.url)))
  .filter((file) => file.endsWith(".sql"));
assert.deepEqual(
  migrationFiles.filter((file) => !/^\d{14}_[a-z0-9_]+\.sql$/.test(file)),
  [],
  "Jede Supabase-Migration muss einen gültigen Zeitstempel tragen und reproduzierbar ausführbar sein",
);

console.log("206 Stressfaelle fuer zentrale Datenquellen und Navigationspfade bestanden.");
