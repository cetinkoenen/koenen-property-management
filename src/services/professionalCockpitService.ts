import { supabase } from "../lib/supabase";
import { effectiveRentDate } from "../lib/rentMonth";
import {
  effectiveVacancyStartDate,
  isVacancyEffectivelyActiveInRange,
  listVacancies,
  type UnitVacancy,
} from "./vacancyService";

export type OpenPostStatus = "paid" | "partial" | "missing" | "vacant";

export type OpenPostRow = {
  contractId: string;
  tenantId: string;
  tenantName: string;
  propertyId: string | null;
  objectCode: string | null;
  objectLabel: string;
  unitLabel: string | null;
  expectedAmount: number;
  paidAmount: number;
  openAmount: number;
  status: OpenPostStatus;
  dueDate: string;
};

export type CockpitTask = {
  id: string;
  title: string;
  category: string;
  priority: string;
  dueDate: string | null;
  propertyName: string | null;
  description: string | null;
  checklistDone: Record<string, boolean>;
  checklistGroups: Array<{
    title: string;
    items: string[];
  }>;
};

type TaskMeta = {
  source?: string;
  source_key?: string;
  vacancy_id?: string;
  vacancy_property_id?: string | null;
  unit_label?: string | null;
  dismissed_at?: string;
  deleted_at?: string;
  checklist_done?: Record<string, boolean>;
  checklist_groups?: Array<{ title?: string; items?: string[] }>;
};

type ExistingTaskRow = {
  id: string;
  title: string | null;
  due_date: string | null;
  property_name: string | null;
  objekt_code: string | null;
  status: string | null;
  meta?: TaskMeta | null;
};

export type CockpitDocumentIssue = {
  id: string;
  propertyName: string;
  category: string;
  detail: string;
};

export type CockpitSnapshot = {
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  expectedTotal: number;
  paidTotal: number;
  openTotal: number;
  paidCount: number;
  partialCount: number;
  missingCount: number;
  vacantCount: number;
  openPosts: OpenPostRow[];
  tasks: CockpitTask[];
  documentIssues: CockpitDocumentIssue[];
};

export type PaymentReminderRow = {
  id: string;
  reminder_level: "zahlungserinnerung" | "mahnung_1" | "mahnung_2" | "letzte_mahnung";
  status: "draft" | "sent" | "blocked" | "resolved" | "archived";
  tenant_id: string | null;
  tenant_contract_id: string | null;
  property_id: string | null;
  object_code: string | null;
  unit_label: string | null;
  due_date: string | null;
  open_amount: number;
  fee_amount: number;
  interest_amount: number;
  subject: string | null;
  body: string | null;
  reminder_key: string;
  created_at: string;
};

type ContractRow = {
  id: string;
  tenant_id: string;
  property_id: string | null;
  object_code: string | null;
  unit_label: string | null;
  rent_type: string | null;
  cold_rent: number | string | null;
  operating_costs: number | string | null;
  total_rent: number | string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  tenant_profiles?: {
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
    tenant_number: string | null;
  } | null;
};

type FinanceRow = {
  object_id: string | null;
  objekt_code: string | null;
  booking_date: string | null;
  amount: number | string | null;
  category: string | null;
  note: string | null;
};

type ObjectRow = {
  value: string | null;
  object_id: string | null;
  property_id: string | null;
  objekt_code: string | null;
  label: string | null;
};

type TaskRow = {
  id: string | number;
  title: string | null;
  description: string | null;
  category: string | null;
  priority: string | number | null;
  due_date: string | null;
  property_name: string | null;
  meta?: TaskMeta | null;
};

type DocumentIssueRow = {
  id: string | number;
  property_name: string | null;
  category: string | null;
  status: string | null;
  title: string | null;
};

