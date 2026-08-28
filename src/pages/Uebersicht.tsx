import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

type EntryRow = {
  id: number;
  objekt_code: string;
  booking_date: string;
  amount: number;
  category: string | null;
  note: string | null;
};

type PieRow = { name: string; value: number };

function formatEUR(n: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
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

function buildPie(rows: EntryRow[]): PieRow[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const cat = (r.category && r.category.trim()) || "Ohne Kategorie";
    map.set(cat, (map.get(cat) ?? 0) + Number(r.amount || 0));
  }
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function PieCard({ title, data }: { title: string; data: PieRow[] }) {
  const hasData = data.some((d) => d.value > 0);

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "white" }}>
      <div style={{ fontWeight: 900, marginBottom: 10 }}>{title}</div>

      {!hasData ? (
        <div style={{ padding: 14, fontSize: 13, opacity: 0.75 }}>Keine Daten.</div>
      ) : (
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                outerRadius={110}
                innerRadius={55}
                paddingAngle={2}
                label={(d) => d.name}
              >
                {data.map((_, idx) => (
                  <Cell key={idx} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => formatEUR(Number(v))} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default function Uebersicht() {
  // Default: aktueller Monat (1. Tag bis heute)
  const [from, setFrom] = useState(() => {
    const now = new Date();
    return toISODate(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [to, setTo] = useState(() => toISODate(new Date()));

  /**
   * Dropdown-Quelle:
   * v_object_dropdown liefert alle Objekte (unabhängig von finance_entry)
   * und bereits den gewünschten Label-Text: "Objekt X – Straße".
   */
  const [objects, setObjects] = useState<Array<{ objekt_code: string; label: string }>>([]);
  const [objektCode, setObjektCode] = useState<string>("");

  const [incomeRows, setIncomeRows] = useState<EntryRow[]>([]);
  const [expenseRows, setExpenseRows] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Objects laden (Dropdown)
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

      const list = (data ?? []).filter((x: any) => x?.objekt_code && x?.label) as Array<{
        objekt_code: string;
        label: string;
      }>;

      setObjects(list);

      if (!objektCode && list.length > 0) {
        setObjektCode(list[0].objekt_code);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    setErr(null);

    const code = objektCode?.trim();
    if (!code) {
      setIncomeRows([]);
      setExpenseRows([]);
      setLoading(false);
      return;
    }

    // to inklusiv -> lt(to+1 Tag)
    const toPlus1 = toISODate(addDays(new Date(to), 1));

    try {
      const [incRes, expRes] = await Promise.all([
        supabase
          .from("v_income_entries")
          .select("id,objekt_code,booking_date,amount,category,note")
          .eq("objekt_code", code)
          .gte("booking_date", from)
          .lt("booking_date", toPlus1),

        supabase
          .from("v_expense_entries")
          .select("id,objekt_code,booking_date,amount,category,note")
          .eq("objekt_code", code)
          .gte("booking_date", from)
          .lt("booking_date", toPlus1),
      ]);

      if (incRes.error) throw incRes.error;
      if (expRes.error) throw expRes.error;

      setIncomeRows((incRes.data ?? []) as EntryRow[]);
      setExpenseRows((expRes.data ?? []) as EntryRow[]);
      setLoading(false);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setIncomeRows([]);
      setExpenseRows([]);
      setLoading(false);
    }
  }

  // Wenn Objekt gesetzt ist, beim ersten Mal automatisch laden
  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      if (objektCode) void load();
    }, 0);
    return () => window.clearTimeout(initialLoad);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objektCode]);

  const totals = useMemo(() => {
    const income = incomeRows.reduce((s, r) => s + Number(r.amount || 0), 0);
    const expense = expenseRows.reduce((s, r) => s + Number(r.amount || 0), 0);
    return { income, expense, net: income - expense };
  }, [incomeRows, expenseRows]);

  const incomePie = useMemo(() => buildPie(incomeRows), [incomeRows]);
  const expensePie = useMemo(() => buildPie(expenseRows), [expenseRows]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 6 }}>Übersicht</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>KPIs + 2 Kreisdiagramme.</div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>
            Objekt
            {objects.length > 0 ? (
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
                {objects.map((o) => (
                  <option key={o.objekt_code} value={o.objekt_code}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={objektCode}
                onChange={(e) => setObjektCode(e.target.value)}
                placeholder="Objekt_1"
                style={{
                  marginLeft: 8,
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  fontWeight: 800,
                  width: 200,
                }}
              />
            )}
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
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "white" }}>
          <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Einnahmen</div>
          <div style={{ fontSize: 17, fontWeight: 900, marginTop: 6 }}>{loading ? "…" : formatEUR(totals.income)}</div>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "white" }}>
          <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Ausgaben</div>
          <div style={{ fontSize: 17, fontWeight: 900, marginTop: 6 }}>{loading ? "…" : formatEUR(totals.expense)}</div>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "white" }}>
          <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Netto</div>
          <div style={{ fontSize: 17, fontWeight: 900, marginTop: 6 }}>{loading ? "…" : formatEUR(totals.net)}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 12 }}>
        <PieCard title="Einnahmen nach Kategorie" data={incomePie} />
        <PieCard title="Ausgaben nach Kategorie" data={expensePie} />
      </div>
    </div>
  );
}
