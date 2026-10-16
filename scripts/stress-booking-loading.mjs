import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const text = await readFile("src/pages/Monate.tsx", "utf8");
const source = ts.createSourceFile("Monate.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = new Map();
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(source));
  ts.forEachChild(node, visit);
}
visit(source);
const compile = (name, context) => runInNewContext(`${ts.transpile(functions.get(name), { target: ts.ScriptTarget.ES2022 })}\n${name}`, context);

function harness() {
  const pending = [];
  const state = { rows: [], loading: false, error: null };
  const context = {
    loadRequest: { current: 0 }, year: 2026, month: 10, periodMode: "month", objektCode: "ALL",
    setRows: (rows) => { state.rows = rows; },
    setLoading: (loading) => { state.loading = loading; },
    setErr: (error) => { state.error = error; },
    monthRangeISO: () => ({ from: "2026-10-01", to: "2026-11-01" }),
    yearRangeISO: () => ({ from: "2026-01-01", to: "2027-01-01" }),
    errorMessage: (error) => error.message,
    console: { error() {} },
    fetchEntriesForRange: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
  };
  return { pending, state, context, load: compile("loadEntries", context) };
}

// Older successes and errors must not replace the current period or clear its loader.
for (const staleFails of [false, true]) {
  const h = harness();
  const older = h.load();
  h.context.periodMode = "year";
  const newer = h.load();
  if (staleFails) h.pending[0].reject(new Error("old failure"));
  else h.pending[0].resolve([{ id: "old-month" }]);
  await older;
  assert.equal(h.state.loading, true);
  assert.equal(h.state.error, null);
  h.pending[1].resolve([{ id: "new-year" }]);
  await newer;
  assert.equal(h.state.rows[0].id, "new-year");
  assert.equal(h.state.loading, false);
}
{
  const h = harness();
  const older = h.load();
  const newer = h.load();
  h.pending[1].resolve([{ id: "new" }]); await newer;
  h.pending[0].resolve([{ id: "old" }]); await older;
  assert.equal(h.state.rows[0].id, "new");
}
{
  const h = harness();
  const older = h.load();
  h.context.year = 0; await h.load();
  h.pending[0].resolve([{ id: "old" }]); await older;
  assert.equal(h.state.rows.length, 0);
  assert.match(h.state.error, /gültiges Jahr/);
}
{
  const h = harness();
  const load = h.load();
  h.context.loadRequest.current += 1; // effect cleanup on unmount/filter change
  h.pending[0].resolve([{ id: "unmounted" }]); await load;
  assert.equal(h.state.rows.length, 0);
}
{
  const h = harness();
  const load = h.load(); h.pending[0].reject(new Error("current failure")); await load;
  assert.equal(h.state.error, "current failure");
  assert.equal(h.state.loading, false);
}

// Execute the real query function against a Data API with a 1,000-row response cap.
const volumeResults = [];
for (const count of [0, 500, 1305, 10_500]) {
  const rows = Array.from({ length: count }, (_, id) => ({ id, object_id: "test", objekt_code: "A", booking_date: "2026-01-02", amount: 10, category: "Miete", entry_type: "income" }));
  const ranges = [], orders = [], filters = [];
  const query = {
    select() { return this; },
    eq(...args) { filters.push(args); return this; },
    gte() { return this; }, lt() { return this; }, in() { return this; },
    order(...args) { orders.push(args); return this; },
    range(from, to) { ranges.push([from, to]); return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null }); },
  };
  const fetch = compile("fetchEntriesForRange", { supabase: { from: () => query } });
  const result = await fetch("2026-01-01", "2027-01-01", "A");
  assert.equal(result.length, count);
  assert.equal(new Set(result.map((row) => row.id)).size, count);
  assert.equal(result.reduce((sum, row) => sum + row.amount, 0), count * 10);
  assert.ok(filters.some(([key, value]) => key === "is_deleted" && value === false));
  assert.ok(filters.some(([key, value]) => key === "objekt_code" && value === "A"));
  assert.deepEqual(orders.map(([key]) => key), ["booking_date", "id"]);
  volumeResults.push({ rows: count, pages: ranges.length });
}
console.log(JSON.stringify({ asyncScenarios: 6, pagination: volumeResults }, null, 2));
