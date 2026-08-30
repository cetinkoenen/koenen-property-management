import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { AutomationAnalytics } from "./Automatisierung";
import { useAppData } from "@/state/AppDataContext";
import { buildMasterFinanceSnapshots, buildMasterTotals } from "@/services/masterDataService";
import { useBackendFinanceMaster } from "@/hooks/useBackendFinanceMaster";
import {
  deletePropertyDocument,
  getPropertyDocumentSignedUrl,
  getPropertyDocumentSummary,
  listPropertyDocuments,
  uploadPropertyDocument,
  type PropertyDocumentCategory,
  type PropertyDocumentRow,
} from "@/services/documentArchiveService";
import { listPropertyTasks, savePropertyTask, completePropertyTask, getPropertyTaskSummary, type PropertyTaskRow, type PropertyTaskPriority } from "@/services/workflowTaskService";
import { listAuditLogs, recordAuditLog, type AuditLogEntry } from "@/services/auditLogService";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  BarChart,
  Bar,
  LabelList,
} from "recharts";

type EntryType = "income" | "expense";

type EntryRow = {
  id: number;
  objekt_code: string;
  booking_date: string;
  amount: number;
  category: string | null;
  note: string | null;
};

type DropdownRow = {
  objekt_code: string;
  label: string;
};

type UnifiedEntryRow = EntryRow & {
  entry_type: EntryType;
};

type PieRow = {
  name: string;
  value: number;
};

type MonthlyRow = {
  month: string;
  income: number;
  expense: number;
  net: number;
};

type ObjectNetRow = {
  object: string;
  income: number;
  expense: number;
  net: number;
};

type ExpenseCategoryTableRow = {
  name: string;
  value: number;
  share: number;
};

type TopTransactionRow = {
  id: number;
  booking_date: string;
  objekt_code: string;
  entry_type: EntryType;
  category: string | null;
  note: string | null;
  amount: number;
};

type FinanceEntryViewRow = EntryRow & {
  entry_type: EntryType;
};

type AuswertungView =
  | "cockpit"
  | "backend5b"
  | "business"
  | "single-source"
  | "stability"
  | "automation"
  | "reporting4d"
  | "reporting"
  | "finanzen"
  | "objektjahr";

const AUSWERTUNG_NAV: Array<{
  key: AuswertungView;
  label: string;
}> = [
  { key: "cockpit", label: "Objektakte & Workflows" },
  { key: "finanzen", label: "Finanzanalyse" },
  { key: "objektjahr", label: "Objekt-Jahresübersicht" },
  { key: "business", label: "Business Intelligence 4C" },
  { key: "backend5b", label: "Backend 5B" },
  { key: "single-source", label: "Single Source 3A" },
  { key: "stability", label: "Stabilität 3B" },
  { key: "automation", label: "Automatisierung 2B" },
  { key: "reporting4d", label: "Reporting/PDF 4D" },
  { key: "reporting", label: "Archiv 2C" },
];

const AUSWERTUNG_VIEW_KEYS = new Set<AuswertungView>(AUSWERTUNG_NAV.map((item) => item.key));

function mapFinanceEntryRows(rows: unknown[]): FinanceEntryViewRow[] {
  return rows.map((row) => {
    const item = row as Partial<FinanceEntryViewRow>;
    return {
      id: Number(item.id ?? 0),
      objekt_code: String(item.objekt_code ?? ""),
      booking_date: String(item.booking_date ?? ""),
      amount: Number(item.amount ?? 0),
      category: item.category ?? null,
      note: item.note ?? null,
      entry_type: item.entry_type === "expense" ? "expense" : "income",
    };
  });
}

function splitFinanceEntries(rows: FinanceEntryViewRow[]) {
  return {
    incomeRows: rows.filter((row) => row.entry_type === "income"),
    expenseRows: rows.filter((row) => row.entry_type === "expense"),
  };
}

const PIE_COLORS = [
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#ea580c",
  "#4f46e5",
  "#65a30d",
  "#be123c",
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

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatMonthLabel(yyyyMm: string) {
  const [year, month] = yyyyMm.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);

  if (Number.isNaN(date.getTime())) return yyyyMm;

  return new Intl.DateTimeFormat("de-DE", {
    month: "short",
    year: "2-digit",
  }).format(date);
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
      <div style={{ fontSize: 17, fontWeight: 900, marginTop: 6 }}>
        {loading ? <InlineSkeleton width={96} height={22} /> : formatEUR(value)}
      </div>
    </div>
  );
}


function InlineSkeleton({ width = 120, height = 18 }: { width?: number; height?: number }) {
  return (
    <span
      aria-label="Lädt"
      style={{
        display: "inline-block",
        width,
        height,
        borderRadius: 999,
        background: "linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 45%, #f8fafc 100%)",
        verticalAlign: "middle",
      }}
    />
  );
}

