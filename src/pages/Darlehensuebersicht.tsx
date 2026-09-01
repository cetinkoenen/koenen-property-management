import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import EditableLoanLedgerTable from "@/components/EditableLoanLedgerTable";
import { useIncome } from "@/features/property-detail/hooks/useIncome";
import { calculateYearlyFinanceMetrics } from "@/services/financeService";
import { generatePropertyLoanLedgerProjection, loadPropertyLoanLedger } from "@/services/propertyLoanLedgerService";
import type { LoanLedgerRow } from "@/types/loanLedger";
import { supabase } from "@/lib/supabase";
import {
  importLoanRatePlanFiles,
  loadLoanRatePlanYearlySummary,
  type LoanRatePlanYearSummary,
} from "@/services/loanRatePlanService";

type PropertyRow = {
  property_id: string;
  property_name: string | null;
  last_balance: number | string | null;
  principal_total: number | string | null;
  interest_total: number | string | null;
};

type PropertyRowNormalized = {
  propertyId: string;
  propertyName: string;
  lastBalance: number;
  principalTotal: number;
  interestTotal: number;
};

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: 1320,
    margin: "0 auto",
    padding: 20,
  },
  hero: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 24,
    padding: 24,
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
    marginBottom: 22,
  },
  title: {
    margin: 0,
    fontSize: 26,
    lineHeight: 1.15,
    fontWeight: 900,
    color: "#0f172a",
  },
  text: {
    margin: "12px 0 0",
    fontSize: 14,
    lineHeight: 1.6,
    color: "#475569",
  },
  metricGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    marginTop: 20,
  },
  metricCard: {
    border: "1px solid #e5e7eb",
    borderRadius: 18,
    background: "#f8fafc",
    padding: 16,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#64748b",
  },
  metricValue: {
    marginTop: 8,
    fontSize: 22,
    lineHeight: 1.15,
    fontWeight: 900,
    color: "#111827",
  },
  controls: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  input: {
    width: "100%",
    maxWidth: 360,
    boxSizing: "border-box",
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    padding: "11px 12px",
    background: "#ffffff",
    color: "#111827",
    fontSize: 14,
  },
  button: {
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    padding: "10px 14px",
    background: "#ffffff",
    color: "#111827",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 800,
  },
  primaryButton: {
    border: "1px solid #c7d2fe",
    borderRadius: 12,
    padding: "10px 14px",
    background: "#eef2ff",
    color: "#3730a3",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 800,
  },
  card: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 24,
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
    overflow: "hidden",
    marginBottom: 18,
  },
  cardHeader: {
    padding: "22px 24px",
    borderBottom: "1px solid #e5e7eb",
    display: "flex",
    gap: 18,
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  cardTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 900,
    color: "#111827",
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: "#64748b",
    lineHeight: 1.6,
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginTop: 16,
  },
  summaryBox: {
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    background: "#f8fafc",
    padding: 14,
  },
  summaryValue: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: 900,
    color: "#111827",
  },
  body: {
    padding: 24,
  },
  loadingBox: {
    padding: 18,
    borderRadius: 16,
    background: "#f8fafc",
    color: "#475569",
  },
  errorBox: {
    padding: 18,
    borderRadius: 16,
    background: "#fff1f2",
    color: "#991b1b",
    border: "1px solid #fecaca",
  },
  sectionTitle: {
    margin: "0 0 14px",
    fontSize: 17,
    fontWeight: 900,
    color: "#111827",
  },
  tableWrap: {
    overflowX: "auto",
    marginBottom: 22,
  },
  table: {
    width: "100%",
    minWidth: 820,
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    padding: "12px 10px",
    background: "#f8fafc",
    borderBottom: "1px solid #e5e7eb",
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "#64748b",
  },
  td: {
    padding: "12px 10px",
    borderBottom: "1px solid #e5e7eb",
    fontSize: 14,
    color: "#111827",
  },
  mutedText: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 1.5,
  },
  taxNotice: {
    border: "1px solid #bfdbfe",
    borderRadius: 18,
    background: "#eff6ff",
    color: "#1e3a8a",
    padding: 16,
    marginBottom: 20,
    fontSize: 14,
    fontWeight: 800,
    lineHeight: 1.6,
  },
};

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}


