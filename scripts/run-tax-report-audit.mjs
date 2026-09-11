import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outputDirectory = await mkdtemp(join(tmpdir(), "koenen-tax-audit-"));
const outputFile = join(outputDirectory, "audit.mjs");

try {
  await build({
    entryPoints: ["scripts/audit-tax-report-exports.ts"],
    outfile: outputFile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    sourcemap: false,
    logLevel: "silent",
  });
  await import(`${pathToFileURL(outputFile).href}?v=${Date.now()}`);
} finally {
  await rm(outputDirectory, { recursive: true, force: true });
}
