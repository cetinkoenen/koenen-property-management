import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, CheckCircle2, ClipboardCheck, KeyRound, Loader2, Pencil, RefreshCw, RotateCcw, Save } from "lucide-react";

import {
  listMoveContractOptions,
  listMoveProcesses,
  saveMoveProcess,
  updateMoveProcessStatus,
  type MoveChecklist,
  type MoveContractOption,
  type MoveMeterReadings,
  type MoveProcess,
  type MoveProcessStatus,
  type MoveProcessType,
} from "../services/moveProcessService";

type FormState = {
  tenantContractId: string;
  propertyId: string;
  objectCode: string;
  unitLabel: string;
  processType: MoveProcessType;
  status: MoveProcessStatus;
  handoverDate: string;
  depositStatus: string;
  notes: string;
  meterReadings: MoveMeterReadings;
  checklist: Required<MoveChecklist>;
};

const checklistItems: Array<{ key: keyof Required<MoveChecklist>; label: string }> = [
  { key: "schluessel", label: "Schlüssel übergeben" },
  { key: "zaehler", label: "Zählerstände erfasst" },
  { key: "kaution", label: "Kaution geprüft" },
  { key: "bescheinigung", label: "Wohnungsgeberbestätigung" },
  { key: "protokoll", label: "Übergabeprotokoll" },
  { key: "fotos", label: "Fotos dokumentiert" },
  { key: "dokumente", label: "Dokumente abgelegt" },
];

const initialForm: FormState = {
  tenantContractId: "",
  propertyId: "",
  objectCode: "",
  unitLabel: "",
  processType: "auszug",
  status: "offen",
  handoverDate: "",
  depositStatus: "",
  notes: "",
  meterReadings: {
    strom: "",
    wasser: "",
    heizung: "",
    gas: "",
  },
  checklist: {
    schluessel: false,
    zaehler: false,
    kaution: false,
    bescheinigung: false,
    protokoll: false,
    fotos: false,
    dokumente: false,
  },
};

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE").format(date);
}

function statusLabel(status: MoveProcessStatus): string {
  if (status === "in_bearbeitung") return "In Bearbeitung";
  if (status === "erledigt") return "Erledigt";
  if (status === "archiviert") return "Archiviert";
  return "Offen";
}

function typeLabel(type: MoveProcessType): string {
  if (type === "einzug") return "Einzug";
  if (type === "wechsel") return "Mieterwechsel";
  return "Auszug";
}

