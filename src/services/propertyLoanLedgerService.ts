import { supabase } from "@/lib/supabase";
import { recordAuditLog } from "@/services/auditLogService";
import type {
  LoanLedgerFormValues,
  LoanLedgerRow,
  LoanLedgerValidationResult,
  SaveLoanLedgerPayload,
} from "@/types/loanLedger";

const DEBUG = import.meta.env.DEV;

const LEDGER_TABLE = "property_loan_ledger";
const PROPERTY_LOANS_TABLE = "property_loans";

const LEDGER_SELECT = `
  id,
  property_id,
  loan_id,
  year,
  interest,
  principal,
  balance,
  source,
  created_at,
  updated_at,
  updated_by
`;

type SupabaseLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  name?: string | null;
};

type PropertyLoanLedgerRowDb = {
  id: unknown;
  property_id: unknown;
  loan_id: unknown;
  year: unknown;
  interest: unknown;
  principal: unknown;
  balance: unknown;
  source: unknown;
  created_at: unknown;
  updated_at: unknown;
  updated_by: unknown;
};

type PropertyLoanRowDb = {
  id: unknown;
  created_at: unknown;
};

type CanonicalPropertyLoanSnapshotRowDb = {
  property_id: unknown;
  year: unknown;
  interest: unknown;
  principal: unknown;
  balance: unknown;
  source: unknown;
};

export type CanonicalPropertyLoanSnapshot = {
  propertyId: string;
  balanceYear: number;
  balance: number;
  interestTotal: number;
  principalTotal: number;
  source: string | null;
};

export type CanonicalPropertyLoanYear = {
  propertyId: string;
  year: number;
  interest: number;
  principal: number;
  balance: number;
  source: string | null;
};

function devLog(message: string, payload?: unknown) {
  if (!DEBUG) return;
  if (import.meta.env.DEV) console.debug(`[propertyLoanLedgerService] ${message}`, payload);
}

function devError(message: string, payload?: unknown) {
  if (!DEBUG) return;
  console.error(`[propertyLoanLedgerService] ${message}`, payload);
}

function assertNonEmptyString(value: unknown, fieldName: string): string {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    throw new Error(`Ungültiger Wert für ${fieldName}.`);
  }

  return normalized;
}

