import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { CloudDownload } from "lucide-react";
import { recordAuditLog } from "@/services/auditLogService";

const BACKUP_TABLES = [
  "finance_entry",
  "v_object_dropdown",
  "portfolio_properties",
  "portfolio_property_finance",
  "portfolio_property_rentals",
  "property_extra_info",
  "properties",
  "objects",
  "property_loans",
  "property_loan_ledger",
  "property_income",
  "yearly_property_income",
  "yearly_capex_entries",
  "property_rent_history_by_unit",
  "apartment_billing_workspaces",
  "categories",
] as const;

type BackupPayload = {
  meta: {
    app: string;
    created_at: string;
    created_by: string | null;
    version: number;
  };
  tables: Record<string, unknown[]>;
  warnings: Record<string, string>;
};

function formatBackupTimestamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + "_" + [pad(date.getHours()), pad(date.getMinutes())].join("-");
}

function downloadJson(filename: string, payload: BackupPayload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function BackupButton() {
  const [isLoading, setIsLoading] = useState(false);

  async function handleBackup() {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const { data: authData } = await supabase.auth.getUser();
      const payload: BackupPayload = {
        meta: {
          app: "koenen-property-management",
          created_at: new Date().toISOString(),
          created_by: authData.user?.email ?? null,
          version: 1,
        },
        tables: {},
        warnings: {},
      };

      for (const table of BACKUP_TABLES) {
        const { data, error } = await supabase.from(table).select("*");
        if (error) {
          payload.warnings[table] = error.message;
          payload.tables[table] = [];
        } else {
          payload.tables[table] = data ?? [];
        }
      }

      downloadJson(`koenen_backup_${formatBackupTimestamp(new Date())}.json`, payload);
      await recordAuditLog({ action: "backup_created", label: "JSON-Backup erstellt", meta: { tables: Object.keys(payload.tables).length, warnings: Object.keys(payload.warnings).length } });

      const warningCount = Object.keys(payload.warnings).length;
      if (warningCount > 0) {
        window.alert(`Backup wurde erstellt. Hinweis: ${warningCount} Tabelle(n) konnten wegen Berechtigungen nicht vollständig gelesen werden. Die restlichen Daten wurden gesichert.`);
      }
    } catch (error) {
      console.error("Backup fehlgeschlagen", error);
      window.alert("Backup fehlgeschlagen. Bitte später erneut versuchen.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleBackup}
      disabled={isLoading}
      className="inline-flex h-[46px] w-[54px] shrink-0 items-center justify-center rounded-2xl border border-[#d8d2c7] bg-white/65 text-[#73b3a4] shadow-sm transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
      title={isLoading ? "Backup läuft…" : "Sicheres JSON-Backup erstellen"}
      aria-label={isLoading ? "Backup läuft" : "Sicheres JSON-Backup erstellen"}
    >
      <CloudDownload size={30} strokeWidth={2.4} />
    </button>
  );
}
