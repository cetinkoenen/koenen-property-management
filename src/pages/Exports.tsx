import { devLog } from "@/lib/devLog";
import { supabase } from "@/lib/supabaseClient";
// src/pages/Exports.tsx
import { useMemo, useState } from "react";
import { useActiveAccount } from "../roles/useActiveAccount";
import { useMyRole } from "../roles/useMyRole";
import { openProfessionalPdfReport } from "../lib/professionalPdfReport";

/**
 * Exports Page
 * ------------
 * Empfehlung:
 * - Route in App.tsx schützen:
 *     <RequireRole minRole="admin"><Exports /></RequireRole>
 *   Dann ist diese Page hier "clean".
 *
 * Trotzdem robust:
 * - zeigt Status (Account/Rolle)
 * - Aktionen nur enabled, wenn admin/owner
 */

// Debug aktivieren:
// - in DEV automatisch, oder
// - via URL: /exports?debug=1
const DEV_DEBUG_DEFAULT = import.meta.env.DEV;

function useDebugFlag() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("debug") === "1" || DEV_DEBUG_DEFAULT;
  } catch {
    return DEV_DEBUG_DEFAULT;
  }
}

type Tone = "neutral" | "warn" | "error" | "success";

function Notice({
  title,
  children,
  tone = "neutral",
}: {
  title?: string;
  children: React.ReactNode;
  tone?: Tone;
}) {
  const styles: Record<Tone, React.CSSProperties> = {
    neutral: { border: "1px solid #e5e7eb", background: "#f9fafb", color: "#111827" },
    warn: { border: "1px solid #fde68a", background: "#fffbeb", color: "#7c2d12" },
    error: { border: "1px solid #fecaca", background: "#fff1f2", color: "#7f1d1d" },
    success: { border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#14532d" },
  };

  return (
    <div
      style={{
        padding: 12,
        borderRadius: 12,
        fontSize: 13,
        fontWeight: 700,
        whiteSpace: "pre-wrap",
        display: "grid",
        gap: 6,
        ...styles[tone],
      }}
      role={tone === "error" ? "alert" : undefined}
      aria-live={tone === "error" ? "assertive" : "polite"}
    >
      {title && <div style={{ fontWeight: 900 }}>{title}</div>}
      <div style={{ fontWeight: 700 }}>{children}</div>
    </div>
  );
}

function CodePill({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, opacity: 0.75 }}>
      {label}: <code>{value}</code>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  loading,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  title?: string;
}) {
  const isDisabled = Boolean(disabled || loading);

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      title={title}
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        fontWeight: 900,
        cursor: isDisabled ? "not-allowed" : "pointer",
        border: "1px solid #e5e7eb",
        background: "white",
        opacity: isDisabled ? 0.6 : 1,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      {loading ? <span aria-hidden>⏳</span> : null}
      <span>{children}</span>
    </button>
  );
}

