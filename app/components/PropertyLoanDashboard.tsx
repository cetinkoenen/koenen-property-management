"use client";

import React, { useMemo, useState } from "react";

export type Row = {
  property_id: string;
  property_name: string;

  repayment_status: "red" | "yellow" | "green" | "grey";
  repayment_label: "critical" | "warning" | "healthy" | "no_data";
  status_rank: number;

  repaid_percent: number | null;
  repaid_percent_display: string;

  last_balance_eur: string;
  interest_total_eur: string;
  principal_total_eur: string;

  first_year: string;
  last_year: string;
  last_balance_year: string;

  refreshed_at: string;
};

function isRepaymentStatus(value: string): value is Row["repayment_status"] {
  return value === "red" || value === "yellow" || value === "green" || value === "grey";
}

function StatusDot({ status }: { status: Row["repayment_status"] }) {
  const cls =
    status === "red"
      ? "bg-red-500"
      : status === "yellow"
      ? "bg-yellow-400"
      : status === "green"
      ? "bg-green-500"
      : "bg-gray-300";

  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`} />;
}

function labelDE(label: Row["repayment_label"]) {
  switch (label) {
    case "critical":
      return "kritisch";
    case "warning":
      return "warnung";
    case "healthy":
      return "ok";
    default:
      return "keine Daten";
  }
}

export default function PropertyLoanDashboard({
  rows: rowsProp,
  error,
}: {
  rows?: Row[];
  error?: string | null;
}) {
  const rows = Array.isArray(rowsProp) ? rowsProp : [];

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | Row["repayment_status"]>("all");
  const [sort, setSort] = useState<"status" | "name">("status");

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();

    return rows
      .filter((r) => (status === "all" ? true : r.repayment_status === status))
      .filter((r) => (ql ? r.property_name.toLowerCase().includes(ql) : true))
      .sort((a, b) => {
        if (sort === "status") {
          if (a.status_rank !== b.status_rank) return a.status_rank - b.status_rank;
          return a.property_name.localeCompare(b.property_name);
        }
        return a.property_name.localeCompare(b.property_name);
      });
  }, [rows, q, status, sort]);

  const counts = useMemo(() => {
    const c = { red: 0, yellow: 0, green: 0, grey: 0 };
    for (const r of rows) c[r.repayment_status]++;
    return c;
  }, [rows]);

  const refreshedAt = rows[0]?.refreshed_at ?? "—";

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Objekte — Darlehensübersicht</h1>
          <p className="text-sm text-gray-500">Letzter gespeicherter Stand je Immobilie</p>
        </div>

        <div className="text-sm text-gray-500">
          Aktualisiert: <span className="text-gray-800">{refreshedAt}</span>
        </div>
      </div>

      {/* Error */}
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-black">
          <div className="font-semibold">Fehler beim Laden</div>
          <div className="mt-1 break-words">{error}</div>
        </div>
      ) : null}

      {/* Debug (lass das erstmal drin, bis alles passt) */}
      <div className="rounded-2xl border bg-gray-50 p-4 text-xs text-gray-700">
        <div className="flex gap-6 flex-wrap">
          <div>
            <span className="text-gray-500">rows:</span> <span className="font-semibold">{rows.length}</span>
          </div>
          <div>
            <span className="text-gray-500">filtered:</span> <span className="font-semibold">{filtered.length}</span>
          </div>
        </div>
        <div className="mt-2 max-h-40 overflow-auto rounded-xl border bg-white p-3 font-mono">
          {JSON.stringify(rows[0] ?? null, null, 2)}
        </div>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl shadow-sm border p-4">
          <div className="text-xs text-gray-500">Kritisch</div>
          <div className="text-2xl font-semibold">{counts.red}</div>
        </div>
        <div className="rounded-2xl shadow-sm border p-4">
          <div className="text-xs text-gray-500">Warnung</div>
          <div className="text-2xl font-semibold">{counts.yellow}</div>
        </div>
        <div className="rounded-2xl shadow-sm border p-4">
          <div className="text-xs text-gray-500">OK</div>
          <div className="text-2xl font-semibold">{counts.green}</div>
        </div>
        <div className="rounded-2xl shadow-sm border p-4">
          <div className="text-xs text-gray-500">Keine Daten</div>
          <div className="text-2xl font-semibold">{counts.grey}</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-3 flex-wrap items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Objekt suchen…"
          className="w-full sm:w-72 rounded-xl border px-3 py-2 text-sm"
        />

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value === "all" || isRepaymentStatus(e.target.value) ? e.target.value : "all")}
          className="rounded-xl border px-3 py-2 text-sm"
        >
          <option value="all">Alle Status</option>
          <option value="red">Rot (kritisch)</option>
          <option value="yellow">Gelb (Warnung)</option>
          <option value="green">Grün (OK)</option>
          <option value="grey">Grau (keine Daten)</option>
        </select>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value === "name" ? "name" : "status")}
          className="rounded-xl border px-3 py-2 text-sm"
        >
          <option value="status">Sortierung: Status</option>
          <option value="name">Sortierung: Name</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-2xl shadow-sm border overflow-hidden">
        <div className="overflow-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Objekt</th>
                <th className="text-left px-4 py-3">Letzter Saldo</th>
                <th className="text-left px-4 py-3">Getilgt</th>
                <th className="text-left px-4 py-3">Zinsen gesamt</th>
                <th className="text-left px-4 py-3">Tilgung gesamt</th>
                <th className="text-left px-4 py-3">Zeitraum</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((r) => (
                <tr key={r.property_id} className="border-t">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <StatusDot status={r.repayment_status} />
                      <span className="text-gray-700">{labelDE(r.repayment_label)}</span>
                    </div>
                  </td>

                  <td className="px-4 py-3 font-medium">{r.property_name}</td>
                  <td className="px-4 py-3">{r.last_balance_eur}</td>
                  <td className="px-4 py-3">{r.repaid_percent_display}</td>
                  <td className="px-4 py-3">{r.interest_total_eur}</td>
                  <td className="px-4 py-3">{r.principal_total_eur}</td>
                  <td className="px-4 py-3">
                    {r.first_year}–{r.last_year} (letzter Stand: {r.last_balance_year})
                  </td>
                </tr>
              ))}

              {!filtered.length && (
                <tr className="border-t">
                  <td className="px-4 py-6 text-gray-500" colSpan={7}>
                    Keine Ergebnisse.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
