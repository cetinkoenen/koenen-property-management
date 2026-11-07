import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import ts from "typescript";

const cache = new Map();

async function loadTsModule(file) {
  const absoluteFile = resolve(file);
  if (cache.has(absoluteFile)) return cache.get(absoluteFile);

  const source = await readFile(absoluteFile, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: absoluteFile,
  }).outputText;
  const module = { exports: {} };
  cache.set(absoluteFile, module.exports);

  const requireRelative = (specifier) => {
    if (!specifier.startsWith(".")) throw new Error(`Unerwarteter Import: ${specifier}`);
    const target = resolve(dirname(absoluteFile), `${specifier}.ts`);
    return cache.get(target) ?? (() => { throw new Error(`Noch nicht geladener Import: ${specifier}`); })();
  };

  // Die drei reinen Fachmodule sind vorab geladen; so testen wir die
  // produktive Vorlage ohne Browser oder Datenbank.
  new Function("exports", "require", "module", compiled)(module.exports, requireRelative, module);
  cache.set(absoluteFile, module.exports);
  return module.exports;
}

const root = resolve(".");
for (const file of [
  "src/lib/financeCategories.ts",
  "src/lib/rosensteinTaxUnit.ts",
  "src/lib/canonicalUnitLabel.ts",
]) {
  await loadTsModule(resolve(root, file));
}
const { getRecurringBookingReference } = await loadTsModule(resolve(root, "src/lib/recurringBookingReferences.ts"));

assert.equal(
  getRecurringBookingReference({ kind: "expense", category: "Kreditrate", objectLabel: "Elsasser Str. 52" }),
  "Darlehensvertrag Lux Credit Ref. Nr. 287-3286114",
);
assert.equal(
  getRecurringBookingReference({ kind: "expense", category: "Verwaltungskosten", objectLabel: "Colmarer Str. 45" }),
  "Verwaltungskosten · Colmarer Str. 45",
);
assert.equal(
  getRecurringBookingReference({ kind: "income", category: "Miete Garage", objectLabel: "Fürther Str. 74" }),
  "Miete · Fürther Str. 74 · Garage 01",
);
assert.equal(
  getRecurringBookingReference({ kind: "income", category: "Miete", objectLabel: "Lilienthaler Str. 54" }),
  "Miete · Lilienthaler Str. 54",
);
assert.equal(
  getRecurringBookingReference({ kind: "expense", category: "Reparatur", objectLabel: "Lilienthaler Str. 54" }),
  null,
);

console.log("Recurring booking references: 5 checks passed.");