function statusClass(status: MoveProcessStatus): string {
  if (status === "erledigt") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "in_bearbeitung") return "border-blue-200 bg-blue-50 text-blue-800";
  if (status === "archiviert") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function checklistProgress(checklist: MoveChecklist): { done: number; total: number; percent: number } {
  const total = checklistItems.length;
  const done = checklistItems.filter((item) => Boolean(checklist[item.key])).length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

function contractLabel(contract: MoveContractOption): string {
  const object = contract.object_code || contract.property_id || "Objekt offen";
  const unit = contract.unit_label ? ` · ${contract.unit_label}` : "";
  return `${contract.tenantName} · ${object}${unit}`;
}

function normalizeChecklist(checklist: MoveChecklist | null | undefined): Required<MoveChecklist> {
  return {
    schluessel: Boolean(checklist?.schluessel),
    zaehler: Boolean(checklist?.zaehler),
    kaution: Boolean(checklist?.kaution),
    bescheinigung: Boolean(checklist?.bescheinigung),
    protokoll: Boolean(checklist?.protokoll),
    fotos: Boolean(checklist?.fotos),
    dokumente: Boolean(checklist?.dokumente),
  };
}

function processToForm(process: MoveProcess): FormState {
  return {
    tenantContractId: process.tenant_contract_id ?? "",
    propertyId: process.property_id ?? "",
    objectCode: process.object_code ?? "",
    unitLabel: process.unit_label ?? "",
    processType: process.process_type,
    status: process.status,
    handoverDate: process.handover_date ?? "",
    depositStatus: process.deposit_status ?? "",
    notes: process.notes ?? "",
    meterReadings: {
      strom: process.meter_readings?.strom ?? "",
      wasser: process.meter_readings?.wasser ?? "",
      heizung: process.meter_readings?.heizung ?? "",
      gas: process.meter_readings?.gas ?? "",
    },
    checklist: normalizeChecklist(process.checklist),
  };
}

export default function EinAuszug() {
  const [contracts, setContracts] = useState<MoveContractOption[]>([]);
  const [processes, setProcesses] = useState<MoveProcess[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const openCount = useMemo(
    () => processes.filter((process) => process.status === "offen" || process.status === "in_bearbeitung").length,
    [processes],
  );

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [contractRows, processRows] = await Promise.all([listMoveContractOptions(), listMoveProcesses()]);
      setContracts(contractRows);
      setProcesses(processRows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Ein-/Auszug konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(initialLoad);
  }, []);

  function selectContract(contractId: string) {
    const contract = contracts.find((item) => item.id === contractId);
    setForm((current) => ({
      ...current,
      tenantContractId: contractId,
      propertyId: contract?.property_id ?? current.propertyId,
      objectCode: contract?.object_code ?? current.objectCode,
      unitLabel: contract?.unit_label ?? current.unitLabel,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const selectedContract = contracts.find((item) => item.id === form.tenantContractId);
      await saveMoveProcess({
        id: editingId,
        tenantId: selectedContract?.tenant_id ?? null,
        tenantContractId: form.tenantContractId || null,
        propertyId: form.propertyId,
        objectCode: form.objectCode,
        unitLabel: form.unitLabel,
        processType: form.processType,
        status: form.status,
        handoverDate: form.handoverDate,
        meterReadings: form.meterReadings,
        depositStatus: form.depositStatus,
        checklist: form.checklist,
        notes: form.notes,
      });
      setForm(initialForm);
      setEditingId(null);
      setSuccess(editingId ? "Ein-/Auszug wurde aktualisiert." : "Ein-/Auszug wurde dokumentiert.");
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Ein-/Auszug konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(id: string, status: MoveProcessStatus) {
    setError(null);
    try {
      const updated = await updateMoveProcessStatus(id, status);
      setProcesses((current) => current.map((item) => (item.id === id ? updated : item)));
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Status konnte nicht geändert werden.");
    }
  }

  function startEdit(process: MoveProcess) {
    setEditingId(process.id);
    setForm(processToForm(process));
    setSuccess(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetEditor() {
    setEditingId(null);
    setForm(initialForm);
    setSuccess(null);
    setError(null);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-slate-600">
              <KeyRound size={15} />
              Ein-/Auszug
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
              Übergaben professionell dokumentieren
            </h1>
            <p className="mt-3 max-w-4xl text-sm font-medium leading-6 text-slate-600">
              Dokumentiere Einzug, Auszug und Mieterwechsel mit Termin, Einheit, Zählerständen, Kaution und Checkliste.
              Bestehende Buchungen, Mietzeiträume und Portfolio-Werte werden dabei nicht verändert.
            </p>
          </div>
          <div className="inline-flex w-fit items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-sm">
            <ClipboardCheck size={18} />
            Offene Vorgänge: {openCount}
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-800">
          {success}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <form onSubmit={handleSubmit} className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-black text-slate-950">{editingId ? "Vorgang bearbeiten" : "Vorgang anlegen"}</h2>
            {editingId ? (
              <button
                type="button"
                onClick={resetEditor}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700"
              >
                Neu
              </button>
            ) : null}
          </div>

          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-sm font-black text-slate-700">Bestehender Mietvertrag</span>
              <select
                value={form.tenantContractId}
                onChange={(event) => selectContract(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
              >
                <option value="">Manuell / bitte auswählen</option>
                {contracts.map((contract) => (
                  <option key={contract.id} value={contract.id}>
                    {contractLabel(contract)}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-black text-slate-700">Vorgang</span>
                <select
                  value={form.processType}
                  onChange={(event) => setForm((current) => ({ ...current, processType: event.target.value as MoveProcessType }))}
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                >
                  <option value="auszug">Auszug</option>
                  <option value="einzug">Einzug</option>
                  <option value="wechsel">Mieterwechsel</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-black text-slate-700">Status</span>
                <select
                  value={form.status}
                  onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as MoveProcessStatus }))}
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                >
                  <option value="offen">Offen</option>
                  <option value="in_bearbeitung">In Bearbeitung</option>
                  <option value="erledigt">Erledigt</option>
                  <option value="archiviert">Archiviert</option>
                </select>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-black text-slate-700">Immobilie / Code</span>
                <input
                  value={form.objectCode}
                  onChange={(event) => setForm((current) => ({ ...current, objectCode: event.target.value }))}
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                  placeholder="z. B. Rosenstein Str. 25"
                />
              </label>
              <label className="block">
                <span className="text-sm font-black text-slate-700">Einheit / Stellplatz</span>
                <input
                  value={form.unitLabel}
                  onChange={(event) => setForm((current) => ({ ...current, unitLabel: event.target.value }))}
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                  placeholder="z. B. Wohnung, P254"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-black text-slate-700">Übergabetermin</span>
                <input
                  type="date"
                  value={form.handoverDate}
                  onChange={(event) => setForm((current) => ({ ...current, handoverDate: event.target.value }))}
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                />
              </label>
              <label className="block">
                <span className="text-sm font-black text-slate-700">Kaution</span>
                <input
                  value={form.depositStatus}
                  onChange={(event) => setForm((current) => ({ ...current, depositStatus: event.target.value }))}
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                  placeholder="z. B. offen, geprüft, auszahlen"
                />
              </label>
            </div>

            <div>
              <h3 className="text-sm font-black text-slate-700">Zählerstände</h3>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {(["strom", "wasser", "heizung", "gas"] as Array<keyof MoveMeterReadings>).map((key) => (
                  <input
                    key={key}
                    value={form.meterReadings[key] ?? ""}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        meterReadings: { ...current.meterReadings, [key]: event.target.value },
                      }))
                    }
                    className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-bold capitalize outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                    placeholder={key}
                  />
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-black text-slate-700">Checkliste</h3>
              <div className="mt-3 grid gap-2">
                {checklistItems.map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={form.checklist[item.key]}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          checklist: { ...current.checklist, [item.key]: event.target.checked },
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="text-sm font-black text-slate-700">Notiz</span>
              <textarea
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                placeholder="z. B. Schäden, fehlende Unterlagen, Rückfragen"
              />
            </label>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              {editingId ? "Änderungen speichern" : "Vorgang speichern"}
            </button>
          </div>
        </form>

        <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between md:p-5">
            <div>
              <h2 className="text-xl font-black text-slate-950">Ein-/Auszug Übersicht</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Zentrale Liste für Übergaben, Mieterwechsel und offene Aufgaben.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadData()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-900 shadow-sm"
            >
              <RefreshCw size={17} />
              Neu laden
            </button>
          </div>

          {loading ? (
            <div className="flex min-h-80 items-center justify-center gap-3 text-sm font-black text-slate-500">
              <Loader2 size={18} className="animate-spin" />
              Ein-/Auszüge werden geladen...
            </div>
          ) : processes.length === 0 ? (
            <div className="min-h-80 p-6 text-sm font-bold text-slate-500">
              Noch keine Übergabe dokumentiert.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] table-fixed text-left">
                <colgroup>
                  <col className="w-[120px]" />
                  <col className="w-[170px]" />
                  <col className="w-[120px]" />
                  <col className="w-[120px]" />
                  <col className="w-[120px]" />
                  <col className="w-[130px]" />
                  <col className="w-[180px]" />
                </colgroup>
                <thead className="bg-slate-50 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Vorgang</th>
                    <th className="px-3 py-3">Immobilie</th>
                    <th className="px-3 py-3">Termin</th>
                    <th className="px-3 py-3">Checkliste</th>
                    <th className="px-3 py-3">Kaution</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Aktion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {processes.map((process) => {
                    const progress = checklistProgress(process.checklist ?? {});
                    return (
                      <tr key={process.id} className="align-top">
                        <td className="px-3 py-3">
                          <div className="font-black text-slate-950">{typeLabel(process.process_type)}</div>
                          <div className="mt-1 text-xs font-bold text-slate-500">{process.unit_label || "Einheit offen"}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="truncate font-black text-slate-950" title={process.object_code || process.property_id || "Objekt offen"}>{process.object_code || process.property_id || "Objekt offen"}</div>
                          {process.notes && <div className="mt-1 line-clamp-2 text-xs font-semibold text-slate-500" title={process.notes}>{process.notes}</div>}
                        </td>
                        <td className="px-3 py-3">
                          <div className="inline-flex items-center gap-2 font-bold text-slate-700">
                            <CalendarDays size={16} />
                            {formatDate(process.handover_date)}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-black text-slate-800">
                            {progress.done}/{progress.total}
                          </div>
                          <div className="mt-2 h-2 w-20 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress.percent}%` }} />
                          </div>
                        </td>
                        <td className="px-3 py-3 font-bold text-slate-700">
                          <div className="truncate" title={process.deposit_status || "-"}>{process.deposit_status || "-"}</div>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${statusClass(process.status)}`}>
                            {statusLabel(process.status)}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-2 min-[1400px]:flex-row min-[1400px]:flex-wrap">
                            <button
                              type="button"
                              onClick={() => startEdit(process)}
                              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-2 text-xs font-black text-blue-800"
                            >
                              <Pencil size={14} />
                              Bearbeiten
                            </button>
                            {process.status !== "archiviert" && (
                              <button
                                type="button"
                                onClick={() => void changeStatus(process.id, "erledigt")}
                                className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-2 text-xs font-black text-emerald-800"
                              >
                                <CheckCircle2 size={14} />
                                Erledigen
                              </button>
                            )}
                            {process.status !== "archiviert" && (
                              <button
                                type="button"
                                onClick={() => void changeStatus(process.id, "archiviert")}
                                className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-xs font-black text-slate-700"
                              >
                                Archivieren
                              </button>
                            )}
                            {process.status === "archiviert" && (
                              <button
                                type="button"
                                onClick={() => void changeStatus(process.id, "in_bearbeitung")}
                                className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-2 text-xs font-black text-slate-700"
                              >
                                <RotateCcw size={14} />
                                Zurücksetzen
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
