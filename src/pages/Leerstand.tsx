import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Building2, Filter, Pencil, Save, Trash2, X } from "lucide-react";

import { useAppData } from "../state/AppDataContext";
import {
  archiveVacancy,
  createVacancy,
  effectiveVacancyStartDate,
  effectiveVacancyStatusForRange,
  isVacancyEffectivelyActiveInRange,
  listVacancies,
  updateVacancy,
  type UnitVacancy,
  type VacancyStatus,
} from "../services/vacancyService";

type FormState = {
  propertyId: string;
  unitLabel: string;
  startDate: string;
  endDate: string;
  reason: string;
  notes: string;
};

type StatusFilter = VacancyStatus | "all";

const todayIso = new Date().toISOString().slice(0, 10);

const emptyForm: FormState = {
  propertyId: "",
  unitLabel: "",
  startDate: todayIso,
  endDate: "",
  reason: "",
  notes: "",
};

function formatDate(value: string | null): string {
  if (!value) return "offen";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("de-DE").format(date);
}

function statusLabel(status: VacancyStatus): string {
  if (status === "planned") return "Geplant";
  if (status === "ended") return "Beendet";
  return "Aktiv";
}

function statusClass(status: VacancyStatus): string {
  if (status === "planned") return "bg-blue-50 text-blue-800 border-blue-100";
  if (status === "ended") return "bg-slate-100 text-slate-700 border-slate-200";
  return "bg-zinc-100 text-zinc-800 border-zinc-200";
}

function statusFromDates(startDate: string, endDate: string): VacancyStatus {
  if (startDate > todayIso) return "planned";
  if (endDate && endDate < todayIso) return "ended";
  return "active";
}