function toSupabaseLikeError(error: unknown): SupabaseLikeError {
  if (!error || typeof error !== "object") {
    return {
      code: null,
      message: error ? String(error) : "Unknown error",
      details: null,
      hint: null,
      name: null,
    };
  }

  const candidate = error as Record<string, unknown>;

  return {
    code: typeof candidate.code === "string" ? candidate.code : null,
    message: typeof candidate.message === "string" ? candidate.message : "Unknown error",
    details: typeof candidate.details === "string" ? candidate.details : null,
    hint: typeof candidate.hint === "string" ? candidate.hint : null,
    name: typeof candidate.name === "string" ? candidate.name : null,
  };
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "string") {
    const normalized = value
      .trim()
      .replace(/\s+/g, "")
      .replace(",", ".")
      .replace(/[^\d.-]/g, "");

    if (!normalized) return fallback;

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function toNumberOrNaN(value: unknown): number {
  if (value === null || value === undefined) return Number.NaN;

  const normalized = String(value)
    .trim()
    .replace(/\s+/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");

  if (!normalized) return Number.NaN;

  return Number(normalized);
}

function toInteger(value: unknown, fallback = 0): number {
  return Math.trunc(toNumber(value, fallback));
}

function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function toOptionalString(value: unknown): string | undefined {
  const normalized = toNullableString(value);
  return normalized ?? undefined;
}

function mapRowToLoanLedgerRow(row: PropertyLoanLedgerRowDb): LoanLedgerRow {
  return {
    id: toInteger(row.id),
    property_id: assertNonEmptyString(row.property_id, "row.property_id"),
    loan_id: assertNonEmptyString(row.loan_id, "row.loan_id"),
    year: toInteger(row.year),
    interest: toNumber(row.interest),
    principal: toNumber(row.principal),
    balance: toNumber(row.balance),
    source: toNullableString(row.source),
    created_at: toOptionalString(row.created_at),
    updated_at: toOptionalString(row.updated_at),
    updated_by: toNullableString(row.updated_by),
  };
}

function buildFriendlyLedgerErrorMessage(error: SupabaseLikeError): string {
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  const details = (error.details ?? "").toLowerCase();
  const hint = (error.hint ?? "").toLowerCase();
  const fullText = `${message} ${details} ${hint}`.trim();

  if (
    code === "23505" ||
    fullText.includes("duplicate key") ||
    fullText.includes("unique constraint")
  ) {
    return "Für dieses Jahr existiert bereits ein Eintrag.";
  }

  if (
    code === "42501" ||
    fullText.includes("row-level security") ||
    fullText.includes("permission denied") ||
    fullText.includes("not allowed") ||
    fullText.includes("violates row-level security policy")
  ) {
    return "Du hast keine Berechtigung, diese Daten zu bearbeiten.";
  }

  if (code === "23514" || fullText.includes("check constraint")) {
    return "Bitte nur gültige Werte eingeben.";
  }

  if (fullText.includes("multiple") && fullText.includes("loan")) {
    return "Zu dieser Immobilie existieren mehrere Darlehen. Bitte die loan_id-Auswahl erweitern.";
  }

  if (fullText.includes("no loan") || fullText.includes("kein darlehen")) {
    return "Zu dieser Immobilie wurde kein Darlehen gefunden.";
  }

  return error.message || "Die Änderung konnte nicht gespeichert werden.";
}

function buildDetailedLedgerError(error: unknown, fallback: string): Error {
  const normalized = toSupabaseLikeError(error);
  const friendly = buildFriendlyLedgerErrorMessage(normalized);

  const detailParts = [
    normalized.code ? `Code: ${normalized.code}` : null,
    normalized.details ? `Details: ${normalized.details}` : null,
    normalized.hint ? `Hint: ${normalized.hint}` : null,
  ].filter(Boolean);

  const finalMessage = [friendly || fallback, ...detailParts].join(" | ");
  return new Error(finalMessage);
}

export function mapLedgerError(error: unknown): string {
  return buildDetailedLedgerError(
    error,
    "Die Änderung konnte nicht gespeichert werden.",
  ).message;
}

export function rowToFormValues(row: LoanLedgerRow): LoanLedgerFormValues {
  return {
    year: String(row.year ?? ""),
    interest: String(row.interest ?? ""),
    principal: String(row.principal ?? ""),
    balance: String(row.balance ?? ""),
    source: row.source ?? "",
  };
}

export function parseLoanLedgerFormValues(
  values: LoanLedgerFormValues,
): SaveLoanLedgerPayload {
  return {
    year: Number(values.year),
    interest: toNumberOrNaN(values.interest),
    principal: toNumberOrNaN(values.principal),
    balance: toNumberOrNaN(values.balance),
    source: values.source?.trim() ? values.source.trim() : null,
  };
}

export function validateLedgerRow(
  values: LoanLedgerFormValues,
): LoanLedgerValidationResult {
  const errors: Partial<Record<keyof LoanLedgerFormValues, string>> = {};

  const year = Number(values.year);
  const interest = toNumberOrNaN(values.interest);
  const principal = toNumberOrNaN(values.principal);
  const balance = toNumberOrNaN(values.balance);

  if (!values.year.trim()) {
    errors.year = "Jahr ist erforderlich.";
  } else if (!Number.isInteger(year)) {
    errors.year = "Jahr muss eine ganze Zahl sein.";
  } else if (year < 1900 || year > 2200) {
    errors.year = "Jahr muss zwischen 1900 und 2200 liegen.";
  }

  if (values.interest.trim() === "") {
    errors.interest = "Zinsen sind erforderlich.";
  } else if (Number.isNaN(interest)) {
    errors.interest = "Zinsen müssen eine Zahl sein.";
  } else if (interest < 0) {
    errors.interest = "Zinsen müssen 0 oder größer sein.";
  }

  if (values.principal.trim() === "") {
    errors.principal = "Tilgung ist erforderlich.";
  } else if (Number.isNaN(principal)) {
    errors.principal = "Tilgung muss eine Zahl sein.";
  } else if (principal < 0) {
    errors.principal = "Tilgung muss 0 oder größer sein.";
  }

  if (values.balance.trim() === "") {
    errors.balance = "Restschuld ist erforderlich.";
  } else if (Number.isNaN(balance)) {
    errors.balance = "Restschuld muss eine Zahl sein.";
  } else if (balance < 0) {
    errors.balance = "Restschuld muss 0 oder größer sein.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export async function loadPropertyLoanLedger(
  propertyId: string,
): Promise<LoanLedgerRow[]> {
  const safePropertyId = assertNonEmptyString(propertyId, "propertyId");

  const { data, error } = await supabase
    .from(LEDGER_TABLE)
    .select(LEDGER_SELECT)
    .eq("property_id", safePropertyId)
    .order("year", { ascending: true });

  if (error) {
    devError("loadPropertyLoanLedger.error", {
      propertyId: safePropertyId,
      table: LEDGER_TABLE,
      error: toSupabaseLikeError(error),
    });

    throw buildDetailedLedgerError(
      error,
      "Fehler beim Laden des Darlehens-Ledgers.",
    );
  }

  const rows = ((data ?? []) as PropertyLoanLedgerRowDb[]).map(mapRowToLoanLedgerRow);

  devLog("loadPropertyLoanLedger.success", {
    propertyId: safePropertyId,
    rowCount: rows.length,
  });

  return rows;
}

/**
 * Zentrale Restschuldquelle für Darlehen, Immobilienvermögen und Folgeseiten.
 * Es werden ausschließlich Werte aus property_loan_ledger verwendet; Views,
 * localStorage und manuelle Vermögensfelder dürfen die Restschuld nicht ersetzen.
 */
export async function loadCanonicalPropertyLoanSnapshots(
  propertyIds: Array<string | null | undefined>,
): Promise<CanonicalPropertyLoanSnapshot[]> {
  const ids = Array.from(new Set(propertyIds.map((value) => String(value ?? "").trim()).filter(Boolean)));
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from(LEDGER_TABLE)
    .select("property_id,year,interest,principal,balance,source")
    .in("property_id", ids)
    .order("property_id", { ascending: true })
    .order("year", { ascending: true });

  if (error) {
    throw buildDetailedLedgerError(error, "Zentrale Restschulden konnten nicht aus dem Darlehens-Ledger geladen werden.");
  }

  const grouped = new Map<string, CanonicalPropertyLoanSnapshot>();
  for (const row of (data ?? []) as CanonicalPropertyLoanSnapshotRowDb[]) {
    const propertyId = String(row.property_id ?? "").trim();
    const year = toInteger(row.year, Number.NaN);
    if (!propertyId || !Number.isFinite(year)) continue;
    const previous = grouped.get(propertyId);
    const interestTotal = (previous?.interestTotal ?? 0) + toNumber(row.interest);
    const principalTotal = (previous?.principalTotal ?? 0) + toNumber(row.principal);
    const isLatest = !previous || year >= previous.balanceYear;
    grouped.set(propertyId, {
      propertyId,
      balanceYear: isLatest ? year : previous.balanceYear,
      balance: isLatest ? toNumber(row.balance) : previous.balance,
      source: isLatest ? toNullableString(row.source) : previous.source,
      interestTotal: Math.round(interestTotal * 100) / 100,
      principalTotal: Math.round(principalTotal * 100) / 100,
    });
  }

  return Array.from(grouped.values()).sort((left, right) => left.propertyId.localeCompare(right.propertyId));
}

export async function loadCanonicalPropertyLoanHistory(
  propertyIds: Array<string | null | undefined>,
  maximumYear = new Date().getFullYear(),
): Promise<CanonicalPropertyLoanYear[]> {
  const ids = Array.from(new Set(propertyIds.map((value) => String(value ?? "").trim()).filter(Boolean)));
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from(LEDGER_TABLE)
    .select("property_id,year,interest,principal,balance,source")
    .in("property_id", ids)
    .lte("year", maximumYear)
    .order("property_id", { ascending: true })
    .order("year", { ascending: true });

  if (error) {
    throw buildDetailedLedgerError(error, "Tilgungs- und Zinsverlauf konnte nicht aus der Darlehens-Hauptquelle geladen werden.");
  }

  return ((data ?? []) as CanonicalPropertyLoanSnapshotRowDb[])
    .map((row) => ({
      propertyId: String(row.property_id ?? "").trim(),
      year: toInteger(row.year, Number.NaN),
      interest: toNumber(row.interest),
      principal: toNumber(row.principal),
      balance: toNumber(row.balance),
      source: toNullableString(row.source),
    }))
    .filter((row) => row.propertyId && Number.isFinite(row.year) && row.year <= maximumYear);
}

export async function resolveLoanIdForProperty(
  propertyId: string,
): Promise<string> {
  const safePropertyId = assertNonEmptyString(propertyId, "propertyId");

  const { data, error } = await supabase
    .from(PROPERTY_LOANS_TABLE)
    .select("id, created_at")
    .eq("property_id", safePropertyId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    devError("resolveLoanIdForProperty.error", {
      propertyId: safePropertyId,
      table: PROPERTY_LOANS_TABLE,
      error: toSupabaseLikeError(error),
    });

    throw buildDetailedLedgerError(
      error,
      "Fehler beim Auflösen der loan_id für die Immobilie.",
    );
  }

  const existingLoanId = ((data ?? []) as PropertyLoanRowDb[])[0]?.id;
  if (existingLoanId) return assertNonEmptyString(existingLoanId, "loan.id");

  const { data: created, error: createError } = await supabase
    .from(PROPERTY_LOANS_TABLE)
    .insert({ property_id: safePropertyId })
    .select("id")
    .limit(1);

  if (createError) {
    devError("resolveLoanIdForProperty.createError", {
      propertyId: safePropertyId,
      table: PROPERTY_LOANS_TABLE,
      error: toSupabaseLikeError(createError),
    });

    throw buildDetailedLedgerError(
      createError,
      "Für diese Immobilie konnte kein Darlehen angelegt werden.",
    );
  }

  const createdLoanId = ((created ?? []) as PropertyLoanRowDb[])[0]?.id;
  return assertNonEmptyString(createdLoanId, "loan.id");
}

export async function insertPropertyLoanLedgerRow(
  propertyId: string,
  values: SaveLoanLedgerPayload,
): Promise<void> {
  const safePropertyId = assertNonEmptyString(propertyId, "propertyId");
  const loanId = await resolveLoanIdForProperty(safePropertyId);

  const { data, error } = await supabase
    .from(LEDGER_TABLE)
    .upsert({
      property_id: safePropertyId,
      loan_id: loanId,
      year: values.year,
      interest: values.interest,
      principal: values.principal,
      balance: values.balance,
      source: values.source,
    }, { onConflict: "property_id,year" })
    .select(LEDGER_SELECT);

  if (error) {
    devError("insertPropertyLoanLedgerRow.error", {
      propertyId: safePropertyId,
      loanId,
      table: LEDGER_TABLE,
      values,
      error: toSupabaseLikeError(error),
    });

    throw buildDetailedLedgerError(
      error,
      "Die neue Ledger-Zeile konnte nicht angelegt werden.",
    );
  }

  if (!data || data.length === 0) {
    devError("insertPropertyLoanLedgerRow.emptyResult", {
      propertyId: safePropertyId,
      loanId,
      values,
    });

    throw new Error(
      "Die neue Ledger-Zeile konnte nicht angelegt werden. Es wurde kein Datensatz geschrieben.",
    );
  }
}

export async function updatePropertyLoanLedgerRow(
  rowId: number,
  values: SaveLoanLedgerPayload,
): Promise<void> {
  const safeRowId = toInteger(rowId, Number.NaN);

  if (!Number.isFinite(safeRowId)) {
    throw new Error("Ungültige Row-ID.");
  }

  const { data, error } = await supabase
    .from(LEDGER_TABLE)
    .update({
      year: values.year,
      interest: values.interest,
      principal: values.principal,
      balance: values.balance,
      source: values.source,
      updated_at: new Date().toISOString(),
    })
    .eq("id", safeRowId)
    .select(LEDGER_SELECT);

  if (error) {
    devError("updatePropertyLoanLedgerRow.error", {
      rowId: safeRowId,
      table: LEDGER_TABLE,
      values,
      error: toSupabaseLikeError(error),
    });

    throw buildDetailedLedgerError(
      error,
      "Die Zeile konnte nicht aktualisiert werden.",
    );
  }

  if (!data || data.length === 0) {
    devError("updatePropertyLoanLedgerRow.emptyResult", {
      rowId: safeRowId,
      values,
    });

    throw new Error(
      "Die Zeile konnte nicht aktualisiert werden. Es wurde kein Datensatz geändert. Bitte Row-ID, RLS und Update-Berechtigung prüfen.",
    );
  }
}

export async function deletePropertyLoanLedgerRow(
  rowId: number,
): Promise<void> {
  const safeRowId = toInteger(rowId, Number.NaN);

  if (!Number.isFinite(safeRowId)) {
    throw new Error("Ungültige Row-ID.");
  }

  const { data, error } = await supabase
    .from(LEDGER_TABLE)
    .delete()
    .eq("id", safeRowId)
    .select("id");

  if (error) {
    devError("deletePropertyLoanLedgerRow.error", {
      rowId: safeRowId,
      table: LEDGER_TABLE,
      error: toSupabaseLikeError(error),
    });

    throw buildDetailedLedgerError(
      error,
      "Die Zeile konnte nicht gelöscht werden.",
    );
  }

  if (!data || data.length === 0) {
    devError("deletePropertyLoanLedgerRow.emptyResult", {
      rowId: safeRowId,
    });

    throw new Error(
      "Die Zeile konnte nicht gelöscht werden. Es wurde kein Datensatz entfernt.",
    );
  }
}
export type LoanProjectionInput = {
  startYear: number;
  endYear: number;
  startBalance: number;
  interestRatePercent: number;
  annualPrincipal: number;
  source?: string | null;
};

export function buildLoanProjectionRows(input: LoanProjectionInput): SaveLoanLedgerPayload[] {
  const startYear = Math.trunc(toNumber(input.startYear, Number.NaN));
  const endYear = Math.trunc(toNumber(input.endYear, Number.NaN));
  const rate = toNumber(input.interestRatePercent, 0) / 100;
  const annualPrincipal = Math.max(0, toNumber(input.annualPrincipal, 0));
  let balance = Math.max(0, toNumber(input.startBalance, 0));
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear) || endYear < startYear) throw new Error("Bitte gültigen Start- und Endjahr-Bereich eingeben.");
  if (!Number.isFinite(balance) || balance <= 0) throw new Error("Bitte gültige Start-Restschuld eingeben.");
  if (!Number.isFinite(annualPrincipal) || annualPrincipal <= 0) throw new Error("Bitte gültige jährliche Tilgung eingeben.");
  if (endYear - startYear > 80) throw new Error("Bitte maximal 80 Jahre auf einmal generieren.");
  const rows: SaveLoanLedgerPayload[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    const interest = Math.round(balance * rate * 100) / 100;
    const principal = Math.min(balance, annualPrincipal);
    balance = Math.max(0, Math.round((balance - principal) * 100) / 100);
    rows.push({ year, interest, principal: Math.round(principal * 100) / 100, balance, source: input.source ?? "auto_projection" });
    if (balance <= 0) break;
  }
  return rows;
}

export async function generatePropertyLoanLedgerProjection(propertyId: string, input: LoanProjectionInput): Promise<number> {
  const rows = buildLoanProjectionRows(input);
  for (const row of rows) await insertPropertyLoanLedgerRow(propertyId, row);
  await recordAuditLog({
    action: "loan_projection_generated",
    property_id: propertyId,
    label: "Tilgungsplan automatisch erzeugt",
    new_value: rows,
    meta: { startYear: input.startYear, endYear: input.endYear, interestRatePercent: input.interestRatePercent },
  });
  return rows.length;
}
