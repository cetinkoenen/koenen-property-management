import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [app, investment, audit, resolver, rentOverview, rentDevelopment, rentMonth, appData, consistency, cockpit, cashflow, loanOverview, utilitiesKpi, utilitiesPage, billingService, wealth, migration, hohenloherMigration, rosensteinRentalMigration, p250JanuaryMigration, vercelConfig] = await Promise.all([
  read("src/App.tsx"),
  read("src/pages/InvestmentBericht.tsx"),
  read("src/services/auditLogService.ts"),
  read("src/services/property/resolvePropertyContext.ts"),
  read("src/pages/Mietuebersicht.tsx"),
  read("src/pages/Mietentwicklung.tsx"),
  read("src/lib/rentMonth.ts"),
  read("src/state/AppDataContext.tsx"),
  read("src/services/financeConsistencyEngine.ts"),
  read("src/services/professionalCockpitService.ts"),
  read("src/pages/WealthCashflowDashboard.tsx"),
  read("src/pages/Darlehensuebersicht.tsx"),
  read("src/components/PropertyUtilitiesKpiDashboard.tsx"),
  read("src/pages/NebenkostenWohnungen.tsx"),
  read("src/services/billingWorkspaceService.ts"),
  read("src/pages/ImmobilienVermoegen.tsx"),
  read("supabase/migrations/20260827163000_property_id_aliases.sql"),
  read("supabase/migrations/20260915133500_include_rent_component_in_monthly_view.sql"),
  read("supabase/migrations/20260920190000_sync_rosenstein_current_rental_periods.sql"),
  read("supabase/migrations/20260920194500_fix_p250_january_2026_rent.sql"),
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
assert.match(rentOverview, /from\("portfolio_units"\)\.select\("id,name,unit_type,property_id"\)/, "Stellplatz-Mietverträge müssen ihre lesbare Einheit aus portfolio_units auflösen");
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
for (const [source, label] of [[rentOverview, "Mieteingang"], [rentDevelopment, "Mietentwicklung"], [appData, "App-Datenquelle"], [consistency, "Konsistenzprüfung"], [cockpit, "Cockpit"]]) {
  assert.match(source, /rentPaymentCutoffDay/, `${label} muss die zentrale Mietmonatsregel verwenden`);
}
assert.doesNotMatch(rentOverview, /if \(normalized\.includes\("hohenloher"\)\) return "2025-04-01"/, "Der Hohenloher-Mietbeginn darf nicht parallel im Frontend fest codiert sein");
assert.match(rentOverview, /Mietbeginn laut zentraler Stammdatenquelle/, "Monate vor Vertragsbeginn müssen aus den zentralen Stammdaten neutralisiert werden");
assert.match(rentOverview, /adjustmentStartDates\[0\] \?\? contractStartDates\[0\] \?\? rentalStartDates\[0\]/, "Ein veralteter Vermietungszeitraum darf Mietanpassung oder Mietvertrag beim Mietbeginn nicht übersteuern");
assert.match(rentOverview, /isRosensteinObject\(object\.label\)[\s\S]*rosensteinStartDates\[0\]/, "Rosenstein muss die Vorperiode aus dem frühesten zentralen Objekt-Vermietungsbeginn neutralisieren");
assert.match(cockpit, /text\.includes\("mietbestandteil"\)/, "Das Cockpit muss separat gebuchte Mietbestandteile in der Gesamtmiete berücksichtigen");
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
assert.match(utilitiesKpi, /from\("apartment_billing_workspaces"\)/, "Nebenkosten-KPIs müssen die zentrale Abrechnungsquelle laden");
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
assert.match(await readFile("src/pages/NebenkostenWohnungen.tsx", "utf8"), /Vorauszahlungen im Abrechnungszeitraum \(€\)[\s\S]*monatliche NK-Vorauszahlung × Belegungsmonate/, "Die Eingabe muss eindeutig den Periodengesamtbetrag statt eines Monatswerts verlangen");
assert.match(await readFile("src/pages/NebenkostenWohnungen.tsx", "utf8"), /settlementStatus[\s\S]*Nachzahlung ausgeglichen[\s\S]*settlementReference/, "Ausgeglichene NK-Nachzahlungen müssen mit Buchungsreferenz sichtbar bleiben");
assert.match(await readFile("src/pages/Mietuebersicht.tsx", "utf8"), /prorateMonthlyRentFromStart[\s\S]*occupiedDays[\s\S]*zeitanteilig ab/, "Untermonatiger Mietbeginn muss das Monats-Soll taggenau reduzieren");
assert.match(await readFile("src/pages/Mietuebersicht.tsx", "utf8"), /vacancyCandidate && bookingAmount <= 0/, "Eine belegte Teilmonatsmiete darf nicht durch einen historischen Teil-Leerstand uebersteuert werden");
assert.match(await readFile("src/pages/Mietuebersicht.tsx", "utf8"), /exactLateMonthTopUpBooking[\s\S]*openAmount[\s\S]*candidates\.length === 1/, "Eine eindeutige centgenaue Restzahlung am Monatsende muss zur offenen Monatsmiete addiert werden");
assert.equal(JSON.parse(vercelConfig).buildCommand, "npm run verify", "Jede Vercel-Veröffentlichung muss die vollständige Qualitätsprüfung ausführen");

console.log("70 Stressfaelle fuer zentrale Datenquellen und Navigationspfade bestanden.");
