import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { clearAppDataCache } from "../lib/appCache";
import { canonicalizeFinanceCategory, getFinanceCategoryOptions } from "../lib/financeCategories";
import { displayFinanceCategory } from "../lib/financeEntryLabels";
import { NK_ABRECHNUNG_LABEL, buildNkMismatchMessage, classifyNkRelevance } from "../lib/nkClassification";
import { isRepairCapexEntry } from "../lib/repairCapex";
import { classifyTaxRelevance } from "../lib/taxClassification";
import {
  PORTFOLIO_GENERAL_LABEL,
  PORTFOLIO_GENERAL_OBJECT_CODE,
  PORTFOLIO_GENERAL_OBJECT_ID,
  isPortfolioGeneralReference,
} from "../lib/portfolioExpense";
import {
  buildTelecommunicationNote,
  calculateTelecommunicationTax,
  isTelecommunicationCategory,
  parseTelecommunicationTaxDetails,
} from "../lib/telecommunicationTax";
import { emitFinanceEntryChanged } from "../lib/appCache";

type EntryType = "income" | "expense";
type TypeFilter = "all" | EntryType;
type GroupMode = "none" | "object" | "category" | "type";
type PeriodMode = "month" | "year";

type EntryRow = {
  id: number;
  object_id: string | null;
  objekt_code: string | null;
  booking_date: string;
  amount: number;
  category: string | null;
  note: string | null;
  entry_type: EntryType;
  tax_relevant: boolean | null;
  nk_relevant: boolean | null;
};

type DropdownRow = {
  value: string;
  objekt_code: string;
  label: string;
  object_id?: string | null;
  property_id?: string | null;
};

type ObjectDropdownResponse = {
  value: string | null;
  objekt_code: string | null;
  label: string | null;
  object_id?: string | null;
  property_id?: string | null;
};

type PageNotice = { tone: "success" | "error" | "warning"; message: string };