function StabilityNotice({ tone = "blue", title, text }: { tone?: "green" | "blue" | "amber" | "red" | "slate"; title: string; text: string }) {
  const colors: Record<string, { bg: string; border: string; text: string }> = {
    green: { bg: "#ecfdf5", border: "#bbf7d0", text: "#047857" },
    blue: { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8" },
    amber: { bg: "#fffbeb", border: "#fde68a", text: "#b45309" },
    red: { bg: "#fff1f2", border: "#fecdd3", text: "#be123c" },
    slate: { bg: "#f8fafc", border: "#e2e8f0", text: "#475569" },
  };
  const c = colors[tone];
  return (
    <div style={{ border: `1px solid ${c.border}`, background: c.bg, color: c.text, borderRadius: 18, padding: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 950 }}>{title}</div>
      <div style={{ marginTop: 4, fontSize: 12, fontWeight: 750, lineHeight: 1.45 }}>{text}</div>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 14,
        background: "white",
      }}
    >
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
        {subtitle ? (
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{subtitle}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}



function SmallStatusPill({ tone, children }: { tone: "green" | "blue" | "amber" | "red" | "slate"; children: ReactNode }) {
  const colors: Record<string, { bg: string; border: string; text: string }> = {
    green: { bg: "#ecfdf5", border: "#bbf7d0", text: "#047857" },
    blue: { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8" },
    amber: { bg: "#fffbeb", border: "#fde68a", text: "#b45309" },
    red: { bg: "#fff1f2", border: "#fecdd3", text: "#be123c" },
    slate: { bg: "#f8fafc", border: "#e2e8f0", text: "#475569" },
  };
  const color = colors[tone];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        border: `1px solid ${color.border}`,
        background: color.bg,
        color: color.text,
        padding: "4px 8px",
        fontSize: 10,
        fontWeight: 950,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function CompactKpi({ label, value, tone = "slate" }: { label: string; value: string; tone?: "green" | "blue" | "amber" | "red" | "slate" }) {
  const toneColor: Record<string, string> = {
    green: "#047857",
    blue: "#1d4ed8",
    amber: "#b45309",
    red: "#be123c",
    slate: "#0f172a",
  };

  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 14,
        background: "rgba(255,255,255,0.82)",
        padding: "9px 10px",
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 13, fontWeight: 950, color: toneColor[tone], overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

function WorkflowCenterCard() {
  const workflows = [
    { title: "Datenqualität", text: "Test-/RLS-/Trigger-Objekte werden ausgeblendet; gleiche Kennzahlen sollen aus denselben Quellen kommen.", tone: "blue" as const },
    { title: "Mietcheck", text: "Mietstatus und Zahlungsauffälligkeiten bleiben in der Objekt-Jahresübersicht gebündelt.", tone: "green" as const },
    { title: "Reporting", text: "Monats-, Jahres- und Objektberichte können später direkt aus dieser Struktur als PDF erzeugt werden.", tone: "amber" as const },
    { title: "Dokumente", text: "Objektakte bleibt der zentrale Ort für Exposé, Darlehens- und Nebenkostenunterlagen.", tone: "slate" as const },
  ];

  return (
    <SectionCard title="Professionelles Kontrollzentrum" subtitle="Nächste Ausbaustufe: klare Workflows, Datenqualität, Reporting und Dokumentenlogik an einer Stelle.">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
        {workflows.map((item) => (
          <div key={item.title} style={{ border: "1px solid #e2e8f0", borderRadius: 18, padding: 14, background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)" }}>
            <SmallStatusPill tone={item.tone}>{item.title}</SmallStatusPill>
            <div style={{ marginTop: 10, color: "#64748b", fontSize: 12, lineHeight: 1.45 }}>{item.text}</div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function EmptyChartHint({ text }: { text: string }) {
  return (
    <div style={{ padding: 14, fontSize: 13, opacity: 0.75 }}>
      {text}
    </div>
  );
}

function PieSection({
  title,
  data,
}: {
  title: string;
  data: PieRow[];
}) {
  const hasData = data.some((d) => d.value > 0);

  return (
    <SectionCard title={title}>
      {!hasData ? (
        <EmptyChartHint text="Keine Daten für das Kreisdiagramm vorhanden." />
      ) : (
        <div style={{ width: "100%", height: 340 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                outerRadius={110}
                innerRadius={58}
                paddingAngle={2}
                label={(entry) => entry.name}
              >
                {data.map((_, idx) => (
                  <Cell
                    key={idx}
                    fill={PIE_COLORS[idx % PIE_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip formatter={(v) => formatEUR(Number(v))} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </SectionCard>
  );
}

function MonthlyLineSection({
  data,
}: {
  data: MonthlyRow[];
}) {
  const hasData = data.length > 0;

  return (
    <SectionCard
      title="Cashflow-Entwicklung"
      subtitle="Einnahmen, Ausgaben und Netto pro Monat im gewählten Zeitraum."
    >
      {!hasData ? (
        <EmptyChartHint text="Keine Monatsdaten für die Zeitreihe vorhanden." />
      ) : (
        <div style={{ width: "100%", height: 340 }}>
          <ResponsiveContainer>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(v) => formatEUR(Number(v))} />
              <Legend />
              <Line
                type="monotone"
                dataKey="income"
                name="Einnahmen"
                stroke="#16a34a"
                strokeWidth={2.5}
              />
              <Line
                type="monotone"
                dataKey="expense"
                name="Ausgaben"
                stroke="#dc2626"
                strokeWidth={2.5}
              />
              <Line
                type="monotone"
                dataKey="net"
                name="Netto"
                stroke="#2563eb"
                strokeWidth={2.5}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </SectionCard>
  );
}

function ExpenseCategoryBarSection({
  data,
}: {
  data: PieRow[];
}) {
  const hasData = data.length > 0;

  return (
    <SectionCard
      title="Ausgaben nach Kategorie"
      subtitle="Detaillierte Kostenstruktur im gewählten Zeitraum."
    >
      {!hasData ? (
        <EmptyChartHint text="Keine Ausgaben-Kategorien für den Balkenvergleich vorhanden." />
      ) : (
        <div style={{ width: "100%", height: Math.max(320, data.length * 52) }}>
          <ResponsiveContainer>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 8, right: 60, left: 24, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis
                type="category"
                dataKey="name"
                width={160}
                tick={{ fontSize: 12 }}
              />
              <Tooltip formatter={(v) => formatEUR(Number(v))} />
              <Legend />
              <Bar
                dataKey="value"
                name="Ausgaben"
                fill="#dc2626"
                radius={[0, 6, 6, 0]}
              >
                <LabelList
                  dataKey="value"
                  position="right"
                  formatter={(value) => formatEUR(Number(value ?? 0))}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </SectionCard>
  );
}

function ExpenseCategoryTableSection({
  data,
}: {
  data: ExpenseCategoryTableRow[];
}) {
  const hasData = data.length > 0;

  return (
    <SectionCard
      title="Kostenstruktur im Detail"
      subtitle="Exakte Beträge und Anteile je Ausgaben-Kategorie."
    >
      {!hasData ? (
        <EmptyChartHint text="Keine Ausgaben-Daten für die Detailtabelle vorhanden." />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 14,
            }}
          >
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                <th
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    borderBottom: "1px solid #e5e7eb",
                    fontWeight: 900,
                  }}
                >
                  Kategorie
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "10px 12px",
                    borderBottom: "1px solid #e5e7eb",
                    fontWeight: 900,
                  }}
                >
                  Betrag
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "10px 12px",
                    borderBottom: "1px solid #e5e7eb",
                    fontWeight: 900,
                  }}
                >
                  Anteil
                </th>
              </tr>
            </thead>

            <tbody>
              {data.map((row) => (
                <tr key={row.name}>
                  <td
                    style={{
                      padding: "10px 12px",
                      borderBottom: "1px solid #f1f5f9",
                      fontWeight: 700,
                    }}
                  >
                    {row.name}
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      borderBottom: "1px solid #f1f5f9",
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatEUR(row.value)}
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      borderBottom: "1px solid #f1f5f9",
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {row.share.toFixed(1)} %
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function ObjectNetBarSection({
  data,
}: {
  data: ObjectNetRow[];
}) {
  const hasData = data.length > 0;

  return (
    <SectionCard
      title="Netto pro Objekt"
      subtitle="Vergleich der Objektperformance im gewählten Zeitraum."
    >
      {!hasData ? (
        <EmptyChartHint text="Keine Objektdaten für den Vergleich vorhanden." />
      ) : (
        <div style={{ width: "100%", height: 340 }}>
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="object" />
              <YAxis />
              <Tooltip formatter={(v) => formatEUR(Number(v))} />
              <Legend />
              <Bar dataKey="net" name="Netto" fill="#2563eb" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </SectionCard>
  );
}

function TopTransactionsSection({
  data,
}: {
  data: TopTransactionRow[];
}) {
  const hasData = data.length > 0;

  return (
    <SectionCard
      title="Top-Transaktionen"
      subtitle="Größte Einzelbuchungen im gewählten Zeitraum."
    >
      {!hasData ? (
        <EmptyChartHint text="Keine Buchungen für die Top-Transaktionen vorhanden." />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 14,
            }}
          >
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                <th
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    borderBottom: "1px solid #e5e7eb",
                    fontWeight: 900,
                  }}
                >
                  Datum
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    borderBottom: "1px solid #e5e7eb",
                    fontWeight: 900,
                  }}
                >
                  Objekt
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    borderBottom: "1px solid #e5e7eb",
                    fontWeight: 900,
                  }}
                >
                  Typ
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    borderBottom: "1px solid #e5e7eb",
                    fontWeight: 900,
                  }}
                >
                  Kategorie
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    borderBottom: "1px solid #e5e7eb",
                    fontWeight: 900,
                  }}
                >
                  Notiz
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "10px 12px",
                    borderBottom: "1px solid #e5e7eb",
                    fontWeight: 900,
                  }}
                >
                  Betrag
                </th>
              </tr>
            </thead>

            <tbody>
              {data.map((row) => {
                const isIncome = row.entry_type === "income";

                return (
                  <tr key={`${row.entry_type}-${row.id}`}>
                    <td
                      style={{
                        padding: "10px 12px",
                        borderBottom: "1px solid #f1f5f9",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatDate(row.booking_date)}
                    </td>

                    <td
                      style={{
                        padding: "10px 12px",
                        borderBottom: "1px solid #f1f5f9",
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.objekt_code || "—"}
                    </td>

                    <td
                      style={{
                        padding: "10px 12px",
                        borderBottom: "1px solid #f1f5f9",
                        whiteSpace: "nowrap",
                      }}
                    >
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

                    <td
                      style={{
                        padding: "10px 12px",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      {row.category?.trim() || "Ohne Kategorie"}
                    </td>

                    <td
                      style={{
                        padding: "10px 12px",
                        borderBottom: "1px solid #f1f5f9",
                        maxWidth: 280,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        opacity: row.note ? 1 : 0.6,
                      }}
                      title={row.note || ""}
                    >
                      {row.note?.trim() || "—"}
                    </td>

                    <td
                      style={{
                        padding: "10px 12px",
                        borderBottom: "1px solid #f1f5f9",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: 900,
                        color: isIncome ? "#166534" : "#991b1b",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isIncome ? formatEUR(row.amount) : `-${formatEUR(row.amount)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}


type PortfolioPropertyNavRow = {
  id: string;
  name: string | null;
  core_property_id?: string | null;
  ledgerPropertyId?: string;
};

type LoanTrendPoint = {
  year: number;
  balance: number;
};

type LoanTrendRow = {
  property_id: string | null;
  year: unknown;
  balance: unknown;
};

type LoanDashboardTrendRow = {
  property_id: string | null;
  property_name?: string | null;
  first_year?: unknown;
  last_year?: unknown;
  last_balance?: unknown;
  principal_total?: unknown;
};

type FinanceModuleLink = {
  label: string;
  description: string;
  to: (propertyId: string) => string;
};

const FINANCE_MODULE_LINKS: FinanceModuleLink[] = [
  {
    label: "Darlehensübersicht / Edit",
    description: "Tilgung, Restschuld, Ledger und Bearbeitung",
    to: (propertyId) => `/immobilienvermoegen/${propertyId}/darlehen`,
  },
  {
    label: "Finance pro Jahr",
    description: "Jahreswerte, Cashflow und Finanzentwicklung",
    to: (propertyId) => `/immobilienvermoegen/${propertyId}/finance-pro-jahr`,
  },
  {
    label: "Income",
    description: "Mieten, Einnahmen und Ertragsdaten",
    to: (propertyId) => `/immobilienvermoegen/${propertyId}/income`,
  },
  {
    label: "Capex",
    description: "Sanierung, Reparatur und Investitionen",
    to: (propertyId) => `/immobilienvermoegen/${propertyId}/capex`,
  },
];

function cleanDisplayName(value: string | null | undefined, fallback = "Objekt"): string {
  const raw = String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const knownNames = [
    "Lilienthaler Str. 54",
    "Colmarer Str. 45",
    "Elsasser Str. 52",
    "Fürther Str. 74",
    "Hohenloher Str. 78",
    "Rosenstein Str. 25",
    "Rosensteinstraße 25",
  ];
  const lowered = raw.toLowerCase();
  for (const candidate of knownNames) {
    if (lowered.startsWith(candidate.toLowerCase())) {
      return candidate === "Rosensteinstraße 25" ? "Rosenstein Str. 25" : candidate;
    }
  }

  const cleaned = raw
    .replace(/\s*\(?\s*core[\W_]*shadow\s*\)?/gi, "")
    .replace(/\s*\(?\s*shadow\s*\)?/gi, "")
    .replace(/\s+\d{5}(?:\s+[^\d,;|/]+)?\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || fallback;
}

function normalizeObjectName(value: string): string {
  return cleanDisplayName(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/straße|strasse/g, "str")
    .replace(/([a-z])str\b/g, "$1 str")
    .replace(/\bobjekt\s*\d+\b/g, "")
    .replace(/\b\d{5}\b/g, "")
    .replace(/\b(bremen|stuttgart|deutschland|germany)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLoanMatchKey(value: unknown): string {
  return cleanDisplayName(String(value ?? ""), "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/straße|strasse/g, "str")
    .replace(/([a-z])str\b/g, "$1 str")
    .replace(/\bobjekt\s*\d+\b/g, "")
    .replace(/\b\d{5}\b/g, "")
    .replace(/\b(bremen|stuttgart|deutschland|germany)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loanMatchAliases(value: unknown): string[] {
  const base = normalizeLoanMatchKey(value);
  if (!base) return [];

  const aliases = new Set<string>([base]);
  const streetNumberMatch = base.match(/([a-z]+(?: [a-z]+)* str) (\d+[a-z]?)/);
  if (streetNumberMatch) aliases.add(`${streetNumberMatch[1]} ${streetNumberMatch[2]}`.trim());

  const withoutTrailingCity = base.replace(/\b(?:bremen|stuttgart)\b.*$/g, "").trim();
  if (withoutTrailingCity) aliases.add(withoutTrailingCity);

  return Array.from(aliases).filter(Boolean);
}

function findTrendKeyByAlias(
  aliases: string[],
  trends: Record<string, LoanTrendPoint[]>,
): string | null {
  for (const alias of aliases) {
    if ((trends[alias] ?? []).length > 0) return alias;
  }

  const trendKeys = Object.keys(trends).filter((key) => (trends[key] ?? []).length > 0);
  for (const alias of aliases) {
    const match = trendKeys.find((key) => {
      const normalizedKey = normalizeLoanMatchKey(key);
      return normalizedKey === alias || normalizedKey.includes(alias) || alias.includes(normalizedKey);
    });
    if (match) return match;
  }

  return null;
}

function pickPropertyDisplayName(row: Record<string, unknown> | null | undefined): string {
  if (!row) return "";
  return cleanDisplayName(
    [row.name, row.title, row.property_name, row.object_name, row.address, row.street]
      .map((value) => String(value ?? "").trim())
      .find(Boolean),
    "",
  );
}

function parseLoanNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const normalized = value
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTrendName(value: unknown): string {
  return normalizeLoanMatchKey(value);
}

function addTrendPoint(grouped: Record<string, LoanTrendPoint[]>, key: string, point: LoanTrendPoint) {
  const cleanKey = String(key ?? "").trim();
  if (!cleanKey) return;
  grouped[cleanKey] = grouped[cleanKey] ?? [];
  grouped[cleanKey].push(point);
}

function finalizeLoanTrendGroups(grouped: Record<string, LoanTrendPoint[]>): Record<string, LoanTrendPoint[]> {
  Object.keys(grouped).forEach((key) => {
    const byYear = new Map<number, LoanTrendPoint>();
    grouped[key]
      .sort((a, b) => a.year - b.year)
      .forEach((point) => byYear.set(point.year, point));
    grouped[key] = Array.from(byYear.values()).sort((a, b) => a.year - b.year);
  });
  return grouped;
}

function groupLoanTrendRows(rows: LoanTrendRow[]): Record<string, LoanTrendPoint[]> {
  const grouped: Record<string, LoanTrendPoint[]> = {};

  rows.forEach((row) => {
    if (!row.property_id) return;

    const year = parseLoanNumber(row.year);
    const balance = parseLoanNumber(row.balance);
    if (year == null || balance == null) return;

    addTrendPoint(grouped, String(row.property_id), { year, balance });
  });

  return finalizeLoanTrendGroups(grouped);
}

function addDashboardFallbackTrends(
  grouped: Record<string, LoanTrendPoint[]>,
  rows: LoanDashboardTrendRow[],
): Record<string, LoanTrendPoint[]> {
  rows.forEach((row) => {
    const propertyId = String(row.property_id ?? "").trim();
    const nameKey = normalizeTrendName(row.property_name);
    const firstYear = parseLoanNumber(row.first_year);
    const lastYear = parseLoanNumber(row.last_year);
    const lastBalance = parseLoanNumber(row.last_balance);
    const principalTotal = parseLoanNumber(row.principal_total) ?? 0;

    if (!lastYear || lastBalance == null) return;

    const points: LoanTrendPoint[] = [];
    if (firstYear && firstYear !== lastYear) {
      points.push({ year: firstYear, balance: Math.max(lastBalance, lastBalance + principalTotal) });
    }
    points.push({ year: lastYear, balance: lastBalance });

    [propertyId, nameKey, ...loanMatchAliases(row.property_name)].filter(Boolean).forEach((key) => {
      if (!(grouped[key] ?? []).length) {
        grouped[key] = points;
      }
    });
  });

  return finalizeLoanTrendGroups(grouped);
}

function pickLedgerPropertyId(
  property: PortfolioPropertyNavRow,
  trends: Record<string, LoanTrendPoint[]>,
  propertyRows: Record<string, unknown>[],
): string {
  const aliases = loanMatchAliases(property.name);
  const normalizedPortfolioName = normalizeTrendName(property.name);
  const candidates = [property.core_property_id, property.id, normalizedPortfolioName, ...aliases]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  const directMatch = candidates.find((candidate) => (trends[candidate] ?? []).length > 0);
  if (directMatch) return directMatch;

  const aliasMatch = findTrendKeyByAlias(aliases, trends);
  if (aliasMatch) return aliasMatch;

  const matchingCoreProperty = propertyRows.find((row) => {
    const id = String(row.id ?? "").trim();
    if (!id || !(trends[id] ?? []).length) return false;
    const rowAliases = loanMatchAliases(pickPropertyDisplayName(row));
    return rowAliases.some((alias) => aliases.includes(alias)) || normalizeTrendName(pickPropertyDisplayName(row)) === normalizedPortfolioName;
  });

  const matchedCoreId = String(matchingCoreProperty?.id ?? "").trim();
  return matchedCoreId || candidates[0] || property.id;
}

function MiniLoanTrend({ points, large = false, onClick }: { points: LoanTrendPoint[]; large?: boolean; onClick?: () => void }) {
  const sorted = [...points].sort((a, b) => a.year - b.year);
  const first = sorted[0] ?? null;
  const last = sorted[sorted.length - 1] ?? null;
  const reduction = first && last ? first.balance - last.balance : null;

  if (!first || !last) {
    return (
      <div
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={(event) => {
          if (onClick && (event.key === "Enter" || event.key === " ")) onClick();
        }}
        style={{
          marginTop: 12,
          border: "1px dashed #cbd5e1",
          borderRadius: 16,
          padding: large ? 18 : 12,
          background: "#f8fafc",
          cursor: onClick ? "zoom-in" : "default",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 950, color: "#334155" }}>Darlehensverlauf</div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>Noch keine Ledger-Verlaufsdaten vorhanden.</div>
      </div>
    );
  }

  const startYear = first.year;
  const endYear = last.year;
  const yearTicks = Array.from(
    { length: Math.max(1, endYear - startYear + 1) },
    (_, index) => startYear + index,
  );

  const balances = sorted.map((point) => point.balance);
  const rawMin = Math.min(...balances);
  const rawMax = Math.max(...balances);
  const range = Math.max(1, rawMax - rawMin);
  const minBalance = Math.max(0, rawMin - range * 0.08);
  const maxBalance = rawMax + range * 0.08;
  const yTicks = Array.from({ length: 4 }, (_, index) => maxBalance - ((maxBalance - minBalance) / 3) * index);

  const width = 640;
  const height = large ? 240 : 168;
  const padding = {
    top: 18,
    right: 20,
    bottom: large ? 42 : 34,
    left: large ? 92 : 82,
  };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const xForYear = (year: number) => {
    if (endYear === startYear) return padding.left + plotWidth / 2;
    return padding.left + ((year - startYear) / (endYear - startYear)) * plotWidth;
  };

  const yForBalance = (balance: number) => {
    if (maxBalance === minBalance) return padding.top + plotHeight / 2;
    return padding.top + ((maxBalance - balance) / (maxBalance - minBalance)) * plotHeight;
  };

  const linePath = sorted
    .map((point, index) => `${index === 0 ? "M" : "L"} ${xForYear(point.year).toFixed(2)} ${yForBalance(point.balance).toFixed(2)}`)
    .join(" ");

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(event) => {
        if (onClick && (event.key === "Enter" || event.key === " ")) onClick();
      }}
      style={{
        marginTop: 12,
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        padding: large ? 18 : 12,
        background: "#ffffff",
        cursor: onClick ? "zoom-in" : "default",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 950, color: "#334155" }}>Darlehensverlauf</div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
            {first.year}–{last.year} · aktuelle Restschuld {formatEUR(last.balance)}
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>
          Abbau<br />
          <strong style={{ color: "#0f172a", fontSize: 12 }}>{reduction == null ? "—" : formatEUR(reduction)}</strong>
        </div>
      </div>

      <div style={{ width: "100%", height: large ? 300 : 180, marginTop: 10 }}>
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" role="img" aria-label="Darlehensverlauf nach Jahren">
          <rect x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} fill="#ffffff" />

          {yTicks.map((tick) => {
            const y = yForBalance(tick);
            return (
              <g key={`y-${tick}`}>
                <line x1={padding.left} x2={padding.left + plotWidth} y1={y} y2={y} stroke="#d1d5db" strokeDasharray="4 5" />
                <text x={padding.left - 10} y={y + 4} textAnchor="end" fontSize={large ? 12 : 10} fill="#64748b">
                  {formatEUR(tick).replace(",00", "")}
                </text>
              </g>
            );
          })}

          <line x1={padding.left} x2={padding.left} y1={padding.top} y2={padding.top + plotHeight} stroke="#cbd5e1" />
          <line x1={padding.left} x2={padding.left + plotWidth} y1={padding.top + plotHeight} y2={padding.top + plotHeight} stroke="#cbd5e1" />

          {yearTicks.map((year) => {
            const x = xForYear(year);
            const isEdge = year === startYear || year === endYear;
            return (
              <g key={`x-${year}`}>
                <line x1={x} x2={x} y1={padding.top + plotHeight} y2={padding.top + plotHeight + 4} stroke="#cbd5e1" />
                <text
                  x={x}
                  y={padding.top + plotHeight + (large ? 22 : 18)}
                  textAnchor="middle"
                  fontSize={isEdge ? (large ? 12 : 10) : (large ? 11 : 8)}
                  fontWeight={isEdge ? 800 : 600}
                  fill="#64748b"
                >
                  {year}
                </text>
              </g>
            );
          })}

          <path d={linePath} fill="none" stroke="#4f46e5" strokeWidth={large ? 4 : 3.5} strokeLinecap="round" strokeLinejoin="round" />
          {sorted.map((point) => (
            <circle
              key={`${point.year}-${point.balance}`}
              cx={xForYear(point.year)}
              cy={yForBalance(point.balance)}
              r={large ? 5 : 4}
              fill="#ffffff"
              stroke="#4f46e5"
              strokeWidth={large ? 4 : 3.5}
            />
          ))}
        </svg>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${yearTicks.length}, minmax(0, 1fr))`,
          gap: large ? 4 : 2,
          marginTop: large ? 8 : 4,
          paddingLeft: large ? 92 : 82,
          paddingRight: 20,
        }}
      >
        {yearTicks.map((year) => (
          <span
            key={`year-strip-${year}`}
            style={{
              textAlign: "center",
              fontSize: large ? 11 : 9,
              fontWeight: 850,
              color: year === startYear || year === endYear ? "#334155" : "#94a3b8",
              lineHeight: 1,
            }}
          >
            {year}
          </span>
        ))}
      </div>
    </div>
  );
}

function isHiddenTechnicalPropertyName(value: unknown): boolean {
  const name = String(value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!name) return true;

  const hiddenPatterns = [
    /\brls\b/,
    /\btest\b/,
    /\btrigger\b/,
    /\bdebug\b/,
    /\bdummy\b/,
    /\bsample\b/,
  ];

  return hiddenPatterns.some((pattern) => pattern.test(name));
}

function ObjectFinanceModuleButtons() {
  const [properties, setProperties] = useState<PortfolioPropertyNavRow[]>([]);
  const [loanTrendByPropertyId, setLoanTrendByPropertyId] = useState<Record<string, LoanTrendPoint[]>>({});
  const [expandedTrend, setExpandedTrend] = useState<{ title: string; points: LoanTrendPoint[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadProperties() {
      setLoading(true);
      setError(null);

      const [{ data, error }, ledgerResult, propertiesResult, dashboardResult, portfolioDashboardResult] = await Promise.all([
        supabase
          .from("portfolio_properties")
          .select("id,name,core_property_id")
          .order("name", { ascending: true }),
        supabase
          .from("property_loan_ledger")
          .select("property_id,year,balance")
          .order("year", { ascending: true }),
        supabase
          .from("properties")
          .select("*")
          .limit(500),
        supabase
          .from("vw_property_loan_dashboard_dedup")
          .select("property_id,property_name,first_year,last_year,last_balance,principal_total")
          .limit(500),
        supabase
          .from("vw_property_loan_dashboard_portfolio_v2")
          .select("property_id,portfolio_property_id,property_name,last_balance,principal_total")
          .limit(500),
      ]);

      if (!alive) return;

      if (error) {
        setProperties([]);
        setError(error.message || "Portfolio-Immobilien konnten nicht geladen werden.");
        setLoading(false);
        return;
      }

      const unique = new Map<string, PortfolioPropertyNavRow>();
      ((data ?? []) as PortfolioPropertyNavRow[])
        .filter((row) => row.id)
        .filter((row) => !isHiddenTechnicalPropertyName(row.name))
        .forEach((row) => {
          const name = cleanDisplayName(row.name, "Objekt");
          if (isHiddenTechnicalPropertyName(name)) return;

          const key = normalizeObjectName(name);
          if (!unique.has(key)) {
            unique.set(key, {
              id: row.id,
              name,
              core_property_id: row.core_property_id ?? null,
            });
          }
        });

      const dashboardRows: LoanDashboardTrendRow[] = [];
      if (Array.isArray(dashboardResult.data)) {
        dashboardRows.push(...((dashboardResult.data ?? []) as LoanDashboardTrendRow[]));
      }
      if (Array.isArray(portfolioDashboardResult.data)) {
        dashboardRows.push(
          ...((portfolioDashboardResult.data ?? []) as Record<string, unknown>[]).map((row) => ({
            property_id: String(row.property_id ?? row.portfolio_property_id ?? "") || null,
            property_name: String(row.property_name ?? "") || null,
            last_year: new Date().getFullYear(),
            first_year: new Date().getFullYear(),
            last_balance: row.last_balance,
            principal_total: row.principal_total,
          })),
        );
      }

      const trends = addDashboardFallbackTrends(
        groupLoanTrendRows(((ledgerResult.data ?? []) as LoanTrendRow[])),
        dashboardRows,
      );
      const corePropertyRows = Array.isArray(propertiesResult.data)
        ? (propertiesResult.data as Record<string, unknown>[]).filter((row) => !isHiddenTechnicalPropertyName(pickPropertyDisplayName(row)))
        : [];

      setProperties(
        Array.from(unique.values())
          .map((property) => ({
            ...property,
            ledgerPropertyId: pickLedgerPropertyId(property, trends, corePropertyRows),
          }))
          .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), "de")),
      );
      setLoanTrendByPropertyId(trends);
      setLoading(false);
    }

    void loadProperties();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <SectionCard
      title="Objekt-Finanzmodule"
      subtitle="Kompakter Schnellzugriff auf Darlehen, Jahresfinanzen, Einnahmen und Capex je Immobilie."
    >
      {loading ? <EmptyChartHint text="Immobilien werden geladen…" /> : null}
      {error ? (
        <div style={{ border: "1px solid #fecaca", background: "#fff1f2", color: "#7f1d1d", padding: 12, borderRadius: 12, fontSize: 13, fontWeight: 800 }}>
          {error}
        </div>
      ) : null}
      {!loading && !error && properties.length === 0 ? (
        <EmptyChartHint text="Keine Portfolio-Immobilien für die Modul-Verlinkung gefunden." />
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: 14,
        }}
      >
        {properties.map((property) => (
          <div
            key={property.id}
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 22,
              padding: 16,
              background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
              boxShadow: "0 10px 24px rgba(15, 23, 42, 0.04)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 950, fontSize: 18, color: "#0f172a" }}>{property.name}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>Finanzakte · 4 Module · Darlehensverlauf</div>
              </div>
              <NavLink
                to={`/immobilienvermoegen/${property.id}`}
                style={{
                  border: "1px solid #bfdbfe",
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  borderRadius: 999,
                  padding: "8px 12px",
                  fontSize: 12,
                  fontWeight: 900,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                Objektakte öffnen
              </NavLink>
            </div>

            {(() => {
              const lookupKeys = [property.ledgerPropertyId, property.core_property_id, property.id, ...loanMatchAliases(property.name)]
                .map((value) => String(value ?? "").trim())
                .filter(Boolean);
              const keyWithData = lookupKeys.find((key) => (loanTrendByPropertyId[key] ?? []).length > 0)
                ?? findTrendKeyByAlias(loanMatchAliases(property.name), loanTrendByPropertyId);
              const points = keyWithData ? loanTrendByPropertyId[keyWithData] ?? [] : [];
              const sortedPoints = [...points].sort((a, b) => a.year - b.year);
              const firstPoint = sortedPoints[0] ?? null;
              const lastPoint = sortedPoints[sortedPoints.length - 1] ?? null;
              const reduction = firstPoint && lastPoint ? firstPoint.balance - lastPoint.balance : null;
              const hasTrend = sortedPoints.length > 0;
              return (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 8 }}>
                    <CompactKpi label="Restschuld" value={lastPoint ? formatEUR(lastPoint.balance) : "—"} tone={hasTrend ? "blue" : "slate"} />
                    <CompactKpi label="Abbau" value={reduction == null ? "—" : formatEUR(reduction)} tone={reduction && reduction > 0 ? "green" : "slate"} />
                    <CompactKpi label="Zeitraum" value={firstPoint && lastPoint ? `${firstPoint.year}–${lastPoint.year}` : "—"} />
                  </div>
                  <MiniLoanTrend
                    points={points}
                    onClick={() => setExpandedTrend({ title: String(property.name ?? "Objekt"), points })}
                  />
                </>
              );
            })()}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 10,
                marginTop: 10,
              }}
            >
              {FINANCE_MODULE_LINKS.map((module) => (
                <NavLink
                  key={module.label}
                  to={module.to(property.id)}
                  style={{
                    border: "1px solid #dbe4ee",
                    background: "white",
                    color: "#0f172a",
                    borderRadius: 16,
                    padding: "12px 13px",
                    minHeight: 82,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    textDecoration: "none",
                    boxShadow: "0 6px 14px rgba(15, 23, 42, 0.05)",
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 950, lineHeight: 1.2 }}>{module.label}</span>
                  <span style={{ fontSize: 11, color: "#64748b", marginTop: 6, lineHeight: 1.35 }}>{module.description}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </div>

      {expandedTrend ? (
        <div
          onClick={() => setExpandedTrend(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            background: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(980px, 96vw)",
              borderRadius: 24,
              background: "#ffffff",
              border: "1px solid #dbe4ee",
              boxShadow: "0 30px 80px rgba(15, 23, 42, 0.28)",
              padding: 22,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 950, color: "#0f172a" }}>{expandedTrend.title}</div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>Vergrößerter Darlehensverlauf</div>
              </div>
              <button
                type="button"
                onClick={() => setExpandedTrend(null)}
                style={{
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  borderRadius: 999,
                  padding: "9px 14px",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Schließen
              </button>
            </div>
            <MiniLoanTrend points={expandedTrend.points} large />
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}



type PhaseTwoModule = {
  title: string;
  subtitle: string;
  status: string;
  tone: "green" | "blue" | "amber" | "red" | "slate";
  items: string[];
  actionLabel?: string;
  to?: string;
};

function ProfessionalModuleCard({ module }: { module: PhaseTwoModule }) {
  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 24,
        padding: 18,
        background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
        boxShadow: "0 12px 30px rgba(15, 23, 42, 0.05)",
        minHeight: 250,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <SmallStatusPill tone={module.tone}>{module.status}</SmallStatusPill>
          <div style={{ marginTop: 12, fontSize: 18, fontWeight: 950, color: "#0f172a" }}>{module.title}</div>
          <div style={{ marginTop: 5, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>{module.subtitle}</div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8, marginTop: 2 }}>
        {module.items.map((item) => (
          <div
            key={item}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              border: "1px solid #edf2f7",
              borderRadius: 14,
              padding: "9px 10px",
              background: "rgba(255,255,255,0.82)",
              fontSize: 12,
              fontWeight: 750,
              color: "#334155",
              lineHeight: 1.35,
            }}
          >
            <span style={{ color: "#4f46e5", fontWeight: 950 }}>✓</span>
            <span>{item}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: "auto" }}>
        {module.to ? (
          <NavLink
            to={module.to}
            style={{
              display: "inline-flex",
              border: "1px solid #c7d2fe",
              background: "#eef2ff",
              color: "#3730a3",
              borderRadius: 999,
              padding: "9px 13px",
              fontSize: 12,
              fontWeight: 950,
              textDecoration: "none",
            }}
          >
            {module.actionLabel ?? "Öffnen"}
          </NavLink>
        ) : (
          <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 850 }}>Bereit für nächste Automatisierungsstufe</span>
        )}
      </div>
    </div>
  );
}

function PhaseTwoObjectFileDashboard() {
  const modules: PhaseTwoModule[] = [
    {
      title: "Zentrale Objektakte",
      subtitle: "Alle Informationen je Immobilie werden in einer digitalen Objektakte gebündelt statt über mehrere Hauptseiten verteilt.",
      status: "Objektakte",
      tone: "blue",
      actionLabel: "Immobilienvermögen öffnen",
      to: "/immobilienvermoegen",
      items: [
        "Schnellzugriff auf Übersicht, Finanzen, Darlehen, Income und Capex",
        "Finanzmodule bleiben mit der jeweiligen Immobilie verknüpft",
        "Objektakte dient als Master-Bereich für Immobilienstammdaten",
      ],
    },
    {
      title: "Dokumentencenter",
      subtitle: "Professionelle Struktur für Exposés, Mietverträge, Darlehensunterlagen, Rechnungen und Nebenkostenarchive.",
      status: "Dokumente",
      tone: "green" as AutomationTone,
      actionLabel: "NK-Archiv öffnen",
      to: "/nebenkosten/wohnungen",
      items: [
        "Dokumentarten nach Objekt und Jahr logisch vorbereitet",
        "Nebenkosten-PDFs und Referenzunterlagen können objektbezogen archiviert werden",
        "Basis für spätere PDF-Vorschau, Versionierung und Upload-Workflows",
      ],
    },
    {
      title: "Hinweiscenter",
      subtitle: "Wichtige operative Risiken werden sichtbarer: Mietstatus, Cashflow, fehlende Daten, offene Abrechnungen und Darlehensentwicklung.",
      status: "Kontrolle",
      tone: "amber",
      actionLabel: "Mieteingang öffnen",
      to: "/mieteruebersicht",
      items: [
        "Mietcheck und Objekt-Jahresübersicht bleiben zentral erreichbar",
        "Ampellogik kann pro Objekt als Statussignal genutzt werden",
        "Vorbereitung für automatische Warnungen bei Rückständen oder fehlenden Daten",
      ],
    },
    {
      title: "Timeline / Historie",
      subtitle: "Jede Immobilie erhält eine chronologische Sicht auf Kauf, Darlehen, Mieterwechsel, Sanierungen, NK-Abschlüsse und Dokumente.",
      status: "Historie",
      tone: "slate",
      items: [
        "Ereignisse werden fachlich nach Finanzierung, Vermietung, Capex und Dokumenten gruppiert",
        "Grundlage für Audit-Log und nachvollziehbare Objektgeschichte",
        "Später erweiterbar um automatische Ereignisse aus Buchungen und Uploads",
      ],
    },
  ];

  return (
    <SectionCard
      title="Phase 2 · Professionelle Verwaltungsstruktur"
      subtitle="Objektakte, Dokumentencenter, Hinweiscenter und Timeline als neue fachliche Ebene über den bestehenden Funktionen."
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        {modules.map((module) => (
          <ProfessionalModuleCard key={module.title} module={module} />
        ))}
      </div>
    </SectionCard>
  );
}

function ProfessionalWorkflowBoard() {
  const workflowRows = [
    { area: "Finanzen", master: "Monate / Buchungen", output: "Cashflow, Einnahmen, Ausgaben, Kategorien", status: "Single Source" },
    { area: "Darlehen", master: "property_loan_ledger", output: "Restschuld, Tilgung, Verlauf, Darlehensübersicht", status: "Zentral" },
    { area: "Capex", master: "Monate mit Sanierung/Reparatur/Modernisierung", output: "Capex-Auswertung, Objektakte, Jahreswerte", status: "Referenziert" },
    { area: "Vermietung", master: "Immobilienvermögen / Mieteingang", output: "Mieter, Kaltmiete, Nebenkosten, Mietcheck", status: "Objektbezogen" },
    { area: "Nebenkosten", master: "NK-Wohnungen / NK-Tiefgaragen", output: "Abrechnung, Archiv, PDF, Referenzunterlagen", status: "Workflow" },
    { area: "Dokumente", master: "Objektakte / Uploads", output: "Exposé, Verträge, Rechnungen, WEG, Energieausweis", status: "Vorbereitet" },
  ];

  return (
    <SectionCard
      title="Daten- und Workflow-Master"
      subtitle="Diese Übersicht macht sichtbar, welche Seite künftig welche Daten fachlich führen soll. Dadurch bleiben Zahlen und Verlinkungen konsistent."
    >
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13 }}>
          <thead>
            <tr>
              {["Bereich", "Master-Seite / Quelle", "Verwendet für", "Status"].map((head) => (
                <th
                  key={head}
                  style={{
                    textAlign: "left",
                    padding: "12px 14px",
                    background: "#f8fafc",
                    borderBottom: "1px solid #e2e8f0",
                    color: "#475569",
                    fontSize: 11,
                    fontWeight: 950,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workflowRows.map((row) => (
              <tr key={row.area}>
                <td style={{ padding: "13px 14px", borderBottom: "1px solid #f1f5f9", fontWeight: 950, color: "#0f172a" }}>{row.area}</td>
                <td style={{ padding: "13px 14px", borderBottom: "1px solid #f1f5f9", color: "#334155", fontWeight: 800 }}>{row.master}</td>
                <td style={{ padding: "13px 14px", borderBottom: "1px solid #f1f5f9", color: "#64748b" }}>{row.output}</td>
                <td style={{ padding: "13px 14px", borderBottom: "1px solid #f1f5f9" }}><SmallStatusPill tone={row.status === "Zentral" || row.status === "Single Source" ? "green" : row.status === "Vorbereitet" ? "amber" : "blue"}>{row.status}</SmallStatusPill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function TimelinePreview() {
  const events = [
    { year: "Kauf", title: "Anschaffung / Objektanlage", text: "Grunddaten, Adresse, Einheiten und Stammdaten werden in der Objektakte geführt." },
    { year: "Finanzierung", title: "Darlehen & Restschuld", text: "Darlehensverlauf und Ledger bleiben als finanzielle Historie je Immobilie sichtbar." },
    { year: "Vermietung", title: "Mieterwechsel & Mietcheck", text: "Mietinformationen und Zahlungsstatus werden objektbezogen angezeigt." },
    { year: "Capex", title: "Sanierung / Reparatur", text: "Capex-relevante Buchungen werden über Kategorien aus Monate/Buchungen referenziert." },
    { year: "NK", title: "Nebenkostenabschluss", text: "Freigegebene Abrechnungen können später als PDF im Objektarchiv abgelegt werden." },
  ];

  return (
    <SectionCard title="Objekt-Timeline · Vorschau" subtitle="Chronologische Objektgeschichte als professionelle Ergänzung zur Objektakte.">
      <div style={{ display: "grid", gap: 12 }}>
        {events.map((event, index) => (
          <div key={event.title} style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 12, alignItems: "start" }}>
            <div style={{ textAlign: "right", fontSize: 12, fontWeight: 950, color: "#4f46e5", paddingTop: 4 }}>{event.year}</div>
            <div style={{ position: "relative", borderLeft: "2px solid #c7d2fe", padding: "0 0 14px 16px" }}>
              <span style={{ position: "absolute", left: -6, top: 5, width: 10, height: 10, borderRadius: 999, background: "#4f46e5" }} />
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 18, padding: 13, background: index % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                <div style={{ fontWeight: 950, color: "#0f172a" }}>{event.title}</div>
                <div style={{ marginTop: 4, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>{event.text}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}


type PhaseTwoObjectRow = {
  id: string;
  name: string | null;
  core_property_id?: string | null;
};

type ObjectWorkspaceTab = "uebersicht" | "finanzen" | "vermietung" | "nk" | "dokumente" | "historie";

const OBJECT_WORKSPACE_TABS: { key: ObjectWorkspaceTab; label: string; hint: string }[] = [
  { key: "uebersicht", label: "Übersicht", hint: "Stammdaten, Status und Schnellzugriffe" },
  { key: "finanzen", label: "Finanzen", hint: "Cashflow, Income, Capex und Darlehen" },
  { key: "vermietung", label: "Vermietung", hint: "Mieter, Miete, Mietcheck und Rückstände" },
  { key: "nk", label: "Nebenkosten", hint: "NK-Wohnungen, Tiefgaragen und Archiv" },
  { key: "dokumente", label: "Dokumente", hint: "Exposé, Verträge, Rechnungen und Nachweise" },
  { key: "historie", label: "Historie", hint: "Timeline für Ereignisse und Objektentwicklung" },
];

const DOCUMENT_CATEGORIES = [
  { title: "Mietverträge", text: "Verträge, Nachträge, Übergabeprotokolle", route: "/immobilienvermoegen", tone: "blue" as const },
  { title: "Rechnungen", text: "Handwerker, Sanierung, Reparatur, Wartung", route: "/monate", tone: "green" as const },
  { title: "Nebenkosten", text: "Abrechnungen, Referenzunterlagen, CO₂-Anlagen", route: "/nebenkosten/wohnungen", tone: "amber" as const },
  { title: "Darlehen", text: "Darlehensverträge, Tilgungspläne, Restschuldnachweise", route: "/darlehensuebersicht", tone: "slate" as const },
  { title: "WEG / Objekt", text: "Protokolle, Teilungserklärung, Energieausweis", route: "/immobilienvermoegen", tone: "blue" as const },
  { title: "Exposé", text: "Objekt-PDFs, Bilder und Vermarktungsunterlagen", route: "/immobilienvermoegen", tone: "green" as const },
];

function ObjectWorkspacePhaseTwoA() {
  const [properties, setProperties] = useState<PhaseTwoObjectRow[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<ObjectWorkspaceTab>("uebersicht");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadObjectWorkspace() {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("portfolio_properties")
        .select("id,name,core_property_id")
        .order("name", { ascending: true });

      if (!alive) return;

      if (error) {
        setProperties([]);
        setSelectedPropertyId("");
        setError(error.message || "Objektakten konnten nicht geladen werden.");
        setLoading(false);
        return;
      }

      const unique = new Map<string, PhaseTwoObjectRow>();
      ((data ?? []) as PhaseTwoObjectRow[])
        .filter((row) => row.id)
        .filter((row) => !isHiddenTechnicalPropertyName(row.name))
        .forEach((row) => {
          const name = cleanDisplayName(row.name, "Objekt");
          if (isHiddenTechnicalPropertyName(name)) return;
          const key = normalizeObjectName(name);
          if (!unique.has(key)) unique.set(key, { ...row, name });
        });

      const nextProperties = Array.from(unique.values()).sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), "de"));
      setProperties(nextProperties);
      setSelectedPropertyId((current) => (current && nextProperties.some((property) => property.id === current) ? current : nextProperties[0]?.id ?? ""));
      setLoading(false);
    }

    void loadObjectWorkspace();

    return () => {
      alive = false;
    };
  }, []);

  const selectedProperty = properties.find((property) => property.id === selectedPropertyId) ?? properties[0] ?? null;

  const objectRoutes = selectedProperty
    ? [
        { label: "Portfolio", to: `/immobilienvermoegen/${selectedProperty.id}` },
        { label: "Darlehen", to: `/immobilienvermoegen/${selectedProperty.id}/darlehen` },
        { label: "Income", to: `/immobilienvermoegen/${selectedProperty.id}/income` },
        { label: "Capex", to: `/immobilienvermoegen/${selectedProperty.id}/capex` },
        { label: "Finance pro Jahr", to: `/immobilienvermoegen/${selectedProperty.id}/finance-pro-jahr` },
      ]
    : [];

  return (
    <SectionCard
      title="Zentrale Objektakte · Phase 2A"
      subtitle="Jede Immobilie bekommt eine eigene Arbeitsfläche mit Tabs, Schnellzugriffen und klarer fachlicher Struktur."
    >
      {loading ? <EmptyChartHint text="Objektakten werden geladen…" /> : null}
      {error ? (
        <div style={{ border: "1px solid #fecaca", background: "#fff1f2", color: "#7f1d1d", padding: 12, borderRadius: 12, fontSize: 13, fontWeight: 800 }}>
          {error}
        </div>
      ) : null}
      {!loading && !error && properties.length === 0 ? <EmptyChartHint text="Keine produktiven Immobilien für die Objektakte gefunden." /> : null}

      {properties.length > 0 ? (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
            {properties.map((property) => {
              const active = property.id === selectedProperty?.id;
              return (
                <button
                  key={property.id}
                  type="button"
                  onClick={() => setSelectedPropertyId(property.id)}
                  style={{
                    border: active ? "1px solid #818cf8" : "1px solid #e2e8f0",
                    background: active ? "#eef2ff" : "#ffffff",
                    color: active ? "#3730a3" : "#334155",
                    borderRadius: 999,
                    padding: "9px 13px",
                    fontSize: 12,
                    fontWeight: 950,
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                  }}
                >
                  {property.name}
                </button>
              );
            })}
          </div>

          {selectedProperty ? (
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 24, background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)", padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 950, color: "#0f172a" }}>{selectedProperty.name}</div>
                  <div style={{ marginTop: 5, fontSize: 12, color: "#64748b", fontWeight: 750 }}>Digitale Objektakte · Stammdaten, Finanzen, Vermietung, NK, Dokumente und Historie</div>
                </div>
                <NavLink
                  to={`/immobilienvermoegen/${selectedProperty.id}`}
                  style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: 999, padding: "9px 13px", fontSize: 12, fontWeight: 950, textDecoration: "none" }}
                >
                  Vollständige Objektakte öffnen
                </NavLink>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginTop: 14 }}>
                {OBJECT_WORKSPACE_TABS.map((tab) => {
                  const active = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      style={{
                        textAlign: "left",
                        border: active ? "1px solid #818cf8" : "1px solid #e2e8f0",
                        background: active ? "#eef2ff" : "#ffffff",
                        borderRadius: 18,
                        padding: 12,
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ color: active ? "#3730a3" : "#0f172a", fontSize: 13, fontWeight: 950 }}>{tab.label}</div>
                      <div style={{ marginTop: 4, color: "#64748b", fontSize: 11, lineHeight: 1.35 }}>{tab.hint}</div>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 0.8fr)", gap: 14, marginTop: 14 }}>
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 20, background: "#ffffff", padding: 14 }}>
                  <SmallStatusPill tone="blue">{OBJECT_WORKSPACE_TABS.find((tab) => tab.key === activeTab)?.label ?? "Objektakte"}</SmallStatusPill>
                  <div style={{ marginTop: 10, fontSize: 15, fontWeight: 950, color: "#0f172a" }}>Arbeitsbereich für {selectedProperty.name}</div>
                  <div style={{ marginTop: 6, fontSize: 12, color: "#64748b", lineHeight: 1.55 }}>
                    {activeTab === "uebersicht" ? "Hier werden künftig Stammdaten, aktuelle KPIs, Statusampeln und die wichtigsten Aktionen der Immobilie gebündelt." : null}
                    {activeTab === "finanzen" ? "Finanzdaten bleiben mit den bestehenden Modulen verknüpft: Darlehensübersicht, Finance pro Jahr, Income und Capex." : null}
                    {activeTab === "vermietung" ? "Mieterinformationen, Mietstatus und Mietcheck werden fachlich mit Portfolio und Mieteingang verbunden." : null}
                    {activeTab === "nk" ? "Nebenkostenabrechnungen, Freigaben und PDF-Archive werden objektbezogen zusammengeführt." : null}
                    {activeTab === "dokumente" ? "Dokumente werden nach Objekt, Kategorie und Jahr strukturiert: Mietvertrag, Rechnung, NK, Darlehen, WEG und Energie." : null}
                    {activeTab === "historie" ? "Die Timeline zeigt später Kauf, Sanierungen, Mieterwechsel, Sondertilgungen, NK-Abschlüsse und Dokumentenereignisse." : null}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                    {objectRoutes.map((route) => (
                      <NavLink
                        key={route.label}
                        to={route.to}
                        style={{ border: "1px solid #e2e8f0", background: "#f8fafc", color: "#334155", borderRadius: 999, padding: "8px 11px", fontSize: 12, fontWeight: 900, textDecoration: "none" }}
                      >
                        {route.label}
                      </NavLink>
                    ))}
                  </div>
                </div>

                <div style={{ border: "1px solid #e2e8f0", borderRadius: 20, background: "#ffffff", padding: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 950, color: "#0f172a" }}>Objektakten-Checkliste</div>
                  <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                    {["Stammdaten vollständig", "Finanzmodule verknüpft", "Darlehensverlauf sichtbar", "Dokumentenstruktur vorhanden", "Timeline vorbereitet"].map((item) => (
                      <div key={item} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#475569", fontWeight: 800 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 999, background: "#22c55e", display: "inline-block" }} />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </SectionCard>
  );
}

function DocumentCenterPhaseTwoA() {
  return (
    <SectionCard
      title="Dokumentencenter · Phase 2A"
      subtitle="Fachliche Ablagestruktur für Objektunterlagen. Die bestehenden Upload-/PDF-Funktionen bleiben erhalten; diese Ansicht bündelt die Kategorien professionell."
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
        {DOCUMENT_CATEGORIES.map((category) => (
          <div key={category.title} style={{ border: "1px solid #e2e8f0", borderRadius: 20, background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)", padding: 14 }}>
            <SmallStatusPill tone={category.tone}>{category.title}</SmallStatusPill>
            <div style={{ marginTop: 10, color: "#64748b", fontSize: 12, lineHeight: 1.45, minHeight: 38 }}>{category.text}</div>
            <NavLink
              to={category.route}
              style={{ display: "inline-flex", marginTop: 12, border: "1px solid #e2e8f0", background: "#ffffff", color: "#334155", borderRadius: 999, padding: "8px 11px", fontSize: 12, fontWeight: 900, textDecoration: "none" }}
            >
              Bereich öffnen
            </NavLink>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function PortfolioComparisonPhaseTwoA() {
  const rows = [
    { label: "Finanziell", text: "Restschuld, Cashflow, Income und Capex werden je Objekt vergleichbar dargestellt.", tone: "blue" as const },
    { label: "Vermietung", text: "Mietcheck, Mieterstatus und Nebenkosten werden objektbezogen gebündelt.", tone: "green" as const },
    { label: "Dokumente", text: "Unterlagen bekommen eine klare Objekt-/Kategorie-/Jahresstruktur.", tone: "amber" as const },
    { label: "Historie", text: "Ereignisse werden als nachvollziehbare Timeline pro Immobilie vorbereitet.", tone: "slate" as const },
  ];

  return (
    <SectionCard
      title="Portfolio-Vergleich & Arbeitslogik"
      subtitle="Diese Ebene macht die App benutzerfreundlicher: erst Objekt wählen, dann in derselben Struktur Finanzen, Vermietung, NK, Dokumente und Historie prüfen."
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {rows.map((row) => (
          <div key={row.label} style={{ border: "1px solid #e2e8f0", borderRadius: 20, padding: 14, background: "#ffffff" }}>
            <SmallStatusPill tone={row.tone}>{row.label}</SmallStatusPill>
            <div style={{ marginTop: 10, color: "#64748b", fontSize: 12, lineHeight: 1.5 }}>{row.text}</div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function PhaseTwoControlCenter() {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <ObjectWorkspacePhaseTwoA />
      <PhaseTwoObjectFileDashboard />
      <PortfolioComparisonPhaseTwoA />
      <DocumentCenterPhaseTwoA />
      <ProfessionalWorkflowBoard />
      <TimelinePreview />
      <ObjectFinanceModuleButtons />
    </div>
  );
}



type AutomationPriority = "hoch" | "mittel" | "niedrig";
type AutomationTone = "green" | "blue" | "amber" | "red" | "slate";

type AutomationTask = {
  id: string;
  title: string;
  objectName: string;
  detail: string;
  priority: AutomationPriority;
  tone: AutomationTone;
  source: string;
};

type AutomationCandidate = {
  id: string;
  objectName: string;
  date: string;
  category: string;
  note: string;
  amount: number;
  rule: string;
  tone: AutomationTone;
};

function includesAny(value: string | null | undefined, keywords: string[]) {
  const normalized = String(value ?? "").toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

function getEntryObjectName(row: { objekt_code?: string | null }) {
  return cleanDisplayName(row.objekt_code ?? "Ohne Objekt", "Ohne Objekt");
}

function priorityRank(priority: AutomationPriority) {
  if (priority === "hoch") return 0;
  if (priority === "mittel") return 1;
  return 2;
}

function AutomationMetricCard({ label, value, tone, text }: { label: string; value: string; tone: AutomationTone; text: string }) {
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 22, background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)", padding: 16 }}>
      <SmallStatusPill tone={tone}>{label}</SmallStatusPill>
      <div style={{ marginTop: 10, fontSize: 24, fontWeight: 950, color: "#0f172a" }}>{value}</div>
      <div style={{ marginTop: 4, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>{text}</div>
    </div>
  );
}

function PhaseTwoBAutomationCenter() {
  const [incomeRows, setIncomeRows] = useState<EntryRow[]>([]);
  const [expenseRows, setExpenseRows] = useState<EntryRow[]>([]);
  const [objects, setObjects] = useState<DropdownRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const currentYear = today.getFullYear();
  const currentMonthKey = `${currentYear}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const startOfYear = `${currentYear}-01-01`;
  const tomorrow = toISODate(addDays(today, 1));

  useEffect(() => {
    let alive = true;

    async function loadAutomationData() {
      setLoading(true);
      setError(null);

      try {
        const [objectsRes, financeRes] = await Promise.all([
          supabase.from("v_object_dropdown").select("objekt_code,label").order("label", { ascending: true }),
          supabase
            .from("finance_entry")
            .select("id,objekt_code,booking_date,amount,category,note,entry_type")
            .eq("is_deleted", false)
            .gte("booking_date", startOfYear)
            .lt("booking_date", tomorrow)
            .in("entry_type", ["income", "expense"]),
        ]);

        if (!alive) return;

        if (objectsRes.error) throw objectsRes.error;
        if (financeRes.error) throw financeRes.error;

        setObjects(
          ((objectsRes.data ?? []) as DropdownRow[])
            .filter((row) => row.objekt_code && row.label)
            .filter((row) => !isHiddenTechnicalPropertyName(row.label))
            .sort((a, b) => a.label.localeCompare(b.label, "de"))
        );
        const financeRows = splitFinanceEntries(mapFinanceEntryRows(financeRes.data ?? []));
        setIncomeRows(financeRows.incomeRows);
        setExpenseRows(financeRows.expenseRows);
        setLoading(false);
      } catch (e: unknown) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setIncomeRows([]);
        setExpenseRows([]);
        setObjects([]);
        setLoading(false);
      }
    }

    void loadAutomationData();

    return () => {
      alive = false;
    };
  }, [startOfYear, tomorrow]);

  const capexCandidates = useMemo<AutomationCandidate[]>(() => {
    return expenseRows
      .filter((row) => includesAny(`${row.category ?? ""} ${row.note ?? ""}`, ["sanierung", "reparatur", "modernisierung", "renovierung", "instandhaltung", "dach", "fenster", "heizung", "küche", "bad"]))
      .map((row) => ({
        id: `capex-${row.id}`,
        objectName: getEntryObjectName(row),
        date: row.booking_date,
        category: row.category || "Ohne Kategorie",
        note: row.note || "—",
        amount: Number(row.amount || 0),
        rule: "Capex-/Instandhaltungsregel",
        tone: (Number(row.amount || 0) >= 1000 ? "amber" : "blue") as AutomationTone,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }, [expenseRows]);

  const nkCandidates = useMemo<AutomationCandidate[]>(() => {
    return expenseRows
      .filter((row) => includesAny(`${row.category ?? ""} ${row.note ?? ""}`, ["nebenkosten", "betriebskosten", "hausgeld", "heizkosten", "wasser", "grundsteuer", "versicherung", "wartung", "reinigung", "müll", "nk"]))
      .map((row) => ({
        id: `nk-${row.id}`,
        objectName: getEntryObjectName(row),
        date: row.booking_date,
        category: row.category || "Ohne Kategorie",
        note: row.note || "—",
        amount: Number(row.amount || 0),
        rule: "NK-/Betriebskostenregel",
        tone: "green" as AutomationTone,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }, [expenseRows]);

  const objectCashflow = useMemo(() => {
    const canonicalNames = new Map<string, string>();
    const map = new Map<string, { objectName: string; income: number; expense: number }>();

    const rememberCanonicalName = (rawName: string | null | undefined, canonicalName: string) => {
      const key = normalizeObjectName(String(rawName ?? ""));
      if (key && !canonicalNames.has(key)) canonicalNames.set(key, canonicalName);
    };

    const getCanonicalBucket = (rawName: string | null | undefined) => {
      const cleanedName = cleanDisplayName(rawName, "Ohne Objekt");
      const rawKey = normalizeObjectName(cleanedName);
      const objectName = canonicalNames.get(rawKey) ?? cleanedName;
      const bucketKey = normalizeObjectName(objectName) || rawKey || objectName;
      const bucket = map.get(bucketKey) ?? { objectName, income: 0, expense: 0 };
      if (!map.has(bucketKey)) map.set(bucketKey, bucket);
      return bucket;
    };

    for (const object of objects) {
      const canonicalName = cleanDisplayName(object.label, object.objekt_code);
      rememberCanonicalName(object.label, canonicalName);
      rememberCanonicalName(object.objekt_code, canonicalName);
      getCanonicalBucket(canonicalName);
    }

    for (const row of incomeRows) {
      const bucket = getCanonicalBucket(getEntryObjectName(row));
      bucket.income += Number(row.amount || 0);
    }

    for (const row of expenseRows) {
      const bucket = getCanonicalBucket(getEntryObjectName(row));
      bucket.expense += Number(row.amount || 0);
    }

    return Array.from(map.values())
      .map((values) => ({ ...values, net: values.income - values.expense }))
      .filter((row) => !isHiddenTechnicalPropertyName(row.objectName))
      .sort((a, b) => a.net - b.net);
  }, [incomeRows, expenseRows, objects]);

  const missingRentObjects = useMemo(() => {
    const rentIncomeKeys = new Set(
      incomeRows
        .filter((row) => row.booking_date?.startsWith(currentMonthKey))
        .filter((row) => includesAny(`${row.category ?? ""} ${row.note ?? ""}`, ["miete", "garage", "stellplatz"]))
        .map((row) => normalizeObjectName(getEntryObjectName(row)))
    );

    return objects
      .map((object) => cleanDisplayName(object.label, object.objekt_code))
      .filter((name) => !isHiddenTechnicalPropertyName(name))
      .filter((name) => !rentIncomeKeys.has(normalizeObjectName(name)))
      .slice(0, 8);
  }, [incomeRows, objects, currentMonthKey]);

  const automationTasks = useMemo<AutomationTask[]>(() => {
    const tasks: AutomationTask[] = [];

    for (const name of missingRentObjects) {
      tasks.push({
        id: `rent-${name}`,
        title: "Mietzahlung prüfen",
        objectName: name,
        detail: `Für ${currentMonthKey} wurde noch keine Miet-/Garagenbuchung erkannt. Bitte Mieteingang bzw. Buchhaltung prüfen.`,
        priority: today.getDate() > 14 ? "hoch" : "mittel",
        tone: today.getDate() > 14 ? "red" : "amber",
        source: "Mietcheck-Regel",
      });
    }

    for (const row of objectCashflow.filter((item) => item.net < 0).slice(0, 6)) {
      tasks.push({
        id: `cashflow-${row.objectName}`,
        title: "Negativen Cashflow prüfen",
        objectName: row.objectName,
        detail: `Jahres-Netto aktuell ${formatEUR(row.net)}. Prüfen, ob Capex, NK oder Darlehen korrekt zugeordnet sind.`,
        priority: row.net < -5000 ? "hoch" : "mittel",
        tone: row.net < -5000 ? "red" : "amber",
        source: "Cashflow-Regel",
      });
    }

    for (const candidate of capexCandidates.filter((item) => item.amount >= 1000).slice(0, 4)) {
      tasks.push({
        id: `capex-task-${candidate.id}`,
        title: "Capex-Zuordnung kontrollieren",
        objectName: candidate.objectName,
        detail: `${candidate.category} vom ${formatDate(candidate.date)} über ${formatEUR(candidate.amount)} sollte ggf. als Capex/Modernisierung bestätigt werden.`,
        priority: "mittel",
        tone: "blue",
        source: "Capex-Regel",
      });
    }

    return tasks.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)).slice(0, 12);
  }, [missingRentObjects, objectCashflow, capexCandidates, currentMonthKey, today]);

  const riskObjects = objectCashflow.filter((row) => row.net < 0).length;
  const positiveObjects = objectCashflow.filter((row) => row.net >= 0 && row.income > 0).length;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <SectionCard
        title="Phase 2B · Intelligenz- & Automatisierungscenter"
        subtitle="Frontend-Regeln erkennen Auffälligkeiten aus bestehenden Buchungen. Es wird nichts automatisch gebucht oder gelöscht — die App zeigt Prüfpunkte und Vorschläge an."
      >
        {error ? (
          <div style={{ border: "1px solid #fecaca", background: "#fff1f2", color: "#7f1d1d", borderRadius: 14, padding: 12, fontSize: 13, fontWeight: 800 }}>{error}</div>
        ) : null}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
          <AutomationMetricCard label="Offene Prüfpunkte" value={loading ? "…" : String(automationTasks.length)} tone={automationTasks.some((task) => task.priority === "hoch") ? "red" : "amber"} text="Automatisch erkannte Aufgaben aus Miete, Cashflow und Capex." />
          <AutomationMetricCard label="Capex-Kandidaten" value={loading ? "…" : String(capexCandidates.length)} tone="blue" text="Ausgaben mit Sanierung/Reparatur/Modernisierung im Text oder in der Kategorie." />
          <AutomationMetricCard label="NK-Kandidaten" value={loading ? "…" : String(nkCandidates.length)} tone="green" text="Mögliche Betriebs-/Nebenkosten aus bestehenden Buchungen." />
          <AutomationMetricCard label="Risikoobjekte" value={loading ? "…" : String(riskObjects)} tone={riskObjects > 0 ? "red" : "green"} text={`${positiveObjects} Objekte mit positivem Jahres-Netto erkannt.`} />
        </div>
      </SectionCard>

      <SectionCard title="Hinweis- & Taskcenter" subtitle="Priorisierte Arbeitsliste. Diese Hinweise sind bewusst kontrollierend: Du entscheidest, ob Buchung, Kategorie oder Dokument angepasst werden soll.">
        {loading ? <EmptyChartHint text="Automatisierungsregeln werden berechnet…" /> : null}
        {!loading && automationTasks.length === 0 ? <EmptyChartHint text="Keine kritischen Prüfpunkte im aktuellen Jahr erkannt." /> : null}
        <div style={{ display: "grid", gap: 10 }}>
          {automationTasks.map((task) => (
            <div key={task.id} style={{ border: "1px solid #e2e8f0", borderRadius: 18, background: "#ffffff", padding: 13, display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "start" }}>
              <div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <SmallStatusPill tone={task.tone}>{task.priority.toUpperCase()}</SmallStatusPill>
                  <span style={{ fontSize: 13, fontWeight: 950, color: "#0f172a" }}>{task.title}</span>
                  <span style={{ fontSize: 12, color: "#64748b", fontWeight: 850 }}>{task.objectName}</span>
                </div>
                <div style={{ marginTop: 7, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>{task.detail}</div>
              </div>
              <SmallStatusPill tone="slate">{task.source}</SmallStatusPill>
            </div>
          ))}
        </div>
      </SectionCard>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        <SectionCard title="Automatische Capex-Erkennung" subtitle="Vorschläge aus Kategorien/Notizen. Diese Liste ersetzt keine Buchhaltung, hilft aber beim schnellen Kontrollieren.">
          <div style={{ display: "grid", gap: 9 }}>
            {capexCandidates.length === 0 && !loading ? <EmptyChartHint text="Keine Capex-Kandidaten erkannt." /> : null}
            {capexCandidates.map((item) => (
              <div key={item.id} style={{ border: "1px solid #edf2f7", borderRadius: 14, padding: 10, background: "#f8fafc" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <strong style={{ fontSize: 12, color: "#0f172a" }}>{item.objectName}</strong>
                  <SmallStatusPill tone={item.tone}>{formatEUR(item.amount)}</SmallStatusPill>
                </div>
                <div style={{ marginTop: 5, fontSize: 11, color: "#64748b" }}>{formatDate(item.date)} · {item.category} · {item.note}</div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Automatische NK-Erkennung" subtitle="Mögliche umlage-/abrechnungsrelevante Kosten aus den Buchungen.">
          <div style={{ display: "grid", gap: 9 }}>
            {nkCandidates.length === 0 && !loading ? <EmptyChartHint text="Keine NK-Kandidaten erkannt." /> : null}
            {nkCandidates.map((item) => (
              <div key={item.id} style={{ border: "1px solid #edf2f7", borderRadius: 14, padding: 10, background: "#f8fafc" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <strong style={{ fontSize: 12, color: "#0f172a" }}>{item.objectName}</strong>
                  <SmallStatusPill tone="green">{formatEUR(item.amount)}</SmallStatusPill>
                </div>
                <div style={{ marginTop: 5, fontSize: 11, color: "#64748b" }}>{formatDate(item.date)} · {item.category} · {item.note}</div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Objekt-Risikoampel" subtitle="Automatischer Status nach Jahres-Cashflow. Später kann diese Logik um Leerstand, Restschuld, NK und Dokumentenstatus erweitert werden.">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13 }}>
            <thead>
              <tr>
                {["Objekt", "Einnahmen", "Ausgaben", "Netto", "Status"].map((head) => (
                  <th key={head} style={{ textAlign: "left", padding: "11px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569", fontSize: 11, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.05em" }}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {objectCashflow.slice(0, 12).map((row) => {
                const statusTone: AutomationTone = row.net < -5000 ? "red" : row.net < 0 ? "amber" : row.income > 0 ? "green" : "slate";
                const statusLabel = row.net < -5000 ? "Kritisch" : row.net < 0 ? "Prüfen" : row.income > 0 ? "Stabil" : "Keine Daten";
                return (
                  <tr key={row.objectName}>
                    <td style={{ padding: "12px", borderBottom: "1px solid #f1f5f9", fontWeight: 950, color: "#0f172a" }}>{row.objectName}</td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #f1f5f9", color: "#047857", fontWeight: 850 }}>{formatEUR(row.income)}</td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #f1f5f9", color: "#be123c", fontWeight: 850 }}>{formatEUR(row.expense)}</td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #f1f5f9", fontWeight: 950, color: row.net < 0 ? "#be123c" : "#047857" }}>{formatEUR(row.net)}</td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #f1f5f9" }}><SmallStatusPill tone={statusTone}>{statusLabel}</SmallStatusPill></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}


type ReportTypeKey = "portfolio" | "object" | "bank" | "tax" | "nk";

type PhaseTwoCReportRow = {
  title: string;
  description: string;
  type: ReportTypeKey;
  status: "Bereit" | "Vorbereitet" | "Prüfen";
  output: string;
};

function normalizeArchiveObjectName(name: string) {
  return String(name || "")
    .replace(/\s+/g, " ")
    .trim();
}

function ReportActionButton({ children, onClick, variant = "primary" }: { children: ReactNode; onClick?: () => void; variant?: "primary" | "secondary" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: variant === "primary" ? "1px solid #bfdbfe" : "1px solid #e2e8f0",
        background: variant === "primary" ? "#eff6ff" : "white",
        color: variant === "primary" ? "#1d4ed8" : "#0f172a",
        borderRadius: 14,
        padding: "9px 12px",
        fontSize: 12,
        fontWeight: 950,
        cursor: "pointer",
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)",
      }}
    >
      {children}
    </button>
  );
}

function PhaseTwoCReportingCenter() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [objektCode, setObjektCode] = useState("ALL");
  const [objects, setObjects] = useState<DropdownRow[]>([]);
  const [incomeRows, setIncomeRows] = useState<EntryRow[]>([]);
  const [expenseRows, setExpenseRows] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data, error } = await supabase
        .from("v_object_dropdown")
        .select("objekt_code,label")
        .order("label", { ascending: true });

      if (!alive) return;

      if (error) {
        console.error("Fehler beim Laden der Objekte für Reporting:", error);
        setObjects([]);
        return;
      }

      setObjects(
        ((data ?? []) as DropdownRow[])
          .filter((row) => row.objekt_code && row.label)
          .filter((row) => !/test|trigger|rls|dummy/i.test(`${row.objekt_code} ${row.label}`))
          .sort((a, b) => a.label.localeCompare(b.label, "de"))
      );
    })();

    return () => {
      alive = false;
    };
  }, []);

  async function loadReportData() {
    const safeYear = Number(year);

    if (!Number.isFinite(safeYear) || safeYear < 2000 || safeYear > 2100) {
      setError("Bitte ein gültiges Jahr eingeben.");
      setIncomeRows([]);
      setExpenseRows([]);
      return;
    }

    setLoading(true);
    setError(null);

    const from = `${safeYear}-01-01`;
    const to = `${safeYear + 1}-01-01`;

    try {
      let financeQuery = supabase
        .from("finance_entry")
        .select("id,objekt_code,booking_date,amount,category,note,entry_type")
        .eq("is_deleted", false)
        .gte("booking_date", from)
        .lt("booking_date", to)
        .in("entry_type", ["income", "expense"]);

      if (objektCode !== "ALL") {
        financeQuery = financeQuery.eq("objekt_code", objektCode);
      }

      const result = await financeQuery;

      if (result.error) throw result.error;

      const financeRows = splitFinanceEntries(mapFinanceEntryRows(result.data ?? []));
      setIncomeRows(financeRows.incomeRows);
      setExpenseRows(financeRows.expenseRows);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setIncomeRows([]);
      setExpenseRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadReportData(), 0);
    return () => window.clearTimeout(initialLoad);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, objektCode]);

  const selectedObjectLabel = useMemo(() => {
    if (objektCode === "ALL") return "Gesamtportfolio";
    return objects.find((object) => object.objekt_code === objektCode)?.label ?? objektCode;
  }, [objects, objektCode]);

  const reportTotals = useMemo(() => {
    const income = incomeRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const expense = expenseRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const capex = expenseRows
      .filter((row) => /sanierung|reparatur|modernisierung|instandhaltung|capex/i.test(`${row.category ?? ""} ${row.note ?? ""}`))
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const nk = expenseRows
      .filter((row) => /nebenkosten|hausgeld|heizung|wasser|müll|muell|grundsteuer|versicherung|kalo|nk/i.test(`${row.category ?? ""} ${row.note ?? ""}`))
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    return {
      income,
      expense,
      net: income - expense,
      capex,
      nk,
      rows: incomeRows.length + expenseRows.length,
    };
  }, [incomeRows, expenseRows]);

  const reportCards: PhaseTwoCReportRow[] = useMemo(
    () => [
      {
        title: "Portfolio-Jahresbericht",
        description: "Jahresübersicht mit Einnahmen, Ausgaben, Cashflow, Capex, NK und Objektvergleich.",
        type: "portfolio",
        status: objektCode === "ALL" ? "Bereit" : "Vorbereitet",
        output: "Management-/Eigentümerbericht",
      },
      {
        title: "Objektbericht",
        description: "Einzelobjekt-Report mit Finanzzahlen, Darlehen, Vermietung, Capex und Dokumentenstatus.",
        type: "object",
        status: objektCode !== "ALL" ? "Bereit" : "Prüfen",
        output: "Objektakte als Report",
      },
      {
        title: "Bankenreport",
        description: "Finanzierungsorientierte Sicht mit Cashflow, Restschuld, DSCR-Logik und Darlehensverlauf.",
        type: "bank",
        status: "Vorbereitet",
        output: "Finanzierungsunterlage",
      },
      {
        title: "Steuer-/Capex-Report",
        description: "Ausgaben nach Kategorien, Capex-Erkennung und steuerrelevante Kostenstruktur.",
        type: "tax",
        status: reportTotals.capex > 0 ? "Bereit" : "Vorbereitet",
        output: "Steuer-/Buchhaltungsübersicht",
      },
      {
        title: "NK-Archivreport",
        description: "Archivlogik für freigegebene Nebenkostenabrechnungen und Referenzunterlagen je Jahr.",
        type: "nk",
        status: reportTotals.nk > 0 ? "Bereit" : "Vorbereitet",
        output: "Nebenkosten-Archiv",
      },
    ],
    [objektCode, reportTotals.capex, reportTotals.nk]
  );

  const archiveCategories = [
    { title: "Mietverträge", text: "Vertrag, Nachträge, Übergabeprotokolle", tone: "blue" as const },
    { title: "Rechnungen", text: "Handwerker, Hausgeld, Betriebskosten, Capex", tone: "amber" as const },
    { title: "Nebenkosten", text: "Abrechnungen, KALO, Referenzunterlagen, Mieter-PDF", tone: "green" as const },
    { title: "Darlehen", text: "Kreditvertrag, Zinsbindung, Tilgungsplan, Sondertilgung", tone: "slate" as const },
    { title: "WEG & Verwaltung", text: "Protokolle, Beschlüsse, Wirtschaftsplan, Hausgeld", tone: "blue" as const },
    { title: "Energie & Exposé", text: "Energieausweis, Fotos, Exposé, Objektunterlagen", tone: "slate" as const },
  ];

  const auditRows = [
    { area: "Buchungen", source: "Monate / finance entries", rule: "Reportwerte werden aus denselben Buchungen aggregiert", status: "Aktiv" },
    { area: "Capex", source: "Kategorie + Notiz", rule: "Sanierung/Reparatur/Modernisierung werden automatisch markiert", status: "Aktiv" },
    { area: "NK", source: "Kategorie + Notiz", rule: "Nebenkosten/Hausgeld/Heizung/KALO werden für Archivreport erkannt", status: "Aktiv" },
    { area: "Dokumente", source: "Objektakte", rule: "Ordnerstruktur je Objekt/Jahr/Kategorie vorbereitet", status: "Vorbereitet" },
    { area: "PDF", source: "Browser-Druck", rule: "Berichtsansicht kann über Drucken als PDF gespeichert werden", status: "Bereit" },
  ];

  const csvContent = useMemo(() => {
    const rows = [
      ["Bereich", "Wert"],
      ["Objekt", selectedObjectLabel],
      ["Jahr", year],
      ["Einnahmen", String(reportTotals.income)],
      ["Ausgaben", String(reportTotals.expense)],
      ["Netto", String(reportTotals.net)],
      ["Capex erkannt", String(reportTotals.capex)],
      ["NK erkannt", String(reportTotals.nk)],
      ["Buchungen", String(reportTotals.rows)],
    ];

    return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\n");
  }, [reportTotals, selectedObjectLabel, year]);

  function downloadCsv() {
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `koenen-report-${year}-${objektCode === "ALL" ? "portfolio" : objektCode}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <SectionCard
        title="Phase 2C · Reporting, Archiv & Audit"
        subtitle="Professionelle Berichtsebene: Jahresberichte, Objektberichte, Dokumentenarchiv und nachvollziehbare Datenherkunft."
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <CompactKpi label="Berichtsobjekt" value={normalizeArchiveObjectName(selectedObjectLabel)} tone="blue" />
          <CompactKpi label="Berichtsjahr" value={year} />
          <CompactKpi label="Buchungen" value={loading ? "…" : String(reportTotals.rows)} />
          <CompactKpi label="Netto-Cashflow" value={loading ? "…" : formatEUR(reportTotals.net)} tone={reportTotals.net >= 0 ? "green" : "red"} />
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ fontSize: 12, fontWeight: 950, color: "#475569" }}>
            Objekt
            <select
              value={objektCode}
              onChange={(event) => setObjektCode(event.target.value)}
              style={{ marginLeft: 8, minWidth: 250, border: "1px solid #e2e8f0", borderRadius: 12, padding: "9px 10px", fontWeight: 850, background: "white" }}
            >
              <option value="ALL">Gesamtportfolio</option>
              {objects.map((object) => (
                <option key={object.objekt_code} value={object.objekt_code}>{object.label}</option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 12, fontWeight: 950, color: "#475569" }}>
            Jahr
            <input
              value={year}
              onChange={(event) => setYear(event.target.value)}
              inputMode="numeric"
              style={{ marginLeft: 8, width: 100, border: "1px solid #e2e8f0", borderRadius: 12, padding: "9px 10px", fontWeight: 900 }}
            />
          </label>

          <ReportActionButton onClick={() => window.print()}>Berichtsansicht als PDF drucken</ReportActionButton>
          <ReportActionButton variant="secondary" onClick={downloadCsv}>Reportdaten als CSV</ReportActionButton>
        </div>

        {error ? <div style={{ marginTop: 12, border: "1px solid #fecaca", background: "#fff1f2", color: "#991b1b", borderRadius: 12, padding: 12, fontSize: 12, fontWeight: 850 }}>{error}</div> : null}
      </SectionCard>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
        <StatCard title="Einnahmen Bericht" value={reportTotals.income} loading={loading} />
        <StatCard title="Ausgaben Bericht" value={reportTotals.expense} loading={loading} />
        <StatCard title="Capex erkannt" value={reportTotals.capex} loading={loading} />
        <StatCard title="NK erkannt" value={reportTotals.nk} loading={loading} />
      </div>

      <SectionCard title="Report-Center" subtitle="Diese Berichte nutzen die vorhandenen Buchungen und Objektstrukturen. PDF erfolgt zunächst stabil über die Druckfunktion des Browsers.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          {reportCards.map((report) => (
            <div key={report.type} style={{ border: "1px solid #e2e8f0", borderRadius: 18, padding: 14, background: "#fff", display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 950, color: "#0f172a" }}>{report.title}</div>
                  <div style={{ marginTop: 5, fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{report.description}</div>
                </div>
                <SmallStatusPill tone={report.status === "Bereit" ? "green" : report.status === "Prüfen" ? "amber" : "blue"}>{report.status}</SmallStatusPill>
              </div>
              <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 10, fontSize: 11, fontWeight: 900, color: "#475569" }}>Output: {report.output}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Dokumentenarchiv · Struktur" subtitle="Phase 2C bereitet die klare Ablage nach Objekt, Jahr und Dokumentart vor. Upload/Storage kann darauf aufbauen.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
          {archiveCategories.map((category) => (
            <div key={category.title} style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 13, background: "linear-gradient(180deg,#fff,#f8fafc)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 950, color: "#0f172a" }}>{category.title}</div>
                <SmallStatusPill tone={category.tone}>Archiv</SmallStatusPill>
              </div>
              <div style={{ marginTop: 7, fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{category.text}</div>
              <div style={{ marginTop: 10, fontSize: 11, color: "#94a3b8", fontWeight: 850 }}>Pfad: {selectedObjectLabel} / {year} / {category.title}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Audit- & Datenherkunft" subtitle="Damit Berichte nachvollziehbar bleiben, zeigt diese Ebene, welche Quelle für welche Kennzahl verwendet wird.">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                {['Bereich', 'Master-Quelle', 'Regel', 'Status'].map((head) => (
                  <th key={head} style={{ padding: 10, fontSize: 11, color: "#475569", borderBottom: "1px solid #e2e8f0", fontWeight: 950 }}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {auditRows.map((row) => (
                <tr key={row.area}>
                  <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9", fontSize: 12, fontWeight: 950 }}>{row.area}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9", fontSize: 12, color: "#475569" }}>{row.source}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9", fontSize: 12, color: "#475569" }}>{row.rule}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}><SmallStatusPill tone={row.status === "Aktiv" || row.status === "Bereit" ? "green" : "blue"}>{row.status}</SmallStatusPill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}


type PhaseFourDReportKind = "portfolio" | "object" | "bank" | "liquidity" | "capex" | "rent" | "documents";

type PhaseFourDReportDefinition = {
  key: PhaseFourDReportKind;
  title: string;
  subtitle: string;
  useCase: string;
  status: "Bereit" | "Druckbereit" | "Vorbereitet";
};

function PhaseFourDProfessionalReportingSystem() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [objektCode, setObjektCode] = useState("ALL");
  const [reportKind, setReportKind] = useState<PhaseFourDReportKind>("portfolio");
  const [objects, setObjects] = useState<DropdownRow[]>([]);
  const [incomeRows, setIncomeRows] = useState<EntryRow[]>([]);
  const [expenseRows, setExpenseRows] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data, error } = await supabase
        .from("v_object_dropdown")
        .select("objekt_code,label")
        .order("label", { ascending: true });

      if (!alive) return;

      if (error) {
        console.error("Fehler beim Laden der Reporting-Objekte:", error);
        setObjects([]);
        return;
      }

      setObjects(
        ((data ?? []) as DropdownRow[])
          .filter((row) => row.objekt_code && row.label)
          .filter((row) => !/test|trigger|rls|dummy/i.test(`${row.objekt_code} ${row.label}`))
          .sort((a, b) => a.label.localeCompare(b.label, "de"))
      );
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const initialLoad = window.setTimeout(() => {
      const safeYear = Number(year);

      if (!Number.isFinite(safeYear) || safeYear < 2000 || safeYear > 2100) {
        setError("Bitte ein gültiges Jahr eingeben.");
        setIncomeRows([]);
        setExpenseRows([]);
        return;
      }

      setLoading(true);
      setError(null);

      const from = `${safeYear}-01-01`;
      const to = `${safeYear + 1}-01-01`;

      void (async () => {
        try {
          let financeQuery = supabase
            .from("finance_entry")
            .select("id,objekt_code,booking_date,amount,category,note,entry_type")
            .eq("is_deleted", false)
            .gte("booking_date", from)
            .lt("booking_date", to)
            .in("entry_type", ["income", "expense"]);

          if (objektCode !== "ALL") {
            financeQuery = financeQuery.eq("objekt_code", objektCode);
          }

          const result = await financeQuery;
          if (result.error) throw result.error;

          if (!alive) return;
          const financeRows = splitFinanceEntries(mapFinanceEntryRows(result.data ?? []));
          setIncomeRows(financeRows.incomeRows);
          setExpenseRows(financeRows.expenseRows);
        } catch (e: unknown) {
          if (!alive) return;
          setError(e instanceof Error ? e.message : String(e));
          setIncomeRows([]);
          setExpenseRows([]);
        } finally {
          if (alive) setLoading(false);
        }
      })();
    }, 0);

    return () => {
      alive = false;
      window.clearTimeout(initialLoad);
    };
  }, [year, objektCode]);

  const selectedObjectLabel = useMemo(() => {
    if (objektCode === "ALL") return "Gesamtportfolio";
    return objects.find((object) => object.objekt_code === objektCode)?.label ?? objektCode;
  }, [objects, objektCode]);

  const allRows = useMemo<UnifiedEntryRow[]>(() => {
    return [
      ...incomeRows.map((row) => ({ ...row, entry_type: "income" as const })),
      ...expenseRows.map((row) => ({ ...row, entry_type: "expense" as const })),
    ];
  }, [incomeRows, expenseRows]);

  const totals = useMemo(() => {
    const income = incomeRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const expense = expenseRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const capex = expenseRows
      .filter((row) => /capex|sanierung|reparatur|modernisierung|instandhaltung|renovierung|fenster|dach|heizung/i.test(`${row.category ?? ""} ${row.note ?? ""}`))
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const nk = expenseRows
      .filter((row) => /nebenkosten|hausgeld|kalo|heizung|wasser|grundsteuer|versicherung|müll|muell|nk/i.test(`${row.category ?? ""} ${row.note ?? ""}`))
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const rent = incomeRows
      .filter((row) => /miete|garage|stellplatz/i.test(`${row.category ?? ""} ${row.note ?? ""}`))
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    return {
      income,
      expense,
      net: income - expense,
      capex,
      nk,
      rent,
      bookingCount: incomeRows.length + expenseRows.length,
      expenseRatio: income > 0 ? expense / income : 0,
    };
  }, [incomeRows, expenseRows]);

  const monthlyReportRows = useMemo(() => {
    const map = new Map<string, MonthlyRow>();
    for (let month = 1; month <= 12; month += 1) {
      const key = `${year}-${String(month).padStart(2, "0")}`;
      map.set(key, { month: key, income: 0, expense: 0, net: 0 });
    }

    for (const row of allRows) {
      const key = String(row.booking_date || "").slice(0, 7);
      const current = map.get(key);
      if (!current) continue;
      if (row.entry_type === "income") current.income += Number(row.amount || 0);
      if (row.entry_type === "expense") current.expense += Number(row.amount || 0);
      current.net = current.income - current.expense;
    }

    return Array.from(map.values());
  }, [allRows, year]);

  const objectRankingRows = useMemo(() => {
    const map = new Map<string, ObjectNetRow>();
    for (const row of allRows) {
      const key = row.objekt_code || "Ohne Objekt";
      const current = map.get(key) ?? { object: key, income: 0, expense: 0, net: 0 };
      if (row.entry_type === "income") current.income += Number(row.amount || 0);
      if (row.entry_type === "expense") current.expense += Number(row.amount || 0);
      current.net = current.income - current.expense;
      map.set(key, current);
    }
    return Array.from(map.values()).sort((a, b) => b.net - a.net).slice(0, 8);
  }, [allRows]);

  const reportDefinitions: PhaseFourDReportDefinition[] = useMemo(
    () => [
      { key: "portfolio", title: "Portfolio-Jahresbericht", subtitle: "Managementbericht mit KPIs, Cashflow, Capex, Objektvergleich und Datenherkunft.", useCase: "Eigentümer / interne Jahresauswertung", status: "Druckbereit" },
      { key: "object", title: "Objektbericht", subtitle: "Einzelobjektbericht für ausgewählte Immobilie mit Finanzen, Mietstatus, Capex und Archivstatus.", useCase: "Objektakte / Verwaltung", status: objektCode === "ALL" ? "Vorbereitet" : "Druckbereit" },
      { key: "bank", title: "Bankenreport", subtitle: "Finanzierungsorientierte Sicht mit Cashflow, Kostenquote, DSCR-Basis und Risikoampel.", useCase: "Bank / Finanzierungsgespräch", status: "Bereit" },
      { key: "liquidity", title: "Liquiditätsbericht", subtitle: "Monatlicher Verlauf mit Einnahmen, Ausgaben und Netto-Cashflow.", useCase: "Liquiditätsplanung", status: "Druckbereit" },
      { key: "capex", title: "Capex-/Sanierungsreport", subtitle: "Erkannte Sanierungen, Reparaturen und Modernisierungen mit Jahreswerten.", useCase: "Steuer / Investitionsplanung", status: totals.capex > 0 ? "Druckbereit" : "Vorbereitet" },
      { key: "rent", title: "Mietstatusbericht", subtitle: "Mieteinnahmen, Mietquote und objektbezogene Mietübersicht.", useCase: "Mietmanagement", status: totals.rent > 0 ? "Druckbereit" : "Vorbereitet" },
      { key: "documents", title: "Dokumenten-/Archivbericht", subtitle: "Dokumentenstruktur nach Objekt, Jahr und Kategorie als prüfbare Archivliste.", useCase: "Ablage / Nachweise", status: "Bereit" },
    ],
    [objektCode, totals.capex, totals.rent]
  );

  const selectedReport = reportDefinitions.find((report) => report.key === reportKind) ?? reportDefinitions[0];

  const riskAssessment = useMemo(() => {
    const issues: string[] = [];
    if (totals.net < 0) issues.push("Netto-Cashflow negativ");
    if (totals.income > 0 && totals.expenseRatio > 0.85) issues.push("Ausgabenquote über 85 %");
    if (totals.capex > totals.income * 0.35 && totals.income > 0) issues.push("Capex im Verhältnis zu Einnahmen hoch");
    if (totals.bookingCount === 0) issues.push("Keine Buchungen im Berichtsjahr");
    return {
      tone: issues.length >= 2 ? "red" as const : issues.length === 1 ? "amber" as const : "green" as const,
      label: issues.length >= 2 ? "kritisch prüfen" : issues.length === 1 ? "beobachten" : "stabil",
      issues,
    };
  }, [totals]);

  const csvContent = useMemo(() => {
    const rows = [
      ["Report", selectedReport.title],
      ["Objekt", selectedObjectLabel],
      ["Jahr", year],
      ["Einnahmen", String(totals.income)],
      ["Ausgaben", String(totals.expense)],
      ["Netto-Cashflow", String(totals.net)],
      ["Capex", String(totals.capex)],
      ["Nebenkosten", String(totals.nk)],
      ["Mieteinnahmen", String(totals.rent)],
      ["Buchungen", String(totals.bookingCount)],
      ["Status", riskAssessment.label],
    ];
    return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\n");
  }, [riskAssessment.label, selectedObjectLabel, selectedReport.title, totals, year]);

  function downloadReportCsv() {
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `koenen-${reportKind}-report-${year}-${objektCode === "ALL" ? "portfolio" : objektCode}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const documentArchiveRows = [
    { category: "Mietvertrag", path: `${selectedObjectLabel} / ${year} / Mietvertrag`, status: "Ablage prüfen" },
    { category: "Rechnungen", path: `${selectedObjectLabel} / ${year} / Rechnungen`, status: totals.expense > 0 ? "Kosten vorhanden" : "keine Kosten" },
    { category: "Nebenkosten", path: `${selectedObjectLabel} / ${year} / Nebenkosten`, status: totals.nk > 0 ? "NK-relevant" : "prüfen" },
    { category: "Darlehen", path: `${selectedObjectLabel} / ${year} / Darlehen`, status: "Unterlagen zuordnen" },
    { category: "Energie / WEG", path: `${selectedObjectLabel} / ${year} / Energie-WEG`, status: "Archivstruktur" },
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <SectionCard
        title="Phase 4D · Professionelles Reporting-/PDF-System"
        subtitle="Exportierbare Berichte für Portfolio, Objekt, Bank, Liquidität, Capex, Mietstatus und Dokumentenarchiv. PDF erfolgt stabil über die Browser-Druckansicht."
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
          <CompactKpi label="Report" value={selectedReport.title} tone="blue" />
          <CompactKpi label="Berichtsobjekt" value={normalizeArchiveObjectName(selectedObjectLabel)} />
          <CompactKpi label="Jahr" value={year} />
          <CompactKpi label="Status" value={riskAssessment.label} tone={riskAssessment.tone} />
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select value={reportKind} onChange={(event) => setReportKind(event.target.value as PhaseFourDReportKind)} style={{ minWidth: 240, border: "1px solid #e2e8f0", borderRadius: 14, padding: "10px 12px", fontWeight: 900 }}>
            {reportDefinitions.map((report) => (
              <option key={report.key} value={report.key}>{report.title}</option>
            ))}
          </select>
          <select value={objektCode} onChange={(event) => setObjektCode(event.target.value)} style={{ minWidth: 240, border: "1px solid #e2e8f0", borderRadius: 14, padding: "10px 12px", fontWeight: 900 }}>
            <option value="ALL">Gesamtportfolio</option>
            {objects.map((object) => (
              <option key={object.objekt_code} value={object.objekt_code}>{object.label}</option>
            ))}
          </select>
          <input value={year} onChange={(event) => setYear(event.target.value)} inputMode="numeric" style={{ width: 110, border: "1px solid #e2e8f0", borderRadius: 14, padding: "10px 12px", fontWeight: 900 }} />
          <ReportActionButton onClick={() => window.print()}>PDF/Druckansicht erstellen</ReportActionButton>
          <ReportActionButton variant="secondary" onClick={downloadReportCsv}>CSV exportieren</ReportActionButton>
        </div>
        {error ? <div style={{ marginTop: 12 }}><StabilityNotice tone="red" title="Reporting konnte nicht geladen werden" text={error} /></div> : null}
      </SectionCard>

      <SectionCard title="Report-Auswahl" subtitle="Jeder Bericht nutzt dieselben Masterdaten aus Buchungen, Objektakte und Dokumentenstruktur. Dadurch bleiben die Werte zwischen Auswertung, Portfolio und Datenprüfung konsistent.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          {reportDefinitions.map((report) => (
            <button
              key={report.key}
              type="button"
              onClick={() => setReportKind(report.key)}
              style={{
                textAlign: "left",
                border: reportKind === report.key ? "2px solid #2563eb" : "1px solid #e2e8f0",
                borderRadius: 18,
                padding: 14,
                background: reportKind === report.key ? "#eff6ff" : "#fff",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 950, color: "#0f172a" }}>{report.title}</div>
                <SmallStatusPill tone={report.status === "Druckbereit" ? "green" : report.status === "Bereit" ? "blue" : "amber"}>{report.status}</SmallStatusPill>
              </div>
              <div style={{ marginTop: 7, fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{report.subtitle}</div>
              <div style={{ marginTop: 10, fontSize: 11, color: "#475569", fontWeight: 900 }}>Use Case: {report.useCase}</div>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Druckfertige Berichtsansicht" subtitle={`${selectedReport.title} · ${selectedObjectLabel} · ${year}`}>
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 22, padding: 18, background: "linear-gradient(180deg,#ffffff,#f8fafc)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", borderBottom: "1px solid #e2e8f0", paddingBottom: 14 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 950, color: "#2563eb", textTransform: "uppercase", letterSpacing: ".12em" }}>Koenen Property Management</div>
              <div style={{ marginTop: 6, fontSize: 24, fontWeight: 950, color: "#0f172a" }}>{selectedReport.title}</div>
              <div style={{ marginTop: 5, fontSize: 13, color: "#64748b", fontWeight: 800 }}>{selectedObjectLabel} · Berichtsjahr {year}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <SmallStatusPill tone={riskAssessment.tone}>{riskAssessment.label}</SmallStatusPill>
              <div style={{ marginTop: 8, fontSize: 11, color: "#64748b", fontWeight: 850 }}>Erstellt: {formatDate(new Date().toISOString())}</div>
            </div>
          </div>

          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
            <CompactKpi label="Einnahmen" value={loading ? "…" : formatEUR(totals.income)} tone="green" />
            <CompactKpi label="Ausgaben" value={loading ? "…" : formatEUR(totals.expense)} tone="red" />
            <CompactKpi label="Netto-Cashflow" value={loading ? "…" : formatEUR(totals.net)} tone={totals.net >= 0 ? "green" : "red"} />
            <CompactKpi label="Capex erkannt" value={loading ? "…" : formatEUR(totals.capex)} tone="amber" />
            <CompactKpi label="NK erkannt" value={loading ? "…" : formatEUR(totals.nk)} tone="blue" />
            <CompactKpi label="Buchungen" value={loading ? "…" : String(totals.bookingCount)} />
          </div>

          {riskAssessment.issues.length ? (
            <div style={{ marginTop: 14 }}>
              <StabilityNotice tone={riskAssessment.tone} title="Prüfhinweise für diesen Bericht" text={riskAssessment.issues.join(" · ")} />
            </div>
          ) : (
            <div style={{ marginTop: 14 }}>
              <StabilityNotice tone="green" title="Keine kritischen Hinweise" text="Die Kennzahlen wirken für diesen Bericht konsistent. Bitte trotzdem Belege und Buchungen vor externer Weitergabe fachlich prüfen." />
            </div>
          )}
        </div>
      </SectionCard>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, .8fr)", gap: 16 }}>
        <SectionCard title="Liquiditätsverlauf im Bericht" subtitle="Monatliche Entwicklung aus denselben Einnahmen- und Ausgabenbuchungen.">
          {monthlyReportRows.every((row) => row.income === 0 && row.expense === 0) ? (
            <EmptyChartHint text="Für dieses Jahr/Objekt liegen noch keine Buchungen für den Bericht vor." />
          ) : (
            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer>
                <LineChart data={monthlyReportRows} margin={{ top: 12, right: 18, bottom: 12, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tickFormatter={formatMonthLabel} />
                  <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
                  <Tooltip formatter={(value) => formatEUR(Number(value ?? 0))} labelFormatter={(label) => formatMonthLabel(String(label ?? ""))} />
                  <Legend />
                  <Line type="monotone" dataKey="income" name="Einnahmen" stroke="#16a34a" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="expense" name="Ausgaben" stroke="#dc2626" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="net" name="Netto" stroke="#2563eb" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Berichtsempfehlung" subtitle="Automatisch abgeleitete Hinweise für die nächste Verwaltungsentscheidung.">
          <div style={{ display: "grid", gap: 10 }}>
            <StabilityNotice tone={totals.net >= 0 ? "green" : "red"} title="Cashflow" text={totals.net >= 0 ? "Der Bericht zeigt einen positiven Netto-Cashflow." : "Der Bericht zeigt einen negativen Netto-Cashflow. Ausgaben, Capex und Mietstatus prüfen."} />
            <StabilityNotice tone={totals.capex > 0 ? "amber" : "slate"} title="Capex" text={totals.capex > 0 ? `Capex/Sanierung erkannt: ${formatEUR(totals.capex)}. Für Steuer/Bank separat ausweisen.` : "Keine Capex-relevanten Buchungen erkannt."} />
            <StabilityNotice tone={totals.bookingCount > 0 ? "blue" : "amber"} title="Datenlage" text={totals.bookingCount > 0 ? `${totals.bookingCount} Buchungen wurden in den Bericht einbezogen.` : "Keine Buchungen vorhanden. Bericht ist nur strukturell nutzbar."} />
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Objektvergleich für Portfolio-Berichte" subtitle="Ranking nach Netto-Cashflow im ausgewählten Jahr. Bei Einzelobjekt-Auswahl wird nur dieses Objekt dargestellt.">
        {objectRankingRows.length === 0 ? (
          <EmptyChartHint text="Noch keine Rankingdaten vorhanden." />
        ) : (
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={objectRankingRows} margin={{ top: 18, right: 18, bottom: 30, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="object" interval={0} angle={-18} textAnchor="end" height={70} />
                <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
                <Tooltip formatter={(value) => formatEUR(Number(value ?? 0))} />
                <Bar dataKey="net" name="Netto-Cashflow" fill="#2563eb" radius={[8, 8, 0, 0]}>
                  <LabelList dataKey="net" position="top" formatter={(value) => formatEUR(Number(value ?? 0))} style={{ fontSize: 10, fontWeight: 800 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Dokumenten-/Archivbericht" subtitle="Prüfliste für objektbezogene Berichtsunterlagen. Diese Struktur ergänzt das Dokumentencenter und kann mit Supabase Storage verknüpft werden.">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                {["Kategorie", "Archivpfad", "Status", "Berichtsrelevanz"].map((head) => (
                  <th key={head} style={{ padding: 10, borderBottom: "1px solid #e2e8f0", fontSize: 11, fontWeight: 950, color: "#475569" }}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {documentArchiveRows.map((row) => (
                <tr key={row.category}>
                  <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9", fontSize: 12, fontWeight: 950 }}>{row.category}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9", fontSize: 12, color: "#475569" }}>{row.path}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}><SmallStatusPill tone={row.status.includes("vorhanden") || row.status.includes("Kosten") ? "green" : "blue"}>{row.status}</SmallStatusPill></td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9", fontSize: 12, color: "#64748b" }}>Für {selectedReport.title}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

function AuswertungCore() {
  const [from, setFrom] = useState(() => toISODate(addDays(new Date(), -29)));
  const [to, setTo] = useState(() => toISODate(new Date()));
  const [mode, setMode] = useState<"income" | "expense">("income");

  const [objects, setObjects] = useState<DropdownRow[]>([]);
  const [objektCode, setObjektCode] = useState<string>("ALL");

  const [incomeRows, setIncomeRows] = useState<EntryRow[]>([]);
  const [expenseRows, setExpenseRows] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data, error } = await supabase
        .from("v_object_dropdown")
        .select("objekt_code,label")
        .order("label", { ascending: true });

      if (!alive) return;

      if (error) {
        console.error("Fehler beim Laden der Objekt-Dropdown-Liste:", error);
        setObjects([]);
        return;
      }

      const list = ((data ?? []) as Partial<DropdownRow>[])
        .filter((row): row is DropdownRow => Boolean(row.objekt_code && row.label))
        .sort((a, b) => a.label.localeCompare(b.label, "de"));

      setObjects(list);
    })();

    return () => {
      alive = false;
    };
  }, []);

  async function load() {
    setLoading(true);
    setErr(null);

    if (!from || !to) {
      setErr("Bitte Von- und Bis-Datum setzen.");
      setIncomeRows([]);
      setExpenseRows([]);
      setLoading(false);
      return;
    }

    if (from > to) {
      setErr("Das Von-Datum darf nicht nach dem Bis-Datum liegen.");
      setIncomeRows([]);
      setExpenseRows([]);
      setLoading(false);
      return;
    }

    const toPlus1 = toISODate(addDays(new Date(to), 1));
    const selectedCode = objektCode?.trim();

    try {
      let query = supabase
        .from("finance_entry")
        .select("id,objekt_code,booking_date,amount,category,note,entry_type")
        .eq("is_deleted", false)
        .gte("booking_date", from)
        .lt("booking_date", toPlus1)
        .in("entry_type", ["income", "expense"]);

      if (selectedCode && selectedCode !== "ALL") {
        query = query.eq("objekt_code", selectedCode);
      }

      const result = await query.order("booking_date", { ascending: true });

      if (result.error) throw result.error;

      const rows = ((result.data ?? []) as Array<EntryRow & { entry_type?: EntryType }>).map((row) => ({
        ...row,
        amount: Number(row.amount || 0),
      }));

      setIncomeRows(rows.filter((row) => row.entry_type === "income"));
      setExpenseRows(rows.filter((row) => row.entry_type === "expense"));
      setLoading(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
      setIncomeRows([]);
      setExpenseRows([]);
      setLoading(false);
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initialLoad);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objektCode]);

  const allRows: UnifiedEntryRow[] = useMemo(() => {
    const income: UnifiedEntryRow[] = incomeRows.map((r) => ({
      ...r,
      entry_type: "income",
    }));

    const expense: UnifiedEntryRow[] = expenseRows.map((r) => ({
      ...r,
      entry_type: "expense",
    }));

    return [...income, ...expense].sort((a, b) =>
      a.booking_date < b.booking_date ? -1 : a.booking_date > b.booking_date ? 1 : 0
    );
  }, [incomeRows, expenseRows]);

  const totals = useMemo(() => {
    const income = incomeRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const expense = expenseRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

    return {
      income,
      expense,
      net: income - expense,
    };
  }, [incomeRows, expenseRows]);

  const activeRows = mode === "income" ? incomeRows : expenseRows;

  const pieData: PieRow[] = useMemo(() => {
    const map = new Map<string, number>();

    for (const row of activeRows) {
      const cat = (row.category && row.category.trim()) || "Ohne Kategorie";
      map.set(cat, (map.get(cat) ?? 0) + Number(row.amount || 0));
    }

    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [activeRows]);

  const expenseCategoryBarData: PieRow[] = useMemo(() => {
    const map = new Map<string, number>();

    for (const row of expenseRows) {
      const cat = (row.category && row.category.trim()) || "Ohne Kategorie";
      map.set(cat, (map.get(cat) ?? 0) + Number(row.amount || 0));
    }

    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [expenseRows]);

  const expenseCategoryTableData: ExpenseCategoryTableRow[] = useMemo(() => {
    const map = new Map<string, number>();

    for (const row of expenseRows) {
      const cat = (row.category && row.category.trim()) || "Ohne Kategorie";
      map.set(cat, (map.get(cat) ?? 0) + Number(row.amount || 0));
    }

    const totalExpense = Array.from(map.values()).reduce((sum, value) => sum + value, 0);

    return Array.from(map.entries())
      .map(([name, value]) => ({
        name,
        value,
        share: totalExpense > 0 ? (value / totalExpense) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [expenseRows]);

  const monthlyData: MonthlyRow[] = useMemo(() => {
    const map = new Map<string, { income: number; expense: number }>();

    for (const row of allRows) {
      const key = row.booking_date.slice(0, 7);

      if (!map.has(key)) {
        map.set(key, { income: 0, expense: 0 });
      }

      const bucket = map.get(key)!;

      if (row.entry_type === "income") {
        bucket.income += Number(row.amount || 0);
      } else {
        bucket.expense += Number(row.amount || 0);
      }
    }

    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, values]) => ({
        month: formatMonthLabel(month),
        income: values.income,
        expense: values.expense,
        net: values.income - values.expense,
      }));
  }, [allRows]);

  const objectNetData: ObjectNetRow[] = useMemo(() => {
    const map = new Map<string, { income: number; expense: number }>();

    for (const row of allRows) {
      const key = row.objekt_code || "Ohne Objekt";

      if (!map.has(key)) {
        map.set(key, { income: 0, expense: 0 });
      }

      const bucket = map.get(key)!;

      if (row.entry_type === "income") {
        bucket.income += Number(row.amount || 0);
      } else {
        bucket.expense += Number(row.amount || 0);
      }
    }

    return Array.from(map.entries())
      .map(([object, values]) => ({
        object,
        income: values.income,
        expense: values.expense,
        net: values.income - values.expense,
      }))
      .sort((a, b) => b.net - a.net);
  }, [allRows]);

  const topTransactions: TopTransactionRow[] = useMemo(() => {
    return [...allRows]
      .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
      .slice(0, 10)
      .map((row) => ({
        id: row.id,
        booking_date: row.booking_date,
        objekt_code: row.objekt_code,
        entry_type: row.entry_type,
        category: row.category,
        note: row.note,
        amount: Number(row.amount || 0),
      }));
  }, [allRows]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 6 }}>Auswertung</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Zeitraum-Auswertung mit KPIs, Kreisdiagramm, Zeitreihe, Kostenstruktur, Objektvergleich und Top-Transaktionen.
          </div>
        </div>

        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <label style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>
            Objekt
            <select
              value={objektCode}
              onChange={(e) => setObjektCode(e.target.value)}
              style={{
                marginLeft: 8,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                fontWeight: 800,
                minWidth: 260,
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

          <label style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>
            Von
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={{
                marginLeft: 8,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                fontWeight: 800,
              }}
            />
          </label>

          <label style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>
            Bis
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={{
                marginLeft: 8,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                fontWeight: 800,
              }}
            />
          </label>

          <button
            onClick={() => void load()}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "white",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Anwenden
          </button>
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        <StatCard title="Einnahmen" value={totals.income} loading={loading} />
        <StatCard title="Ausgaben" value={totals.expense} loading={loading} />
        <StatCard title="Netto" value={totals.net} loading={loading} />
      </div>

      <MonthlyLineSection data={monthlyData} />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={() => setMode("income")}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: mode === "income" ? "#f3f4f6" : "white",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          Kreisdiagramm: Einnahmen
        </button>
        <button
          onClick={() => setMode("expense")}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: mode === "expense" ? "#f3f4f6" : "white",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          Kreisdiagramm: Ausgaben
        </button>
      </div>

      <PieSection
        title={`${mode === "income" ? "Einnahmen" : "Ausgaben"} nach Kategorie`}
        data={pieData}
      />

      <ExpenseCategoryBarSection data={expenseCategoryBarData} />

      <ExpenseCategoryTableSection data={expenseCategoryTableData} />

      <ObjectNetBarSection data={objectNetData} />

      <TopTransactionsSection data={topTransactions} />
    </div>
  );
}

function PhaseThreeASingleSourceCenter() {
  const app = useAppData();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const selectedYear = Number(year) || new Date().getFullYear();

  const backendFinance = useBackendFinanceMaster(selectedYear);
  const frontendSnapshots = useMemo(() => buildMasterFinanceSnapshots({
    objects: app.objects,
    entries: app.entries,
    yearlyFinanceSummaries: app.yearlyFinanceSummaries,
    portfolioRows: app.portfolioRows,
    loanRows: app.loanRows,
    loanChartByPropertyId: app.loanChartByPropertyId,
  }, selectedYear), [app.objects, app.entries, app.yearlyFinanceSummaries, app.portfolioRows, app.loanRows, app.loanChartByPropertyId, selectedYear]);
  const snapshots = backendFinance.snapshots.length ? backendFinance.snapshots : frontendSnapshots;
  const totals = useMemo(() => buildMasterTotals(snapshots), [snapshots]);
  const warnings = snapshots.filter((row) => row.issues.length > 0);
  const strongestCashflow = [...snapshots].sort((a, b) => b.netCashflow - a.netCashflow).slice(0, 5);

  return (
    <div className="space-y-5">
      <SectionCard
        title="Phase 5D · Backend-Finanzmaster aktiv"
        subtitle="Portfolio, Datenprüfung, Auswertung und Objektakte nutzen bevorzugt die neue Supabase-Finance-Master-View/RPCs aus Phase 5C. Nur wenn der Backend-Master nicht verfügbar ist, greift die UI auf den Frontend-Fallback zurück."
      >
        <div style={{ marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <SmallStatusPill tone={backendFinance.snapshots.length ? "green" : backendFinance.error ? "red" : "amber"}>{backendFinance.snapshots.length ? "Quelle: Backend-Finanzmaster" : "Quelle: Frontend-Fallback"}</SmallStatusPill>
          <div style={{ color: backendFinance.error ? "#be123c" : "#64748b", fontSize: 12, fontWeight: 850 }}>
            {backendFinance.error ?? (backendFinance.refreshedAt ? `Stand: ${formatDate(backendFinance.refreshedAt)}` : "Backend-Master wird geprüft …")}
          </div>
          <button type="button" disabled title="Der technische Server-Refresh ist aus Sicherheitsgründen nur serverseitig freigegeben." className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-black shadow-sm disabled:opacity-60">
            Refresh geschützt
          </button>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 18, padding: 14, background: "#f8fafc" }}><div style={{ fontSize: 11, fontWeight: 950, color: "#64748b", textTransform: "uppercase", letterSpacing: ".08em" }}>Restschuld</div><div style={{ marginTop: 6, fontSize: 20, fontWeight: 950 }}>{formatEUR(totals.latestBalance)}</div></div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 18, padding: 14, background: "#f8fafc" }}><div style={{ fontSize: 11, fontWeight: 950, color: "#64748b", textTransform: "uppercase", letterSpacing: ".08em" }}>Einnahmen</div><div style={{ marginTop: 6, fontSize: 20, fontWeight: 950 }}>{formatEUR(totals.income)}</div></div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 18, padding: 14, background: "#f8fafc" }}><div style={{ fontSize: 11, fontWeight: 950, color: "#64748b", textTransform: "uppercase", letterSpacing: ".08em" }}>Ausgaben</div><div style={{ marginTop: 6, fontSize: 20, fontWeight: 950 }}>{formatEUR(totals.expenses)}</div></div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 18, padding: 14, background: "#f8fafc" }}><div style={{ fontSize: 11, fontWeight: 950, color: "#64748b", textTransform: "uppercase", letterSpacing: ".08em" }}>Capex</div><div style={{ marginTop: 6, fontSize: 20, fontWeight: 950 }}>{formatEUR(totals.capex)}</div></div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 18, padding: 14, background: totals.netCashflow >= 0 ? "#ecfdf5" : "#fff1f2" }}><div style={{ fontSize: 11, fontWeight: 950, color: "#64748b", textTransform: "uppercase", letterSpacing: ".08em" }}>Cashflow</div><div style={{ marginTop: 6, fontSize: 20, fontWeight: 950 }}>{formatEUR(totals.netCashflow)}</div></div>
          </div>
          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 950, textTransform: "uppercase", letterSpacing: ".08em", color: "#64748b" }}>Master-Jahr</span>
            <select value={year} onChange={(event) => setYear(event.target.value)} style={{ height: 44, borderRadius: 16, border: "1px solid #e2e8f0", padding: "0 12px", fontWeight: 900, background: "white" }}>
              {Array.from({ length: 12 }, (_, index) => new Date().getFullYear() - index).map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
            </select>
          </label>
        </div>
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <SectionCard title="Master-Prüftabelle" subtitle="Zeigt pro Objekt, welche Masterquelle verwendet wird und ob Daten abweichen.">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr style={{ textAlign: "left", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: ".08em" }}>
                  <th style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>Objekt</th>
                  <th style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>Restschuld</th>
                  <th style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>Einnahmen</th>
                  <th style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>Ausgaben</th>
                  <th style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>Quelle</th>
                  <th style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((row) => (
                  <tr key={row.propertyId}>
                    <td style={{ padding: "12px", borderBottom: "1px solid #f1f5f9", fontWeight: 950 }}>{cleanDisplayName(row.propertyName, "Objekt")}</td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #f1f5f9", fontWeight: 850 }}>{row.latestBalance == null ? "—" : formatEUR(row.latestBalance)}</td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #f1f5f9", fontWeight: 850 }}>{formatEUR(row.income)}</td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #f1f5f9", fontWeight: 850 }}>{formatEUR(row.expenses)}</td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #f1f5f9", color: "#64748b", fontSize: 12, fontWeight: 800 }}>Balance: {row.sources.balance} · Finanzen: {row.sources.income}/{row.sources.expenses}</td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #f1f5f9" }}><SmallStatusPill tone={row.severity === "ok" ? "green" : row.severity === "critical" ? "red" : "amber"}>{row.issues.length ? `${row.issues.length} Hinweis(e)` : "OK"}</SmallStatusPill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Abweichungen & Top-Cashflow" subtitle="Schneller Überblick, welche Objekte zuerst geprüft werden sollten.">
          <div style={{ display: "grid", gap: 12 }}>
            {warnings.slice(0, 5).map((row) => (
              <div key={row.propertyId} style={{ border: "1px solid #e2e8f0", borderRadius: 18, padding: 12, background: row.severity === "critical" ? "#fff1f2" : "#fffbeb" }}>
                <div style={{ fontWeight: 950 }}>{cleanDisplayName(row.propertyName, "Objekt")}</div>
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "#475569", fontSize: 13, fontWeight: 700 }}>
                  {row.issues.slice(0, 3).map((issue) => <li key={issue}>{issue}</li>)}
                </ul>
              </div>
            ))}
            {!warnings.length ? <div style={{ border: "1px solid #bbf7d0", borderRadius: 18, padding: 14, background: "#ecfdf5", color: "#047857", fontWeight: 950 }}>Alle Master-Daten wirken konsistent.</div> : null}
            <div style={{ height: 1, background: "#e2e8f0", margin: "4px 0" }} />
            {strongestCashflow.map((row) => (
              <div key={`cash-${row.propertyId}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontWeight: 900 }}>
                <span>{cleanDisplayName(row.propertyName, "Objekt")}</span><span>{formatEUR(row.netCashflow)}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}


type PortfolioBiRow = {
  propertyId: string;
  propertyName: string;
  income: number;
  expenses: number;
  capex: number;
  netCashflow: number;
  latestBalance: number | null;
  rentYield: number | null;
  capexRatio: number;
  riskScore: number;
  riskTone: "green" | "amber" | "red" | "slate";
  recommendation: string;
};

function percentageLabel(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1).replace(".", ",")} %`;
}

function getRiskTone(score: number): "green" | "amber" | "red" | "slate" {
  if (!Number.isFinite(score)) return "slate";
  if (score >= 70) return "red";
  if (score >= 35) return "amber";
  return "green";
}

function buildPortfolioBiRows(snapshots: ReturnType<typeof buildMasterFinanceSnapshots>): PortfolioBiRow[] {
  return snapshots.map((row) => {
    const rentYield = row.latestBalance && row.latestBalance > 0 ? (row.rentIncome || row.income) / row.latestBalance * 100 : null;
    const capexRatio = row.expenses > 0 ? row.capex / row.expenses * 100 : 0;
    let riskScore = 0;
    if (row.netCashflow < 0) riskScore += 35;
    if (row.latestBalance == null) riskScore += 25;
    if (row.income <= 0) riskScore += 20;
    if (capexRatio > 35) riskScore += 15;
    if (row.severity === "critical") riskScore += 30;
    if (row.severity === "warning") riskScore += 12;
    riskScore = Math.min(100, Math.round(riskScore));

    let recommendation = "Stabil beobachten.";
    if (row.latestBalance == null) recommendation = "Darlehens-/Ledger-Verknüpfung prüfen.";
    else if (row.netCashflow < 0) recommendation = "Cashflow prüfen: Ausgaben, Miete oder Capex analysieren.";
    else if (capexRatio > 35) recommendation = "Capex-Belastung hoch: Investitionsplanung überprüfen.";
    else if (rentYield != null && rentYield < 2.5) recommendation = "Rendite niedrig: Mietniveau oder Finanzierung prüfen.";
    else if (rentYield != null && rentYield >= 5 && row.netCashflow > 0) recommendation = "Starkes Objekt: als Benchmark für Portfolio nutzen.";

    return {
      propertyId: row.propertyId,
      propertyName: cleanDisplayName(row.propertyName, "Objekt"),
      income: row.income,
      expenses: row.expenses,
      capex: row.capex,
      netCashflow: row.netCashflow,
      latestBalance: row.latestBalance,
      rentYield,
      capexRatio,
      riskScore,
      riskTone: getRiskTone(riskScore),
      recommendation,
    };
  });
}

function PhaseFourCBusinessIntelligenceCenter() {
  const app = useAppData();
  const currentYear = new Date().getFullYear();
  const backendFinance = useBackendFinanceMaster(currentYear);
  const frontendSnapshots = useMemo(() => buildMasterFinanceSnapshots({
    objects: app.objects,
    entries: app.entries,
    yearlyFinanceSummaries: app.yearlyFinanceSummaries,
    portfolioRows: app.portfolioRows,
    loanRows: app.loanRows,
    loanChartByPropertyId: app.loanChartByPropertyId,
  }, currentYear), [app.objects, app.entries, app.yearlyFinanceSummaries, app.portfolioRows, app.loanRows, app.loanChartByPropertyId, currentYear]);
  const snapshots = backendFinance.snapshots.length ? backendFinance.snapshots : frontendSnapshots;

  const biRows = useMemo(() => buildPortfolioBiRows(snapshots), [snapshots]);
  const totals = useMemo(() => buildMasterTotals(snapshots), [snapshots]);
  const bestCashflow = useMemo(() => [...biRows].sort((a, b) => b.netCashflow - a.netCashflow)[0], [biRows]);
  const weakestCashflow = useMemo(() => [...biRows].sort((a, b) => a.netCashflow - b.netCashflow)[0], [biRows]);
  const highestCapex = useMemo(() => [...biRows].sort((a, b) => b.capex - a.capex)[0], [biRows]);
  const highestRisk = useMemo(() => [...biRows].sort((a, b) => b.riskScore - a.riskScore)[0], [biRows]);
  const rankedByYield = useMemo(() => [...biRows]
    .filter((row) => row.rentYield != null)
    .sort((a, b) => (b.rentYield ?? -Infinity) - (a.rentYield ?? -Infinity))
    .slice(0, 8), [biRows]);
  const rankedByCashflow = useMemo(() => [...biRows].sort((a, b) => b.netCashflow - a.netCashflow).slice(0, 8), [biRows]);
  const rankedByRisk = useMemo(() => [...biRows].sort((a, b) => b.riskScore - a.riskScore).slice(0, 8), [biRows]);
  const chartRows = useMemo(() => biRows.map((row) => ({
    object: cleanDisplayName(row.propertyName, "Objekt"),
    Cashflow: row.netCashflow,
    Capex: row.capex,
    Einnahmen: row.income,
  })).slice(0, 10), [biRows]);

  const portfolioStatus = totals.netCashflow < 0 || (highestRisk?.riskScore ?? 0) >= 70
    ? { tone: "red" as const, label: "Prüfen", text: "Mindestens ein Kernindikator ist kritisch. Priorisiere Risikoobjekte und negativen Cashflow." }
    : totals.warnings > 0
      ? { tone: "amber" as const, label: "Beobachten", text: "Portfolio wirkt nutzbar, aber einzelne Daten-/Risikoindikatoren sollten geprüft werden." }
      : { tone: "green" as const, label: "Stabil", text: "Keine kritischen Portfolioindikatoren aus der aktuellen Masterlogik erkannt." };

  return (
    <div className="space-y-5">
      <SectionCard
        title="Phase 4C · Business Intelligence / Portfolioanalyse"
        subtitle="Objekt-Ranking, Renditevergleich, Cashflow-Ranking, Capex-Belastung, Darlehensrisiko und konkrete Handlungsempfehlungen aus den zentralen Masterdaten."
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 22, padding: 16, background: "#f8fafc" }}>
              <div style={{ fontSize: 11, fontWeight: 950, color: "#64748b", textTransform: "uppercase", letterSpacing: ".08em" }}>Portfolio-Cashflow</div>
              <div style={{ marginTop: 8, fontSize: 22, fontWeight: 950, color: totals.netCashflow >= 0 ? "#047857" : "#be123c" }}>{formatEUR(totals.netCashflow)}</div>
            </div>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 22, padding: 16, background: "#f8fafc" }}>
              <div style={{ fontSize: 11, fontWeight: 950, color: "#64748b", textTransform: "uppercase", letterSpacing: ".08em" }}>Restschuld gesamt</div>
              <div style={{ marginTop: 8, fontSize: 22, fontWeight: 950 }}>{formatEUR(totals.latestBalance)}</div>
            </div>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 22, padding: 16, background: "#f8fafc" }}>
              <div style={{ fontSize: 11, fontWeight: 950, color: "#64748b", textTransform: "uppercase", letterSpacing: ".08em" }}>Capex gesamt</div>
              <div style={{ marginTop: 8, fontSize: 22, fontWeight: 950 }}>{formatEUR(totals.capex)}</div>
            </div>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 22, padding: 16, background: highestRisk?.riskScore ? (highestRisk.riskScore >= 70 ? "#fff1f2" : highestRisk.riskScore >= 35 ? "#fffbeb" : "#ecfdf5") : "#f8fafc" }}>
              <div style={{ fontSize: 11, fontWeight: 950, color: "#64748b", textTransform: "uppercase", letterSpacing: ".08em" }}>Max. Risiko</div>
              <div style={{ marginTop: 8, fontSize: 22, fontWeight: 950 }}>{highestRisk ? `${highestRisk.riskScore}/100` : "—"}</div>
            </div>
          </div>
          <StabilityNotice tone={portfolioStatus.tone} title={`Portfolio-Status: ${portfolioStatus.label}`} text={portfolioStatus.text} />
        </div>
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-4">
        <SectionCard title="Bester Cashflow" subtitle="Objekt mit stärkstem Nettoergebnis.">
          <div style={{ fontWeight: 950 }}>{bestCashflow ? cleanDisplayName(bestCashflow.propertyName, "Objekt") : "—"}</div>
          <div style={{ marginTop: 8, fontSize: 22, fontWeight: 950, color: "#047857" }}>{bestCashflow ? formatEUR(bestCashflow.netCashflow) : "—"}</div>
        </SectionCard>
        <SectionCard title="Schwächster Cashflow" subtitle="Erster Prüfpunkt bei Liquiditätsrisiken.">
          <div style={{ fontWeight: 950 }}>{weakestCashflow ? cleanDisplayName(weakestCashflow.propertyName, "Objekt") : "—"}</div>
          <div style={{ marginTop: 8, fontSize: 22, fontWeight: 950, color: weakestCashflow && weakestCashflow.netCashflow < 0 ? "#be123c" : "#0f172a" }}>{weakestCashflow ? formatEUR(weakestCashflow.netCashflow) : "—"}</div>
        </SectionCard>
        <SectionCard title="Höchste Capex" subtitle="Objekt mit größter Investitionsbelastung.">
          <div style={{ fontWeight: 950 }}>{highestCapex ? cleanDisplayName(highestCapex.propertyName, "Objekt") : "—"}</div>
          <div style={{ marginTop: 8, fontSize: 22, fontWeight: 950 }}>{highestCapex ? formatEUR(highestCapex.capex) : "—"}</div>
        </SectionCard>
        <SectionCard title="Höchstes Risiko" subtitle="Kombiniert Cashflow, Restschuld, Capex und Datenhinweise.">
          <div style={{ fontWeight: 950 }}>{highestRisk ? cleanDisplayName(highestRisk.propertyName, "Objekt") : "—"}</div>
          <div style={{ marginTop: 8 }}>{highestRisk ? <SmallStatusPill tone={highestRisk.riskTone}>{highestRisk.riskScore}/100</SmallStatusPill> : <SmallStatusPill tone="slate">—</SmallStatusPill>}</div>
        </SectionCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)]">
        <SectionCard title="Portfolio-Performance nach Objekt" subtitle="Vergleich von Cashflow, Capex und Einnahmen für die wichtigsten Objekte.">
          {chartRows.length === 0 ? (
            <EmptyChartHint text="Noch keine BI-Daten vorhanden." />
          ) : (
            <div style={{ width: "100%", height: 360 }}>
              <ResponsiveContainer>
                <BarChart data={chartRows} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="object" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip formatter={(v) => formatEUR(Number(v))} />
                  <Legend />
                  <Bar dataKey="Cashflow" fill="#2563eb" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Capex" fill="#d97706" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Einnahmen" fill="#16a34a" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Handlungsempfehlungen" subtitle="Automatisch abgeleitet aus Risiko, Cashflow, Rendite und Datenqualität.">
          <div style={{ display: "grid", gap: 10 }}>
            {rankedByRisk.slice(0, 6).map((row) => (
              <div key={row.propertyId} style={{ border: "1px solid #e2e8f0", borderRadius: 18, padding: 12, background: row.riskTone === "red" ? "#fff1f2" : row.riskTone === "amber" ? "#fffbeb" : "#ffffff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div style={{ fontWeight: 950 }}>{cleanDisplayName(row.propertyName, "Objekt")}</div>
                  <SmallStatusPill tone={row.riskTone}>{row.riskScore}/100</SmallStatusPill>
                </div>
                <div style={{ marginTop: 7, color: "#64748b", fontSize: 12, fontWeight: 750, lineHeight: 1.45 }}>{row.recommendation}</div>
              </div>
            ))}
            {rankedByRisk.length === 0 ? <EmptyChartHint text="Keine Handlungsempfehlungen vorhanden." /> : null}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <SectionCard title="Rendite-Ranking" subtitle="Nähe: Mieteinnahmen / Restschuld. Für echte Mietrendite später Kaufpreis/Marktwert ergänzen.">
          <div style={{ display: "grid", gap: 9 }}>
            {rankedByYield.length === 0 ? <EmptyChartHint text="Keine Renditedaten vorhanden." /> : rankedByYield.map((row, index) => (
              <div key={row.propertyId} style={{ display: "grid", gridTemplateColumns: "34px 1fr auto", alignItems: "center", gap: 10, border: "1px solid #e2e8f0", borderRadius: 16, padding: "10px 12px", background: "#ffffff" }}>
                <div style={{ fontWeight: 950, color: "#4f46e5" }}>#{index + 1}</div>
                <div style={{ minWidth: 0, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cleanDisplayName(row.propertyName, "Objekt")}</div>
                <SmallStatusPill tone={(row.rentYield ?? 0) >= 5 ? "green" : (row.rentYield ?? 0) >= 3 ? "amber" : "slate"}>{percentageLabel(row.rentYield)}</SmallStatusPill>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Cashflow-Ranking" subtitle="Sortiert nach positivem Netto-Cashflow.">
          <div style={{ display: "grid", gap: 9 }}>
            {rankedByCashflow.map((row, index) => (
              <div key={row.propertyId} style={{ display: "grid", gridTemplateColumns: "34px 1fr auto", alignItems: "center", gap: 10, border: "1px solid #e2e8f0", borderRadius: 16, padding: "10px 12px", background: row.netCashflow < 0 ? "#fff1f2" : "#ffffff" }}>
                <div style={{ fontWeight: 950, color: "#4f46e5" }}>#{index + 1}</div>
                <div style={{ minWidth: 0, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cleanDisplayName(row.propertyName, "Objekt")}</div>
                <span style={{ fontSize: 12, fontWeight: 950, color: row.netCashflow >= 0 ? "#047857" : "#be123c" }}>{formatEUR(row.netCashflow)}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Risiko-Ranking" subtitle="Priorisierte Objektliste für operative Prüfung.">
          <div style={{ display: "grid", gap: 9 }}>
            {rankedByRisk.map((row, index) => (
              <div key={row.propertyId} style={{ display: "grid", gridTemplateColumns: "34px 1fr auto", alignItems: "center", gap: 10, border: "1px solid #e2e8f0", borderRadius: 16, padding: "10px 12px", background: row.riskTone === "red" ? "#fff1f2" : row.riskTone === "amber" ? "#fffbeb" : "#ffffff" }}>
                <div style={{ fontWeight: 950, color: "#4f46e5" }}>#{index + 1}</div>
                <div style={{ minWidth: 0, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cleanDisplayName(row.propertyName, "Objekt")}</div>
                <SmallStatusPill tone={row.riskTone}>{row.riskScore}</SmallStatusPill>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}


type StabilityCheckRow = {
  label: string;
  status: "OK" | "Prüfen" | "Offen";
  tone: "green" | "amber" | "blue" | "red" | "slate";
  detail: string;
};

function PhaseThreeBStabilityCenter() {
  const app = useAppData();
  const currentYear = new Date().getFullYear();
  const backendFinance = useBackendFinanceMaster(currentYear);
  const frontendSnapshots = useMemo(() => buildMasterFinanceSnapshots({
    objects: app.objects,
    entries: app.entries,
    yearlyFinanceSummaries: app.yearlyFinanceSummaries,
    portfolioRows: app.portfolioRows,
    loanRows: app.loanRows,
    loanChartByPropertyId: app.loanChartByPropertyId,
  }, currentYear), [app.objects, app.entries, app.yearlyFinanceSummaries, app.portfolioRows, app.loanRows, app.loanChartByPropertyId, currentYear]);
  const snapshots = backendFinance.snapshots.length ? backendFinance.snapshots : frontendSnapshots;

  const totals = useMemo(() => buildMasterTotals(snapshots), [snapshots]);
  const criticalObjects = useMemo(() => snapshots.filter((row) => row.severity === "critical"), [snapshots]);
  const warningObjects = useMemo(() => snapshots.filter((row) => row.severity === "warning"), [snapshots]);

  const dataReadiness = useMemo(() => {
    const categories = [
      { label: "Objekte", count: app.objects.length },
      { label: "Buchungen", count: app.entries.length },
      { label: "Portfolio", count: app.portfolioRows.length },
      { label: "Darlehen", count: app.loanRows.length },
      { label: "Jahresfinanzen", count: app.yearlyFinanceSummaries.length },
    ];
    const available = categories.filter((item) => item.count > 0).length;
    return { categories, available, total: categories.length, percent: Math.round((available / categories.length) * 100) };
  }, [app.objects.length, app.entries.length, app.portfolioRows.length, app.loanRows.length, app.yearlyFinanceSummaries.length]);

  const checks = useMemo<StabilityCheckRow[]>(() => [
    {
      label: "Single Source Daten",
      status: snapshots.length > 0 ? "OK" : "Offen",
      tone: snapshots.length > 0 ? "green" : "amber",
      detail: snapshots.length > 0 ? `${snapshots.length} produktive Objekt-Snapshots zentral berechnet.` : "Noch keine produktiven Master-Snapshots geladen.",
    },
    {
      label: "Datenabweichungen",
      status: criticalObjects.length > 0 ? "Prüfen" : "OK",
      tone: criticalObjects.length > 0 ? "red" : warningObjects.length > 0 ? "amber" : "green",
      detail: criticalObjects.length > 0 ? `${criticalObjects.length} kritische Objekt(e) müssen geprüft werden.` : warningObjects.length > 0 ? `${warningObjects.length} Objekt(e) mit Hinweisen, aber ohne kritischen Blocker.` : "Keine kritischen Abweichungen erkannt.",
    },
    {
      label: "Lade-/Fallbackfähigkeit",
      status: dataReadiness.percent >= 80 ? "OK" : "Prüfen",
      tone: dataReadiness.percent >= 80 ? "green" : "amber",
      detail: `${dataReadiness.available}/${dataReadiness.total} Datenbereiche sind im App-Kontext verfügbar.`,
    },
    {
      label: "UI-Stabilität",
      status: "OK",
      tone: "green",
      detail: "Auswertungsbereiche nutzen jetzt klarere Ladezustände, Empty States und konsistente KPI-Fallbacks.",
    },
  ], [criticalObjects.length, dataReadiness.available, dataReadiness.percent, dataReadiness.total, snapshots.length, warningObjects.length]);

  const slowestRiskRows = useMemo(() => [...snapshots]
    .sort((a, b) => (a.issues.length === b.issues.length ? a.propertyName.localeCompare(b.propertyName, "de") : b.issues.length - a.issues.length))
    .slice(0, 6), [snapshots]);

  const refreshRecommendation = useCallback((row: StabilityCheckRow) => {
    if (row.label === "Datenabweichungen" && row.status !== "OK") return "Datenprüfung öffnen und Masterquelle mit Portfolio/Darlehen vergleichen.";
    if (row.label === "Lade-/Fallbackfähigkeit" && row.status !== "OK") return "Fehlende Tabellenbereiche in Supabase prüfen oder leere Bereiche bewusst als nicht genutzt markieren.";
    if (row.label === "Single Source Daten" && row.status !== "OK") return "Objekte, Buchungen und Darlehensdaten einmal synchronisieren.";
    return "Kein unmittelbarer Eingriff erforderlich.";
  }, []);

  return (
    <div className="space-y-5">
      <SectionCard
        title="Phase 3B · Stabilität & Performance"
        subtitle="Technische Produktreife: bessere Ladezustände, robustere Fallbacks, weniger doppelte Rechenlogik und klarere Hinweise bei leeren oder unvollständigen Daten."
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 20, padding: 16, background: "#f8fafc" }}><div style={{ fontSize: 11, fontWeight: 950, color: "#64748b", textTransform: "uppercase", letterSpacing: ".08em" }}>Datenbereitschaft</div><div style={{ marginTop: 8, fontSize: 26, fontWeight: 950 }}>{dataReadiness.percent}%</div></div>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 20, padding: 16, background: "#f8fafc" }}><div style={{ fontSize: 11, fontWeight: 950, color: "#64748b", textTransform: "uppercase", letterSpacing: ".08em" }}>Objekte</div><div style={{ marginTop: 8, fontSize: 26, fontWeight: 950 }}>{snapshots.length}</div></div>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 20, padding: 16, background: criticalObjects.length ? "#fff1f2" : "#ecfdf5" }}><div style={{ fontSize: 11, fontWeight: 950, color: "#64748b", textTransform: "uppercase", letterSpacing: ".08em" }}>Kritisch</div><div style={{ marginTop: 8, fontSize: 26, fontWeight: 950 }}>{criticalObjects.length}</div></div>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 20, padding: 16, background: totals.netCashflow >= 0 ? "#ecfdf5" : "#fff1f2" }}><div style={{ fontSize: 11, fontWeight: 950, color: "#64748b", textTransform: "uppercase", letterSpacing: ".08em" }}>Master-Cashflow</div><div style={{ marginTop: 8, fontSize: 20, fontWeight: 950 }}>{formatEUR(totals.netCashflow)}</div></div>
          </div>
          <StabilityNotice
            tone={criticalObjects.length ? "red" : "green"}
            title={criticalObjects.length ? "Prüfung empfohlen" : "Stabilitätsstatus gut"}
            text={criticalObjects.length ? "Es gibt kritische Datenhinweise. Die App bleibt nutzbar, aber die betroffenen Objekte sollten über Datenprüfung/Single Source korrigiert werden." : "Die wichtigsten Datenbereiche sind konsistent genug für weitere Performance- und Reporting-Ausbaustufen."}
          />
        </div>
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.7fr)]">
        <SectionCard title="Stabilitäts-Checkliste" subtitle="Schnelle technische Kontrolle der aktuell wichtigsten Produktreife-Bereiche.">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr style={{ textAlign: "left", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: ".08em" }}>
                  <th style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>Bereich</th>
                  <th style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>Status</th>
                  <th style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>Detail</th>
                  <th style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>Empfehlung</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((row) => (
                  <tr key={row.label}>
                    <td style={{ padding: "13px 12px", borderBottom: "1px solid #f1f5f9", fontWeight: 950 }}>{row.label}</td>
                    <td style={{ padding: "13px 12px", borderBottom: "1px solid #f1f5f9" }}><SmallStatusPill tone={row.tone}>{row.status}</SmallStatusPill></td>
                    <td style={{ padding: "13px 12px", borderBottom: "1px solid #f1f5f9", color: "#475569", fontSize: 13, fontWeight: 750 }}>{row.detail}</td>
                    <td style={{ padding: "13px 12px", borderBottom: "1px solid #f1f5f9", color: "#64748b", fontSize: 12, fontWeight: 800 }}>{refreshRecommendation(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Datenbereiche" subtitle="Zeigt, welche App-Kontextbereiche aktuell Daten liefern.">
          <div style={{ display: "grid", gap: 10 }}>
            {dataReadiness.categories.map((item) => (
              <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, border: "1px solid #e2e8f0", borderRadius: 16, padding: "10px 12px", background: item.count > 0 ? "#ffffff" : "#f8fafc" }}>
                <span style={{ fontWeight: 950 }}>{item.label}</span>
                <SmallStatusPill tone={item.count > 0 ? "green" : "slate"}>{item.count > 0 ? `${item.count} Datensätze` : "leer"}</SmallStatusPill>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Objekte mit höchstem Prüfbedarf" subtitle="Sortiert nach Anzahl der erkannten Datenhinweise aus der Masterlogik.">
        {slowestRiskRows.length === 0 ? (
          <EmptyChartHint text="Noch keine Objekt-Snapshots vorhanden." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {slowestRiskRows.map((row) => (
              <div key={row.propertyId} style={{ border: "1px solid #e2e8f0", borderRadius: 20, padding: 14, background: row.severity === "critical" ? "#fff1f2" : row.severity === "warning" ? "#fffbeb" : "#ffffff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div style={{ fontWeight: 950 }}>{cleanDisplayName(row.propertyName, "Objekt")}</div>
                  <SmallStatusPill tone={row.severity === "critical" ? "red" : row.severity === "warning" ? "amber" : "green"}>{row.issues.length ? `${row.issues.length} Hinweis(e)` : "OK"}</SmallStatusPill>
                </div>
                <div style={{ marginTop: 10, display: "grid", gap: 5, fontSize: 12, color: "#475569", fontWeight: 750 }}>
                  <div>Restschuld: {row.latestBalance == null ? "—" : formatEUR(row.latestBalance)}</div>
                  <div>Cashflow: {formatEUR(row.netCashflow)}</div>
                  <div>Quellen: {row.sources.balance} · {row.sources.income}/{row.sources.expenses}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}


type PhaseFiveBBackendStatus = {
  documents: number;
  tasks: number;
  audits: number;
  documentSummary: Array<Record<string, unknown>>;
  taskSummary: Array<Record<string, unknown>>;
};

const PHASE5B_DOCUMENT_CATEGORIES: { value: PropertyDocumentCategory; label: string }[] = [
  { value: "mietvertrag", label: "Mietvertrag" },
  { value: "rechnung", label: "Rechnung" },
  { value: "nk_abrechnung", label: "NK-Abrechnung" },
  { value: "energieausweis", label: "Energieausweis" },
  { value: "darlehensunterlage", label: "Darlehensunterlage" },
  { value: "weg_protokoll", label: "WEG-Protokoll" },
  { value: "expose", label: "Exposé" },
  { value: "steuer", label: "Steuer" },
  { value: "versicherung", label: "Versicherung" },
  { value: "sonstiges", label: "Sonstiges" },
];

function asCount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeTaskMatchValue(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/straße/g, "str")
    .replace(/strasse/g, "str")
    .replace(/\s+/g, " ")
    .trim();
}

function buildPropertyTaskMatchTokens(property: { id?: string | null; code?: string | null; label?: string | null; aliases?: string[] | null } | null): string[] {
  if (!property) return [];
  const rawTokens = [property.id, property.code, property.label, ...(property.aliases ?? [])];
  return Array.from(new Set(rawTokens.map(normalizeTaskMatchValue).filter(Boolean)));
}

function taskBelongsToSelectedProperty(task: PropertyTaskRow, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const taskTokens = [
    task.property_id,
    task.portfolio_property_id,
    task.objekt_code,
    task.property_name,
    task.meta?.property_id,
    task.meta?.portfolio_property_id,
    task.meta?.objekt_code,
    task.meta?.property_name,
  ].map(normalizeTaskMatchValue).filter(Boolean);

  return taskTokens.some((taskToken) => tokens.some((propertyToken) => taskToken === propertyToken || taskToken.includes(propertyToken) || propertyToken.includes(taskToken)));
}

function PhaseFiveBBackendBindingCenter() {
  const app = useAppData();
  const currentYear = new Date().getFullYear();
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [documents, setDocuments] = useState<PropertyDocumentRow[]>([]);
  const [tasks, setTasks] = useState<PropertyTaskRow[]>([]);
  const [auditRows, setAuditRows] = useState<AuditLogEntry[]>([]);
  const [status, setStatus] = useState<PhaseFiveBBackendStatus>({ documents: 0, tasks: 0, audits: 0, documentSummary: [], taskSummary: [] });
  const [loadingBackend, setLoadingBackend] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskPriority, setTaskPriority] = useState<PropertyTaskPriority>("mittel");
  const [documentCategory, setDocumentCategory] = useState<PropertyDocumentCategory>("sonstiges");
  const [documentYear, setDocumentYear] = useState<number>(currentYear);

  const selectedProperty = useMemo(() => {
    return app.objects.find((object) => object.id === selectedPropertyId) ?? app.objects[0] ?? null;
  }, [app.objects, selectedPropertyId]);

  useEffect(() => {
    const syncSelection = window.setTimeout(() => {
      if (!selectedPropertyId && app.objects[0]?.id) setSelectedPropertyId(app.objects[0].id);
    }, 0);
    return () => window.clearTimeout(syncSelection);
  }, [app.objects, selectedPropertyId]);

  const selectedPropertyName = selectedProperty?.label ?? "Immobilie";
  const selectedObjektCode = selectedProperty?.code ?? null;

  const loadBackendData = useCallback(async () => {
    if (!selectedProperty) return;
    setLoadingBackend(true);
    setBackendError(null);
    try {
      const [documentRows, taskRows, auditLogRows, documentSummary, taskSummary] = await Promise.all([
        listPropertyDocuments({ propertyId: selectedProperty.id }),
        listPropertyTasks({ status: "aktiv" }),
        listAuditLogs({ propertyId: selectedProperty.id, limit: 25 }),
        getPropertyDocumentSummary(null),
        getPropertyTaskSummary(),
      ]);
      const selectedTaskTokens = buildPropertyTaskMatchTokens(selectedProperty);
      const visibleTaskRows = taskRows.filter((task) => taskBelongsToSelectedProperty(task, selectedTaskTokens));

      setDocuments(documentRows);
      setTasks(visibleTaskRows);
      setAuditRows(auditLogRows);
      setStatus({
        documents: documentRows.length,
        tasks: visibleTaskRows.length,
        audits: auditLogRows.length,
        documentSummary: Array.isArray(documentSummary) ? documentSummary as Array<Record<string, unknown>> : [],
        taskSummary: Array.isArray(taskSummary) ? taskSummary as Array<Record<string, unknown>> : [],
      });
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : "Backend-Daten konnten nicht geladen werden.");
    } finally {
      setLoadingBackend(false);
    }
  }, [selectedProperty]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadBackendData(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadBackendData]);

  const handleUpload = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selectedProperty) return;
    setUploading(true);
    setBackendError(null);
    try {
      const uploaded = await uploadPropertyDocument({
        file,
        category: documentCategory,
        propertyId: selectedProperty.id,
        objektCode: selectedObjektCode,
        propertyName: selectedPropertyName,
        documentYear,
        title: file.name,
      });
      await recordAuditLog({
        action: "phase5b_document_uploaded",
        property_id: selectedProperty.id,
        objekt_code: selectedObjektCode,
        label: uploaded.title,
        new_value: { category: uploaded.category, storage_path: uploaded.storage_path },
        meta: { phase: "5B", source: "Auswertung Dokumentencenter" },
      });
      await loadBackendData();
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : "Upload fehlgeschlagen.");
    } finally {
      setUploading(false);
    }
  }, [documentCategory, documentYear, loadBackendData, selectedObjektCode, selectedProperty, selectedPropertyName]);

  const handleOpenDocument = useCallback(async (document: PropertyDocumentRow) => {
    const previewWindow = window.open("about:blank", "_blank", "noopener,noreferrer");
    try {
      if (previewWindow) {
        previewWindow.document.title = document.title || "Dokument";
        previewWindow.document.body.innerHTML = '<p style="font-family:system-ui;padding:24px">Dokument wird geladen …</p>';
      }

      const signedUrl = await getPropertyDocumentSignedUrl(
        document.storage_path,
        60 * 10,
        document.storage_bucket,
      );

      if (previewWindow) {
        previewWindow.location.href = signedUrl;
      } else {
        window.location.href = signedUrl;
      }
    } catch (error) {
      previewWindow?.close();
      setBackendError(error instanceof Error ? error.message : "Dokument konnte nicht geöffnet werden.");
    }
  }, []);

  const handleDeleteDocument = useCallback(async (document: PropertyDocumentRow) => {
    if (!window.confirm(`Dokument „${document.title}“ wirklich löschen?`)) return;
    try {
      await deletePropertyDocument(document);
      await recordAuditLog({
        action: "phase5b_document_deleted",
        property_id: document.property_id,
        portfolio_property_id: document.portfolio_property_id,
        objekt_code: document.objekt_code,
        label: document.title,
        old_value: { storage_path: document.storage_path, category: document.category },
        meta: { phase: "5B" },
      });
      await loadBackendData();
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : "Dokument konnte nicht gelöscht werden.");
    }
  }, [loadBackendData]);

  const handleCreateTask = useCallback(async () => {
    const title = taskTitle.trim();
    if (!title || !selectedProperty) return;
    try {
      const task = await savePropertyTask({
        propertyId: selectedProperty.id,
        objektCode: selectedObjektCode,
        propertyName: selectedPropertyName,
        title,
        priority: taskPriority,
        category: "allgemein",
        source: "manuell",
      });
      await recordAuditLog({
        action: "phase5b_task_saved",
        property_id: selectedProperty.id,
        objekt_code: selectedObjektCode,
        label: task.title,
        new_value: { priority: task.priority, status: task.status },
        meta: { phase: "5B" },
      });
      setTaskTitle("");
      await loadBackendData();
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : "Aufgabe konnte nicht gespeichert werden.");
    }
  }, [loadBackendData, selectedObjektCode, selectedProperty, selectedPropertyName, taskPriority, taskTitle]);

  const handleCompleteTask = useCallback(async (task: PropertyTaskRow) => {
    try {
      await completePropertyTask(task.id);
      await recordAuditLog({
        action: "phase5b_task_completed",
        property_id: task.property_id,
        portfolio_property_id: task.portfolio_property_id,
        objekt_code: task.objekt_code,
        label: task.title,
        old_value: { status: task.status },
        new_value: { status: "erledigt" },
        meta: { phase: "5B" },
      });
      await loadBackendData();
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : "Aufgabe konnte nicht abgeschlossen werden.");
    }
  }, [loadBackendData]);

  const summaryTotals = useMemo(() => {
    const docTotals = status.documentSummary.reduce((sum, row) => sum + asCount(row.total_documents), 0);
    const missing = status.documentSummary.reduce((sum, row) => sum + asCount(row.missing_documents), 0);
    const expiring = status.documentSummary.reduce((sum, row) => sum + asCount(row.expiring_documents), 0);
    const open = status.taskSummary.reduce((sum, row) => sum + asCount(row.open_tasks), 0);
    const critical = status.taskSummary.reduce((sum, row) => sum + asCount(row.critical_tasks), 0);
    const overdue = status.taskSummary.reduce((sum, row) => sum + asCount(row.overdue_tasks), 0);
    return { docTotals, missing, expiring, open, critical, overdue };
  }, [status.documentSummary, status.taskSummary]);

  return (
    <div className="space-y-5">
      <SectionCard
        title="Phase 5B · Backend-Anbindung für Dokumente, Aufgaben & Audit"
        subtitle="Die in Phase 5A angelegten Supabase-Tabellen und der private Storage-Bucket werden jetzt im Frontend wirklich genutzt."
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <CompactKpi label="Dokumente gesamt" value={loadingBackend ? "…" : String(summaryTotals.docTotals)} tone="blue" />
            <CompactKpi label="Fehlend / läuft ab" value={loadingBackend ? "…" : `${summaryTotals.missing} / ${summaryTotals.expiring}`} tone={summaryTotals.missing || summaryTotals.expiring ? "amber" : "green"} />
            <CompactKpi label="Offene Aufgaben" value={loadingBackend ? "…" : String(summaryTotals.open)} tone={summaryTotals.open ? "amber" : "green"} />
            <CompactKpi label="Kritisch / überfällig" value={loadingBackend ? "…" : `${summaryTotals.critical} / ${summaryTotals.overdue}`} tone={summaryTotals.critical || summaryTotals.overdue ? "red" : "green"} />
          </div>
          <StabilityNotice
            tone={backendError ? "red" : "green"}
            title={backendError ? "Backend-Prüfung fehlgeschlagen" : "Supabase-Anbindung aktiv"}
            text={backendError ?? "Dokumente, Aufgaben und Audit-Logs werden über die neuen Phase-5A-Tabellen/Storage-Struktur geladen und gespeichert."}
          />
        </div>
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
        <SectionCard title="Objekt auswählen" subtitle="Dokumente und Aufgaben werden objektbezogen gespeichert.">
          <div style={{ display: "grid", gap: 12 }}>
            <select value={selectedPropertyId} onChange={(event) => setSelectedPropertyId(event.target.value)} style={{ width: "100%", border: "1px solid #dbe4f0", borderRadius: 16, padding: "11px 12px", fontWeight: 900 }}>
              {app.objects.map((object) => <option key={object.id} value={object.id}>{object.label}</option>)}
            </select>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 18, padding: 14, background: "#f8fafc" }}>
              <div style={{ fontSize: 12, fontWeight: 950, color: "#64748b", textTransform: "uppercase", letterSpacing: ".08em" }}>Aktive Objektakte</div>
              <div style={{ marginTop: 6, fontSize: 18, fontWeight: 950 }}>{selectedPropertyName}</div>
              <div style={{ marginTop: 4, fontSize: 12, color: "#64748b", fontWeight: 800 }}>Objektcode: {selectedObjektCode ?? "—"}</div>
            </div>
            <button type="button" onClick={() => void loadBackendData()} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black shadow-sm hover:bg-slate-50">Backend neu laden</button>
          </div>
        </SectionCard>

        <div className="grid gap-5 2xl:grid-cols-2">
          <SectionCard title="Dokumente · echter Storage" subtitle="Upload in den privaten Supabase-Bucket property-documents mit Archivdatensatz in property_documents.">
            <div style={{ display: "grid", gap: 12 }}>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px]">
                <select value={documentCategory} onChange={(event) => setDocumentCategory(event.target.value as PropertyDocumentCategory)} style={{ border: "1px solid #dbe4f0", borderRadius: 14, padding: "10px 12px", fontWeight: 850 }}>
                  {PHASE5B_DOCUMENT_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
                </select>
                <input value={documentYear} onChange={(event) => setDocumentYear(Number(event.target.value) || currentYear)} type="number" min={1990} max={2100} style={{ border: "1px solid #dbe4f0", borderRadius: 14, padding: "10px 12px", fontWeight: 850 }} />
              </div>
              <label className="rounded-2xl border border-dashed border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm font-black text-blue-800 hover:bg-blue-100" style={{ cursor: uploading ? "not-allowed" : "pointer" }}>
                {uploading ? "Upload läuft …" : "Dokument hochladen"}
                <input type="file" onChange={(event) => void handleUpload(event)} disabled={uploading || !selectedProperty} style={{ display: "none" }} />
              </label>
              <div style={{ display: "grid", gap: 10, maxHeight: 360, overflow: "auto" }}>
                {documents.length === 0 ? <EmptyChartHint text="Für diese Immobilie sind noch keine Dokumente im Supabase-Archiv gespeichert." /> : null}
                {documents.map((document) => (
                  <div key={document.id} style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 12, background: "white" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                      <div>
                        <div style={{ fontWeight: 950 }}>{document.title}</div>
                        <div style={{ marginTop: 3, color: "#64748b", fontSize: 12, fontWeight: 800 }}>{document.category} · {document.document_year ?? "ohne Jahr"} · {document.file_name}</div>
                      </div>
                      <SmallStatusPill tone={document.status === "vorhanden" ? "green" : document.status === "archiviert" ? "slate" : "amber"}>{document.status}</SmallStatusPill>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      <button type="button" onClick={() => void handleOpenDocument(document)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black hover:bg-slate-50">Vorschau/Download</button>
                      <button type="button" onClick={() => void handleDeleteDocument(document)} className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-100">Löschen</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Aufgaben · echte Persistenz" subtitle="Aufgaben werden in property_tasks gespeichert und können abgeschlossen werden.">
            <div style={{ display: "grid", gap: 12 }}>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px]">
                <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Neue Aufgabe, z. B. Mietvertrag prüfen" style={{ border: "1px solid #dbe4f0", borderRadius: 14, padding: "10px 12px", fontWeight: 850 }} />
                <select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as PropertyTaskPriority)} style={{ border: "1px solid #dbe4f0", borderRadius: 14, padding: "10px 12px", fontWeight: 850 }}>
                  <option value="niedrig">Niedrig</option>
                  <option value="mittel">Mittel</option>
                  <option value="hoch">Hoch</option>
                  <option value="kritisch">Kritisch</option>
                </select>
              </div>
              <button type="button" onClick={() => void handleCreateTask()} disabled={!taskTitle.trim()} className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-black text-indigo-800 shadow-sm disabled:opacity-50">Aufgabe speichern</button>
              <div style={{ display: "grid", gap: 10, maxHeight: 360, overflow: "auto" }}>
                {tasks.length === 0 ? <EmptyChartHint text="Keine offenen Aufgaben für diese Immobilie." /> : null}
                {tasks.map((task) => (
                  <div key={task.id} style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 12, background: task.priority === "kritisch" ? "#fff1f2" : task.priority === "hoch" ? "#fffbeb" : "white" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div>
                        <div style={{ fontWeight: 950 }}>{task.title}</div>
                        <div style={{ marginTop: 3, color: "#64748b", fontSize: 12, fontWeight: 800 }}>{task.category} · {task.status} · Fällig: {task.due_date ? formatDate(task.due_date) : "—"}</div>
                      </div>
                      <SmallStatusPill tone={task.priority === "kritisch" ? "red" : task.priority === "hoch" ? "amber" : "blue"}>{task.priority}</SmallStatusPill>
                    </div>
                    <button type="button" onClick={() => void handleCompleteTask(task)} className="mt-3 rounded-xl border border-green-100 bg-green-50 px-3 py-2 text-xs font-black text-green-700 hover:bg-green-100">Als erledigt markieren</button>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      <SectionCard title="Audit-Log · echte Historie" subtitle="Die letzten Backend-Aktionen aus app_audit_log für die ausgewählte Immobilie.">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
            <thead>
              <tr style={{ textAlign: "left", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: ".08em" }}>
                <th style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>Zeitpunkt</th>
                <th style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>Aktion</th>
                <th style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>Label</th>
                <th style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>Quelle</th>
              </tr>
            </thead>
            <tbody>
              {auditRows.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: 16, color: "#64748b", fontWeight: 800 }}>Noch keine Audit-Einträge für diese Immobilie.</td></tr>
              ) : auditRows.map((entry) => (
                <tr key={entry.id}>
                  <td style={{ padding: "12px", borderBottom: "1px solid #f1f5f9", fontWeight: 850 }}>{formatDate(entry.created_at)}</td>
                  <td style={{ padding: "12px", borderBottom: "1px solid #f1f5f9", fontWeight: 950 }}>{entry.action}</td>
                  <td style={{ padding: "12px", borderBottom: "1px solid #f1f5f9", color: "#475569", fontWeight: 800 }}>{entry.label ?? "—"}</td>
                  <td style={{ padding: "12px", borderBottom: "1px solid #f1f5f9", color: "#64748b", fontSize: 12, fontWeight: 800 }}>{entry.objekt_code ?? entry.property_id ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

export default function Auswertung() {
  const [searchParams] = useSearchParams();
  const requestedView = searchParams.get("view") as AuswertungView | null;
  const activeView: AuswertungView = requestedView && AUSWERTUNG_VIEW_KEYS.has(requestedView) ? requestedView : "cockpit";

  return (
    <div className="space-y-5">
      <section className="rounded-[30px] border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6 shadow-sm md:p-8">
        <div className="inline-flex rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-indigo-700">Auswertungscenter</div>
        <div className="mt-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">Auswertungen</h1>
            <p className="mt-3 max-w-4xl text-slate-600">Zentrale Analyse-Seite für Finanzdiagramme, Objekt-Jahresübersicht, Mietcheck und Liquiditätsverlauf. Die Daten kommen weiterhin aus den bestehenden Buchungen.</p>
          </div>
        </div>
      </section>

      <section className="min-w-0 space-y-5">
        {activeView === "cockpit" ? (
          <PhaseTwoControlCenter />
        ) : activeView === "backend5b" ? (
          <PhaseFiveBBackendBindingCenter />
        ) : activeView === "business" ? (
          <PhaseFourCBusinessIntelligenceCenter />
        ) : activeView === "single-source" ? (
          <PhaseThreeASingleSourceCenter />
        ) : activeView === "stability" ? (
          <PhaseThreeBStabilityCenter />
        ) : activeView === "automation" ? (
          <PhaseTwoBAutomationCenter />
        ) : activeView === "reporting4d" ? (
          <PhaseFourDProfessionalReportingSystem />
        ) : activeView === "reporting" ? (
          <PhaseTwoCReportingCenter />
        ) : activeView === "finanzen" ? (
          <>
            <WorkflowCenterCard />
            <ObjectFinanceModuleButtons />
            <AuswertungCore />
          </>
        ) : (
          <AutomationAnalytics embedded />
        )}
      </section>
    </div>
  );
}
