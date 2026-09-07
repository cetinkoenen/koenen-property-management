import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, FileText, FolderOpen, Plus, RefreshCw } from "lucide-react";

import { supabase } from "@/lib/supabase";
import {
  extractBillingWorkspaceRecords,
  summarizeBillingWorkspace,
  type BillingWorkspaceRecordSnapshot,
} from "@/services/billingWorkspaceService";
import {
  getPropertyDocumentSignedUrl,
  type PropertyDocumentRow,
} from "@/services/documentArchiveService";

type BillingRow = { object_id: string; year: string | number; data: unknown };
type ObjectOption = { objekt_code: string; label: string };

type KpiRecord = BillingWorkspaceRecordSnapshot & { sourceObjectId: string; year: number };

function normalizeIdentity(value: unknown) {
  return String(value ?? "")
    .toLocaleLowerCase("de-DE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ß", "ss")
    .replace(/strasse|straße/g, "str")
    .replace(/[^a-z0-9]+/g, "");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value || "—" : new Intl.DateTimeFormat("de-DE").format(date);
}

function statusPresentation(value: string | undefined, locked: boolean | undefined) {
  const normalized = String(value || (locked ? "Freigegeben" : "Offen")).toLocaleLowerCase("de-DE");
  if (normalized.includes("korrigiert")) return { label: "Korrigiert", classes: "border-sky-200 bg-sky-50 text-sky-700", pdfEnabled: true };
  if (locked || normalized.includes("freigegeben")) return { label: "Freigegeben", classes: "border-emerald-200 bg-emerald-50 text-emerald-700", pdfEnabled: true };
  if (normalized.includes("arbeit") || normalized.includes("prüfung") || normalized.includes("prufung")) return { label: value || "In Arbeit", classes: "border-amber-200 bg-amber-50 text-amber-700", pdfEnabled: false };
  return { label: "Offen", classes: "border-slate-200 bg-slate-100 text-slate-600", pdfEnabled: false };
}

