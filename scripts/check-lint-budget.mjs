import { ESLint } from "eslint";

const warningBudget = Number(process.argv[2] ?? 64);
if (!Number.isInteger(warningBudget) || warningBudget < 0) {
  throw new Error("Das Lint-Warnungsbudget muss eine nichtnegative ganze Zahl sein.");
}

const eslint = new ESLint();
const results = await eslint.lintFiles(["."]);
const errors = results.reduce((sum, result) => sum + result.errorCount, 0);
const warnings = results.reduce((sum, result) => sum + result.warningCount, 0);
const warningsByRule = new Map();

for (const result of results) {
  for (const message of result.messages) {
    if (message.severity !== 1) continue;
    const rule = message.ruleId ?? "unbekannt";
    warningsByRule.set(rule, (warningsByRule.get(rule) ?? 0) + 1);
  }
}

const summary = Object.fromEntries([...warningsByRule.entries()].sort((a, b) => b[1] - a[1]));
console.log(JSON.stringify({ errors, warnings, warningBudget, warningsByRule: summary }, null, 2));

if (errors > 0) {
  throw new Error(`ESLint meldet ${errors} Fehler.`);
}
if (warnings > warningBudget) {
  throw new Error(`ESLint-Warnungsbudget überschritten: ${warnings} statt höchstens ${warningBudget}.`);
}
