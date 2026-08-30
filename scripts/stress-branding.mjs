import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [packageJson, indexHtml, manifest, app, investmentReport, approvalApi, backupScript, supabaseConfig, readme, backupButton] = await Promise.all([
  read("package.json"),
  read("index.html"),
  read("public/manifest.webmanifest"),
  read("src/App.tsx"),
  read("src/pages/InvestmentBericht.tsx"),
  read("api/login-approval-request.ts"),
  read("scripts/backup-source-to-onedrive.mjs"),
  read("supabase/config.toml"),
  read("README.md"),
  read("src/components/BackupButton.tsx"),
]);

assert.equal(JSON.parse(packageJson).name, "koenen-property-management", "Der technische Paketname muss der neuen Marke entsprechen");
assert.match(indexHtml, /<title>Koenen Property Management<\/title>/, "Der Browser-Titel muss die neue Marke anzeigen");
assert.equal(JSON.parse(manifest).name, "Koenen Property Management – Steuer & Cashflow", "Das App-Manifest muss die neue Marke anzeigen");
assert.match(app, /Koenen Property Management/, "Die Hauptnavigation muss die neue Marke anzeigen");
assert.doesNotMatch(app, /Koenen Investment/, "Die Hauptnavigation darf die alte Marke nicht mehr enthalten");
assert.match(investmentReport, /Koenen Property Management – Investment- und Finanzierungsanalyse/, "Investment-Berichte müssen die neue Marke verwenden");
assert.doesNotMatch(investmentReport, /Koenen Investment/, "Investment-Berichte dürfen die alte Marke nicht mehr enthalten");
assert.match(approvalApi, /Koenen Property Management/, "Login-Freigabe-E-Mails müssen die neue Marke verwenden");
assert.match(backupScript, /koenen-property-management-quellcode-/, "Neue Sicherungen müssen den neuen technischen Namen tragen");
assert.match(supabaseConfig, /project_id = "koenen-property-management"/, "Die lokale Supabase-Kennung muss den neuen Namen tragen");
assert.match(supabaseConfig, /site_url = "https:\/\/koenen-investment\.com"/, "Die bestehende Produktionsdomain muss während der Umbenennung erhalten bleiben");
assert.match(readme, /https:\/\/koenen-investment\.com/, "Die Dokumentation muss auf die aktive Produktionsdomain verweisen");
assert.doesNotMatch(readme, /koenen-immobilien\.vercel\.app/, "Die Dokumentation darf keine veraltete Vercel-Adresse enthalten");
assert.match(backupButton, /app: "koenen-property-management"/, "Manuelle Datensicherungen müssen die neue technische App-Kennung tragen");

console.log("14 Marken- und Umbenennungspruefungen bestanden.");