function cleanDisplayName(value: string | null | undefined, fallback = "Unbenanntes Objekt"): string {
  const cleaned = String(value ?? "")
    .replace(/\s*\(?\s*core[\W_]*shadow\s*\)?/gi, "")
    .replace(/\s*\(?\s*shadow\s*\)?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || fallback;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function FinanceSummary(props: { label: string; value: string }) {
  return (
    <div style={styles.summaryBox}>
      <div style={styles.metricLabel}>{props.label}</div>
      <div style={styles.summaryValue}>{props.value}</div>
    </div>
  );
}

function PropertyLoanCard(props: {
  propertyId: string;
  propertyName: string;
  dashboardBalance: number;
  dashboardPrincipalTotal: number;
  dashboardInterestTotal: number;
}) {
  const { propertyIncome, yearlyIncome, yearlyCapex, isLoading: incomeLoading, error: incomeError } = useIncome(props.propertyId);
  const [ledgerRows, setLedgerRows] = useState<LoanLedgerRow[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState<boolean>(false);
  const [ledgerLoaded, setLedgerLoaded] = useState<boolean>(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [open, setOpen] = useState<boolean>(false);
  const [projection, setProjection] = useState({ interestRatePercent: "3.5", annualPrincipal: "12000", years: "10" });
  const [projectionStatus, setProjectionStatus] = useState<string | null>(null);
  const [projectionLoading, setProjectionLoading] = useState(false);
  const [planSummaryOpen, setPlanSummaryOpen] = useState(false);
  const [planSummaryRows, setPlanSummaryRows] = useState<LoanRatePlanYearSummary[]>([]);
  const [planSummaryLoading, setPlanSummaryLoading] = useState(false);
  const [planSummaryLoaded, setPlanSummaryLoaded] = useState(false);
  const [planSummaryError, setPlanSummaryError] = useState<string | null>(null);

  const reloadLedger = useCallback(async () => {
    try {
      setLedgerLoading(true);
      setLedgerError(null);
      const rows = await loadPropertyLoanLedger(props.propertyId);
      setLedgerRows(rows);
      setLedgerLoaded(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fehler beim Laden der Darlehensdaten.";
      setLedgerError(message);
      setLedgerRows([]);
      setLedgerLoaded(true);
    } finally {
      setLedgerLoading(false);
    }
  }, [props.propertyId]);

  const reloadPlanSummary = useCallback(async () => {
    try {
      setPlanSummaryLoading(true);
      setPlanSummaryError(null);
      const rows = await loadLoanRatePlanYearlySummary({
        propertyId: props.propertyId,
        propertyName: props.propertyName,
      });
      setPlanSummaryRows(rows);
      setPlanSummaryLoaded(true);
    } catch (error) {
      setPlanSummaryRows([]);
      setPlanSummaryLoaded(true);
      setPlanSummaryError(error instanceof Error ? error.message : "Tilgungsplan-Entwicklung konnte nicht geladen werden.");
    } finally {
      setPlanSummaryLoading(false);
    }
  }, [props.propertyId, props.propertyName]);

  async function createProjection() {
    const last = ledgerRows.at(-1);
    if (!last) {
      setProjectionStatus("Bitte zuerst mindestens eine Darlehenszeile anlegen.");
      return;
    }
    const years = Math.max(1, Math.min(80, Math.trunc(Number(projection.years) || 1)));
    try {
      setProjectionLoading(true);
      setProjectionStatus(null);
      const created = await generatePropertyLoanLedgerProjection(props.propertyId, {
        startYear: last.year + 1,
        endYear: last.year + years,
        startBalance: last.balance,
        interestRatePercent: Number(String(projection.interestRatePercent).replace(",", ".")) || 0,
        annualPrincipal: Number(String(projection.annualPrincipal).replace(",", ".")) || last.principal || 0,
        source: "auto_projection",
      });
      setProjectionStatus(`${created} Darlehensjahr(e) wurden automatisch erzeugt.`);
      await reloadLedger();
    } catch (error) {
      setProjectionStatus(error instanceof Error ? error.message : "Tilgungsplan konnte nicht erzeugt werden.");
    } finally {
      setProjectionLoading(false);
    }
  }

  useEffect(() => {
    if (!open || ledgerLoaded || ledgerLoading) return;
    const initialLoad = window.setTimeout(() => void reloadLedger(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [open, ledgerLoaded, ledgerLoading, reloadLedger]);

  useEffect(() => {
    if (!planSummaryOpen || planSummaryLoaded || planSummaryLoading) return;
    const initialLoad = window.setTimeout(() => void reloadPlanSummary(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [planSummaryLoaded, planSummaryLoading, planSummaryOpen, reloadPlanSummary]);

  const yearlyMetrics = useMemo(() => {
    return calculateYearlyFinanceMetrics({
      ledger: ledgerRows.map((row) => ({
        year: row.year,
        interestPayment: row.interest,
        principalPayment: row.principal,
        remainingBalance: row.balance,
        source: row.source,
      })),
      yearlyIncome,
      yearlyCapex,
      propertyIncome,
    });
  }, [ledgerRows, yearlyIncome, yearlyCapex, propertyIncome]);



  const latestBalance = ledgerRows.length > 0 ? ledgerRows[ledgerRows.length - 1].balance : props.dashboardBalance;
  const latestYear = ledgerRows.length > 0 ? ledgerRows[ledgerRows.length - 1].year : null;
  const visibleDebtService = ledgerRows.length > 0
    ? ledgerRows.reduce((sum, row) => sum + row.interest + row.principal, 0)
    : props.dashboardInterestTotal + props.dashboardPrincipalTotal;
  const visibleDscr = yearlyMetrics.length > 0
    ? yearlyMetrics.reduce((sum, row) => sum + (row.dscr ?? 0), 0) / yearlyMetrics.length
    : null;
  const yearlyWarnings = ledgerRows.some((row, index) => index > 0 && row.balance > ledgerRows[index - 1].balance + 1);
  const currentYear = new Date().getFullYear();
  const displayedPlanYears = useMemo(() => {
    const firstYear = 2024;
    const years = Array.from({ length: Math.max(1, currentYear - firstYear + 1) }, (_, index) => firstYear + index);
    const rowsByYear = new Map(planSummaryRows.map((row) => [row.year, row]));
    return years.map((year) => ({ year, summary: rowsByYear.get(year) ?? null }));
  }, [currentYear, planSummaryRows]);

  return (
    <article style={styles.card}>
      <div style={styles.cardHeader}>
        <div style={{ flex: "1 1 720px", minWidth: 260 }}>
          <h2 style={styles.cardTitle}>{props.propertyName}</h2>
          <div style={styles.subtitle}>
            Editierbare Jahresübersicht mit bestehender Ledger-Logik und automatisch berechneter Finance-Tabelle.
          </div>
          <div style={styles.summaryGrid}>
            <FinanceSummary label="Aktuelle Restschuld" value={formatCurrency(latestBalance)} />
            <FinanceSummary label="Quelle" value={latestYear ? `Ledger ${latestYear}` : "Übersicht"} />
            <FinanceSummary label="Debt Service gesamt" value={visibleDebtService > 0 ? formatCurrency(visibleDebtService) : "—"} />
            <FinanceSummary label="DSCR Ø" value={visibleDscr !== null ? formatNumber(visibleDscr) : "—"} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" style={styles.button} onClick={() => setOpen((current) => !current)}>
            {open ? "Schließen" : "Öffnen / Edit"}
          </button>
          {open ? (
            <button type="button" style={styles.primaryButton} onClick={() => void reloadLedger()}>
              Neu laden
            </button>
          ) : null}
        </div>
      </div>

      <details
        open={planSummaryOpen}
        onToggle={(event) => setPlanSummaryOpen(event.currentTarget.open)}
        style={{ borderBottom: "1px solid #e5e7eb", background: "#fbfdff" }}
      >
        <summary style={{ padding: "16px 24px", cursor: "pointer", color: "#0f3f4b", fontWeight: 900, fontSize: 15 }}>
          Jährliche Entwicklung aus Tilgungsplan · 2024–{currentYear}
        </summary>
        <div style={{ padding: "0 24px 22px" }}>
          <div style={{ ...styles.mutedText, marginBottom: 12 }}>
            Direkte Hauptquelle: hochgeladene Monatspläne. Rate, Zins, Tilgung, Gebühren und Restschuld werden je Kalenderjahr zusammengefasst.
          </div>
          {planSummaryLoading ? <div style={styles.loadingBox}>Tilgungsplandaten werden geladen…</div> : null}
          {!planSummaryLoading && planSummaryError ? <div style={styles.errorBox}>{planSummaryError}</div> : null}
          {!planSummaryLoading && !planSummaryError ? (
            <div style={{ ...styles.tableWrap, marginBottom: 0 }}>
              <table style={{ ...styles.table, minWidth: 860 }}>
                <thead>
                  <tr>
                    <th style={styles.th}>Jahr</th>
                    <th style={styles.th}>Monate</th>
                    <th style={styles.th}>Gesamtrate</th>
                    <th style={styles.th}>Zinsen</th>
                    <th style={styles.th}>Tilgung</th>
                    <th style={styles.th}>Gebühren</th>
                    <th style={styles.th}>Restschuld Jahresende</th>
                    <th style={styles.th}>Quelle / Qualität</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedPlanYears.map(({ year, summary }) => {
                    const isCurrentYear = year === currentYear;
                    return (
                      <tr key={year} style={isCurrentYear ? { background: "#ecfdf5" } : undefined}>
                        <td style={{ ...styles.td, fontWeight: 900 }}>
                          {year}{isCurrentYear ? <span style={{ marginLeft: 8, borderRadius: 999, background: "#047857", color: "white", padding: "3px 8px", fontSize: 10, whiteSpace: "nowrap" }}>Laufendes Jahr</span> : null}
                        </td>
                        <td style={styles.td}>{summary ? `${summary.monthCount} / 12` : "0 / 12"}</td>
                        <td style={{ ...styles.td, fontWeight: 850 }}>{summary ? formatCurrency(summary.paymentTotal) : "—"}</td>
                        <td style={{ ...styles.td, color: "#0f766e", fontWeight: 850 }}>{summary ? formatCurrency(summary.interestTotal) : "—"}</td>
                        <td style={{ ...styles.td, color: "#1d4ed8", fontWeight: 850 }}>{summary ? formatCurrency(summary.principalTotal) : "—"}</td>
                        <td style={styles.td}>{summary ? formatCurrency(summary.feeTotal) : "—"}</td>
                        <td style={{ ...styles.td, fontWeight: 850 }}>{summary?.closingBalance !== null && summary?.closingBalance !== undefined ? formatCurrency(summary.closingBalance) : "—"}</td>
                        <td style={styles.td}>
                          {summary ? (
                            <div>
                              <div style={{ fontWeight: 800, color: summary.warningCount ? "#92400e" : "#166534" }}>
                                {summary.warningCount ? `${summary.warningCount} Hinweis(e)` : "Quelle geprüft"}
                              </div>
                              <div style={{ ...styles.mutedText, marginTop: 4 }}>{summary.sourceFiles.join(", ") || "Tilgungsplan"}</div>
                            </div>
                          ) : <span style={styles.mutedText}>Keine Monatswerte vorhanden</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </details>

      {open ? (
        <div style={styles.body}>
          {ledgerLoading || incomeLoading ? <div style={styles.loadingBox}>Daten werden geladen…</div> : null}
          {!ledgerLoading && ledgerError ? <div style={styles.errorBox}>{ledgerError}</div> : null}
          {!incomeLoading && incomeError ? <div style={styles.errorBox}>{incomeError}</div> : null}

          {!ledgerLoading && !ledgerError ? (
            <>
              {yearlyWarnings ? <div style={{ ...styles.errorBox, marginBottom: 16 }}>Warnung: Mindestens eine Restschuld ist höher als im Vorjahr. Bitte Darlehenswerte prüfen.</div> : null}

              <div style={styles.taxNotice}>
                Steuerlogik fuer dieses Darlehen: <strong>Zinsen</strong> werden im Steuer-Center als steuerrelevante Werbungskosten beruecksichtigt.
                <strong> Tilgung</strong> ist nicht steuerrelevant, bleibt aber wichtig fuer Restschuld, Cashflow und Bankuebersicht.
                Monatsraten aus der Buchhaltung sollten deshalb nicht komplett als steuerrelevant markiert werden.
              </div>

              <div style={{ border: "1px solid #e5e7eb", borderRadius: 18, padding: 16, marginBottom: 22, background: "#f8fafc" }}>
                <h3 style={styles.sectionTitle}>Automatischer Tilgungsplan</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
                  <input style={styles.input} value={projection.interestRatePercent} onChange={(event) => setProjection((prev) => ({ ...prev, interestRatePercent: event.target.value }))} placeholder="Zinssatz %" />
                  <input style={styles.input} value={projection.annualPrincipal} onChange={(event) => setProjection((prev) => ({ ...prev, annualPrincipal: event.target.value }))} placeholder="Tilgung pro Jahr" />
                  <input style={styles.input} value={projection.years} onChange={(event) => setProjection((prev) => ({ ...prev, years: event.target.value }))} placeholder="Anzahl Jahre" />
                  <button type="button" style={styles.primaryButton} disabled={projectionLoading} onClick={() => void createProjection()}>{projectionLoading ? "Erzeuge…" : "Tilgungsplan erzeugen"}</button>
                </div>
                {projectionStatus ? <div style={{ ...styles.mutedText, marginTop: 10, fontWeight: 800 }}>{projectionStatus}</div> : null}
              </div>

              <h3 style={styles.sectionTitle}>Finance pro Jahr</h3>
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Jahr</th>
                      <th style={styles.th}>Income</th>
                      <th style={styles.th}>Capex</th>
                      <th style={styles.th}>Zinsen</th>
                      <th style={styles.th}>Tilgung</th>
                      <th style={styles.th}>Steuer</th>
                      <th style={styles.th}>Debt Service</th>
                      <th style={styles.th}>Cashflow</th>
                      <th style={styles.th}>DSCR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearlyMetrics.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={styles.td}>
                          <div style={styles.mutedText}>Noch keine Jahresdaten vorhanden.</div>
                        </td>
                      </tr>
                    ) : (
                      yearlyMetrics.map((row) => (
                        <tr key={row.year}>
                          <td style={styles.td}>{row.year}</td>
                          <td style={styles.td}>{formatCurrency(row.income)}</td>
                          <td style={styles.td}>{formatCurrency(row.capex)}</td>
                          <td style={styles.td}>{formatCurrency(row.interest)}</td>
                          <td style={styles.td}>{formatCurrency(row.principal)}</td>
                          <td style={styles.td}>Zinsen ja · Tilgung nein</td>
                          <td style={styles.td}>{formatCurrency(row.debtService)}</td>
                          <td style={styles.td}>{formatCurrency(row.cashflow)}</td>
                          <td style={styles.td}>{formatNumber(row.dscr)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <h3 style={styles.sectionTitle}>Darlehens-Ledger editieren</h3>
              <EditableLoanLedgerTable
                propertyId={props.propertyId}
                rows={ledgerRows}
                onChanged={async () => {
                  await reloadLedger();
                }}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export default function Darlehensuebersicht() {
  const [rows, setRows] = useState<PropertyRowNormalized[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<string>("");
  const [importingPlans, setImportingPlans] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [planDataRevision, setPlanDataRevision] = useState(0);

  async function load() {
    try {
      setLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .from("vw_property_loan_dashboard_display")
        .select("property_id, property_name, last_balance, principal_total, interest_total")
        .order("property_name", { ascending: true });

      if (queryError) throw queryError;

      const nextRows = ((data ?? []) as PropertyRow[])
        .map((row) => ({
          propertyId: String(row.property_id ?? ""),
          propertyName: cleanDisplayName(row.property_name, "Unbenanntes Objekt"),
          lastBalance: toNumber(row.last_balance),
          principalTotal: toNumber(row.principal_total),
          interestTotal: toNumber(row.interest_total),
        }));

      setRows(nextRows);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Darlehensübersicht konnte nicht geladen werden.";
      setError(message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initialLoad);
  }, []);

  async function importPlans(files: File[]) {
    if (!files.length) return;
    try {
      setImportingPlans(true);
      setImportStatus(null);
      setImportWarnings([]);
      const result = await importLoanRatePlanFiles(files);
      setImportStatus(`${result.rows} Monatswerte aus ${files.length} CSV-Datei(en) gespeichert; ${result.bookings} bestehende Kreditraten wurden mit Zins und Tilgung verknüpft.`);
      setImportWarnings(result.warnings);
      setPlanDataRevision((current) => current + 1);
      await load();
    } catch (importError) {
      setImportStatus(`Fehler beim Tilgungsplan-Import: ${importError instanceof Error ? importError.message : String(importError)}`);
    } finally {
      setImportingPlans(false);
    }
  }

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return rows;
    return rows.filter((row) => row.propertyName.toLowerCase().includes(normalizedQuery));
  }, [rows, query]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.balance += row.lastBalance;
        acc.principal += row.principalTotal;
        acc.interest += row.interestTotal;
        return acc;
      },
      { balance: 0, principal: 0, interest: 0 },
    );
  }, [filteredRows]);

  return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <h1 style={styles.title}>Darlehensübersicht für alle Immobilien</h1>
        <p style={styles.text}>
          Diese Seite bündelt die jährliche Darlehensübersicht aus deinem Bestand. Jede Immobilie kann geöffnet werden, die Tabelle „Finance pro Jahr“ wird automatisch berechnet und darunter bleibt das Darlehens-Ledger direkt editierbar.
          Für die Steuer ist diese Seite die Hauptquelle: Zinsen sind steuerrelevant, Tilgung dient nur der Restschuld- und Cashflow-Dokumentation.
        </p>

        <div style={styles.metricGrid}>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Objekte</div>
            <div style={styles.metricValue}>{filteredRows.length}</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Restschuld gesamt</div>
            <div style={styles.metricValue}>{formatCurrency(totals.balance)}</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Tilgung gesamt</div>
            <div style={styles.metricValue}>{formatCurrency(totals.principal)}</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Zinsen gesamt</div>
            <div style={styles.metricValue}>{formatCurrency(totals.interest)}</div>
          </div>
        </div>

        <div style={{ marginTop: 20, border: "1px solid #bfdbfe", borderRadius: 18, background: "#eff6ff", padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#1e3a8a", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Monatliche Tilgungspläne · Hauptquelle
          </div>
          <p style={{ ...styles.text, marginTop: 8 }}>
            Deutsche CSV-Tilgungspläne importieren. Die App speichert Rate, Zins, Tilgung, Restschuld, Quelldatei und Qualitätsstatus pro Objekt und Monat in Supabase. Vorhandene Kreditraten-Buchungen werden automatisch verknüpft.
          </p>
          <label style={{ ...styles.primaryButton, display: "inline-flex", alignItems: "center", gap: 8, marginTop: 12, opacity: importingPlans ? 0.65 : 1 }}>
            {importingPlans ? "Tilgungspläne werden importiert…" : "CSV-Tilgungspläne auswählen"}
            <input
              type="file"
              accept=".csv,text/csv"
              multiple
              disabled={importingPlans}
              style={{ display: "none" }}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                void importPlans(files);
              }}
            />
          </label>
          {importStatus ? (
            <div style={{ marginTop: 12, fontSize: 13, fontWeight: 800, color: importStatus.startsWith("Fehler") ? "#991b1b" : "#166534" }}>
              {importStatus}
            </div>
          ) : null}
          {importWarnings.length ? (
            <details style={{ marginTop: 10, color: "#92400e", fontSize: 12, fontWeight: 750 }}>
              <summary>{importWarnings.length} Quellenhinweis(e) anzeigen</summary>
              <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
                {importWarnings.slice(0, 20).map((warning) => <li key={warning} style={{ marginTop: 5 }}>{warning}</li>)}
              </ul>
              {importWarnings.length > 20 ? <div style={{ marginTop: 8 }}>Weitere {importWarnings.length - 20} Hinweise sind mit den Monatszeilen in Supabase gespeichert.</div> : null}
            </details>
          ) : null}
        </div>
      </section>

      <div style={styles.controls}>
        <input
          style={styles.input}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Immobilie suchen…"
        />
        <button type="button" style={styles.primaryButton} onClick={() => void load()}>
          Übersicht neu laden
        </button>
      </div>

      {loading ? <div style={styles.loadingBox}>Darlehensübersicht wird geladen…</div> : null}
      {!loading && error ? <div style={styles.errorBox}>{error}</div> : null}
      {!loading && !error && filteredRows.length === 0 ? (
        <div style={styles.loadingBox}>Keine Immobilien für die aktuelle Suche gefunden.</div>
      ) : null}

      {!loading && !error
        ? filteredRows.map((row) => (
            <PropertyLoanCard
              key={`${row.propertyId}-${planDataRevision}`}
              propertyId={row.propertyId}
              propertyName={row.propertyName}
              dashboardBalance={row.lastBalance}
              dashboardPrincipalTotal={row.principalTotal}
              dashboardInterestTotal={row.interestTotal}
            />
          ))
        : null}
    </div>
  );
}