function toMoney(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthRange(baseDate = new Date()) {
  const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
  const due = new Date(baseDate.getFullYear(), baseDate.getMonth(), 3);
  return {
    start: isoDate(start),
    end: isoDate(end),
    due: isoDate(due),
    label: new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(start),
  };
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

function compact(value: string | null | undefined): string {
  return normalize(value).replace(/\s+/g, "");
}

function tenantName(contract: ContractRow): string {
  const tenant = contract.tenant_profiles;
  const personal = [tenant?.first_name, tenant?.last_name].filter(Boolean).join(" ").trim();
  return tenant?.company_name || personal || tenant?.tenant_number || "Unbenannter Mieter";
}

function isContractRelevant(contract: ContractRow, start: string, end: string): boolean {
  if (contract.status === "ended" && contract.end_date && contract.end_date < start) return false;
  if (contract.status === "planned" && contract.start_date && contract.start_date > end) return false;
  if (contract.start_date && contract.start_date > end) return false;
  if (contract.end_date && contract.end_date < start) return false;
  return contract.status !== "vacant";
}

function expectedRent(contract: ContractRow): number {
  const total = toMoney(contract.total_rent);
  if (total > 0) return total;
  return toMoney(contract.cold_rent) + toMoney(contract.operating_costs);
}

function bookingEffectiveMonthDate(bookingDate: string | null): string | null {
  return effectiveRentDate(bookingDate);
}

function isRentPayment(row: FinanceRow): boolean {
  const text = normalize(`${row.category ?? ""} ${row.note ?? ""}`);
  return text.includes("miete") || text.includes("pacht") || text.includes("garage") || text.includes("stellplatz");
}

function bookingHasContractObject(row: FinanceRow, contract: ContractRow): boolean {
  return (
    Boolean(row.object_id && contract.property_id && String(row.object_id) === String(contract.property_id)) ||
    Boolean(row.objekt_code && contract.object_code && normalize(row.objekt_code) === normalize(contract.object_code))
  );
}

function unitMatchesBookingText(row: FinanceRow, contract: ContractRow): boolean {
  const unit = compact(contract.unit_label);
  if (!unit) return false;
  const text = compact(`${row.category ?? ""} ${row.note ?? ""}`);
  return text.includes(unit);
}

function contractObjectKey(contract: ContractRow): string {
  return `${contract.property_id ?? ""}::${normalize(contract.object_code)}`;
}

function parkingCode(value: string | null | undefined): string | null {
  const match = compact(value).match(/p25[034]/);
  return match?.[0] ?? null;
}

function bookingMatchesContract(row: FinanceRow, contract: ContractRow, requiresUnitMatch: boolean): boolean {
  const objectMatches = bookingHasContractObject(row, contract);
  if (!objectMatches) return false;
  if (!requiresUnitMatch) return true;
  return unitMatchesBookingText(row, contract);
}

function vacancyMatchesContract(vacancy: UnitVacancy, contract: ContractRow): boolean {
  const propertyMatch =
    String(vacancy.property_id ?? "") === String(contract.property_id ?? "") ||
    normalize(vacancy.object_code) === normalize(contract.object_code);
  if (!propertyMatch) return false;

  const vacancyUnit = compact(vacancy.unit_label);
  const contractUnit = compact(contract.unit_label);
  if (!vacancyUnit || !contractUnit) return true;

  const vacancyParkingCode = parkingCode(vacancy.unit_label);
  const contractParkingCode = parkingCode(contract.unit_label);
  if (vacancyParkingCode || contractParkingCode) {
    return Boolean(vacancyParkingCode && contractParkingCode && vacancyParkingCode === contractParkingCode);
  }

  return vacancyUnit.includes(contractUnit) || contractUnit.includes(vacancyUnit);
}

function buildObjectLabelMap(rows: ObjectRow[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of rows) {
    const label = row.label || row.objekt_code || row.value || "Unbekanntes Objekt";
    for (const key of [row.value, row.object_id, row.property_id, row.objekt_code]) {
      if (key) result[String(key)] = label;
    }
  }
  return result;
}

function moveOutChecklistGroups(): CockpitTask["checklistGroups"] {
  return [
    {
      title: "1. Am Auszugstag",
      items: [
        "Gemeinsamen Übergabetermin mit Mieter vereinbaren.",
        "Auszugsprotokoll erstellen und von beiden Parteien unterschreiben lassen.",
        "Zustand von Wänden, Böden, Türen und Fenstern prüfen.",
        "Mängel und vereinbarte Schönheitsreparaturen schriftlich festhalten.",
        "Fotodokumentation aller Räume und Schäden erstellen.",
        "Alle Schlüssel inkl. Keller, Briefkasten und Garage zählen und protokollieren.",
      ],
    },
    {
      title: "2. Zählerstände",
      items: [
        "Heizungswerte aller Messgeräte notieren.",
        "Stromzählerstand dokumentieren.",
        "Warm- und Kaltwasserzähler dokumentieren.",
        "Zählernummern den richtigen Einheiten zuordnen.",
        "Zählerstände zeitnah an Versorger bzw. Verwaltung melden.",
      ],
    },
    {
      title: "3. Nach dem Auszug",
      items: [
        "Neue Anschrift des Mieters hinterlegen.",
        "Kaution bis zur Klärung möglicher Ansprüche einbehalten.",
        "Angemessenen Kautionsanteil für ausstehende Nebenkostenabrechnung zurückhalten.",
        "Auf beschlossene Hausgeldabrechnung der Hausverwaltung warten.",
      ],
    },
    {
      title: "4. Finale Abrechnung",
      items: [
        "Nebenkostenabrechnung auf Basis der Hausgeldabrechnung erstellen.",
        "Nur umlagefähige Kosten laut Mietvertrag berücksichtigen.",
        "Unterjährige Wohndauer zeitanteilig berechnen.",
        "Abrechnung innerhalb der gesetzlichen Frist zusenden.",
        "Restkaution nach Verrechnung von Nachzahlungen, Guthaben oder Schäden auszahlen.",
      ],
    },
  ];
}

function checklistDescription(): string {
  return moveOutChecklistGroups()
    .map((group) => `${group.title}\n${group.items.map((item) => `- ${item}`).join("\n")}`)
    .join("\n\n");
}

function effectiveVacancyTaskKey(vacancy: UnitVacancy): string {
  return `unit_vacancy:${vacancy.id}:move_out_checklist`;
}

function asUuid(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function taskLabelForVacancy(vacancy: UnitVacancy, objectLabels: Record<string, string>): string {
  return (
    vacancy.object_label ||
    objectLabels[vacancy.property_id ?? ""] ||
    objectLabels[vacancy.object_code ?? ""] ||
    vacancy.object_code ||
    "Unbekanntes Objekt"
  );
}

async function ensureMoveOutChecklistTasks(
  vacancies: UnitVacancy[],
  objectLabels: Record<string, string>,
  periodStart: string,
  periodEnd: string,
): Promise<void> {
  const activeVacancies = vacancies.filter((vacancy) =>
    isVacancyEffectivelyActiveInRange(vacancy, periodStart, periodEnd),
  );
  if (!activeVacancies.length) return;

  const { data: existingRows, error: existingError } = await supabase
    .from("property_tasks")
    .select("id,title,due_date,property_name,objekt_code,meta,status")
    .eq("category", "leerstand")
    .neq("status", "erledigt");

  if (existingError) {
    console.warn("Leerstand-Aufgaben konnten nicht geprüft werden.", existingError);
    return;
  }

  const existingTasks = (existingRows ?? []) as ExistingTaskRow[];
  const existingKeys = new Set(existingTasks.map((row) => row.meta?.source_key).filter(Boolean));
  const existingVacancyIds = new Set(existingTasks.map((row) => row.meta?.vacancy_id).filter(Boolean));
  const existingNaturalKeys = new Set(
    existingTasks.map((row) =>
      normalizeTaskNaturalKey({
        title: row.title,
        dueDate: row.due_date,
        propertyName: row.property_name,
        objectCode: row.objekt_code,
      }),
    ),
  );
  const checklistGroups = moveOutChecklistGroups();
  const description = checklistDescription();

  for (const vacancy of activeVacancies) {
    const sourceKey = effectiveVacancyTaskKey(vacancy);
    const propertyName = taskLabelForVacancy(vacancy, objectLabels);
    const unitSuffix = vacancy.unit_label ? ` · ${vacancy.unit_label}` : "";
    const effectiveStart = effectiveVacancyStartDate(vacancy);
    const title = `Auszug organisieren: ${propertyName}${unitSuffix}`;
    const naturalKey = normalizeTaskNaturalKey({
      title,
      dueDate: effectiveStart,
      propertyName,
      objectCode: vacancy.object_code,
    });

    if (existingKeys.has(sourceKey) || existingVacancyIds.has(vacancy.id) || existingNaturalKeys.has(naturalKey)) {
      continue;
    }

    const { error: insertError } = await supabase.from("property_tasks").insert({
      property_id: asUuid(vacancy.property_id),
      portfolio_property_id: null,
      objekt_code: vacancy.object_code,
      property_name: propertyName,
      title,
      description,
      category: "leerstand",
      priority: "hoch",
      status: "offen",
      due_date: effectiveStart,
      source: "system",
      meta: {
        source: "unit_vacancies",
        source_key: sourceKey,
        vacancy_id: vacancy.id,
        vacancy_property_id: vacancy.property_id,
        unit_label: vacancy.unit_label,
        checklist_done: {},
        checklist_groups: checklistGroups,
      },
    });
    if (insertError) {
      if (insertError.code === "23505") continue;
      console.warn("Leerstand-Aufgabe konnte nicht angelegt werden.", insertError);
      continue;
    }
    existingKeys.add(sourceKey);
    existingVacancyIds.add(vacancy.id);
    existingNaturalKeys.add(naturalKey);
  }
}

function normalizeTaskNaturalKey({
  title,
  dueDate,
  propertyName,
  objectCode,
}: {
  title: string | null;
  dueDate: string | null;
  propertyName: string | null;
  objectCode: string | null;
}): string {
  return [title, dueDate, propertyName, objectCode].map((part) => normalize(part)).join("::");
}

function normalizeChecklistGroups(meta: TaskRow["meta"]): CockpitTask["checklistGroups"] {
  return (meta?.checklist_groups ?? [])
    .map((group) => ({
      title: String(group.title ?? "Checkliste"),
      items: Array.isArray(group.items)
        ? group.items.map((item) => String(item).trim()).filter(Boolean)
        : [],
    }))
    .filter((group) => group.items.length > 0);
}

function normalizeChecklistDone(meta: TaskRow["meta"]): Record<string, boolean> {
  const raw = meta?.checklist_done;
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Boolean(value)]));
}