export default function Exports() {
  const DEBUG = useDebugFlag();

  const { loading: accLoading, accountId, error: accErr } = useActiveAccount();

  const shouldLoadRole = Boolean(accountId);
  const { loading: roleLoading, role } = useMyRole(shouldLoadRole ? accountId : null);

  const isLoading = accLoading || (shouldLoadRole && roleLoading);
  const canExport = useMemo(() => role === "admin" || role === "owner", [role]);

  const [pingLoading, setPingLoading] = useState(false);

  async function debugPing() {
    setPingLoading(true);
    try {
      const { data, error } = await supabase
        .from("account_members")
        .select("account_id,user_id,role,created_at")
        .limit(10);

      devLog("[Exports] Ping account_members:", {
        data,
        error,
        accountId,
        role,
        accLoading,
        roleLoading,
        accErr,
      });

      if (error) {
        alert(`Ping: Fehler\n\n${error.message}`);
      } else {
        alert("Ping ok. Schau Console.");
      }
    } catch (e: any) {
      console.error("[Exports] debugPing failed:", e);
      alert(`Ping failed: ${e?.message ?? String(e)}`);
    } finally {
      setPingLoading(false);
    }
  }

  // Status ableiten (eine Quelle der Wahrheit für UX)
  const status = useMemo(() => {
    if (isLoading) return { kind: "loading" as const };

    if (accErr) return { kind: "accErr" as const, message: String(accErr) };

    if (!accountId)
      return {
        kind: "noAccount" as const,
        message:
          "Kein Account gefunden.\nBitte prüfe `account_members` / `accounts` (z.B. ob der User einem Account zugeordnet ist).",
      };

    if (!role)
      return {
        kind: "noRole" as const,
        message: "Keine Rolle gefunden für diesen Account.\nBitte `account_members` prüfen.",
      };

    if (!canExport)
      return {
        kind: "forbidden" as const,
        message: `Keine Berechtigung für Exports.\nBenötigt: admin oder owner · Deine Rolle: ${role}`,
      };

    return { kind: "ready" as const };
  }, [isLoading, accErr, accountId, role, canExport]);

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <h2 style={{ margin: 0 }}>Exports</h2>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <CodePill label="accountId" value={accountId ?? "—"} />
          <CodePill label="role" value={role ?? "—"} />
          {DEBUG ? <CodePill label="debug" value="on" /> : null}
        </div>
      </div>

      {DEBUG && (
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: 12,
            whiteSpace: "pre-wrap",
          }}
        >
          {JSON.stringify(
            {
              accLoading,
              accErr: accErr ?? null,
              accountId: accountId ?? null,
              shouldLoadRole,
              roleLoading,
              role: role ?? null,
              canExport,
              isLoading,
              status: status.kind,
            },
            null,
            2
          )}
        </div>
      )}

      {status.kind === "loading" && <Notice>🔄 Lädt…</Notice>}

      {status.kind === "accErr" && <Notice tone="error" title="Account-Error">{status.message}</Notice>}

      {status.kind === "noAccount" && <Notice tone="warn" title="Account fehlt">{status.message}</Notice>}

      {status.kind === "noRole" && <Notice tone="warn" title="Rolle fehlt">{status.message}</Notice>}

      {status.kind === "forbidden" && (
        <Notice tone="warn" title="⛔ Keine Berechtigung">
          {status.message}
        </Notice>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {DEBUG && (
          <ActionButton onClick={debugPing} loading={pingLoading} disabled={isLoading} title="Liest 10 rows aus account_members">
            Debug Ping
          </ActionButton>
        )}

        <ActionButton
          onClick={() => alert("Excel Export kommt als nächster Schritt (xlsx).")}
          disabled={!canExport || status.kind !== "ready"}
          loading={false}
          title={!canExport ? "Nur admin/owner" : "Export als .xlsx"}
        >
          Excel Export
        </ActionButton>

        <ActionButton
          onClick={() => openProfessionalPdfReport({
            documentName: "koenen-investment-export-center.pdf",
            title: "Export-Center",
            subtitle: "Zentrale Exportübersicht für Koenen Investment. Detailberichte werden in den jeweiligen Fachseiten mit derselben PDF-Vorlage erzeugt.",
            meta: [
              { label: "Rolle", value: role ?? "-" },
              { label: "Account", value: accountId ?? "-" },
            ],
            metrics: [
              { label: "CSV", value: "Bereit" },
              { label: "TXT", value: "Bereit in Steuerberichten" },
              { label: "PDF", value: "Vorlage aktiv" },
            ],
            sections: [
              {
                title: "Verfügbare PDF-Struktur",
                subtitle: "Alle neuen PDF-Exporte nutzen Deckkopf, Untertitel, Kennzahlen, Tabellenoptik und Fußzeile.",
                tables: [
                  {
                    title: "Berichtsstandard",
                    headers: ["Element", "Status"],
                    rows: [
                      ["Dokumentname", "Im Kopfbereich sichtbar"],
                      ["Printed Datum", "Automatisch gesetzt"],
                      ["Fußzeile", "Hohenloher Str. 78 74243 Langenbrettach - info.koenen@gmail.com"],
                      ["Seitenangabe", "In der Druckvorlage vorbereitet"],
                    ],
                  },
                ],
              },
            ],
          })}
          disabled={!canExport || status.kind !== "ready"}
          title={!canExport ? "Nur admin/owner" : "Export als PDF"}
        >
          PDF Export
        </ActionButton>

        <ActionButton
          onClick={() => alert("Steuerübersicht kommt als nächster Schritt.")}
          disabled={!canExport || status.kind !== "ready"}
          title={!canExport ? "Nur admin/owner" : "Zusammenfassung / Steuerreport"}
        >
          Steuerübersicht
        </ActionButton>
      </div>

      <div style={{ fontSize: 12, opacity: 0.6, lineHeight: 1.4 }}>
        Hinweis: Für “echte” Exports kommt als nächster Schritt ein serverseitiger RPC oder eine Edge Function, damit RLS &amp;
        Performance sauber bleiben.
        {DEBUG ? (
          <>
            {" "}
            Debug: füge <code>?debug=1</code> an die URL an/weg, um die Debug-Box zu steuern.
          </>
        ) : null}
      </div>
    </div>
  );
}
