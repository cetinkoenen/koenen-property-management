import {
  deletePropertyLoanLedgerRow,
  getPropertyLoanLedgerRow,
  insertPropertyLoanLedgerRow,
  listPropertyLoanLedgerRows,
  updatePropertyLoanLedgerRow,
  type PropertyLoanLedgerRecord,
} from "@/services/propertyLoanLedgerService";
import type { YearlyLedgerEntry } from "@/types/finance";

export type CreateYearlyLedgerEntryInput = {
  propertyId: string;
  year: number | string;
  interest: number | string;
  principal: number | string;
  balance: number | string;
  source?: string | null;
};

export type UpdateYearlyLedgerEntryInput = {
  year?: number | string;
  interest?: number | string;
  principal?: number | string;
  balance?: number | string;
  source?: string | null;
};

function numberValue(value: unknown, field: string): number {
  const normalized = typeof value === "string"
    ? value.trim().replace(/\s/g, "").replace(",", ".").replace(/[^\d.-]/g, "")
    : value;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error(`${field} ist keine gültige Zahl.`);
  return parsed;
}

function yearValue(value: unknown): number {
  const year = Math.trunc(numberValue(value, "Jahr"));
  if (year < 1900 || year > 3000) throw new Error("Jahr ist ungültig.");
  return year;
}

function toEntry(row: PropertyLoanLedgerRecord): YearlyLedgerEntry {
  return {
    id: row.id,
    propertyId: row.propertyId,
    year: row.year,
    interestPayment: row.interest,
    principalPayment: row.principal,
    remainingBalance: row.balance,
    interest: row.interest,
    principal: row.principal,
    balance: row.balance,
    source: row.source,
  };
}

async function requireSavedRow(propertyId: string, year: number): Promise<YearlyLedgerEntry> {
  const row = (await listPropertyLoanLedgerRows({ propertyIds: [propertyId], year }))[0];
  if (!row) throw new Error("Darlehens-Ledger wurde gespeichert, konnte aber nicht erneut geladen werden.");
  return toEntry(row);
}

export const ledgerService = {
  async getByPropertyId(propertyId: string): Promise<YearlyLedgerEntry[]> {
    return (await listPropertyLoanLedgerRows({ propertyIds: [propertyId] })).map(toEntry);
  },

  async getById(id: string | number): Promise<YearlyLedgerEntry | null> {
    const row = await getPropertyLoanLedgerRow(id);
    return row ? toEntry(row) : null;
  },

  async create(input: CreateYearlyLedgerEntryInput): Promise<YearlyLedgerEntry> {
    const year = yearValue(input.year);
    await insertPropertyLoanLedgerRow(input.propertyId, {
      year,
      interest: numberValue(input.interest, "Zinsen"),
      principal: numberValue(input.principal, "Tilgung"),
      balance: numberValue(input.balance, "Restschuld"),
      source: input.source?.trim() || null,
    });
    return requireSavedRow(input.propertyId, year);
  },

  async update(id: string | number, input: UpdateYearlyLedgerEntryInput): Promise<YearlyLedgerEntry> {
    const current = await getPropertyLoanLedgerRow(id);
    if (!current) throw new Error("Darlehens-Ledger-Zeile wurde nicht gefunden.");
    const values = {
      year: input.year === undefined ? current.year : yearValue(input.year),
      interest: input.interest === undefined ? current.interest : numberValue(input.interest, "Zinsen"),
      principal: input.principal === undefined ? current.principal : numberValue(input.principal, "Tilgung"),
      balance: input.balance === undefined ? current.balance : numberValue(input.balance, "Restschuld"),
      source: input.source === undefined ? current.source : input.source?.trim() || null,
    };
    await updatePropertyLoanLedgerRow(Number(id), values);
    const updated = await getPropertyLoanLedgerRow(id);
    if (!updated) throw new Error("Aktualisierte Darlehens-Ledger-Zeile konnte nicht geladen werden.");
    return toEntry(updated);
  },

  async remove(id: string | number): Promise<void> {
    await deletePropertyLoanLedgerRow(Number(id));
  },
};

export type { YearlyLedgerEntry };
export default ledgerService;
