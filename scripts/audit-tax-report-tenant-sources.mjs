import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const PROJECT_REF = "ufqfrotpefxtwczuqrxf";

function serviceRoleKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  const output = execFileSync(
    "supabase",
    ["projects", "api-keys", "--project-ref", PROJECT_REF, "-o", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15_000 },
  );
  const keys = JSON.parse(output);
  const row = keys.find((item) => item.name === "service_role" || item.type === "secret");
  const key = row?.api_key ?? row?.key ?? row?.value;
  if (!key) throw new Error("Service-Role-Schlüssel konnte nicht gelesen werden.");
  return key;
}

const url = process.env.VITE_SUPABASE_URL;
if (!url) throw new Error("VITE_SUPABASE_URL fehlt.");
const client = createClient(url, serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } });

async function read(table, select) {
  const rows = [];
  for (let offset = 0; ; offset += 1_000) {
    const { data, error } = await client.from(table).select(select).range(offset, offset + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1_000) return rows;
  }
}

const normalize = (value) => String(value ?? "")
  .toLocaleLowerCase("de-DE")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replaceAll("ß", "ss")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();
const fullName = (profile) => profile?.company_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");
const overlaps = (left, right) => (!left.start_date || !right.end_date || left.start_date <= right.end_date)
  && (!left.end_date || !right.start_date || left.end_date >= right.start_date);
const canonicalUnit = (value) => {
  const normalized = normalize(value);
  if (/p250|e008440000121/.test(normalized)) return "p250";
  if (/p253|e008440000122/.test(normalized)) return "p253";
  if (/p254|e008440000123/.test(normalized)) return "p254";
  if (/garage|stellplatz|tiefgarage/.test(normalized)) return "garage";
  return "wohnung";
};

const [directory, properties, units, profiles, contracts, rentals, entries, extraRows, adjustments, billingWorkspaces, aliases, bridge] = await Promise.all([
  read("v_object_dropdown", "object_id,property_id,objekt_code,label"),
  read("portfolio_properties", "id,core_property_id,name"),
  read("portfolio_units", "*"),
  read("tenant_profiles", "id,user_id,first_name,last_name,company_name,is_deleted,status"),
  read("tenant_contracts", "*"),
  read("portfolio_property_rentals", "id,user_id,property_id,unit_id,start_date,end_date,rent_monthly,kaltmiete_laut_mietvertrag,nebenkosten,gesamt_mietkosten"),
  read("finance_entry", "*"),
  read("property_extra_info", "*"),
  read("rent_adjustments", "*"),
  read("apartment_billing_workspaces", "object_id,year,data"),
  read("property_id_aliases", "*"),
  read("v_koenen_object_bridge", "*"),
]);

const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
const propertyById = new Map(properties.map((property) => [property.id, property]));
const unitById = new Map(units.map((unit) => [unit.id, unit]));
const directoryByCode = new Map(directory.map((object) => [object.objekt_code, object]));
const identityForContract = (contract) => directory.find((object) => object.object_id === contract.property_id
  || object.property_id === contract.property_id
  || object.objekt_code === contract.object_code);
const identityForRental = (rental) => {
  const property = propertyById.get(rental.property_id);
  return directory.find((object) => object.property_id === property?.core_property_id
    || object.property_id === rental.property_id
    || normalize(property?.name).includes(normalize(object.label)));
};

const activeContracts = contracts.filter((contract) => !contract.is_deleted && contract.status !== "vacant");
const findings = [];
for (const contract of activeContracts) {
  const object = identityForContract(contract) ?? directoryByCode.get(contract.object_code);
  const tenant = fullName(profileById.get(contract.tenant_id));
  if (!object) findings.push({ severity: "error", code: "contract_object", contract: contract.id, detail: "Objekt nicht auflösbar" });
  if (!tenant) findings.push({ severity: "error", code: "contract_tenant", contract: contract.id, object: object?.label, detail: "Mieterprofil fehlt oder ist leer" });
  if (!contract.unit_label) findings.push({ severity: "error", code: "contract_unit", contract: contract.id, object: object?.label, detail: "Einheit fehlt" });
}

for (const rental of rentals) {
  const object = identityForRental(rental);
  const rentalUnit = unitById.get(rental.unit_id)?.name;
  const matchingContracts = activeContracts.filter((contract) => {
    const contractObject = identityForContract(contract) ?? directoryByCode.get(contract.object_code);
    return contractObject?.objekt_code === object?.objekt_code
      && canonicalUnit(contract.unit_label) === canonicalUnit(rentalUnit)
      && overlaps(contract, rental);
  });
  const resolvedNames = [...new Set(matchingContracts.map((contract) => fullName(profileById.get(contract.tenant_id))).filter(Boolean))];
  if (resolvedNames.length !== 1) findings.push({
    severity: "error",
    code: "rental_tenant_unresolved",
    rental: rental.id,
    object: object?.label,
    unit: rentalUnit,
    period: `${rental.start_date ?? "—"} bis ${rental.end_date ?? "offen"}`,
    candidates: resolvedNames,
  });
}

