import assert from "node:assert/strict";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript";
import { matchRoutes } from "react-router-dom";

const routes = [];
const links = [];
const redirects = new Map();
const sourceRoot = "src";

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) { await scan(file); continue; }
    if (!/\.(tsx?|jsx?)$/.test(file)) continue;
    const source = ts.createSourceFile(file, await readFile(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const literal = (node) => node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
    const attrValue = (attr) => attr?.initializer && ts.isJsxExpression(attr.initializer) ? literal(attr.initializer.expression) : literal(attr?.initializer);
    const record = (node, value) => {
      if (!value?.startsWith("/") || value.startsWith("//")) return;
      links.push({ file, line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, target: value });
    };
    function visit(node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(source);
        const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
        if (tag === "Route") {
          const path = attrValue(attrs.find((attr) => attr.name.text === "path"));
          if (path && path !== "*") {
            routes.push({ path });
            const element = attrs.find((attr) => attr.name.text === "element")?.initializer;
            const expression = element && ts.isJsxExpression(element) ? element.expression : null;
            if (expression && ts.isJsxSelfClosingElement(expression) && expression.tagName.getText(source) === "Navigate") {
              const to = attrValue(expression.attributes.properties.find((attr) => ts.isJsxAttribute(attr) && attr.name.text === "to"));
              if (to) redirects.set(path, to);
            }
          }
        }
        for (const attr of attrs) if (["to", "href"].includes(attr.name.text)) record(attr, attrValue(attr));
      }
      if (ts.isPropertyAssignment(node) && ["to", "href", "path"].includes(node.name.getText(source).replaceAll('"', ""))) record(node, literal(node.initializer));
      if (ts.isCallExpression(node) && ["navigate", "preloadRoute"].includes(node.expression.getText(source))) record(node, literal(node.arguments[0]));
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
await scan(sourceRoot);
const missing = links.filter((link) => !matchRoutes(routes, link.target.split(/[?#]/)[0]));
const cycles = [];
for (const start of redirects.keys()) {
  const seen = new Set();
  let path = start;
  while (redirects.has(path)) {
    if (seen.has(path)) { cycles.push(start); break; }
    seen.add(path);
    path = redirects.get(path);
  }
}
const report = { routes: routes.length, literalNavigationTargets: links.length, redirects: redirects.size, missing, cycles };
await mkdir("tmp/quality-audit", { recursive: true });
await writeFile("tmp/quality-audit/navigation.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
assert.deepEqual(missing, [], "Interne Links müssen auf eine registrierte Route führen.");
assert.deepEqual(cycles, [], "Weiterleitungen dürfen keine Schleifen bilden.");

// Preserve the actual destination rather than accepting any existing page.
assert.equal(redirects.get("/buchhaltung/kautionen"), "/kautionen", "Kautions-Link muss das Kautionsmodul öffnen.");
