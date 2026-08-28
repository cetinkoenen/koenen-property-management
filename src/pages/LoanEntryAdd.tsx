// src/pages/LoanEntryAdd.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { normalizeUuid } from "../lib/ids";
import { getErrorMessage } from "../lib/errorMessage";

type PropertyRow = { id: string; name: string };

function toNumberOrNull(v: string) {
  // Accept: "1.234,56" or "1234,56" or "1234.56"
  const s = v.trim().replace(/\./g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export default function LoanEntryAdd() {
  const { id } = useParams(); // property_id in route
  const rawPropertyId = (id ?? "").trim();
  const safePropertyId = useMemo(() => normalizeUuid(rawPropertyId), [rawPropertyId]);

  const navigate = useNavigate();

  const [prop, setProp] = useState<PropertyRow | null>(null);
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [interest, setInterest] = useState("");
  const [principal, setPrincipal] = useState("");
  const [balance, setBalance] = useState("");
  const [source, setSource] = useState("manual");

  const [saving, setSaving] = useState(false);
  const [loadingProp, setLoadingProp] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Parse numbers once
  const parsed = useMemo(() => {
    return {
      interest: toNumberOrNull(interest),
      principal: toNumberOrNull(principal),
      balance: toNumberOrNull(balance),
    };
  }, [interest, principal, balance]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoadingProp(true);
      setError(null);
      setProp(null);

      if (!safePropertyId) {
        setError("Ungültige Immobilien-ID in der URL (keine UUID).");
        setLoadingProp(false);
        return;
      }

      // ✅ IMPORTANT: only query the single property that matches the route param
      const { data, error } = await supabase
        .from("properties")
        .select("id,name")
        .eq("id", safePropertyId)
        .maybeSingle();

      if (!alive) return;

      if (error) {
        console.error(error);
        setError(error.message);
        setProp(null);
        setLoadingProp(false);
        return;
      }

      const found = (data as PropertyRow | null) ?? null;

      // ✅ Important: show clear error if ID is from the wrong "world"
      if (!found) {
        setError(
          "Immobilie nicht gefunden. Diese ID existiert nicht in 'properties'. " +
            "Wenn du aus dem Portfolio kommst: Portfolio-IDs (portfolio_properties.id) dürfen hier nicht verwendet werden."
        );
        setProp(null);
      } else {
        setProp(found);
      }

      setLoadingProp(false);
    })();

    return () => {
      alive = false;
    };
  }, [safePropertyId]);

  async function ensureLoanId(pid: string): Promise<string> {
    // 1) newest loan for property
    const { data: existing, error: e1 } = await supabase
      .from("property_loans")
      .select("id,created_at")
      .eq("property_id", pid)
      .order("created_at", { ascending: false })
      .limit(1);

    if (e1) throw e1;

    const current = (existing ?? [])[0]?.id as string | undefined;
    if (current) return current;

    // 2) create loan
    const { data: created, error: e2 } = await supabase
      .from("property_loans")
      .insert({ property_id: pid })
      .select("id")
      .limit(1);

    if (e2) throw e2;

    const newId = (created ?? [])[0]?.id as string | undefined;
    if (!newId) throw new Error("Konnte loan_id nicht erzeugen.");
    return newId;
  }

  async function save() {
    try {
      setSaving(true);
      setError(null);

      if (!safePropertyId) throw new Error("Ungültige property_id (keine UUID).");
      if (!year || !Number.isFinite(year)) throw new Error("Bitte Jahr prüfen.");

      // ✅ Don't allow saving if property doesn't exist
      if (!prop?.id) {
        throw new Error(
          "Kann nicht speichern: Immobilie existiert nicht in 'properties' (falsche ID oder falscher Entry-Pfad)."
        );
      }

      const loanId = await ensureLoanId(safePropertyId);

      // Upsert in property_loan_ledger über UNIQUE(property_id, year)
      const payload = {
        loan_id: loanId,
        property_id: safePropertyId,
        year,
        interest: parsed.interest ?? 0,
        principal: parsed.principal ?? 0,
        balance: parsed.balance ?? 0,
        source,
      };

      const { error: uerr } = await supabase.from("property_loan_ledger").upsert(payload, {
        onConflict: "property_id,year",
      });

      if (uerr) throw uerr;

      // ✅ Go to the new, canonical route (no legacy)
      navigate(`/darlehensuebersicht/${safePropertyId}`);
    } catch (e: unknown) {
      console.error(e);
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  // ✅ Canonical back link (no legacy)
  const backHref = safePropertyId ? `/darlehensuebersicht/${safePropertyId}` : "/darlehensuebersicht";

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link
          to={backHref}
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
        <div style={{ fontWeight: 900, fontSize: 17 }}>Darlehenszeile hinzufügen</div>

        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
          Objekt: <span style={{ fontWeight: 900 }}>{prop ? prop.name : loadingProp ? "Lädt…" : "—"}</span>
        </div>

        {error && (
          <div style={{ marginTop: 10, fontSize: 12, color: "#b91c1c" }}>
            Fehler: {error}
          </div>
        )}

        <div style={{ display: "grid", gap: 10, marginTop: 14, maxWidth: 520 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>Jahr</span>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              disabled={saving || !safePropertyId || !prop}
              style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>Zinsen</span>
            <input
              value={interest}
              onChange={(e) => setInterest(e.target.value)}
              placeholder="z.B. 1.234,56"
              disabled={saving || !safePropertyId || !prop}
              style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>Tilgung</span>
            <input
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
              placeholder="z.B. 3.000,00"
              disabled={saving || !safePropertyId || !prop}
              style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>Saldo</span>
            <input
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="z.B. 95.000,00"
              disabled={saving || !safePropertyId || !prop}
              style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>Quelle</span>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              disabled={saving || !safePropertyId || !prop}
              style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }}
            >
              <option value="manual">manual</option>
              <option value="import">import</option>
              <option value="seed">seed</option>
            </select>
          </label>

          <button
            onClick={save}
            disabled={saving || !safePropertyId || !prop}
            style={{
              marginTop: 6,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "#111827",
              color: "white",
              fontWeight: 900,
              cursor: saving || !safePropertyId || !prop ? "not-allowed" : "pointer",
              opacity: saving || !safePropertyId || !prop ? 0.6 : 1,
            }}
          >
            {saving ? "Speichern…" : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}