type FinanceEntryResponse = {
  id: unknown;
  object_id: unknown;
  objekt_code: unknown;
  booking_date: unknown;
  amount: unknown;
  category: unknown;
  note: unknown;
  entry_type: unknown;
  tax_relevant: unknown;
  nk_relevant: unknown;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type SortKey = "booking_date" | "objekt_code" | "entry_type" | "category" | "amount";
type SortDirection = "asc" | "desc";

const MONTHS = [
  { m: 1, label: "Januar" },
  { m: 2, label: "Februar" },
  { m: 3, label: "März" },
  { m: 4, label: "April" },
  { m: 5, label: "Mai" },
  { m: 6, label: "Juni" },
  { m: 7, label: "Juli" },
  { m: 8, label: "August" },
  { m: 9, label: "September" },
  { m: 10, label: "Oktober" },
  { m: 11, label: "November" },
  { m: 12, label: "Dezember" },
];

function formatEUR(n: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}

function formatDate(dateString: string) {
  if (!dateString) return "—";

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function toIsoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthRangeISO(year: number, month: number) {
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 1);
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

function yearRangeISO(year: number) {
  const from = new Date(year, 0, 1);
  const to = new Date(year + 1, 0, 1);
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

function parseNumberInput(raw: string): number {
  const normalized = raw.replace(",", ".").trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

function taxRuleForRow(row: EntryRow, objectLabel?: string | null) {
  return classifyTaxRelevance(row, objectLabel);
}

function nkRuleForRow(row: Pick<EntryRow, "entry_type" | "category" | "note">) {
  return classifyNkRelevance(row);
}

function getCategoryFilterValues(row: EntryRow, objectLabel?: string | null): string[] {
  const canonical = canonicalizeFinanceCategory(row.category, row.entry_type);
  const display = displayFinanceCategory(row, objectLabel);
  const values = [display, canonical, row.category ?? ""].filter(Boolean);
  if (isRepairCapexEntry(row)) values.push("Capex", "Reparatur");
  return Array.from(new Set(values));
}

function effectiveTaxRelevant(row: EntryRow, objectLabel?: string | null): boolean {
  const rule = taxRuleForRow(row, objectLabel);
  if (rule.locked) return false;
  return typeof row.tax_relevant === "boolean" ? row.tax_relevant : rule.taxRelevant;
}

function compareStrings(a: string, b: string, direction: SortDirection) {
  const result = a.localeCompare(b, "de", { sensitivity: "base" });
  return direction === "asc" ? result : -result;
}

function compareNumbers(a: number, b: number, direction: SortDirection) {
  const result = a - b;
  return direction === "asc" ? result : -result;
}

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";

  const stringValue = String(value);

  if (
    stringValue.includes(";") ||
    stringValue.includes('"') ||
    stringValue.includes("\n") ||
    stringValue.includes("\r")
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function toCsv(rows: Array<Record<string, unknown>>, headers: string[]) {
  const headerLine = headers.map(escapeCsvValue).join(";");
  const dataLines = rows.map((row) => headers.map((h) => escapeCsvValue(row[h])).join(";"));
  return [headerLine, ...dataLines].join("\n");
}

function downloadCsv(filename: string, csvContent: string) {
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csvContent], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function sanitizeFilenamePart(value: string) {
  return value.replace(/[^\wäöüÄÖÜß-]+/g, "_");
}

function rowSelectionKey(row: EntryRow) {
  return `${row.entry_type}-${row.id}`;
}

function StatCard({
  title,
  value,
  loading,
}: {
  title: string;
  value: number;
  loading: boolean;
}) {
  const isNegative = value < 0;

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 14,
        background: "white",
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>{title}</div>
      <div
        style={{
          fontSize: 17,
          fontWeight: 900,
          marginTop: 6,
          color: title === "Netto" ? (isNegative ? "#991b1b" : "#166534") : undefined,
        }}
      >
        {loading ? "…" : formatEUR(value)}
      </div>
    </div>
  );
}

function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 50,
      }}
      onMouseDown={onClose}
    >
      <div
        style={{
          width: "min(720px, 100%)",
          background: "white",
          borderRadius: 14,
          border: "1px solid #e5e7eb",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          padding: 14,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 17 }}>{title}</div>
          <button
            onClick={onClose}
            style={{
              marginLeft: "auto",
              border: "1px solid #e5e7eb",
              background: "white",
              borderRadius: 10,
              padding: "8px 10px",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Schließen
          </button>
        </div>

        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onClick,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onClick: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const isActive = activeKey === sortKey;
  const arrow = isActive ? (direction === "asc" ? " ▲" : " ▼") : "";

  return (
    <th
      onClick={() => onClick(sortKey)}
      style={{
        textAlign: align,
        padding: 10,
        fontSize: 12,
        opacity: 0.85,
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
      title="Sortieren"
    >
      {label}
      {arrow}
    </th>
  );
}

export default function Monate() {
  const now = new Date();

  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");

  const [objects, setObjects] = useState<DropdownRow[]>([]);
  const [objektCode, setObjektCode] = useState<string>("ALL");

  const [rows, setRows] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<PageNotice | null>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [groupMode, setGroupMode] = useState<GroupMode>("none");

  const [sortKey, setSortKey] = useState<SortKey>("booking_date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<EntryRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [editType, setEditType] = useState<EntryType>("income");
  const [editDate, setEditDate] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editTaxRelevant, setEditTaxRelevant] = useState<boolean>(false);
  const [editNkRelevant, setEditNkRelevant] = useState<boolean>(false);
  const [editObjectValue, setEditObjectValue] = useState("");
  const [editTelecomSpouseA, setEditTelecomSpouseA] = useState("");
  const [editTelecomSpouseB, setEditTelecomSpouseB] = useState("");
  const [editTelecomLandlineInternet, setEditTelecomLandlineInternet] = useState("");

  const [editCategoryMode, setEditCategoryMode] = useState<"existing" | "new">("existing");
  const [editCategorySelect, setEditCategorySelect] = useState("");
  const [editCategoryCustom, setEditCategoryCustom] = useState("");

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data, error } = await supabase
          .from("v_object_dropdown")
          .select("value,objekt_code,label,object_id,property_id")
          .order("label", { ascending: true });

        if (!alive) return;

        if (error) {
          console.error("Fehler beim Laden der Objekt-Dropdown-Liste:", error);
          setObjects([]);
          return;
        }

        const dbObjects = ((data ?? []) as ObjectDropdownResponse[])
          .filter((x) => (x.object_id || x.value) && x.objekt_code && x.label)
          .map((x) => ({
            value: String(x.object_id ?? x.value),
            objekt_code: String(x.objekt_code),
            label: String(x.label),
            object_id: x.object_id == null ? null : String(x.object_id),
            property_id: x.property_id == null ? null : String(x.property_id),
          }))
          .sort((a, b) => a.label.localeCompare(b.label, "de"));

        const list: DropdownRow[] = [
          {
            value: PORTFOLIO_GENERAL_OBJECT_ID,
            objekt_code: PORTFOLIO_GENERAL_OBJECT_CODE,
            label: PORTFOLIO_GENERAL_LABEL,
            object_id: null,
            property_id: null,
          },
          ...dbObjects,
        ];

        setObjects(list);
      } catch (e) {
        console.error("Dropdown load exception:", e);
        if (!alive) return;
        setObjects([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const objectLabelMap = useMemo(() => {
    return new Map(objects.map((o) => [o.objekt_code, o.label]));
  }, [objects]);

  const objectByValue = useMemo(() => {
    return new Map(objects.map((o) => [o.value, o]));
  }, [objects]);

  async function fetchEntriesForRange(from: string, to: string, code: string) {
    let query = supabase
      .from("finance_entry")
      .select("id,object_id,objekt_code,booking_date,amount,category,note,entry_type,tax_relevant,nk_relevant,is_deleted")
      .eq("is_deleted", false)
      .gte("booking_date", from)
      .lt("booking_date", to)
      .in("entry_type", ["income", "expense"])
      .order("booking_date", { ascending: false });

    if (code && code !== "ALL") {
      query = query.eq("objekt_code", code);
    }

    const { data, error } = await query;
    if (error) throw error;

    const entries: EntryRow[] = ((data ?? []) as FinanceEntryResponse[]).map((r) => ({
      id: Number(r.id),
      object_id: r.object_id == null ? null : String(r.object_id),
      objekt_code: r.objekt_code == null ? null : String(r.objekt_code),
      booking_date: String(r.booking_date ?? ""),
      amount: Number(r.amount || 0),
      category: r.category == null ? null : String(r.category),
      note: r.note == null ? null : String(r.note),
      entry_type: r.entry_type === "expense" ? "expense" : "income",
      tax_relevant: typeof r.tax_relevant === "boolean" ? r.tax_relevant : null,
      nk_relevant: typeof r.nk_relevant === "boolean" ? r.nk_relevant : null,
    }));
    return entries;
  }

  async function loadEntries() {
    setLoading(true);
    setErr(null);

    if (!Number.isFinite(year) || year < 1900 || year > 3000) {
      setRows([]);
      setErr("Bitte ein gültiges Jahr eingeben.");
      setLoading(false);
      return;
    }

    if (periodMode === "month" && (!Number.isFinite(month) || month < 1 || month > 12)) {
      setRows([]);
      setErr("Bitte einen gültigen Monat auswählen.");
      setLoading(false);
      return;
    }

    const { from, to } = periodMode === "year" ? yearRangeISO(year) : monthRangeISO(year, month);
    const code = objektCode.trim();

    try {
      const data = await fetchEntriesForRange(from, to, code);
      setRows(data);
    } catch (e: unknown) {
      console.error("loadEntries failed:", e);
      setRows([]);
      setErr(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadEntries(), 0);
    return () => window.clearTimeout(initialLoad);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objektCode, year, month, periodMode]);

  const categories = useMemo(() => {
    const rowCategories = rows
      .map((r) => displayFinanceCategory(r, objectLabelMap.get(r.objekt_code ?? "") ?? r.objekt_code))
      .filter(Boolean);

    return Array.from(
      new Set([
        ...getFinanceCategoryOptions("income", rowCategories),
        ...getFinanceCategoryOptions("expense", rowCategories),
      ])
    ).sort((a, b) => a.localeCompare(b, "de"));
  }, [rows, objectLabelMap]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows.filter((r) => {
      const note = r.note?.trim() || "";
      const objectCode = r.objekt_code?.trim() || "";
      const objectLabel = objectLabelMap.get(objectCode)?.trim() || "";
      const categoryValues = getCategoryFilterValues(r, objectLabel || objectCode);
      const typeLabel = r.entry_type === "income" ? "einnahme" : "ausgabe";
      const searchable = [
        ...categoryValues,
        note,
        objectCode,
        objectLabel,
        typeLabel,
        r.booking_date,
      ].join(" ").toLowerCase();
      const searchTokens = q.split(/\s+/).filter(Boolean);

      const matchesType = typeFilter === "all" ? true : r.entry_type === typeFilter;
      const matchesCategory = categoryFilter === "ALL" ? true : categoryValues.includes(categoryFilter);

      const matchesSearch =
        !q ||
        searchTokens.every((token) => searchable.includes(token));

      return matchesType && matchesCategory && matchesSearch;
    });
  }, [rows, search, typeFilter, categoryFilter, objectLabelMap]);

  const sortedRows = useMemo(() => {
    const list = [...filteredRows];

    list.sort((a, b) => {
      switch (sortKey) {
        case "booking_date":
          return compareStrings(a.booking_date, b.booking_date, sortDirection);

        case "objekt_code": {
          const aLabel = objectLabelMap.get(a.objekt_code ?? "") ?? a.objekt_code ?? "";
          const bLabel = objectLabelMap.get(b.objekt_code ?? "") ?? b.objekt_code ?? "";
          return compareStrings(aLabel, bLabel, sortDirection);
        }

        case "entry_type": {
          const aLabel = a.entry_type === "income" ? "Einnahme" : "Ausgabe";
          const bLabel = b.entry_type === "income" ? "Einnahme" : "Ausgabe";
          return compareStrings(aLabel, bLabel, sortDirection);
        }

        case "category":
          return compareStrings(
            displayFinanceCategory(a, objectLabelMap.get(a.objekt_code ?? "") ?? a.objekt_code),
            displayFinanceCategory(b, objectLabelMap.get(b.objekt_code ?? "") ?? b.objekt_code),
            sortDirection
          );

        case "amount":
          return compareNumbers(a.amount, b.amount, sortDirection);

        default:
          return 0;
      }
    });

    return list;
  }, [filteredRows, sortKey, sortDirection, objectLabelMap]);

  useEffect(() => {
    const resetPage = window.setTimeout(() => setCurrentPage(1), 0);
    return () => window.clearTimeout(resetPage);
  }, [search, typeFilter, categoryFilter, objektCode, year, month, periodMode, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));

  useEffect(() => {
    const clampPage = window.setTimeout(() => {
      if (currentPage > totalPages) setCurrentPage(totalPages);
    }, 0);
    return () => window.clearTimeout(clampPage);
  }, [currentPage, totalPages]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return sortedRows.slice(start, end);
  }, [sortedRows, currentPage, pageSize]);

  const pageStart = sortedRows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = sortedRows.length === 0 ? 0 : Math.min(currentPage * pageSize, sortedRows.length);

  const visiblePageKeys = useMemo(() => paginatedRows.map((r) => rowSelectionKey(r)), [paginatedRows]);

  const allVisibleSelected =
    visiblePageKeys.length > 0 && visiblePageKeys.every((key) => selectedKeys.includes(key));

  const someVisibleSelected =
    visiblePageKeys.some((key) => selectedKeys.includes(key)) && !allVisibleSelected;

  useEffect(() => {
    const validKeys = new Set(sortedRows.map((r) => rowSelectionKey(r)));
    const syncSelection = window.setTimeout(() => {
      setSelectedKeys((prev) => prev.filter((key) => validKeys.has(key)));
    }, 0);
    return () => window.clearTimeout(syncSelection);
  }, [sortedRows]);

  const totals = useMemo(() => {
    const income = sortedRows
      .filter((r) => r.entry_type === "income")
      .reduce((sum, r) => sum + r.amount, 0);

    const expense = sortedRows
      .filter((r) => r.entry_type === "expense")
      .reduce((sum, r) => sum + r.amount, 0);

    return {
      income,
      expense,
      net: income - expense,
    };
  }, [sortedRows]);

  const selectedRows = useMemo(() => {
    const selected = new Set(selectedKeys);
    return sortedRows.filter((row) => selected.has(rowSelectionKey(row)));
  }, [selectedKeys, sortedRows]);

  const selectedTotals = useMemo(() => {
    const income = selectedRows
      .filter((r) => r.entry_type === "income")
      .reduce((sum, r) => sum + r.amount, 0);

    const expense = selectedRows
      .filter((r) => r.entry_type === "expense")
      .reduce((sum, r) => sum + r.amount, 0);

    return { income, expense, net: income - expense };
  }, [selectedRows]);

  const groupedSummaries = useMemo(() => {
    const map = new Map<string, { label: string; count: number; income: number; expense: number; net: number }>();

    for (const row of sortedRows) {
      const objectCode = row.objekt_code ?? "";
      const label =
        groupMode === "object"
          ? objectLabelMap.get(objectCode) ?? (objectCode || "Ohne Objekt")
          : groupMode === "category"
          ? displayFinanceCategory(row, objectLabelMap.get(objectCode) ?? objectCode)
          : groupMode === "type"
          ? row.entry_type === "income" ? "Einnahmen" : "Ausgaben"
          : "Alle Buchungen";

      const current = map.get(label) ?? { label, count: 0, income: 0, expense: 0, net: 0 };
      current.count += 1;

      if (row.entry_type === "income") current.income += row.amount;
      else current.expense += row.amount;

      current.net = current.income - current.expense;
      map.set(label, current);
    }

    return Array.from(map.values()).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  }, [groupMode, objectLabelMap, sortedRows]);

  function applyPreset(preset: "rent" | "capex" | "expenses" | "income" | "reset") {
    setCurrentPage(1);

    if (preset === "reset") {
      setSearch("");
      setTypeFilter("all");
      setCategoryFilter("ALL");
      setGroupMode("none");
      return;
    }

    if (preset === "rent") {
      setTypeFilter("income");
      setSearch("miete");
      setCategoryFilter("ALL");
      setGroupMode("object");
      return;
    }

    if (preset === "capex") {
      setTypeFilter("expense");
      setSearch("");
      setCategoryFilter("Capex");
      setGroupMode("category");
      setPeriodMode("year");
      return;
    }

    if (preset === "expenses") {
      setTypeFilter("expense");
      setSearch("");
      setCategoryFilter("ALL");
      setGroupMode("category");
      return;
    }

    setTypeFilter("income");
    setSearch("");
    setCategoryFilter("ALL");
    setGroupMode("object");
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);

    if (key === "booking_date" || key === "amount") {
      setSortDirection("desc");
    } else {
      setSortDirection("asc");
    }
  }

  function toggleRowSelection(row: EntryRow) {
    const key = rowSelectionKey(row);
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
    );
  }

  function toggleSelectVisibleRows() {
    if (allVisibleSelected) {
      setSelectedKeys((prev) => prev.filter((key) => !visiblePageKeys.includes(key)));
      return;
    }

    setSelectedKeys((prev) => Array.from(new Set([...prev, ...visiblePageKeys])));
  }

  async function deleteEntry(id: number) {
    const ok = window.confirm("Wirklich löschen?");
    if (!ok) return;

    // Datensicherheit: Buchungen werden nicht mehr endgültig gelöscht.
    // Sie werden nur als Papierkorb/gelöscht markiert und können per SQL/Audit wiederhergestellt werden.
    const { error } = await supabase
      .from("finance_entry")
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      setNotice({ tone: "error", message: `Löschen fehlgeschlagen: ${error.message}` });
      return;
    }

    clearAppDataCache();
    emitFinanceEntryChanged();
    await loadEntries();
    setNotice({ tone: "success", message: "Buchung wurde sicher in den Papierkorb verschoben." });
  }

  async function deleteSelectedEntries() {
    if (selectedKeys.length === 0) return;

    const selectedIds = Array.from(
      new Set(
        selectedKeys
          .map((key) => {
            const parts = key.split("-");
            const id = Number(parts[1]);
            return Number.isFinite(id) ? id : null;
          })
          .filter((id): id is number => id !== null)
      )
    );

    if (selectedIds.length === 0) {
      setNotice({ tone: "warning", message: "Keine gültigen Einträge ausgewählt." });
      return;
    }

    const ok = window.confirm(
      `Wirklich ${selectedIds.length} ausgewählte Buchung${selectedIds.length === 1 ? "" : "en"} löschen?`
    );
    if (!ok) return;

    setBulkDeleting(true);

    try {
      // Datensicherheit: Auch Sammel-Löschen ist nur Soft-Delete, kein echtes DELETE.
      const { error } = await supabase
        .from("finance_entry")
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .in("id", selectedIds);

      if (error) throw error;

      setSelectedKeys([]);
      clearAppDataCache();
      emitFinanceEntryChanged();
      await loadEntries();
      setNotice({ tone: "success", message: `${selectedIds.length} Buchung${selectedIds.length === 1 ? "" : "en"} wurde${selectedIds.length === 1 ? "" : "n"} sicher in den Papierkorb verschoben.` });
    } catch (e: unknown) {
      setNotice({ tone: "error", message: `Sammel-Löschen fehlgeschlagen: ${errorMessage(e)}` });
    } finally {
      setBulkDeleting(false);
    }
  }

  function openEdit(row: EntryRow) {
    const rawCategory = row.category?.trim() ?? "";
    const normalizedCategory = rawCategory || "Ohne Kategorie";
    const matchingObject =
      objects.find((object) => row.object_id && String(object.value) === String(row.object_id)) ??
      objects.find((object) => row.objekt_code && object.objekt_code === row.objekt_code);

    setEditRow(row);
    setEditType(row.entry_type);
    setEditDate(row.booking_date);
    setEditAmount(String(row.amount));
    setEditNote(row.note ?? "");
    setEditObjectValue(
      isPortfolioGeneralReference(row.object_id) || isPortfolioGeneralReference(row.objekt_code)
        ? PORTFOLIO_GENERAL_OBJECT_ID
        : matchingObject?.value ?? "",
    );
    setEditTaxRelevant(effectiveTaxRelevant(row, objectLabelMap.get(row.objekt_code ?? "") ?? row.objekt_code));
    setEditNkRelevant(Boolean(row.nk_relevant));

    const telecommunicationDetails = parseTelecommunicationTaxDetails(row);
    setEditTelecomSpouseA(telecommunicationDetails ? String(telecommunicationDetails.spouseA).replace(".", ",") : "");
    setEditTelecomSpouseB(telecommunicationDetails ? String(telecommunicationDetails.spouseB).replace(".", ",") : "");
    setEditTelecomLandlineInternet(
      telecommunicationDetails ? String(telecommunicationDetails.landlineInternet).replace(".", ",") : "",
    );

    if (!rawCategory) {
      setEditCategoryMode("existing");
      setEditCategorySelect("Ohne Kategorie");
      setEditCategoryCustom("");
    } else if (categories.includes(normalizedCategory)) {
      setEditCategoryMode("existing");
      setEditCategorySelect(normalizedCategory);
      setEditCategoryCustom("");
    } else {
      setEditCategoryMode("new");
      setEditCategorySelect("__NEW__");
      setEditCategoryCustom(rawCategory);
    }

    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editRow) return;

    const resolvedCategory =
      editCategoryMode === "new"
        ? canonicalizeFinanceCategory(editCategoryCustom.trim(), editType)
        : editCategorySelect === "Ohne Kategorie"
        ? ""
        : canonicalizeFinanceCategory(editCategorySelect.trim(), editType);
    const isTelecommunicationEdit = editType === "expense" && isTelecommunicationCategory(resolvedCategory);
    const telecomSpouseA = parseNumberInput(editTelecomSpouseA || "0");
    const telecomSpouseB = parseNumberInput(editTelecomSpouseB || "0");
    const telecomLandlineInternet = parseNumberInput(editTelecomLandlineInternet || "0");
    const telecommunicationDetails = calculateTelecommunicationTax({
      spouseA: Number.isFinite(telecomSpouseA) ? telecomSpouseA : NaN,
      spouseB: Number.isFinite(telecomSpouseB) ? telecomSpouseB : NaN,
      landlineInternet: Number.isFinite(telecomLandlineInternet) ? telecomLandlineInternet : NaN,
    });
    const n = isTelecommunicationEdit ? telecommunicationDetails.totalAmount : parseNumberInput(editAmount);

    if (!Number.isFinite(n) || n <= 0) {
      setNotice({ tone: "warning", message: "Bitte einen gültigen Betrag größer als 0 eingeben." });
      return;
    }

    if (
      isTelecommunicationEdit &&
      (!Number.isFinite(telecomSpouseA) ||
        telecomSpouseA < 0 ||
        !Number.isFinite(telecomSpouseB) ||
        telecomSpouseB < 0 ||
        !Number.isFinite(telecomLandlineInternet) ||
        telecomLandlineInternet < 0)
    ) {
      setNotice({ tone: "warning", message: "Bitte die drei Handy- und Internetbeträge gültig und nicht negativ eingeben." });
      return;
    }

    if (!editDate) {
      setNotice({ tone: "warning", message: "Bitte ein Buchungsdatum eintragen." });
      return;
    }

    if (editCategoryMode === "new" && !editCategoryCustom.trim()) {
      setNotice({ tone: "warning", message: "Bitte eine neue Kategorie eingeben." });
      return;
    }

    const resolvedNote = isTelecommunicationEdit
      ? buildTelecommunicationNote({
          spouseA: telecommunicationDetails.spouseA,
          spouseB: telecommunicationDetails.spouseB,
          landlineInternet: telecommunicationDetails.landlineInternet,
        })
      : editNote.trim() || null;
    const selectedObject = objectByValue.get(editObjectValue);
    if (!selectedObject) {
      setNotice({ tone: "warning", message: "Bitte ein Objekt auswählen." });
      return;
    }

    const isPortfolioGeneralEdit =
      isPortfolioGeneralReference(selectedObject.value) ||
      isPortfolioGeneralReference(selectedObject.objekt_code);
    const nextObjectId = isPortfolioGeneralEdit ? null : selectedObject.value;
    const nextObjectCode = selectedObject.objekt_code;
    const objectLabel = selectedObject.label;
    const editTaxRule = classifyTaxRelevance(
      {
        ...editRow,
        object_id: nextObjectId,
        objekt_code: nextObjectCode,
        entry_type: editType,
        category: resolvedCategory,
        note: resolvedNote,
        amount: n,
      },
      objectLabel,
    );
    const editNkRule = classifyNkRelevance({
      entry_type: editType,
      category: resolvedCategory,
      note: resolvedNote,
    });
    let nextNkRelevant = editNkRelevant;
    if (editNkRule.nkRelevant !== editNkRelevant) {
      const useRecommendation = window.confirm(
        `${buildNkMismatchMessage(editNkRule, editNkRelevant)}\n\nOK = Empfehlung uebernehmen. Abbrechen = bewusst so speichern.`,
      );
      if (useRecommendation) nextNkRelevant = editNkRule.nkRelevant;
    }

    setEditSaving(true);

    try {
      const payload: {
        entry_type: EntryType;
        booking_date: string;
        amount: number;
        category: string | null;
        note: string | null;
        object_id: string | null;
        objekt_code: string | null;
        tax_relevant: boolean;
        nk_relevant: boolean;
      } = {
        entry_type: editType,
        booking_date: editDate,
        amount: n,
        category: resolvedCategory || null,
        note: resolvedNote,
        object_id: nextObjectId,
        objekt_code: nextObjectCode,
        tax_relevant: editTaxRule.locked ? false : editTaxRelevant,
        nk_relevant: nextNkRelevant,
      };

      const { error } = await supabase
        .from("finance_entry")
        .update(payload)
        .eq("id", editRow.id);

      if (error) throw error;

      setEditOpen(false);
      setEditRow(null);
      clearAppDataCache();
      emitFinanceEntryChanged();
      await loadEntries();
      setNotice({ tone: "success", message: "Buchung wurde gespeichert." });
    } catch (e: unknown) {
      setNotice({ tone: "error", message: `Speichern fehlgeschlagen: ${errorMessage(e)}` });
    } finally {
      setEditSaving(false);
    }
  }

  async function updateTaxRelevant(row: EntryRow, value: boolean) {
    const objectLabel = objectLabelMap.get(row.objekt_code ?? "") ?? row.objekt_code;
    const rule = taxRuleForRow(row, objectLabel);
    if (rule.locked && value) {
      setNotice({ tone: "warning", message: rule.hint });
      setRows((current) => current.map((item) => (item.id === row.id ? { ...item, tax_relevant: false } : item)));
      return;
    }

    const nextValue = rule.locked ? false : value;
    setRows((current) => current.map((item) => (item.id === row.id ? { ...item, tax_relevant: nextValue } : item)));

    const { error } = await supabase
      .from("finance_entry")
      .update({ tax_relevant: nextValue })
      .eq("id", row.id);

    if (error) {
      setRows((current) => current.map((item) => (item.id === row.id ? { ...item, tax_relevant: row.tax_relevant } : item)));
      setNotice({ tone: "error", message: `Steuerrelevanz konnte nicht gespeichert werden: ${error.message}` });
      return;
    }

    clearAppDataCache();
    emitFinanceEntryChanged();
    setNotice({ tone: "success", message: "Steuerrelevanz wurde gespeichert." });
  }

  async function updateNkRelevant(row: EntryRow, value: boolean) {
    const rule = nkRuleForRow(row);
    let nextValue = value;
    if (rule.nkRelevant !== value) {
      const useRecommendation = window.confirm(
        `${buildNkMismatchMessage(rule, value)}\n\nOK = Empfehlung uebernehmen. Abbrechen = bewusst so speichern.`,
      );
      if (useRecommendation) nextValue = rule.nkRelevant;
    }

    setRows((current) => current.map((item) => (item.id === row.id ? { ...item, nk_relevant: nextValue } : item)));

    const { error } = await supabase
      .from("finance_entry")
      .update({ nk_relevant: nextValue })
      .eq("id", row.id);

    if (error) {
      setRows((current) => current.map((item) => (item.id === row.id ? { ...item, nk_relevant: row.nk_relevant } : item)));
      setNotice({ tone: "error", message: `NK-Relevanz konnte nicht gespeichert werden: ${error.message}` });
      return;
    }

    clearAppDataCache();
    emitFinanceEntryChanged();
    setNotice({ tone: "success", message: "Nebenkosten-Relevanz wurde gespeichert." });
  }

  async function exportYearCsv() {
    if (!Number.isFinite(year) || year < 1900 || year > 3000) {
      setNotice({ tone: "warning", message: "Bitte ein gültiges Jahr eingeben." });
      return;
    }

    const code = objektCode.trim();
    const { from, to } = yearRangeISO(year);

    try {
      setLoading(true);
      const exportRowsRaw = await fetchEntriesForRange(from, to, code);
      const exportRows = exportRowsRaw
        .sort((a, b) => compareStrings(a.booking_date, b.booking_date, "asc"))
        .map((r) => {
          const objectCode = r.objekt_code ?? "";
          const objectLabel = objectCode ? objectLabelMap.get(objectCode) ?? objectCode : "—";
          const signedAmount = r.entry_type === "expense" ? -Math.abs(r.amount) : Math.abs(r.amount);

          return {
            Datum: formatDate(r.booking_date),
            Objekt: objectLabel,
            Objektcode: objectCode || "—",
            Typ: r.entry_type === "income" ? "Einnahme" : "Ausgabe",
            Kategorie: displayFinanceCategory(r, objectLabel),
            Betrag: signedAmount.toLocaleString("de-DE", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
            Notiz: r.note?.trim() || "",
            St: effectiveTaxRelevant(r, objectLabel) ? "Ja" : "Nein",
            [NK_ABRECHNUNG_LABEL]: r.nk_relevant ? "Ja" : "Nein",
          };
        });

      const headers = ["Datum", "Objekt", "Objektcode", "Typ", "Kategorie", "Betrag", "Notiz", "St", NK_ABRECHNUNG_LABEL];
      const csv = toCsv(exportRows, headers);
      const objectPart = code && code !== "ALL" ? `${sanitizeFilenamePart(code)}_` : "alle_objekte_";
      const filename = `jahresuebersicht_${objectPart}${year}.csv`;
      downloadCsv(filename, csv);
      setNotice({ tone: "success", message: `Jahres-CSV „${filename}“ wurde erstellt.` });
    } catch (e: unknown) {
      setNotice({ tone: "error", message: `Jahres-CSV fehlgeschlagen: ${errorMessage(e)}` });
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    const exportRows = sortedRows.map((r) => {
      const objectCode = r.objekt_code ?? "";
      const objectLabel = objectCode ? objectLabelMap.get(objectCode) ?? objectCode : "—";
      const signedAmount = r.entry_type === "expense" ? -Math.abs(r.amount) : Math.abs(r.amount);

      return {
        Datum: formatDate(r.booking_date),
        Objekt: objectLabel,
        Objektcode: objectCode || "—",
        Typ: r.entry_type === "income" ? "Einnahme" : "Ausgabe",
        Kategorie: displayFinanceCategory(r, objectLabel),
        Betrag: signedAmount.toLocaleString("de-DE", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        Notiz: r.note?.trim() || "",
        St: effectiveTaxRelevant(r, objectLabel) ? "Ja" : "Nein",
        [NK_ABRECHNUNG_LABEL]: r.nk_relevant ? "Ja" : "Nein",
      };
    });

    const headers = ["Datum", "Objekt", "Objektcode", "Typ", "Kategorie", "Betrag", "Notiz", "St", NK_ABRECHNUNG_LABEL];
    const csv = toCsv(exportRows, headers);

    const monthPart = String(month).padStart(2, "0");
    const objectPart =
      objektCode !== "ALL" ? `${sanitizeFilenamePart(objektCode)}_` : "alle_objekte_";

    const filename =
      periodMode === "year"
        ? `jahresuebersicht_${objectPart}${year}_gefiltert.csv`
        : `monatsuebersicht_${objectPart}${year}_${monthPart}_gefiltert.csv`;

    downloadCsv(filename, csv);
  }

  const monthLabel = MONTHS.find((x) => x.m === month)?.label ?? String(month);
  const periodLabel = periodMode === "year" ? `Jahr ${year}` : `${monthLabel} ${year}`;
  const editResolvedCategory =
    editCategoryMode === "new"
      ? canonicalizeFinanceCategory(editCategoryCustom.trim(), editType)
      : editCategorySelect === "Ohne Kategorie"
        ? ""
        : canonicalizeFinanceCategory(editCategorySelect.trim(), editType);
  const editIsTelecommunication =
    editType === "expense" && isTelecommunicationCategory(editResolvedCategory);
  const editTelecomDetails = useMemo(() => {
    const spouseA = parseNumberInput(editTelecomSpouseA || "0");
    const spouseB = parseNumberInput(editTelecomSpouseB || "0");
    const landlineInternet = parseNumberInput(editTelecomLandlineInternet || "0");

    return calculateTelecommunicationTax({
      spouseA: Number.isFinite(spouseA) ? spouseA : 0,
      spouseB: Number.isFinite(spouseB) ? spouseB : 0,
      landlineInternet: Number.isFinite(landlineInternet) ? landlineInternet : 0,
    });
  }, [editTelecomLandlineInternet, editTelecomSpouseA, editTelecomSpouseB]);
  const editTelecomNote = editIsTelecommunication
    ? buildTelecommunicationNote({
        spouseA: editTelecomDetails.spouseA,
        spouseB: editTelecomDetails.spouseB,
        landlineInternet: editTelecomDetails.landlineInternet,
      })
    : editNote;
  const editSelectedObject = objectByValue.get(editObjectValue);
  const editTaxRule = editRow
    ? classifyTaxRelevance(
        {
          ...editRow,
          object_id: editSelectedObject
            ? isPortfolioGeneralReference(editSelectedObject.value)
              ? null
              : editSelectedObject.value
            : editRow.object_id,
          objekt_code: editSelectedObject?.objekt_code ?? editRow.objekt_code,
          entry_type: editType,
          category: editResolvedCategory,
          note: editTelecomNote,
          amount: editIsTelecommunication ? editTelecomDetails.totalAmount : editRow.amount,
        },
        editSelectedObject?.label ?? objectLabelMap.get(editRow.objekt_code ?? "") ?? editRow.objekt_code,
      )
    : null;

  useEffect(() => {
    const syncTaxRule = window.setTimeout(() => {
      if (editTaxRule?.locked && editTaxRelevant) setEditTaxRelevant(false);
    }, 0);
    return () => window.clearTimeout(syncTaxRule);
  }, [editTaxRelevant, editTaxRule?.locked]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {notice ? (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          aria-live={notice.tone === "error" ? "assertive" : "polite"}
          style={{
            border: `1px solid ${notice.tone === "success" ? "#86efac" : notice.tone === "warning" ? "#fcd34d" : "#fca5a5"}`,
            borderRadius: 14,
            background: notice.tone === "success" ? "#f0fdf4" : notice.tone === "warning" ? "#fffbeb" : "#fff1f2",
            color: notice.tone === "success" ? "#166534" : notice.tone === "warning" ? "#92400e" : "#991b1b",
            padding: "11px 14px",
            fontSize: 13,
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span>{notice.message}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Meldung schließen"
            style={{ border: 0, background: "transparent", color: "inherit", cursor: "pointer", fontSize: 18 }}
          >
            ×
          </button>
        </div>
      ) : null}
      <div
        style={{
          display: "grid",
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 6 }}>
            Buchhaltung
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Zentrale Monats- und Jahresübersicht für Einnahmen und Ausgaben. Hier filterst,
            sortierst, bearbeitest und exportierst du bestehende Buchungen.
          </div>
          <div
            style={{
              marginTop: 10,
              border: "1px solid #bbf7d0",
              borderRadius: 12,
              background: "#f0fdf4",
              color: "#166534",
              padding: "9px 11px",
              fontSize: 12,
              fontWeight: 800,
              lineHeight: 1.5,
            }}
          >
            Datensicher: Gelöschte Buchungen werden nur markiert und nicht endgültig aus der
            Datenbank entfernt.
          </div>
        </div>

        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 18,
            background: "white",
            padding: 16,
            display: "grid",
            gap: 16,
            gridTemplateColumns: "minmax(0, 1fr)",
          }}
        >
          <div
            style={{
              display: "grid",
              gap: 14,
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              alignItems: "end",
            }}
          >
            <label style={{ fontSize: 12, opacity: 0.75, fontWeight: 900, display: "grid", gap: 6 }}>
              Ansicht
              <select
                value={periodMode}
                onChange={(e) => {
                  setPeriodMode(e.target.value as PeriodMode);
                  setCurrentPage(1);
                }}
                style={{
                  width: "100%",
                  height: 46,
                  padding: "0 14px",
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  fontWeight: 800,
                  background: "white",
                }}
              >
                <option value="month">Monat</option>
                <option value="year">Ganzes Jahr</option>
              </select>
            </label>

            <label style={{ fontSize: 12, opacity: 0.75, fontWeight: 900, display: "grid", gap: 6 }}>
              Objekt
              <select
                value={objektCode}
                onChange={(e) => setObjektCode(e.target.value)}
                style={{
                  width: "100%",
                  height: 46,
                  padding: "0 14px",
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  fontWeight: 800,
                  background: "white",
                }}
              >
                <option value="ALL">Alle Objekte</option>
                {objects.map((o) => (
                  <option key={o.objekt_code} value={o.objekt_code}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ fontSize: 12, opacity: 0.75, fontWeight: 900, display: "grid", gap: 6 }}>
              Jahr
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                style={{
                  width: "100%",
                  height: 46,
                  padding: "0 14px",
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  fontWeight: 800,
                  background: "white",
                }}
              />
            </label>

            <label style={{ fontSize: 12, opacity: 0.75, fontWeight: 900, display: "grid", gap: 6 }}>
              Monat
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                disabled={periodMode === "year"}
                style={{
                  width: "100%",
                  height: 46,
                  padding: "0 14px",
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  fontWeight: 800,
                  background: periodMode === "year" ? "#f8fafc" : "white",
                  color: periodMode === "year" ? "#94a3b8" : undefined,
                  cursor: periodMode === "year" ? "not-allowed" : undefined,
                }}
              >
                {MONTHS.map((x) => (
                  <option key={x.m} value={x.m}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            <button
              onClick={() => void loadEntries()}
              disabled={loading}
              style={{
                minHeight: 46,
                padding: "0 18px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: loading ? "#f3f4f6" : "white",
                fontWeight: 900,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              Neu laden
            </button>

            <button
              onClick={exportCsv}
              disabled={loading || sortedRows.length === 0}
              style={{
                minHeight: 46,
                padding: "0 18px",
                borderRadius: 12,
                border: "1px solid #c7d2fe",
                background: loading || sortedRows.length === 0 ? "#eef2ff" : "#eef2ff",
                color: loading || sortedRows.length === 0 ? "#6366f1" : "#4338ca",
                fontWeight: 900,
                cursor: loading || sortedRows.length === 0 ? "not-allowed" : "pointer",
              }}
              title="Aktuell gefilterte und sortierte Tabelle als CSV exportieren"
            >
              {periodMode === "year" ? "Gefilterte Jahres-CSV" : "Gefilterte Monats-CSV"}
            </button>

            <button
              onClick={() => void exportYearCsv()}
              disabled={loading}
              style={{
                minHeight: 46,
                padding: "0 18px",
                borderRadius: 12,
                border: "1px solid #0f172a",
                background: loading ? "#e2e8f0" : "#0f172a",
                color: loading ? "#64748b" : "white",
                fontWeight: 900,
                cursor: loading ? "not-allowed" : "pointer",
              }}
              title={objektCode === "ALL" ? "CSV für alle Objekte des gewählten Jahres exportieren" : "CSV für das gewählte Objekt im ganzen Jahr exportieren"}
            >
              Jahres-CSV exportieren
            </button>
          </div>
        </div>
      </div>

      {err && (
        <div
          style={{
            border: "1px solid #fecaca",
            background: "#fff1f2",
            color: "#7f1d1d",
            padding: 12,
            borderRadius: 12,
            whiteSpace: "pre-wrap",
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          {err}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
        }}
      >
        <StatCard title="Einnahmen" value={totals.income} loading={loading} />
        <StatCard title="Ausgaben" value={totals.expense} loading={loading} />
        <StatCard title="Netto" value={totals.net} loading={loading} />
      </div>

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          background: "white",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: 12,
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontWeight: 950 }}>Buchungen im {periodMode === "year" ? "Jahr" : "Monat"} ({periodLabel})</div>
            <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 800, marginTop: 3 }}>
              Alle geladenen Buchungen koennen weiter nach Immobilie, Kategorie, Typ, Notiz, Datum und Gruppierung gefiltert werden.
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => applyPreset("rent")} style={{ padding: "8px 10px", borderRadius: 999, border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#166534", fontWeight: 900, cursor: "pointer" }}>Miete</button>
            <button onClick={() => applyPreset("capex")} style={{ padding: "8px 10px", borderRadius: 999, border: "1px solid #fed7aa", background: "#fff7ed", color: "#9a3412", fontWeight: 900, cursor: "pointer" }}>Capex</button>
            <button onClick={() => applyPreset("expenses")} style={{ padding: "8px 10px", borderRadius: 999, border: "1px solid #fecaca", background: "#fff1f2", color: "#991b1b", fontWeight: 900, cursor: "pointer" }}>Ausgaben</button>
            <button onClick={() => applyPreset("income")} style={{ padding: "8px 10px", borderRadius: 999, border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", fontWeight: 900, cursor: "pointer" }}>Einnahmen</button>
            <button onClick={() => applyPreset("reset")} style={{ padding: "8px 10px", borderRadius: 999, border: "1px solid #e5e7eb", background: "white", color: "#334155", fontWeight: 900, cursor: "pointer" }}>Zurücksetzen</button>
          </div>
        </div>

        <div
          style={{
            padding: 12,
            borderBottom: "1px solid #e5e7eb",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            background: "#fcfcfd",
          }}
        >
          <label style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>
            Suche
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Kategorie, Notiz, Objekt, Typ, Datum"
              style={{
                marginTop: 6,
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                fontWeight: 700,
              }}
            />
          </label>

          <label style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>
            Ansicht
            <select
              value={periodMode}
              onChange={(e) => {
                setPeriodMode(e.target.value as PeriodMode);
                setCurrentPage(1);
              }}
              style={{
                marginTop: 6,
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                fontWeight: 700,
                background: "white",
              }}
            >
              <option value="month">Monat</option>
              <option value="year">Ganzes Jahr</option>
            </select>
          </label>

          <label style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>
            Typ
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
              style={{
                marginTop: 6,
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                fontWeight: 700,
                background: "white",
              }}
            >
              <option value="all">Alle Typen</option>
              <option value="income">Nur Einnahmen</option>
              <option value="expense">Nur Ausgaben</option>
            </select>
          </label>

          <label style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>
            Kategorie
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{
                marginTop: 6,
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                fontWeight: 700,
                background: "white",
              }}
            >
              <option value="ALL">Alle Kategorien</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>
            Zeilen pro Seite
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              style={{
                marginTop: 6,
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                fontWeight: 700,
                background: "white",
              }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>


          <label style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>
            Gruppierung
            <select
              value={groupMode}
              onChange={(e) => setGroupMode(e.target.value as GroupMode)}
              style={{
                marginTop: 6,
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                fontWeight: 700,
                background: "white",
              }}
            >
              <option value="none">Keine Gruppierung</option>
              <option value="object">Nach Objekt</option>
              <option value="category">Nach Kategorie</option>
              <option value="type">Nach Einnahme/Ausgabe</option>
            </select>
          </label>
        </div>

        <div
          style={{
            padding: "10px 12px",
            borderBottom: "1px solid #e5e7eb",
            fontSize: 12,
            opacity: 0.75,
            fontWeight: 800,
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span>Treffer: {sortedRows.length} · Netto gefiltert: {formatEUR(totals.net)}</span>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {selectedKeys.length > 0 && (
              <span style={{ padding: "6px 10px", borderRadius: 999, background: "#f8fafc", border: "1px solid #e2e8f0", color: selectedTotals.net < 0 ? "#991b1b" : "#166534" }}>
                Auswahl: {selectedKeys.length} · Netto {formatEUR(selectedTotals.net)}
              </span>
            )}
            <span>
              Anzeige: {pageStart}–{pageEnd} von {sortedRows.length}
            </span>

            <button
              onClick={() => void deleteSelectedEntries()}
              disabled={selectedKeys.length === 0 || bulkDeleting}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background:
                  selectedKeys.length === 0 || bulkDeleting ? "#f3f4f6" : "white",
                fontWeight: 900,
                cursor:
                  selectedKeys.length === 0 || bulkDeleting ? "not-allowed" : "pointer",
              }}
              title="Alle ausgewählten Buchungen löschen"
            >
              {bulkDeleting
                ? "Löscht…"
                : `Auswahl löschen${selectedKeys.length > 0 ? ` (${selectedKeys.length})` : ""}`}
            </button>
          </div>
        </div>

        {groupMode !== "none" && (
          <div style={{ padding: 12, borderBottom: "1px solid #e5e7eb", background: "#f8fafc" }}>
            <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.75, marginBottom: 8 }}>Gruppierte Zusammenfassung</div>
            <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 12, background: "white" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f1f5f9" }}>
                    <th style={{ textAlign: "left", padding: 10 }}>Gruppe</th>
                    <th style={{ textAlign: "right", padding: 10 }}>Zeilen</th>
                    <th style={{ textAlign: "right", padding: 10 }}>Einnahmen</th>
                    <th style={{ textAlign: "right", padding: 10 }}>Ausgaben</th>
                    <th style={{ textAlign: "right", padding: 10 }}>Netto</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedSummaries.map((group) => (
                    <tr key={group.label} style={{ borderTop: "1px solid #e2e8f0" }}>
                      <td style={{ padding: 10, fontWeight: 900 }}>{group.label}</td>
                      <td style={{ padding: 10, textAlign: "right", fontWeight: 800 }}>{group.count}</td>
                      <td style={{ padding: 10, textAlign: "right", color: "#166534", fontWeight: 900 }}>{formatEUR(group.income)}</td>
                      <td style={{ padding: 10, textAlign: "right", color: "#991b1b", fontWeight: 900 }}>{formatEUR(group.expense)}</td>
                      <td style={{ padding: 10, textAlign: "right", color: group.net < 0 ? "#991b1b" : "#166534", fontWeight: 950 }}>{formatEUR(group.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ overflowX: "auto", maxHeight: 680 }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr style={{ background: "#f9fafb", position: "sticky", top: 0, zIndex: 2, boxShadow: "0 1px 0 #e5e7eb" }}>
                <th style={{ padding: 10, width: 42, textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someVisibleSelected;
                    }}
                    onChange={toggleSelectVisibleRows}
                    title="Alle sichtbaren Zeilen auswählen"
                  />
                </th>

                <SortableHeader
                  label="Datum"
                  sortKey="booking_date"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onClick={toggleSort}
                />
                <SortableHeader
                  label="Objekt"
                  sortKey="objekt_code"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onClick={toggleSort}
                />
                <SortableHeader
                  label="Typ"
                  sortKey="entry_type"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onClick={toggleSort}
                />
                <SortableHeader
                  label="Kategorie"
                  sortKey="category"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onClick={toggleSort}
                />
                <SortableHeader
                  label="Betrag"
                  sortKey="amount"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onClick={toggleSort}
                  align="right"
                />
                <th style={{ textAlign: "left", padding: 10, fontSize: 12, opacity: 0.75 }}>
                  Notiz
                </th>
                <th style={{ textAlign: "center", padding: 10, fontSize: 12, opacity: 0.75 }}>
                  St.
                </th>
                <th style={{ textAlign: "center", padding: 10, fontSize: 12, opacity: 0.75 }}>
                  {NK_ABRECHNUNG_LABEL}
                </th>
                <th style={{ padding: 10, width: 140 }} />
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} style={{ padding: 12, opacity: 0.7 }}>
                    Lädt…
                  </td>
                </tr>
              ) : paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: 12, opacity: 0.7 }}>
                    Keine Einträge für die aktuelle Filterung.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((r) => {
                  const isIncome = r.entry_type === "income";
                  const objectCode = r.objekt_code ?? "";
                  const objectLabel = objectCode ? objectLabelMap.get(objectCode) ?? objectCode : "—";
                  const key = rowSelectionKey(r);
                  const checked = selectedKeys.includes(key);

                  return (
                    <tr key={key} style={{ borderTop: "1px solid #e5e7eb" }}>
                      <td style={{ padding: 10, textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRowSelection(r)}
                          title="Zeile auswählen"
                        />
                      </td>

                      <td style={{ padding: 10, fontWeight: 800, whiteSpace: "nowrap" }}>
                        {formatDate(r.booking_date)}
                      </td>

                      <td style={{ padding: 10, fontWeight: 700, whiteSpace: "nowrap" }}>
                        {objectLabel}
                      </td>

                      <td style={{ padding: 10, whiteSpace: "nowrap" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "4px 8px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 800,
                            background: isIncome ? "#ecfdf5" : "#fef2f2",
                            color: isIncome ? "#166534" : "#991b1b",
                          }}
                        >
                          {isIncome ? "Einnahme" : "Ausgabe"}
                        </span>
                      </td>

                      <td style={{ padding: 10 }}>
                        {displayFinanceCategory(r, objectLabel)}
                      </td>

                      <td
                        style={{
                          padding: 10,
                          textAlign: "right",
                          fontWeight: 900,
                          color: isIncome ? "#166534" : "#991b1b",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {isIncome ? formatEUR(r.amount) : `-${formatEUR(r.amount)}`}
                      </td>

                      <td
                        style={{
                          padding: 10,
                          opacity: r.note ? 0.9 : 0.6,
                          maxWidth: 280,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={r.note ?? ""}
                      >
                        {r.note?.trim() || "—"}
                      </td>

                      <td style={{ padding: 10, textAlign: "center", whiteSpace: "nowrap" }}>
                        <input
                          type="checkbox"
                          checked={effectiveTaxRelevant(r, objectLabel)}
                          disabled={taxRuleForRow(r, objectLabel).locked}
                          onChange={(event) => void updateTaxRelevant(r, event.target.checked)}
                          title={taxRuleForRow(r, objectLabel).hint || "Steuerrelevant Ja/Nein"}
                          style={{ width: 18, height: 18 }}
                        />
                      </td>

                      <td style={{ padding: 10, textAlign: "center", whiteSpace: "nowrap" }}>
                        <input
                          type="checkbox"
                          checked={Boolean(r.nk_relevant)}
                          onChange={(event) => void updateNkRelevant(r, event.target.checked)}
                          title="Nebenkostenabrechnung relevant Ja/Nein"
                          style={{ width: 18, height: 18 }}
                        />
                      </td>

                      <td style={{ padding: 10, textAlign: "right", whiteSpace: "nowrap" }}>
                        <button
                          onClick={() => openEdit(r)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                            background: "white",
                            fontWeight: 900,
                            cursor: "pointer",
                            marginRight: 8,
                          }}
                          title="Bearbeiten"
                        >
                          ✏️
                        </button>

                        <button
                          onClick={() => void deleteEntry(r.id)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                            background: "white",
                            fontWeight: 900,
                            cursor: "pointer",
                          }}
                          title="Löschen"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr style={{ background: "#f8fafc", position: "sticky", bottom: 0, zIndex: 1, boxShadow: "0 -1px 0 #e5e7eb" }}>
                <td colSpan={5} style={{ padding: 10, textAlign: "right", fontWeight: 950 }}>Summe gefiltert</td>
                <td style={{ padding: 10, textAlign: "right", fontWeight: 950, color: totals.net < 0 ? "#991b1b" : "#166534", whiteSpace: "nowrap" }}>
                  {formatEUR(totals.net)}
                </td>
                <td colSpan={4} style={{ padding: 10, fontSize: 12, opacity: 0.7 }}>
                  Einnahmen {formatEUR(totals.income)} · Ausgaben {formatEUR(totals.expense)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            padding: 12,
            borderTop: "1px solid #e5e7eb",
            flexWrap: "wrap",
            background: "#fcfcfd",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.75 }}>
            Seite {currentPage} von {totalPages}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: currentPage <= 1 ? "#f3f4f6" : "white",
                fontWeight: 900,
                cursor: currentPage <= 1 ? "not-allowed" : "pointer",
              }}
            >
              Zurück
            </button>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: currentPage >= totalPages ? "#f3f4f6" : "white",
                fontWeight: 900,
                cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
              }}
            >
              Weiter
            </button>
          </div>
        </div>
      </div>

      <Modal
        open={editOpen}
        title={editRow ? `Buchung bearbeiten (#${editRow.id})` : "Buchung bearbeiten"}
        onClose={() => {
          if (editSaving) return;
          setEditOpen(false);
          setEditRow(null);
        }}
      >
        <div style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            <label style={{ fontSize: 12, fontWeight: 900, opacity: 0.75 }}>
              Typ
              <select
                value={editType}
                onChange={(e) => setEditType(e.target.value as EntryType)}
                style={{
                  marginTop: 6,
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  fontWeight: 800,
                  background: "white",
                }}
              >
                <option value="income">Einnahme</option>
                <option value="expense">Ausgabe</option>
              </select>
            </label>

            <label style={{ fontSize: 12, fontWeight: 900, opacity: 0.75 }}>
              Objekt / Zuordnung
              <select
                value={editObjectValue}
                onChange={(e) => setEditObjectValue(e.target.value)}
                style={{
                  marginTop: 6,
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  fontWeight: 800,
                  background: "white",
                }}
              >
                <option value="">Bitte auswählen</option>
                {objects.map((object) => (
                  <option key={`${object.value}-${object.objekt_code}`} value={object.value}>
                    {object.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ fontSize: 12, fontWeight: 900, opacity: 0.75 }}>
              Datum
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                style={{
                  marginTop: 6,
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  fontWeight: 800,
                }}
              />
            </label>

            <label style={{ fontSize: 12, fontWeight: 900, opacity: 0.75 }}>
              Betrag
              <input
                value={
                  editIsTelecommunication
                    ? editTelecomDetails.totalAmount.toLocaleString("de-DE", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : editAmount
                }
                onChange={(e) => setEditAmount(e.target.value)}
                placeholder={editIsTelecommunication ? "Automatisch aus Einzelbeträgen" : "z. B. 123,45"}
                readOnly={editIsTelecommunication}
                style={{
                  marginTop: 6,
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  fontWeight: 800,
                  background: editIsTelecommunication ? "#f8fafc" : "white",
                }}
              />
            </label>

            <div style={{ display: "grid", gap: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 900, opacity: 0.75 }}>
                Kategorie
                <select
                  value={editCategoryMode === "new" ? "__NEW__" : editCategorySelect}
                  onChange={(e) => {
                    const value = e.target.value;

                    if (value === "__NEW__") {
                      setEditCategoryMode("new");
                      setEditCategorySelect("__NEW__");
                      setEditCategoryCustom("");
                      return;
                    }

                    setEditCategoryMode("existing");
                    setEditCategorySelect(value);
                    setEditCategoryCustom("");
                  }}
                  style={{
                    marginTop: 6,
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    fontWeight: 800,
                    background: "white",
                  }}
                >
                  <option value="Ohne Kategorie">Ohne Kategorie</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                  <option value="__NEW__">Neue Kategorie…</option>
                </select>
              </label>

              {editCategoryMode === "new" && (
                <label style={{ fontSize: 12, fontWeight: 900, opacity: 0.75 }}>
                  Neue Kategorie
                  <input
                    value={editCategoryCustom}
                    onChange={(e) => setEditCategoryCustom(e.target.value)}
                    placeholder="Neue Kategorie eingeben"
                    style={{
                      marginTop: 6,
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      fontWeight: 800,
                    }}
                  />
                </label>
              )}
            </div>
          </div>

          {editIsTelecommunication ? (
            <div
              style={{
                border: "1px solid #bfdbfe",
                borderRadius: 14,
                background: "#eff6ff",
                padding: 12,
                display: "grid",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 950, color: "#1e3a8a" }}>
                  Handy & Internet separat bearbeiten
                </div>
                <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: "#475569", lineHeight: 1.45 }}>
                  Gesamtbetrag und steuerlicher Anteil werden aus diesen drei Feldern automatisch berechnet.
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 10,
                }}
              >
                <label style={{ fontSize: 12, fontWeight: 900, color: "#334155" }}>
                  Mobilfunk Ehepartner A
                  <input
                    value={editTelecomSpouseA}
                    onChange={(e) => setEditTelecomSpouseA(e.target.value)}
                    placeholder="0,00"
                    inputMode="decimal"
                    style={{
                      marginTop: 6,
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid #cbd5e1",
                      fontWeight: 850,
                      background: "white",
                    }}
                  />
                </label>

                <label style={{ fontSize: 12, fontWeight: 900, color: "#334155" }}>
                  Mobilfunk Ehepartner B
                  <input
                    value={editTelecomSpouseB}
                    onChange={(e) => setEditTelecomSpouseB(e.target.value)}
                    placeholder="0,00"
                    inputMode="decimal"
                    style={{
                      marginTop: 6,
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid #cbd5e1",
                      fontWeight: 850,
                      background: "white",
                    }}
                  />
                </label>

                <label style={{ fontSize: 12, fontWeight: 900, color: "#334155" }}>
                  Festnetz & Internet
                  <input
                    value={editTelecomLandlineInternet}
                    onChange={(e) => setEditTelecomLandlineInternet(e.target.value)}
                    placeholder="0,00"
                    inputMode="decimal"
                    style={{
                      marginTop: 6,
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid #cbd5e1",
                      fontWeight: 850,
                      background: "white",
                    }}
                  />
                </label>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    border: "1px solid #dbeafe",
                    borderRadius: 12,
                    background: "white",
                    padding: 10,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: 1.5, color: "#64748b" }}>
                    GESAMT
                  </div>
                  <div style={{ marginTop: 4, fontSize: 18, fontWeight: 950, color: "#0f172a" }}>
                    {formatEUR(editTelecomDetails.totalAmount)}
                  </div>
                </div>
                <div
                  style={{
                    border: "1px solid #bbf7d0",
                    borderRadius: 12,
                    background: "#f0fdf4",
                    padding: 10,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: 1.5, color: "#166534" }}>
                    STEUERLICH ABSETZBAR
                  </div>
                  <div style={{ marginTop: 4, fontSize: 18, fontWeight: 950, color: "#166534" }}>
                    {formatEUR(editTelecomDetails.deductibleTotal)}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <label style={{ fontSize: 12, fontWeight: 900, opacity: 0.75 }}>
            {editIsTelecommunication ? "Automatische Steuer-Notiz" : "Notiz"}
            <input
              value={editIsTelecommunication ? editTelecomNote : editNote}
              onChange={(e) => setEditNote(e.target.value)}
              readOnly={editIsTelecommunication}
              style={{
                marginTop: 6,
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                fontWeight: 800,
                background: editIsTelecommunication ? "#f8fafc" : "white",
              }}
            />
          </label>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                fontSize: 13,
                fontWeight: 900,
                padding: "10px 12px",
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                background: "#f8fafc",
              }}
            >
              <input
                type="checkbox"
                checked={editTaxRelevant}
                disabled={Boolean(editTaxRule?.locked)}
                onChange={(event) => setEditTaxRelevant(editTaxRule?.locked ? false : event.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              St.
            </label>
            {editTaxRule?.hint ? (
              <span style={{ flexBasis: "100%", fontSize: 12, fontWeight: 800, color: editTaxRule.locked ? "#9f1239" : "#64748b" }}>
                {editTaxRule.hint}
              </span>
            ) : null}
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                fontSize: 13,
                fontWeight: 900,
                padding: "10px 12px",
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                background: "#f8fafc",
              }}
            >
              <input
                type="checkbox"
                checked={editNkRelevant}
                onChange={(event) => setEditNkRelevant(event.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              {NK_ABRECHNUNG_LABEL}
            </label>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => void saveEdit()}
              disabled={editSaving || !editRow}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: editSaving ? "#f3f4f6" : "white",
                fontWeight: 900,
                cursor: editSaving ? "not-allowed" : "pointer",
              }}
            >
              {editSaving ? "Speichert…" : "Änderungen speichern"}
            </button>

            <button
              onClick={() => {
                if (editSaving) return;
                setEditOpen(false);
                setEditRow(null);
              }}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "white",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Abbrechen
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
