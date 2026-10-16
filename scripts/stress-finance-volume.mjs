import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { uniqueFinanceEntries } from "../src/lib/uniqueFinanceEntries.ts";

const booking = { object_id: "test-object", objekt_code: "Objekt_1", booking_date: "2026-01-02", amount: 725, category: "Miete", note: "Test", entry_type: "income" };
const first = { ...booking, id: "a" };
const legacy = { ...booking, id: null };
const cases = [
  [[], []],
  [[first, { ...first, amount: 999 }], [first]],
  [[legacy, { ...legacy }], [legacy]],
  [[first, legacy], [first, legacy]],
  [[{ ...booking, id: 0 }, { ...booking, id: "0" }], [{ ...booking, id: 0 }]],
  [[legacy, { ...legacy, note: "Andere Zahlung" }], [legacy, { ...legacy, note: "Andere Zahlung" }]],
  [[legacy, { ...legacy, object_id: "another-object" }], [legacy, { ...legacy, object_id: "another-object" }]],
];
for (const [input, expected] of cases) assert.deepEqual(uniqueFinanceEntries(input), expected);
assert.equal(uniqueFinanceEntries([first])[0], first, "Die erste Originalbuchung muss unverändert erhalten bleiben.");

const measurements = [];
for (const size of [1_000, 10_000, 100_000]) {
  const originals = Array.from({ length: size }, (_, index) => ({ ...booking, id: `booking-${index}`, amount: index % 100 }));
  const input = [...originals, ...originals];
  Object.freeze(input);
  const start = performance.now();
  const result = uniqueFinanceEntries(input);
  const elapsedMs = performance.now() - start;
  assert.equal(result.length, size, "Dubletten dürfen die Zahlungssumme nicht verdoppeln.");
  assert.equal(result[0], originals[0]);
  assert.equal(result.at(-1), originals.at(-1));
  assert.equal(result.reduce((sum, row) => sum + row.amount, 0), size * 49.5);
  assert.ok(elapsedMs < 5000, `${input.length} Zeilen überschreiten das großzügige 5-Sekunden-Budget: ${elapsedMs} ms`);
  measurements.push({ inputRows: input.length, uniqueRows: result.length, elapsedMs: Number(elapsedMs.toFixed(2)) });
}
console.log(JSON.stringify({ identityChecks: cases.length + 1, volumeChecks: measurements }, null, 2));
