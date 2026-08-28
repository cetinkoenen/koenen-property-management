import assert from "node:assert/strict";
import { expandPropertyIdAliases } from "../src/lib/propertyIdAliases.ts";

const rows = [
  { object_id: "core-a", legacy_property_id: "legacy-a1" },
  { object_id: "core-a", legacy_property_id: "legacy-a2" },
  { object_id: "core-b", legacy_property_id: "legacy-b1" },
];

assert.deepEqual(expandPropertyIdAliases(["core-a"], rows).sort(), ["core-a", "legacy-a1", "legacy-a2"]);
assert.deepEqual(expandPropertyIdAliases(["legacy-a2"], rows).sort(), ["core-a", "legacy-a1", "legacy-a2"]);
assert.deepEqual(expandPropertyIdAliases(["unknown"], rows), []);
assert.deepEqual(expandPropertyIdAliases([" legacy-b1 "], rows).sort(), ["core-b", "legacy-b1"]);

console.log("4 Stressfaelle fuer zentrale historische Objekt-ID-Zuordnungen bestanden.");
