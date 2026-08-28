import { clearAppDataCache } from "../lib/appCache";
import { supabase } from "../lib/supabase";
import { emitFinanceEntryChanged } from "../lib/appCache";
import { isReadonlyApprovalEmail } from "../auth/accessControl";

export type RuleEntryType = "income" | "expense";

export type TransactionRule = {
  id: string;
  user_id: string;
  name: string;
  match_text: string;
  property_id: string | null;
  object_code: string | null;
  unit_label: string | null;
  entry_type: RuleEntryType | null;
  category: string | null;
  tax_relevant: boolean | null;
  priority: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FinanceEntryForRules = {
  id: string;
  object_id: string | null;
  objekt_code: string | null;
  booking_date: string | null;
  amount: number | string | null;
  category: string | null;
  note: string | null;
  entry_type: RuleEntryType;
  tax_relevant: boolean | null;
};

export type TransactionRuleInput = {
  name: string;
  matchText: string;
  propertyId?: string | null;
  objectCode?: string | null;
  unitLabel?: string | null;
  entryType?: RuleEntryType | null;
  category?: string | null;
  taxRelevant?: boolean | null;
  priority?: number;
  isActive?: boolean;
  notes?: string | null;
};

export type RulePreviewRow = {
  entry: FinanceEntryForRules;
  rule: TransactionRule;
  changes: string[];
  fields?: RuleChangeField[];
};

function cleanText(value: string | null | undefined): string | null {
  const cleaned = String(value ?? "").trim();
  return cleaned ? cleaned : null;
}

function normalize(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll("ß", "ss")
    .replace(/[ä]/g, "ae")
    .replace(/[ö]/g, "oe")
    .replace(/[ü]/g, "ue")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toMoney(value: number | string | null): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const userId = data.user?.id;
  if (!userId) throw new Error("Nicht eingeloggt.");
  return userId;
}

async function isCurrentUserReadonly(): Promise<boolean> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return isReadonlyApprovalEmail(data.user?.email);
}

export async function listTransactionRules(includeInactive = true): Promise<TransactionRule[]> {
  const userId = await getCurrentUserId();
  let query = supabase
    .from("transaction_rules")
    .select("*")
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false });

  if (!(await isCurrentUserReadonly())) query = query.eq("user_id", userId);
  if (!includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as TransactionRule[];
}

