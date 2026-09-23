import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, Bell, CheckCircle2, ChevronDown, FileWarning, RefreshCw, WalletCards } from "lucide-react";
import { NavLink } from "react-router-dom";

import {
  loadCockpitSnapshot,
  updateCockpitTaskChecklistItem,
  type CockpitTask,
  type CockpitSnapshot,
  type OpenPostRow,
  type OpenPostStatus,
} from "../services/professionalCockpitService";
import { PROPERTY_TASKS_CHANGED_EVENT } from "../services/workflowTaskService";

function eur(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(value || 0);
}

function dateDE(value: string | null): string {
  if (!value) return "ohne Datum";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("de-DE").format(date);
}

function statusLabel(status: OpenPostStatus): string {
  if (status === "paid") return "Bezahlt";
  if (status === "partial") return "Teilweise";
  if (status === "vacant") return "Leerstand";
  return "Offen";
}

function statusClass(status: OpenPostStatus): string {
  if (status === "paid") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "partial") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "vacant") return "border-zinc-200 bg-zinc-100 text-zinc-700";
  return "border-rose-200 bg-rose-50 text-rose-800";
}

function checklistItemKey(groupTitle: string, item: string): string {
  return `${groupTitle}::${item}`;
}

export default function Cockpit() {
  const [snapshot, setSnapshot] = useState<CockpitSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await loadCockpitSnapshot();
      setSnapshot(data);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : String(loadError);
      setError(message);
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    function handleTasksChanged() {
      void load();
    }

    window.addEventListener(PROPERTY_TASKS_CHANGED_EVENT, handleTasksChanged);
    return () => window.removeEventListener(PROPERTY_TASKS_CHANGED_EVENT, handleTasksChanged);
  }, []);

  async function handleTaskChecklistChange(taskId: string, itemKey: string, done: boolean) {
    setSnapshot((current) => {
      if (!current) return current;
      return {
        ...current,
        tasks: current.tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                checklistDone: {
                  ...task.checklistDone,
                  [itemKey]: done,
                },
              }
            : task,
        ),
      };
    });

    try {
      await updateCockpitTaskChecklistItem(taskId, itemKey, done);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setError(`Aufgaben-Checkliste konnte nicht gespeichert werden: ${message}`);
      void load();
    }
  }

  const riskyPosts = useMemo(
    () => (snapshot?.openPosts ?? []).filter((row) => row.status === "missing" || row.status === "partial"),
    [snapshot],
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <section className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-slate-700">
              <WalletCards size={15} />
              Verwaltungs-Cockpit
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950">Professioneller Monatsüberblick</h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
              Erwartete Mieten, Zahlungseingänge, Leerstände, Aufgaben und Dokumenthinweise werden hier zusammengeführt. Buchungen bleiben die Ist-Quelle; Sollwerte kommen aus Mietverträgen.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 shadow-sm disabled:opacity-60"
          >
            <RefreshCw size={16} />
            Neu laden
          </button>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">
          Cockpit konnte nicht geladen werden: {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm font-black text-slate-500 shadow-sm">
          Cockpit wird geladen...
        </div>
      ) : snapshot ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Metric title="Monat" value={snapshot.periodLabel} sub={`Fälligkeit ${dateDE(snapshot.dueDate)}`} />
            <Metric title="Sollmiete" value={eur(snapshot.expectedTotal)} sub="ohne Leerstände" />
            <Metric title="Bezahlt" value={eur(snapshot.paidTotal)} sub={`${snapshot.paidCount} vollständig bezahlt`} tone="green" />
            <Metric title="Offen" value={eur(snapshot.openTotal)} sub={`${snapshot.missingCount} offen · ${snapshot.partialCount} teilweise`} tone={snapshot.openTotal > 0 ? "red" : "gray"} />
            <Metric title="Leerstand" value={String(snapshot.vacantCount)} sub="aktuell dokumentiert" tone="gray" />
          </section>

          <section className="grid gap-5 2xl:grid-cols-[minmax(1040px,1fr)_minmax(360px,420px)]">
            <div className="rounded-[22px] border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-200 p-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-950">Offene Posten</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">Soll-Ist-Abgleich aus Mietverträgen und Buchungen.</p>
                </div>
                <NavLink
                  to="/mieteruebersicht"
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-900 shadow-sm transition hover:bg-slate-50"
                >
                  <span>Mieteingang</span>
                  <ArrowRight size={15} />
                </NavLink>
              </div>

              <div className="block divide-y divide-slate-100 md:hidden">
                {snapshot.openPosts.length ? (
                  snapshot.openPosts.map((row) => <OpenPostCard key={row.contractId} row={row} />)
                ) : (
                  <div className="px-4 py-6 text-sm font-bold text-slate-500">Keine Sollstellungen aus Mietverträgen gefunden.</div>
                )}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[1040px] table-fixed border-collapse">
                  <colgroup>
                    <col className="w-[150px]" />
                    <col className="w-[270px]" />
                    <col className="w-[250px]" />
                    <col className="w-[140px]" />
                    <col className="w-[140px]" />
                    <col className="w-[150px]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Objekt / Einheit</th>
                      <th className="px-4 py-3">Mieter</th>
                      <th className="px-4 py-3 text-right">Soll</th>
                      <th className="px-4 py-3 text-right">Bezahlt</th>
                      <th className="px-4 py-3 text-right">Offen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.openPosts.length ? (
                      snapshot.openPosts.map((row) => (
                        <tr key={row.contractId} className="border-b border-slate-100">
                          <td className="px-4 py-4">
                            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${statusClass(row.status)}`}>
                              {statusLabel(row.status)}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="truncate font-black text-slate-950" title={row.objectLabel}>{row.objectLabel}</div>
                            <div className="mt-1 text-xs font-bold text-slate-500">{row.unitLabel || row.objectCode || "Einheit"}</div>
                          </td>
                          <td className="px-4 py-4 font-bold text-slate-700">
                            <div className="truncate" title={row.tenantName}>{row.tenantName}</div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-right font-black tabular-nums text-slate-900">{row.status === "vacant" ? "—" : eur(row.expectedAmount)}</td>
                          <td className="whitespace-nowrap px-4 py-4 text-right font-black tabular-nums text-emerald-700">{eur(row.paidAmount)}</td>
                          <td className={`whitespace-nowrap px-5 py-4 text-right font-black tabular-nums ${row.openAmount > 0 ? "text-rose-700" : "text-slate-500"}`}>{row.status === "vacant" ? "Leerstand" : eur(row.openAmount)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-sm font-bold text-slate-500">Keine Sollstellungen aus Mietverträgen gefunden.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="space-y-5">
              <InfoPanel
                icon={<AlertTriangle size={18} />}
                title="Heute wichtig"
                rows={
                  riskyPosts.length
                    ? riskyPosts.slice(0, 5).map((row) => `${row.objectLabel}: ${eur(row.openAmount)} offen`)
                    : ["Keine kritischen offenen Mieten im aktuellen Monat."]
                }
              />
              <TaskPanel tasks={snapshot.tasks} onChecklistChange={handleTaskChecklistChange} />
              <InfoPanel
                icon={<FileWarning size={18} />}
                title="Dokumente"
                rows={
                  snapshot.documentIssues.length
                    ? snapshot.documentIssues.map((doc) => `${doc.propertyName}: ${doc.detail}`)
                    : ["Keine fehlenden/ablaufenden Dokumente gemeldet."]
                }
              />
            </aside>
          </section>

          <section className="rounded-[22px] border border-indigo-100 bg-indigo-50 p-5 text-sm leading-6 text-indigo-950">
            <div className="flex items-center gap-2 font-black">
              <CheckCircle2 size={18} />
              Nächster Ausbau
            </div>
            <p className="mt-2 max-w-5xl">
              Auf dieser Grundlage können als nächstes Mahnungen, Transaktionsregeln, Ein-/Auszug-Prozesse und Dokumentpflichten produktiv ergänzt werden, ohne die bestehenden Buchungen oder Auswertungen umzubauen.
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Metric({ title, value, sub, tone = "slate" }: { title: string; value: string; sub: string; tone?: "slate" | "green" | "red" | "gray" }) {
  const valueClass = tone === "green" ? "text-emerald-700" : tone === "red" ? "text-rose-700" : tone === "gray" ? "text-zinc-700" : "text-slate-950";
  return (
    <div className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">{title}</div>
      <div className={`mt-3 text-2xl font-black ${valueClass}`}>{value}</div>
      <div className="mt-2 text-xs font-bold text-slate-500">{sub}</div>
    </div>
  );
}

function OpenPostCard({ row }: { row: OpenPostRow }) {
  return (
    <article className="space-y-4 px-4 py-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-base font-black text-slate-950" title={row.objectLabel}>
            {row.objectLabel}
          </div>
          <div className="mt-1 text-xs font-bold text-slate-500">{row.unitLabel || row.objectCode || "Einheit"}</div>
        </div>
        <span className={`inline-flex shrink-0 rounded-full border px-3 py-1 text-xs font-black ${statusClass(row.status)}`}>
          {statusLabel(row.status)}
        </span>
      </div>

      <div className="truncate text-sm font-bold text-slate-700" title={row.tenantName}>
        {row.tenantName}
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">Soll</div>
          <div className="mt-1 whitespace-nowrap text-sm font-black tabular-nums text-slate-950">
            {row.status === "vacant" ? "—" : eur(row.expectedAmount)}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">Bezahlt</div>
          <div className="mt-1 whitespace-nowrap text-sm font-black tabular-nums text-emerald-700">{eur(row.paidAmount)}</div>
        </div>
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">Offen</div>
          <div className={`mt-1 whitespace-nowrap text-sm font-black tabular-nums ${row.openAmount > 0 ? "text-rose-700" : "text-slate-500"}`}>
            {row.status === "vacant" ? "Leerstand" : eur(row.openAmount)}
          </div>
        </div>
      </div>
    </article>
  );
}

function InfoPanel({ icon, title, rows }: { icon: ReactNode; title: string; rows: string[] }) {
  return (
    <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-black text-slate-950">
        {icon}
        {title}
      </h2>
      <div className="mt-4 space-y-3">
        {rows.map((row, index) => (
          <div key={`${title}-${index}`} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-700">
            {row}
          </div>
        ))}
      </div>
    </section>
  );
}

function TaskPanel({
  tasks,
  onChecklistChange,
}: {
  tasks: CockpitTask[];
  onChecklistChange: (taskId: string, itemKey: string, done: boolean) => void | Promise<void>;
}) {
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(() => new Set());

  function toggleTask(taskId: string) {
    setExpandedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  return (
    <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-black text-slate-950">
        <Bell size={18} />
        Aufgaben
      </h2>
      <div className="mt-4 space-y-3">
        {tasks.length ? (
          tasks.map((task) => {
            const totalItems = task.checklistGroups.reduce((sum, group) => sum + group.items.length, 0);
            const doneItems = task.checklistGroups.reduce(
              (sum, group) =>
                sum +
                group.items.filter((item) => task.checklistDone[checklistItemKey(group.title, item)]).length,
              0,
            );
            const isExpanded = expandedTaskIds.has(task.id);

            return (
              <article key={task.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                <button
                  type="button"
                  onClick={() => toggleTask(task.id)}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-black leading-5 text-slate-800">{task.title}</span>
                    <span className="mt-1 block text-xs font-bold text-slate-500">
                      {task.dueDate ? `Fällig: ${dateDE(task.dueDate)} · ` : ""}
                      {totalItems ? `${doneItems}/${totalItems} erledigt` : "Keine Checkliste"}
                    </span>
                  </span>
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600">
                    <ChevronDown className={`transition ${isExpanded ? "rotate-180" : ""}`} size={17} />
                  </span>
                </button>

                {isExpanded && task.checklistGroups.length ? (
                  <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                    {task.checklistGroups.map((group) => (
                      <div key={`${task.id}-${group.title}`}>
                        <div className="text-xs font-black uppercase tracking-wide text-slate-600">{group.title}</div>
                        <div className="mt-2 space-y-2">
                          {group.items.map((item) => {
                            const itemKey = checklistItemKey(group.title, item);
                            const isDone = Boolean(task.checklistDone[itemKey]);
                            return (
                              <label
                                key={itemKey}
                                className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold leading-5 text-slate-700"
                              >
                                <input
                                  type="checkbox"
                                  checked={isDone}
                                  onChange={(event) => void onChecklistChange(task.id, itemKey, event.currentTarget.checked)}
                                  className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                                />
                                <span className={isDone ? "text-slate-400 line-through" : "text-slate-700"}>{item}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : isExpanded && task.description ? (
                  <p className="mt-3 border-t border-slate-200 pt-3 text-xs font-semibold leading-5 text-slate-600">{task.description}</p>
                ) : null}
              </article>
            );
          })
        ) : (
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-700">
            Keine offenen Aufgaben gefunden.
          </div>
        )}
      </div>
    </section>
  );
}