function uniqueTasks(tasks: CockpitTask[]): CockpitTask[] {
  const seen = new Set<string>();
  return tasks.filter((task) => {
    const key = normalizeTaskNaturalKey({
      title: task.title,
      dueDate: task.dueDate,
      propertyName: task.propertyName,
      objectCode: null,
    });
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function loadCockpitSnapshot(baseDate = new Date()): Promise<CockpitSnapshot> {
  const period = monthRange(baseDate);
  const previousWindowStart = isoDate(new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 25));

  const [contractsRes, objectsRes, paymentsRes, docsRes, vacancyRows] = await Promise.all([
    supabase
      .from("tenant_contracts")
      .select("*,tenant_profiles(first_name,last_name,company_name,tenant_number)")
      .eq("is_deleted", false)
      .in("status", ["active", "planned"]),
    supabase.from("v_object_dropdown").select("value,object_id,property_id,objekt_code,label"),
    supabase
      .from("finance_entry")
      .select("object_id,objekt_code,booking_date,amount,category,note")
      .eq("is_deleted", false)
      .eq("entry_type", "income")
      .gte("booking_date", previousWindowStart)
      .lte("booking_date", period.end),
    supabase
      .from("property_documents")
      .select("id,property_name,category,status,title")
      .in("status", ["fehlt", "läuft_bald_ab", "abgelaufen"])
      .limit(8),
    listVacancies().catch(() => [] as UnitVacancy[]),
  ]);

  if (contractsRes.error) throw contractsRes.error;
  if (objectsRes.error) throw objectsRes.error;
  if (paymentsRes.error) throw paymentsRes.error;

  const contracts = ((contractsRes.data ?? []) as unknown as ContractRow[]).filter((contract) =>
    isContractRelevant(contract, period.start, period.end),
  );
  const objectLabels = buildObjectLabelMap((objectsRes.data ?? []) as ObjectRow[]);
  await ensureMoveOutChecklistTasks(vacancyRows, objectLabels, period.start, period.end);

  const taskRes = await supabase
    .from("property_tasks")
    .select("id,title,description,category,priority,due_date,property_name,status,meta")
    .in("status", ["offen", "in_bearbeitung"])
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(8);

  const payments = ((paymentsRes.data ?? []) as FinanceRow[]).filter((row) => {
    const effectiveDate = bookingEffectiveMonthDate(row.booking_date);
    return Boolean(effectiveDate && effectiveDate >= period.start && effectiveDate <= period.end && isRentPayment(row));
  });
  const contractCountByObject = contracts.reduce<Record<string, number>>((result, contract) => {
    const key = contractObjectKey(contract);
    result[key] = (result[key] ?? 0) + 1;
    return result;
  }, {});

  const openPosts = contracts
    .map<OpenPostRow | null>((contract) => {
      const expectedAmount = expectedRent(contract);
      if (expectedAmount <= 0) return null;
      const requiresUnitMatch = (contractCountByObject[contractObjectKey(contract)] ?? 0) > 1;

      const isVacant = vacancyRows.some(
        (vacancy) =>
          isVacancyEffectivelyActiveInRange(vacancy, period.start, period.end) &&
          vacancyMatchesContract(vacancy, contract),
      );
      const paidAmount = isVacant
        ? 0
        : payments
            .filter((payment) => bookingMatchesContract(payment, contract, requiresUnitMatch))
            .reduce((sum, payment) => sum + toMoney(payment.amount), 0);
      const openAmount = Math.max(expectedAmount - paidAmount, 0);
      const status: OpenPostStatus = isVacant
        ? "vacant"
        : openAmount <= 0.01
          ? "paid"
          : paidAmount > 0
            ? "partial"
            : "missing";

      return {
        contractId: contract.id,
        tenantId: contract.tenant_id,
        tenantName: tenantName(contract),
        propertyId: contract.property_id,
        objectCode: contract.object_code,
        objectLabel: objectLabels[contract.property_id ?? ""] || objectLabels[contract.object_code ?? ""] || contract.object_code || "Unbekanntes Objekt",
        unitLabel: contract.unit_label,
        expectedAmount,
        paidAmount,
        openAmount,
        status,
        dueDate: period.due,
      };
    })
    .filter((row): row is OpenPostRow => Boolean(row));

  const expectedTotal = openPosts.reduce((sum, row) => sum + (row.status === "vacant" ? 0 : row.expectedAmount), 0);
  const paidTotal = openPosts.reduce((sum, row) => sum + row.paidAmount, 0);
  const openTotal = openPosts.reduce((sum, row) => sum + row.openAmount, 0);
  const activeVacancies = vacancyRows.filter((vacancy) =>
    isVacancyEffectivelyActiveInRange(vacancy, period.start, period.end),
  );
  const activeVacancyIds = new Set(activeVacancies.map((vacancy) => vacancy.id));
  const taskRows = taskRes.error
    ? []
    : ((taskRes.data ?? []) as TaskRow[]).filter((task) => {
        if (task.meta?.source !== "unit_vacancies" || !task.meta.vacancy_id) return true;
        return activeVacancyIds.has(task.meta.vacancy_id);
      });

  return {
    periodLabel: period.label,
    periodStart: period.start,
    periodEnd: period.end,
    dueDate: period.due,
    expectedTotal,
    paidTotal,
    openTotal,
    paidCount: openPosts.filter((row) => row.status === "paid").length,
    partialCount: openPosts.filter((row) => row.status === "partial").length,
    missingCount: openPosts.filter((row) => row.status === "missing").length,
    vacantCount: activeVacancies.length,
    openPosts: openPosts.sort((a, b) => b.openAmount - a.openAmount),
    tasks: taskRes.error
      ? []
      : uniqueTasks(taskRows.map((task) => ({
          id: String(task.id),
          title: String(task.title ?? "Aufgabe"),
          category: String(task.category ?? "allgemein"),
          priority: String(task.priority ?? "mittel"),
          dueDate: task.due_date ?? null,
          propertyName: task.property_name ?? null,
          description: task.description ?? null,
          checklistDone: normalizeChecklistDone(task.meta),
          checklistGroups: normalizeChecklistGroups(task.meta),
        }))),
    documentIssues: docsRes.error
      ? []
      : ((docsRes.data ?? []) as DocumentIssueRow[]).map((doc) => ({
          id: String(doc.id),
          propertyName: doc.property_name ?? "Unbekanntes Objekt",
          category: String(doc.category ?? "sonstiges"),
          detail: doc.title || doc.status || "Dokument prüfen",
        })),
  };
}

export async function updateCockpitTaskChecklistItem(taskId: string, itemKey: string, done: boolean): Promise<void> {
  const { data, error: loadError } = await supabase
    .from("property_tasks")
    .select("meta")
    .eq("id", taskId)
    .single();

  if (loadError) throw loadError;

  const meta = ((data?.meta ?? {}) as TaskMeta) || {};
  const checklistDone = { ...(meta.checklist_done ?? {}), [itemKey]: done };

  const { error: updateError } = await supabase
    .from("property_tasks")
    .update({
      meta: {
        ...meta,
        checklist_done: checklistDone,
      },
    })
    .eq("id", taskId);

  if (updateError) throw updateError;
}

export async function createPaymentReminderDraft(
  row: OpenPostRow,
  level: PaymentReminderRow["reminder_level"] = "zahlungserinnerung",
): Promise<PaymentReminderRow> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) throw new Error("Nicht eingeloggt.");

  const levelLabel =
    level === "mahnung_1"
      ? "1. Mahnung"
      : level === "mahnung_2"
        ? "2. Mahnung"
        : level === "letzte_mahnung"
          ? "Letzte Mahnung"
          : "Zahlungserinnerung";
  const subject = `${levelLabel}: offener Mietbetrag ${row.objectLabel}`;
  const body = [
    `Sehr geehrte Damen und Herren,`,
    ``,
    `für ${row.objectLabel}${row.unitLabel ? `, ${row.unitLabel}` : ""} ist aktuell ein Mietbetrag offen.`,
    `Sollbetrag: ${eurText(row.expectedAmount)}`,
    `Bisher bezahlt: ${eurText(row.paidAmount)}`,
    `Offener Betrag: ${eurText(row.openAmount)}`,
    ``,
    `Bitte prüfen Sie die Zahlung und gleichen Sie den offenen Betrag aus.`,
  ].join("\n");

  const { data, error } = await supabase
    .from("payment_reminders")
    .insert({
      user_id: userId,
      tenant_id: row.tenantId,
      tenant_contract_id: row.contractId,
      property_id: row.propertyId,
      object_code: row.objectCode,
      unit_label: row.unitLabel,
      reminder_level: level,
      status: "draft",
      due_date: row.dueDate,
      open_amount: row.openAmount,
      subject,
      body,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as PaymentReminderRow;
}

export async function listPaymentReminderDrafts(limit = 20): Promise<PaymentReminderRow[]> {
  const { data, error } = await supabase
    .from("payment_reminders")
    .select("*")
    .in("status", ["draft", "blocked", "sent"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as PaymentReminderRow[];
}

function eurText(value: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value || 0);
}