export async function createTransactionRule(input: TransactionRuleInput): Promise<TransactionRule> {
  const userId = await getCurrentUserId();
  const name = cleanText(input.name);
  const matchText = cleanText(input.matchText);

  if (!name) throw new Error("Bitte einen Regelnamen eingeben.");
  if (!matchText) throw new Error("Bitte einen Suchtext eingeben.");

  const { data, error } = await supabase
    .from("transaction_rules")
    .insert({
      user_id: userId,
      name,
      match_text: matchText,
      property_id: cleanText(input.propertyId),
      object_code: cleanText(input.objectCode),
      unit_label: cleanText(input.unitLabel),
      entry_type: input.entryType ?? null,
      category: cleanText(input.category),
      tax_relevant: typeof input.taxRelevant === "boolean" ? input.taxRelevant : null,
      priority: Number.isFinite(input.priority) ? input.priority : 100,
      is_active: input.isActive ?? true,
      notes: cleanText(input.notes),
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as TransactionRule;
}

export async function updateTransactionRule(id: string, input: TransactionRuleInput): Promise<TransactionRule> {
  const userId = await getCurrentUserId();
  const name = cleanText(input.name);
  const matchText = cleanText(input.matchText);

  if (!name) throw new Error("Bitte einen Regelnamen eingeben.");
  if (!matchText) throw new Error("Bitte einen Suchtext eingeben.");

  const { data, error } = await supabase
    .from("transaction_rules")
    .update({
      name,
      match_text: matchText,
      property_id: cleanText(input.propertyId),
      object_code: cleanText(input.objectCode),
      unit_label: cleanText(input.unitLabel),
      entry_type: input.entryType ?? null,
      category: cleanText(input.category),
      tax_relevant: typeof input.taxRelevant === "boolean" ? input.taxRelevant : null,
      priority: Number.isFinite(input.priority) ? input.priority : 100,
      is_active: input.isActive ?? true,
      notes: cleanText(input.notes),
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return data as TransactionRule;
}

export async function updateTransactionRuleActive(id: string, isActive: boolean): Promise<TransactionRule> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("transaction_rules")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return data as TransactionRule;
}

export async function deleteTransactionRule(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("transaction_rules")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function listRuleCandidateEntries(from: string, to: string): Promise<FinanceEntryForRules[]> {
  const { data, error } = await supabase
    .from("finance_entry")
    .select("id,object_id,objekt_code,booking_date,amount,category,note,entry_type,tax_relevant")
    .eq("is_deleted", false)
    .in("entry_type", ["income", "expense"])
    .gte("booking_date", from)
    .lte("booking_date", to)
    .order("booking_date", { ascending: false })
    .limit(1500);

  if (error) throw error;
  return ((data ?? []) as FinanceEntryForRules[]).map((entry) => ({
    ...entry,
    entry_type: entry.entry_type === "expense" ? "expense" : "income",
  }));
}

function ruleMatchesEntry(rule: TransactionRule, entry: FinanceEntryForRules): boolean {
  if (!rule.is_active) return false;
  const haystack = normalize(`${entry.category ?? ""} ${entry.note ?? ""} ${entry.objekt_code ?? ""}`);
  const needle = normalize(rule.match_text);
  if (!needle || !haystack.includes(needle)) return false;
  if (rule.object_code && normalize(rule.object_code) !== normalize(entry.objekt_code)) return false;
  if (rule.property_id && String(rule.property_id) !== String(entry.object_id ?? "")) return false;
  return true;
}

type RuleChangeField = "entry_type" | "category" | "tax_relevant";

type RuleChange = {
  field: RuleChangeField;
  label: string;
};

function changeDetailsForRule(rule: TransactionRule, entry: FinanceEntryForRules): RuleChange[] {
  const changes: RuleChange[] = [];
  if (rule.entry_type && rule.entry_type !== entry.entry_type) {
    changes.push({
      field: "entry_type",
      label: `Typ: ${entry.entry_type === "income" ? "Einnahme" : "Ausgabe"} -> ${rule.entry_type === "income" ? "Einnahme" : "Ausgabe"}`,
    });
  }
  if (rule.category && normalize(rule.category) !== normalize(entry.category)) {
    changes.push({
      field: "category",
      label: `Kategorie: ${entry.category || "leer"} -> ${rule.category}`,
    });
  }
  if (typeof rule.tax_relevant === "boolean" && rule.tax_relevant !== entry.tax_relevant) {
    changes.push({
      field: "tax_relevant",
      label: `Steuerrelevant: ${entry.tax_relevant ? "Ja" : "Nein"} -> ${rule.tax_relevant ? "Ja" : "Nein"}`,
    });
  }
  return changes;
}

function changesForRule(rule: TransactionRule, entry: FinanceEntryForRules): string[] {
  return changeDetailsForRule(rule, entry).map((change) => change.label);
}

function ruleSpecificityScore(rule: TransactionRule, entry: FinanceEntryForRules): number {
  const haystack = normalize(`${entry.category ?? ""} ${entry.note ?? ""} ${entry.objekt_code ?? ""}`);
  const needle = normalize(rule.match_text);
  const changes = changesForRule(rule, entry);

  let score = 0;
  if (needle) score += needle.length * 4;
  if (haystack === needle) score += 200;
  if (haystack.split(" ").includes(needle)) score += 80;
  if (rule.object_code) score += 60;
  if (rule.property_id) score += 60;
  if (rule.unit_label) score += 30;
  if (rule.entry_type) score += 20;
  if (rule.category) score += 20;
  if (typeof rule.tax_relevant === "boolean") score += 20;
  score += changes.length * 50;

  // Niedrige Prioritaet bleibt wichtig, aber Spezifitaet darf breite Altregeln ueberstimmen.
  score -= Math.max(0, Number(rule.priority ?? 100)) * 0.5;
  return score;
}

export function previewRuleMatches(rules: TransactionRule[], entries: FinanceEntryForRules[]): RulePreviewRow[] {
  const activeRules = [...rules].filter((rule) => rule.is_active).sort((a, b) => a.priority - b.priority);
  const preview: RulePreviewRow[] = [];

  for (const entry of entries) {
    const assignedFields = new Set<RuleChangeField>();
    const matchingRules = activeRules
      .filter((rule) => ruleMatchesEntry(rule, entry))
      .map((rule) => ({ rule, score: ruleSpecificityScore(rule, entry), changes: changeDetailsForRule(rule, entry) }))
      .filter((row) => row.changes.length > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.rule.priority !== b.rule.priority) return a.rule.priority - b.rule.priority;
        return String(b.rule.created_at ?? "").localeCompare(String(a.rule.created_at ?? ""));
      });

    for (const { rule, changes } of matchingRules) {
      const usableChanges = changes.filter((change) => !assignedFields.has(change.field));
      if (usableChanges.length === 0) continue;
      usableChanges.forEach((change) => assignedFields.add(change.field));
      preview.push({
        entry,
        rule,
        fields: usableChanges.map((change) => change.field),
        changes: usableChanges.map((change) => change.label),
      });
    }
  }

  return preview;
}

export async function applyRulePreview(rows: RulePreviewRow[]): Promise<number> {
  const userId = await getCurrentUserId();
  let updated = 0;

  for (const row of rows) {
    const payload: Partial<FinanceEntryForRules> = {};
    const fields = new Set<RuleChangeField>(row.fields ?? ["entry_type", "category", "tax_relevant"]);
    if (fields.has("entry_type") && row.rule.entry_type) payload.entry_type = row.rule.entry_type;
    if (fields.has("category") && row.rule.category) payload.category = row.rule.category;
    if (fields.has("tax_relevant") && typeof row.rule.tax_relevant === "boolean") payload.tax_relevant = row.rule.tax_relevant;

    if (Object.keys(payload).length === 0) continue;

    const { error } = await supabase
      .from("finance_entry")
      .update(payload)
      .eq("id", row.entry.id)
      .eq("user_id", userId)
      .eq("is_deleted", false);

    if (error) throw error;
    updated += 1;
  }

  if (updated > 0) {
    clearAppDataCache();
    emitFinanceEntryChanged();
  }

  return updated;
}

export function formatRuleAmount(value: number | string | null): string {
  return toMoney(value).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}