export default function Leerstand() {
  const appData = useAppData();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rows, setRows] = useState<UnitVacancy[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const selectedProperty = useMemo(
    () => appData.objects.find((object) => object.id === form.propertyId),
    [appData.objects, form.propertyId],
  );

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listVacancies({ status: statusFilter, propertyId: propertyFilter === "all" ? undefined : propertyFilter });
      setRows(data);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : String(loadError);
      setError(`Leerstände konnten nicht geladen werden: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [propertyFilter, statusFilter]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadRows(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadRows]);

  function updateField(event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus(null);

    if (!form.propertyId) {
      setError("Bitte eine Immobilie auswählen.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        propertyId: form.propertyId,
        objectCode: selectedProperty?.code ?? null,
        objectLabel: selectedProperty?.label ?? null,
        unitLabel: form.unitLabel,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason,
        notes: form.notes,
        status: statusFromDates(form.startDate, form.endDate),
      };

      if (editingId) await updateVacancy(editingId, payload);
      else await createVacancy(payload);

      setForm(emptyForm);
      setEditingId(null);
      setStatus(editingId ? "Leerstand wurde aktualisiert." : "Leerstand wurde gespeichert.");
      window.dispatchEvent(new Event("koenen:vacancy-changed"));
      await loadRows();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setError(`Speichern fehlgeschlagen: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(id: string) {
    const confirmed = window.confirm("Diesen Leerstand archivieren?");
    if (!confirmed) return;
    setError(null);
    try {
      await archiveVacancy(id);
      window.dispatchEvent(new Event("koenen:vacancy-changed"));
      await loadRows();
    } catch (archiveError) {
      const message = archiveError instanceof Error ? archiveError.message : String(archiveError);
      setError(`Archivieren fehlgeschlagen: ${message}`);
    }
  }

  function startEdit(row: UnitVacancy) {
    setEditingId(row.id);
    setForm({
      propertyId: row.property_id,
      unitLabel: row.unit_label ?? "",
      startDate: row.start_date,
      endDate: row.end_date ?? "",
      reason: row.reason ?? "",
      notes: row.notes ?? "",
    });
    setError(null);
    setStatus("Leerstand wird bearbeitet. Änderungen oben speichern.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setStatus(null);
    setError(null);
  }

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return rows;
    return rows.filter((row) =>
      `${row.object_label ?? ""} ${row.object_code ?? ""} ${row.unit_label ?? ""} ${row.reason ?? ""} ${row.notes ?? ""}`
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [rows, search]);

  const currentMonth = useMemo(() => {
    const start = new Date();
    const from = new Date(start.getFullYear(), start.getMonth(), 1).toISOString().slice(0, 10);
    const to = new Date(start.getFullYear(), start.getMonth() + 1, 0).toISOString().slice(0, 10);
    return { from, to };
  }, []);

  const activeCount = filteredRows.filter((row) => isVacancyEffectivelyActiveInRange(row, currentMonth.from, currentMonth.to)).length;

  return (
    <div className="vacancy-page mx-auto max-w-[1480px] space-y-5">
      <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-zinc-700">
              <Building2 size={15} />
              Leerstandmanagement
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950">Leerstand verwalten</h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
              Manuelle Leerstände werden hier gespeichert. Beendete Mietzeiträume werden in der Mieterprüfung zusätzlich automatisch als leerstandsrelevant erkannt.
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-black text-zinc-800">
            Aktive Leerstände: {activeCount}
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
        <form onSubmit={handleSubmit} className="min-w-0 rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-950">{editingId ? "Leerstand bearbeiten" : "Leerstand eintragen"}</h2>
              <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                Bei Wiedervermietung ab 10.03.2026 wird als Ende der 09.03.2026 eingetragen.
              </p>
            </div>
            {editingId ? (
              <button type="button" onClick={cancelEdit} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700">
                <X size={14} />
                Abbrechen
              </button>
            ) : null}
          </div>
          <div className="mt-4 grid gap-4">
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Immobilie
              <select name="propertyId" value={form.propertyId} onChange={updateField} className="h-11 rounded-xl border border-slate-300 bg-white px-3 font-semibold text-slate-950">
                <option value="">Bitte auswählen</option>
                {appData.objects.map((object) => (
                  <option key={object.id} value={object.id}>{object.label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Einheit / Stellplatz
              <input name="unitLabel" value={form.unitLabel} onChange={updateField} placeholder="z. B. Wohnung, P250, Garage" className="h-11 rounded-xl border border-slate-300 px-3 font-semibold text-slate-950" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Beginn
                <input name="startDate" type="date" value={form.startDate} onChange={updateField} className="h-11 rounded-xl border border-slate-300 px-3 font-semibold text-slate-950" />
              </label>
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Ende
                <input name="endDate" type="date" value={form.endDate} onChange={updateField} className="h-11 rounded-xl border border-slate-300 px-3 font-semibold text-slate-950" />
              </label>
            </div>
            <p className="-mt-2 text-xs font-semibold leading-5 text-slate-500">Leerstand endet am Tag vor dem neuen Mietbeginn.</p>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Grund
              <input name="reason" value={form.reason} onChange={updateField} placeholder="z. B. Kündigung, Renovierung, Neuvermietung offen" className="h-11 rounded-xl border border-slate-300 px-3 font-semibold text-slate-950" />
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Notiz
              <textarea name="notes" value={form.notes} onChange={updateField} rows={4} className="rounded-xl border border-slate-300 px-3 py-3 font-medium text-slate-950" />
            </label>
          </div>
          <button type="submit" disabled={saving} className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-black text-white disabled:bg-slate-300">
            <Save size={17} />
            {saving ? "Speichert..." : editingId ? "Änderungen speichern" : "Leerstand speichern"}
          </button>
          {status ? <div className="mt-3 text-sm font-bold text-emerald-700">{status}</div> : null}
          {error ? <div className="mt-3 text-sm font-bold text-red-700">{error}</div> : null}
        </form>

        <section className="min-w-0 rounded-[22px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <div className="grid gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-950">Übersicht leerstehender Einheiten</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">Filter nach Immobilie, Status und Suchtext.</p>
              </div>
              <div className="vacancy-filter-grid grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1 text-xs font-black text-slate-600">
                  <span className="inline-flex items-center gap-1"><Filter size={13} /> Immobilie</span>
                  <select value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)} className="h-10 rounded-xl border border-slate-300 bg-white px-3 font-bold">
                    <option value="all">Alle</option>
                    {appData.objects.map((object) => <option key={object.id} value={object.id}>{object.label}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-black text-slate-600">
                  Status
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="h-10 rounded-xl border border-slate-300 bg-white px-3 font-bold">
                    <option value="all">Alle</option>
                    <option value="active">Aktiv</option>
                    <option value="planned">Geplant</option>
                    <option value="ended">Beendet</option>
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-black text-slate-600">
                  Suche
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Einheit, Grund, Notiz" className="h-10 rounded-xl border border-slate-300 px-3 font-bold" />
                </label>
              </div>
            </div>
          </div>

          <div className="vacancy-list-wrap">
            {loading ? (
              <div className="vacancy-empty-state">Leerstände werden geladen...</div>
            ) : filteredRows.length ? (
              <div className="vacancy-list">
                {filteredRows.map((row) => {
                  const effectiveStatus = effectiveVacancyStatusForRange(row, currentMonth.from, currentMonth.to);
                  const effectiveStart = effectiveVacancyStartDate(row);
                  const displayStatus = row.end_date && row.end_date < todayIso ? "ended" : effectiveStatus;
                  return (
                    <article key={row.id} className="vacancy-list-item">
                      <div className="vacancy-list-main">
                        <div>
                          <div className="vacancy-kicker">Immobilie</div>
                          <div className="vacancy-title">{row.object_label || row.object_code || row.property_id}</div>
                        </div>
                        <div>
                          <div className="vacancy-kicker">Einheit</div>
                          <div className="vacancy-value">{row.unit_label || "Gesamte Immobilie"}</div>
                        </div>
                        <div>
                          <div className="vacancy-kicker">Zeitraum</div>
                          <div className="vacancy-value">{formatDate(effectiveStart)} bis {row.end_date ? formatDate(row.end_date) : "offen"}</div>
                        </div>
                        <div>
                          <div className="vacancy-kicker">Status</div>
                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${statusClass(displayStatus)}`}>
                            {statusLabel(displayStatus)}
                          </span>
                        </div>
                        <div>
                          <div className="vacancy-kicker">Grund</div>
                          <div className="vacancy-value">{row.reason || row.notes || "—"}</div>
                        </div>
                      </div>
                      <div className="vacancy-row-actions">
                        <button type="button" onClick={() => startEdit(row)} className="vacancy-edit-button">
                          <Pencil size={14} />
                          Bearbeiten
                        </button>
                        <button type="button" onClick={() => void handleArchive(row.id)} className="vacancy-archive-button">
                          <Trash2 size={14} />
                          Archivieren
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="vacancy-empty-state">Keine Leerstände für die aktuelle Auswahl.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