export default function PropertyUtilitiesKpiDashboard({ propertyId, propertyLabel }: { propertyId: string; propertyLabel: string }) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<string>(String(currentYear));
  const [records, setRecords] = useState<KpiRecord[]>([]);
  const [documents, setDocuments] = useState<PropertyDocumentRow[]>([]);
  const [billingObjectId, setBillingObjectId] = useState(propertyId);
  const [openArchiveId, setOpenArchiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [billingResult, documentResult, objectResult] = await Promise.all([
        supabase.from("apartment_billing_workspaces").select("object_id,year,data").order("year", { ascending: false }),
        supabase.from("property_documents").select("*").eq("category", "nk_abrechnung").order("document_year", { ascending: false, nullsFirst: false }),
        supabase.from("v_object_dropdown").select("objekt_code,label").order("label", { ascending: true }),
      ]);
      if (billingResult.error) throw billingResult.error;
      if (documentResult.error) throw documentResult.error;
      if (objectResult.error) throw objectResult.error;

      const labelKey = normalizeIdentity(propertyLabel);
      const matchingObject = ((objectResult.data ?? []) as ObjectOption[]).find((object) => {
        return object.objekt_code === propertyId || (Boolean(labelKey) && normalizeIdentity(object.label) === labelKey);
      });
      const canonicalBillingObjectId = matchingObject?.objekt_code ?? propertyId;
      const nextRecords = ((billingResult.data ?? []) as BillingRow[]).filter((row) => row.object_id === canonicalBillingObjectId).flatMap((row) => {
        const year = Number(row.year);
        return extractBillingWorkspaceRecords(row.data, year).map((record) => ({
          ...record,
          sourceObjectId: row.object_id,
          year: Number(record.workspace.meta.billingYear || year),
        }));
      }).sort((a, b) => b.year - a.year || b.workspace.meta.periodFrom.localeCompare(a.workspace.meta.periodFrom));

      const nextDocuments = ((documentResult.data ?? []) as PropertyDocumentRow[]).filter((document) => {
        return document.property_id === propertyId
          || document.portfolio_property_id === propertyId
          || document.objekt_code === propertyId
          || (Boolean(labelKey) && normalizeIdentity(document.property_name) === labelKey);
      });
      setRecords(nextRecords);
      setDocuments(nextDocuments);
      setBillingObjectId(canonicalBillingObjectId);
    } catch (loadError) {
      setRecords([]);
      setDocuments([]);
      setError(loadError instanceof Error ? loadError.message : "Nebenkosten-KPIs konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [propertyId, propertyLabel]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const years = useMemo(() => Array.from(new Set([currentYear, ...records.map((record) => record.year)])).sort((a, b) => b - a), [currentYear, records]);
  const visibleRecords = useMemo(() => selectedYear === "all" ? records : records.filter((record) => record.year === Number(selectedYear)), [records, selectedYear]);

  function billingUrl(record?: KpiRecord, view?: "pdf") {
    const params = new URLSearchParams({ object: billingObjectId, year: String(record?.year ?? (selectedYear === "all" ? currentYear : selectedYear)) });
    if (record) params.set("billing", record.id);
    if (view) params.set("view", view);
    return `/nebenkosten/wohnungen?${params.toString()}`;
  }

  async function openDocument(document: PropertyDocumentRow) {
    try {
      const url = await getPropertyDocumentSignedUrl(document.storage_path, 10 * 60, document.storage_bucket);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (documentError) {
      setError(documentError instanceof Error ? documentError.message : "Archivdatei konnte nicht geöffnet werden.");
    }
  }

  return (
    <section aria-labelledby="utilities-kpi-title" className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Nebenkosten · Jahresübersicht</p>
          <h2 id="utilities-kpi-title" className="mt-1 text-xl font-black text-slate-950">Nebenkosten-KPI-Dashboard</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">Abrechnungsstatus und Ergebnis direkt aus der zentralen Nebenkosten-Hauptquelle.</p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700">
          <RefreshCw size={15} /> Aktualisieren
        </button>
      </div>

      <div className="flex flex-col gap-3 bg-slate-50/70 p-5 sm:flex-row sm:items-end sm:justify-between">
        <a href={billingUrl()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#255f6f] px-5 text-sm font-black text-white no-underline shadow-sm">
          <Plus size={17} /> Nebenkosten bearbeiten / Neu erstellen
        </a>
        <label className="grid gap-2 sm:min-w-52">
          <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Abrechnungsjahr</span>
          <select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)} className="min-h-12 rounded-2xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-800 shadow-sm">
            {years.map((year) => <option key={year} value={year}>{year}{year === currentYear ? " · aktuelles Jahr" : ""}</option>)}
            <option value="all">Alle Jahre anzeigen</option>
          </select>
        </label>
      </div>

      <div className="p-5">
        {loading ? <div role="status" className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-600">Nebenkostenabrechnungen werden geladen…</div> : null}
        {!loading && error ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">{error}</div> : null}
        {!loading && !error && visibleRecords.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm font-bold text-slate-600">Für {selectedYear === "all" ? "diese Immobilie" : `das Jahr ${selectedYear}`} ist noch keine Nebenkostenabrechnung gespeichert.</div> : null}
        {!loading && !error && visibleRecords.length ? (
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {visibleRecords.map((record) => {
              const summary = summarizeBillingWorkspace(record.workspace);
              const status = statusPresentation(record.workspace.meta.workflowStatus, record.workspace.meta.locked);
              const matchingDocuments = documents.filter((document) => document.document_year === record.year);
              const archiveOpen = openArchiveId === record.id;
              return (
                <article key={`${record.sourceObjectId}-${record.year}-${record.id}`} className="overflow-hidden rounded-[22px] border border-slate-200 bg-gradient-to-br from-white to-slate-50 shadow-sm">
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black ${status.classes}`}>{status.label}</span>
                      <span className="inline-flex items-center gap-2 text-xl font-black text-slate-950"><CalendarDays size={17} className="text-slate-400" />{record.year}</span>
                    </div>
                    <h3 className="mt-4 text-base font-black text-slate-950">{record.workspace.meta.propertyLabel || propertyLabel}</h3>
                    <p className="mt-1 text-sm font-bold text-slate-500">{summary.apartment?.label || "Einheit nicht benannt"}</p>
                    <p className="mt-3 text-sm font-bold text-slate-600">{formatDate(record.workspace.meta.periodFrom)} bis {formatDate(record.workspace.meta.periodTo)}</p>
                    <p className="mt-1 text-sm font-bold text-slate-600">{summary.apartment?.tenantName || "Mieter noch nicht hinterlegt"}</p>
                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Kosten</div>
                        <div className="mt-2 text-lg font-black tabular-nums text-slate-950">{formatCurrency(summary.tenantTotal)}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className={`text-[10px] font-black uppercase tracking-[0.16em] ${summary.balance >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{summary.label}</div>
                        <div className={`mt-2 text-lg font-black tabular-nums ${summary.balance >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{formatCurrency(Math.abs(summary.balance))}</div>
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap gap-2">
                      <a aria-disabled={!status.pdfEnabled} href={status.pdfEnabled ? billingUrl(record, "pdf") : undefined} target={status.pdfEnabled ? "_blank" : undefined} rel="noreferrer" className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-black no-underline ${status.pdfEnabled ? "border-slate-200 bg-white text-slate-800 hover:bg-slate-50" : "cursor-not-allowed border-slate-100 bg-slate-100 text-slate-400"}`}>
                        <FileText size={15} /> PDF öffnen
                      </a>
                      <button type="button" onClick={() => setOpenArchiveId((current) => current === record.id ? null : record.id)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-800">
                        <FolderOpen size={15} /> Archivdatei{matchingDocuments.length ? ` (${matchingDocuments.length})` : ""}
                      </button>
                    </div>
                    {archiveOpen ? (
                      <div className="mt-3 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        {matchingDocuments.length ? matchingDocuments.map((document) => (
                          <button key={document.id} type="button" onClick={() => void openDocument(document)} className="flex min-h-10 items-center justify-between gap-3 rounded-lg bg-white px-3 text-left text-xs font-bold text-slate-700 shadow-sm">
                            <span>{document.title || document.file_name}</span><span className="shrink-0 text-[#255f6f]">Öffnen</span>
                          </button>
                        )) : <span className="text-xs font-bold text-slate-500">Für dieses Jahr ist noch keine NK-Archivdatei hinterlegt.</span>}
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
