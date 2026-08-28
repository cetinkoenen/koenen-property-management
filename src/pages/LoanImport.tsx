// src/pages/LoanImport.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getErrorMessage } from "../lib/errorMessage";

type PropertyOption = { id: string; name: string };

type Parsed = {
  property_name: string;
  year: number;
  interest: number;
  principal: number;
  balance: number;
  source: string;
};

function parseNumberDE(raw: string) {
  const s = raw.trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function simpleCsvParse(text: string): string[][] {
  // Minimal CSV parser: unterstützt Quotes "..."
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      const next = text[i + 1];
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (ch === "," || ch === ";")) {
      cur.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      cur.push(cell);
      const cleaned = cur.map((c) => c.trim());
      if (cleaned.some((x) => x.length)) rows.push(cleaned);
      cur = [];
      cell = "";
      continue;
    }

    cell += ch;
  }

  cur.push(cell);
  const cleaned = cur.map((c) => c.trim());
  if (cleaned.some((x) => x.length)) rows.push(cleaned);

  return rows;
}

function norm(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export default function LoanImport() {
  const nav = useNavigate();
  const loc = useLocation();
  const qs = useMemo(() => new URLSearchParams(loc.search), [loc.search]);
  const preselectPropertyId = qs.get("property_id") ?? "";

  const [csvText, setCsvText] = useState("");
  const [parsed, setParsed] = useState<Parsed[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [properties, setProperties] = useState<PropertyOption[]>([]);

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id,name")
        .eq("is_test", false) // ✅ Wichtig: Test-Properties ausblenden
        .order("name");

      if (!alive) return;

      if (error) {
        console.error(error);
        setProperties([]);
      } else {
        setProperties((data ?? []) as PropertyOption[]);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const propByName = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    for (const p of properties) m.set(norm(p.name), p);
    return m;
  }, [properties]);

  function doParse() {
    try {
      setError(null);

      const rows = simpleCsvParse(csvText);
      if (!rows.length) {
        setParsed([]);
        setError("CSV ist leer.");
        return;
      }

      // Header erkennen
      const header = rows[0].map((h) => norm(h));
      const idx = {
        property_name: header.indexOf("property_name"),
        year: header.indexOf("year"),
        interest: header.indexOf("interest"),
        principal: header.indexOf("principal"),
        balance: header.indexOf("balance"),
        source: header.indexOf("source"),
      };

      if (idx.property_name < 0 || idx.year < 0) {
        throw new Error(
          "Header fehlt. Erwartet: property_name, year, interest, principal, balance, source"
        );
      }

      const out: Parsed[] = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const property_name = (r[idx.property_name] ?? "").trim();
        if (!property_name) continue;

        const year = Number((r[idx.year] ?? "").trim());
        if (!Number.isFinite(year)) continue;

        const interest = idx.interest >= 0 ? parseNumberDE(r[idx.interest] ?? "0") : 0;
        const principal = idx.principal >= 0 ? parseNumberDE(r[idx.principal] ?? "0") : 0;
        const balance = idx.balance >= 0 ? parseNumberDE(r[idx.balance] ?? "0") : 0;
        const source = idx.source >= 0 ? (r[idx.source] ?? "import").trim() || "import" : "import";

        out.push({ property_name, year, interest, principal, balance, source });
      }

      if (!out.length) throw new Error("Keine gültigen Datenzeilen gefunden.");
      setParsed(out);
    } catch (e: unknown) {
      setParsed([]);
      setError(getErrorMessage(e, "Parse Fehler"));
    }
  }

  async function ensureLoanId(property_id: string): Promise<string> {
    // 1) latest loan
    const { data: existing, error: e1 } = await supabase
      .from("property_loans")
      .select("id,created_at")
      .eq("property_id", property_id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (e1) throw e1;
    const got = (existing ?? [])[0]?.id as string | undefined;
    if (got) return got;

    // 2) create
    const { data: created, error: e2 } = await supabase
      .from("property_loans")
      .insert({ property_id })
      .select("id");

    if (e2) throw e2;
    const newId = (created ?? [])[0]?.id as string | undefined;
    if (!newId) throw new Error("Konnte loan_id nicht erzeugen.");
    return newId;
  }

  async function commit() {
    try {
      setBusy(true);
      setError(null);

      if (!parsed.length) throw new Error("Nichts zu importieren. Erst Parse ausführen.");

      // Map property_name -> property_id (normalisiert)
      const mapped = parsed.map((p) => {
        const found = propByName.get(norm(p.property_name));
        return { ...p, property: found ?? null };
      });

      const missing = mapped.filter((m) => !m.property);
      if (missing.length) {
        throw new Error(
          `Unbekannte Objekte (Mapping fehlt): ${missing
            .slice(0, 5)
            .map((x) => x.property_name)
            .join(", ")}${missing.length > 5 ? " ..." : ""}`
        );
      }

      // optional filter to one property_id if opened from detail page
      const finalRows = preselectPropertyId
        ? mapped.filter((m) => m.property!.id === preselectPropertyId)
        : mapped;

      if (!finalRows.length) throw new Error("Keine Zeilen passen zu diesem Objekt (property_id Filter).");

      // Group by property_id -> loan_id
      const loanIdByProperty = new Map<string, string>();
      for (const r of finalRows) {
        const pid = r.property!.id;
        if (!loanIdByProperty.has(pid)) {
          const loanId = await ensureLoanId(pid);
          loanIdByProperty.set(pid, loanId);
        }
      }

      // Upsert ledger rows
      const payload = finalRows.map((r) => {
        const pid = r.property!.id;
        const loan_id = loanIdByProperty.get(pid)!;
        return {
          loan_id,
          property_id: pid,
          year: r.year,
          interest: r.interest,
          principal: r.principal,
          balance: r.balance,
          source: r.source || "import",
        };
      });

      const { error: uerr } = await supabase.from("property_loan_ledger").upsert(payload, {
        onConflict: "property_id,year",
      });

      if (uerr) throw uerr;

      // zurück
      if (preselectPropertyId) {
        nav(`/immobilienvermoegen/${preselectPropertyId}`);
      } else {
        nav(`/immobilienvermoegen`);
      }
    } catch (e: unknown) {
      console.error(e);
      setError(getErrorMessage(e, "Import Fehler"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link
          to={preselectPropertyId ? `/immobilienvermoegen/${preselectPropertyId}` : "/immobilienvermoegen"}
          style={{
            textDecoration: "none",
            padding: "8px 12px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "white",
            fontWeight: 900,
            color: "inherit",
          }}
        >
          ← Zurück
        </Link>
      </div>

      <div style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 14, background: "white" }}>
        <div style={{ fontWeight: 900, fontSize: 17 }}>CSV Import → Darlehens-Ledger</div>
        <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>
          Erwarteter Header: <b>property_name, year, interest, principal, balance, source</b>
        </div>

        {error && (
          <div style={{ marginTop: 10, fontSize: 12, color: "#b91c1c" }}>
            Fehler: {error}
          </div>
        )}

        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder={`property_name,year,interest,principal,balance,source
Lilienthaler Str. 54 28215 Bremen,2022,1234.56,3000,95000,import`}
          style={{
            marginTop: 12,
            width: "100%",
            minHeight: 220,
            padding: 12,
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: 12,
          }}
        />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <button
            onClick={doParse}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "white",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Vorschau erzeugen
          </button>

          <button
            onClick={commit}
            disabled={busy}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "#111827",
              color: "white",
              fontWeight: 900,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Import…" : "Import ausführen"}
          </button>

          <div
            style={{
              marginLeft: "auto",
              fontSize: 12,
              opacity: 0.7,
              display: "grid",
              placeItems: "center",
            }}
          >
            Zeilen in Vorschau: <b>{parsed.length}</b>
          </div>
        </div>

        {parsed.length > 0 && (
          <div style={{ marginTop: 14, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
              <thead>
                <tr style={{ textAlign: "left", fontSize: 12, opacity: 0.7 }}>
                  <th style={{ padding: "10px 8px", borderBottom: "1px solid #e5e7eb" }}>Objekt</th>
                  <th style={{ padding: "10px 8px", borderBottom: "1px solid #e5e7eb" }}>Jahr</th>
                  <th style={{ padding: "10px 8px", borderBottom: "1px solid #e5e7eb" }}>Zinsen</th>
                  <th style={{ padding: "10px 8px", borderBottom: "1px solid #e5e7eb" }}>Tilgung</th>
                  <th style={{ padding: "10px 8px", borderBottom: "1px solid #e5e7eb" }}>Saldo</th>
                  <th style={{ padding: "10px 8px", borderBottom: "1px solid #e5e7eb" }}>source</th>
                </tr>
              </thead>
              <tbody>
                {parsed.slice(0, 50).map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "10px 8px", fontWeight: 900 }}>{r.property_name}</td>
                    <td style={{ padding: "10px 8px" }}>{r.year}</td>
                    <td style={{ padding: "10px 8px" }}>{r.interest}</td>
                    <td style={{ padding: "10px 8px" }}>{r.principal}</td>
                    <td style={{ padding: "10px 8px" }}>{r.balance}</td>
                    <td style={{ padding: "10px 8px", fontSize: 12, opacity: 0.75 }}>{r.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {parsed.length > 50 && (
              <div style={{ fontSize: 12, opacity: 0.65, marginTop: 8 }}>
                Vorschau zeigt nur die ersten 50 Zeilen.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
