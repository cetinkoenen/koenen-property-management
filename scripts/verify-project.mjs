import { spawnSync } from "node:child_process";

const checks = [
  ["Produktions-Build", "npm", ["run", "build"]],
  ["Lint-Warnungsbudget", "npm", ["run", "lint:budget"]],
  ["Mietentwicklung und Leerstand", "npm", ["run", "stress:rent-vacancy"]],
  ["Immobilienvermögen", "npm", ["run", "stress:wealth-dashboard"]],
  ["Objekt-ID-Aliase", "npm", ["run", "stress:property-aliases"]],
  ["Zentrale Datenquellen", "npm", ["run", "stress:central-data"]],
  ["Datenqualität", "npm", ["run", "stress:data-quality"]],
  ["Berichtsexporte", "npm", ["run", "stress:report-exports"]],
  ["Logos in App und PDF-Berichten", "npm", ["run", "stress:report-logos"]],
  ["Sicherheitsbasis", "npm", ["run", "stress:security"]],
  ["Tilgungspläne und Kreditraten", "npm", ["run", "stress:loan-rate-plans"]],
  ["Marke und Projektname", "npm", ["run", "stress:branding"]],
];

for (const [label, command, args] of checks) {
  console.log(`\n[Prüfung] ${label}`);
  const result = spawnSync(command, args, { stdio: "inherit", shell: false });
  if (result.status !== 0) {
    throw new Error(`${label} ist fehlgeschlagen (Exit ${result.status ?? "unbekannt"}).`);
  }
}

console.log(`\nAlle ${checks.length} Qualitätsprüfungen wurden erfolgreich abgeschlossen.`);
