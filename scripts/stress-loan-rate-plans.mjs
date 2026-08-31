import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, service, entryAdd, loanPage, taxCenter, appData, reports, backup] = await Promise.all([
  readFile(new URL("../supabase/migrations/20260831193000_monthly_loan_rate_plans.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/services/loanRatePlanService.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/EntryAdd.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/Darlehensuebersicht.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/SteuerCenter.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/state/AppDataContext.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/BackupButton.tsx", import.meta.url), "utf8"),
]);

assert.match(migration, /create table if not exists public\.property_loan_rate_plan/, "Monatliche Tilgungspläne brauchen eine zentrale Tabelle");
assert.match(migration, /unique \(user_id, property_key, plan_year, plan_month\)/, "Pro Benutzer, Objekt und Monat darf es nur eine Quelle geben");
assert.match(migration, /enable row level security/, "Tilgungspläne müssen durch RLS geschützt sein");
assert.match(migration, /revoke all on public\.property_loan_rate_plan from anon/, "Anonyme Zugriffe müssen gesperrt sein");
assert.match(migration, /loan_interest_amount/, "Buchungen müssen den Zinsanteil speichern");
assert.match(migration, /loan_principal_amount/, "Buchungen müssen den Tilgungsanteil speichern");

for (const property of ["colmarer", "elsasser", "fuerther", "hohenloher", "lilienthaler", "rosenstein"]) {
  assert.match(service, new RegExp(property), `Objektzuordnung für ${property} fehlt`);
}
assert.match(service, /payment, interest \+ principal/, "CSV-Import muss Rate gegen Zins plus Tilgung prüfen");
assert.match(service, /quality_status: rowWarnings\.length \? "warning" : "ok"/, "Quellabweichungen müssen sichtbar gespeichert werden");
assert.match(service, /onConflict: "user_id,property_key,plan_year,plan_month"/, "Wiederholte Importe müssen aktualisieren statt duplizieren");
assert.match(service, /backfillBookedLoanSplits/, "Bestehende Kreditraten müssen nachträglich verknüpft werden");
assert.match(service, /tax_relevant: false/, "Die Gesamtrate darf nicht als steuerlich abziehbarer Betrag markiert werden");

assert.match(loanPage, /multiple/, "Die Darlehensseite muss mehrere CSV-Dateien gemeinsam importieren können");
assert.match(loanPage, /Quelldatei und Qualitätsstatus/, "Die Hauptquelle und Datenqualität müssen in der UI erklärt sein");
assert.match(entryAdd, /isCreditRate/, "Zins- und Tilgungsfelder dürfen nur bei Kreditraten erscheinen");
assert.match(entryAdd, /disabled=\{loanPlanLoading \|\| Boolean\(loanRatePlan\)\}/, "Importierte Monatswerte müssen schreibgeschützt sein");
assert.match(entryAdd, /loanRatePlan \? `csv:/, "Manuelle und importierte Aufteilungen müssen unterscheidbar sein");
assert.match(entryAdd, /Math\.abs\(effectiveAmountNumber - \(loanInterestNumber \+ loanPrincipalNumber\)\)/, "Gesamtrate muss gegen Zins plus Tilgung validiert werden");

for (const source of [taxCenter, appData, reports]) {
  assert.match(source, /loan_interest_amount/, "Steuer- und Berichtsdaten müssen den gebuchten Zinsanteil lesen");
  assert.match(source, /loan_principal_amount/, "Steuer- und Berichtsdaten müssen den gebuchten Tilgungsanteil lesen");
}
assert.match(taxCenter, /Gebuchte Monatsraten/, "Der Steuer-Report muss gebuchte Monatsaufteilungen priorisieren");
assert.match(reports, /bookedSplits/, "Berichte & Exporte muss gebuchte Monatsaufteilungen priorisieren");
assert.match(backup, /property_loan_rate_plan/, "Die neue Hauptquelle muss im App-Backup enthalten sein");

console.log("27 Stressfälle für Tilgungsplan-Import, Buchungsaufteilung, Steuerberichte und Sicherheit bestanden.");
