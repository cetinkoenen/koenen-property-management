import { useEffect, useMemo, useState } from "react";
import { Bell, FileText, RefreshCw, Send } from "lucide-react";

import {
  createPaymentReminderDraft,
  listPaymentReminderDrafts,
  loadCockpitSnapshot,
  type CockpitSnapshot,
  type PaymentReminderRow,
} from "../services/professionalCockpitService";

function eur(value: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value || 0);
}

function levelLabel(level: PaymentReminderRow["reminder_level"]): string {
  if (level === "mahnung_1") return "1. Mahnung";
  if (level === "mahnung_2") return "2. Mahnung";
  if (level === "letzte_mahnung") return "Letzte Mahnung";
  return "Zahlungserinnerung";
}

export default function Mahnwesen() {
  const [snapshot, setSnapshot] = useState<CockpitSnapshot | null>(null);
  const [reminders, setReminders] = useState<PaymentReminderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [cockpit, drafts] = await Promise.all([
        loadCockpitSnapshot(),
        listPaymentReminderDrafts(),
      ]);
      setSnapshot(cockpit);
      setReminders(drafts);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initialLoad);
  }, []);

  const reminderCandidates = useMemo(
    () => (snapshot?.openPosts ?? []).filter((row) => row.status === "missing" || row.status === "partial"),
    [snapshot],
  );

  async function createDraft(contractId: string) {
    const row = reminderCandidates.find((candidate) => candidate.contractId === contractId);
    if (!row) return;
    setSavingId(contractId);
    setMessage(null);
    setError(null);
    try {
      await createPaymentReminderDraft(row, row.status === "partial" ? "zahlungserinnerung" : "mahnung_1");
      setMessage("Mahnungsentwurf wurde erstellt.");
      const drafts = await listPaymentReminderDrafts();
      setReminders(drafts);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <section className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-amber-800">
              <Bell size={15} />
              Mahnwesen light
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950">Offene Mieten nachverfolgen</h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
              Offene Posten werden aus Sollmieten und Zahlungseingängen berechnet. Du kannst daraus Entwürfe für Zahlungserinnerungen oder Mahnungen erstellen und später weiter ausbauen.
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

      {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}
      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">{error}</div> : null}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <div className="rounded-[22px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-xl font-black text-slate-950">Mahnkandidaten</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">Nur fehlende oder teilweise bezahlte Mieten werden gelistet.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="p-5 text-sm font-bold text-slate-500">Mahnwesen wird geladen...</div>
            ) : reminderCandidates.length ? (
              reminderCandidates.map((row) => (
                <div key={row.contractId} className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <div className="text-lg font-black text-slate-950">{row.objectLabel}</div>
                    <div className="mt-1 text-sm font-bold text-slate-500">{row.tenantName} · {row.unitLabel || row.objectCode || "Einheit"}</div>
                    <div className="mt-3 grid gap-2 text-sm font-bold text-slate-700 sm:grid-cols-3">
                      <span>Soll {eur(row.expectedAmount)}</span>
                      <span>Bezahlt {eur(row.paidAmount)}</span>
                      <span className="text-rose-700">Offen {eur(row.openAmount)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void createDraft(row.contractId)}
                    disabled={savingId === row.contractId}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white disabled:bg-slate-300"
                  >
                    <Send size={16} />
                    {savingId === row.contractId ? "Erstelle..." : "Entwurf erstellen"}
                  </button>
                </div>
              ))
            ) : (
              <div className="p-5 text-sm font-bold text-slate-500">Keine Mahnkandidaten im aktuellen Monat.</div>
            )}
          </div>
        </div>

        <aside className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-xl font-black text-slate-950">
            <FileText size={18} />
            Entwürfe
          </h2>
          <div className="mt-4 space-y-3">
            {reminders.length ? (
              reminders.map((reminder) => (
                <div key={reminder.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-black text-slate-950">{reminder.subject || levelLabel(reminder.reminder_level)}</div>
                  <div className="mt-1 text-xs font-bold text-slate-500">ID {reminder.reminder_key} · {levelLabel(reminder.reminder_level)}</div>
                  <div className="mt-3 text-sm font-black text-rose-700">{eur(reminder.open_amount)}</div>
                </div>
              ))
            ) : (
              <p className="text-sm font-semibold text-slate-500">Noch keine Mahnungsentwürfe vorhanden.</p>
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}