const contractSummary = activeContracts.map((contract) => {
  const object = identityForContract(contract) ?? directoryByCode.get(contract.object_code);
  return {
    object: object?.label ?? "NICHT ZUGEORDNET",
    unit: contract.unit_label,
    tenant: fullName(profileById.get(contract.tenant_id)) || "NICHT GEPFLEGT",
    from: contract.start_date,
    to: contract.end_date ?? "offen",
    status: contract.status,
  };
}).sort((left, right) => left.object.localeCompare(right.object, "de") || String(left.unit).localeCompare(String(right.unit), "de") || String(left.from).localeCompare(String(right.from)));

const sourceCoverage = directory.map((object) => {
  const matchingUnits = units.filter((unit) => identityForRental({ property_id: unit.property_id })?.objekt_code === object.objekt_code);
  const matchingExtra = extraRows.filter((row) => [object.object_id, object.property_id].includes(row.property_id));
  return {
    object: object.label,
    units: matchingUnits.map((unit) => `${unit.name}: ${unit.area_sqm ?? unit.living_area_m2 ?? unit.living_area ?? "—"} m²`).join(" | ") || "—",
    propertyArea: matchingExtra.map((row) => row.living_area ?? row.wealth_profile?.livingArea ?? row.wealth_profile?.totalArea ?? "—").join(" | ") || "—",
  };
});

const bundleDirectory = await mkdtemp(join(tmpdir(), "koenen-tenant-report-audit-"));
let reportFindings = [];
try {
  await build({
    entryPoints: ["src/services/reportCenterEngine.ts"],
    outfile: join(bundleDirectory, "report-engine.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    loader: { ".webp": "dataurl" },
    logLevel: "silent",
  });
  const { buildReportCenter } = await import(`${pathToFileURL(join(bundleDirectory, "report-engine.mjs")).href}?v=${Date.now()}`);
  const objects = directory.map((object) => ({
    id: object.object_id,
    code: object.objekt_code,
    label: object.label,
    aliases: [object.property_id],
    livingAreaM2: extraRows.find((row) => row.property_id === object.object_id || row.property_id === object.property_id)?.living_area,
  }));
  const sources = {
    portfolio_properties: properties,
    portfolio_units: units,
    portfolio_property_rentals: rentals,
    tenant_profiles: profiles,
    tenant_contracts: contracts,
    property_extra: extraRows,
    rent_adjustments: adjustments,
    billing_workspaces: billingWorkspaces,
    property_id_aliases: aliases,
    object_bridge: bridge,
  };
  reportFindings = [2024, 2025, 2026].flatMap((year) => objects.flatMap((object) => {
    const modules = buildReportCenter({ objects, entries, loans: [], sources, rent: null, from: `${year}-01-01`, to: `${year}-12-31`, objectId: object.id, today: "2026-10-30" });
    const tenantModules = modules.filter((module) => ["tenants", "utilities"].includes(module.id));
    return tenantModules.flatMap((module) => (module.tables ?? []).flatMap((table) => table.rows.flatMap((row, rowIndex) => row.flatMap((cell, columnIndex) => {
      if (!/nicht gepflegt|nicht zugeordnet|mieterzuordnung prüfen/i.test(String(cell ?? ""))) return [];
      const column = table.headers[columnIndex];
      return [{
        severity: column === "Mieter" ? "error" : "review",
        code: column === "Mieter" ? "report_tenant_placeholder" : "report_related_placeholder",
        year,
        object: object.label,
        module: module.id,
        table: table.title,
        row: rowIndex + 1,
        column,
        value: cell,
      }];
    }))));
  }));
} finally {
  await rm(bundleDirectory, { recursive: true, force: true });
}

findings.push(...reportFindings);

console.log("MIETERQUELLEN-AUDIT FÜR STEUERBERICHTE");
console.table(contractSummary);
console.table(sourceCoverage);
const reportTenantErrors = reportFindings.filter((finding) => finding.severity === "error");
const relatedReviews = reportFindings.filter((finding) => finding.severity === "review");
console.table(reportTenantErrors);
console.table(relatedReviews);
console.log(JSON.stringify({
  contracts: contractSummary.length,
  rentals: rentals.length,
  profiles: profiles.length,
  reportTenantErrors: reportTenantErrors.length,
  relatedReviews: relatedReviews.length,
}, null, 2));
if (reportTenantErrors.length) process.exitCode = 1;
