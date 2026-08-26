import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, Building2, Edit3, RefreshCw, UserCheck, Users } from "lucide-react";

import {
  listTenantProfilesWithContracts,
  type TenantContract,
  type TenantProfile,
  type TenantProfileWithContracts,
} from "../services/tenantService";
import { useAppData } from "../state/AppDataContext";

function formatTenantName(tenant: TenantProfile): string {
  const personalName = [tenant.first_name, tenant.last_name].filter(Boolean).join(" ").trim();
  return tenant.company_name || personalName || tenant.tenant_number || "Unbenannter Mieter";
}

function dateKeyFromValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const rawValue = String(value).trim();
  const isoValue = rawValue.includes("T") ? rawValue.slice(0, 10) : rawValue;
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoValue);
  if (isoMatch) return isoValue;

  const germanMatch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(isoValue.replace(/\s+/g, ""));
  if (germanMatch) {
    const [, day, month, year] = germanMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsedDate = new Date(rawValue);
  if (Number.isNaN(parsedDate.getTime())) return null;
  const year = parsedDate.getFullYear();
  const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
  const day = String(parsedDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayDateKey(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateParts(value: string | null): { date: string; time: string } {
  if (!value) return { date: "—", time: "" };
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return { date: value, time: "" };

  return {
    date: new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date),
    time: new Intl.DateTimeFormat("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date),
  };
}

function formatShortDate(value: string | null): string {
  if (!value) return "offen";
  const dateKey = dateKeyFromValue(value);
  if (!dateKey) return value;
  const date = new Date(`${dateKey}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("de-DE").format(date);
}

function formatContact(tenant: TenantProfile): string {
  const parts = [tenant.email, tenant.phone, tenant.mobile].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Keine Kontaktdaten hinterlegt";
}

function formatMoney(value: number | null | undefined): string {
  return value == null
    ? "—"
    : `${Number(value).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function isContractActive(contract: TenantContract): boolean {
  if (contract.status === "vacant") return false;
  const startDate = dateKeyFromValue(contract.start_date);
  const endDate = dateKeyFromValue(contractEndDate(contract));
  const referenceDate = todayDateKey();
  if (startDate && startDate > referenceDate) return false;
  if (endDate && endDate < referenceDate) return false;
  return true;
}

function contractEndDate(contract: TenantContract): string | null {
  const startDate = dateKeyFromValue(contract.start_date);
  const endDate = dateKeyFromValue(contract.end_date);
  if (startDate && endDate && endDate < startDate) return null;
  return contract.end_date;
}

function isContractPlanned(contract: TenantContract): boolean {
  if (contract.status === "vacant") return false;
  const startDate = dateKeyFromValue(contract.start_date);
  return Boolean(startDate && startDate > todayDateKey());
}

function contractSortValue(contract: TenantContract): string {
  return contract.start_date || contract.updated_at || contract.created_at || "";
}

function primaryContract(tenant: TenantProfileWithContracts): TenantContract | null {
  const contracts = [...(tenant.tenant_contracts ?? [])].filter((contract) => !(contract as TenantContract & { is_deleted?: boolean }).is_deleted);
  const active = contracts.filter(isContractActive).sort((a, b) => contractSortValue(b).localeCompare(contractSortValue(a)))[0];
  if (active) return active;
  const planned = contracts.filter(isContractPlanned).sort((a, b) => contractSortValue(a).localeCompare(contractSortValue(b)))[0];
  if (planned) return planned;
  return contracts.sort((a, b) => contractSortValue(b).localeCompare(contractSortValue(a)))[0] ?? null;
}

function hasCurrentContract(tenant: TenantProfileWithContracts): boolean {
  return (tenant.tenant_contracts ?? []).some(isContractActive);
}

function hasPlannedContract(tenant: TenantProfileWithContracts): boolean {
  return (tenant.tenant_contracts ?? []).some(isContractPlanned);
}

function isInactiveTenant(tenant: TenantProfileWithContracts): boolean {
  const contracts = tenant.tenant_contracts ?? [];
  if (hasCurrentContract(tenant)) return false;
  if (hasPlannedContract(tenant)) return false;
  return tenant.status === "former" || contracts.length > 0;
}

function tenantStatusLabel(tenant: TenantProfileWithContracts): string {
  if (hasCurrentContract(tenant)) return "Aktiv";
  if (hasPlannedContract(tenant)) return "Geplant";
  if (isInactiveTenant(tenant)) return "Archiviert";
  if (tenant.status === "notice") return "Kündigung";
  if (tenant.status === "prospect") return "Interessent";
  return "Aktiv";
}

function tenantStatusClass(tenant: TenantProfileWithContracts): string {
  if (hasCurrentContract(tenant)) return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (hasPlannedContract(tenant)) return "bg-blue-50 text-blue-800 border-blue-100";
  if (isInactiveTenant(tenant)) return "bg-slate-100 text-slate-700 border-slate-200";
  if (tenant.status === "notice") return "bg-amber-50 text-amber-800 border-amber-200";
  if (tenant.status === "prospect") return "bg-blue-50 text-blue-800 border-blue-100";
  return "bg-emerald-50 text-emerald-800 border-emerald-200";
}

export default function MieterRegister() {
  const appData = useAppData();
  const [tenants, setTenants] = useState<TenantProfileWithContracts[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("all");

  const propertyLabelById = useMemo(
    () => Object.fromEntries(appData.objects.map((object) => [object.id, object.label])),
    [appData.objects],
  );

  async function loadTenants() {
    setLoading(true);
    setError(null);
    try {
      setTenants(await listTenantProfilesWithContracts(250));
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : String(loadError);
      setError(`Mieterregister konnte nicht geladen werden: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Initialer Supabase-Ladevorgang fuer das Mieterregister.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTenants();
  }, []);

  const sortedTenants = useMemo(
    () =>
      [...tenants].sort((a, b) => {
        const archiveDiff = Number(isInactiveTenant(a)) - Number(isInactiveTenant(b));
        if (archiveDiff !== 0) return archiveDiff;
        const plannedDiff = Number(hasPlannedContract(a)) - Number(hasPlannedContract(b));
        if (plannedDiff !== 0) return plannedDiff;
        return String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""));
      }),
    [tenants],
  );
  const activeTenants = sortedTenants.filter(hasCurrentContract);
  const plannedTenants = sortedTenants.filter((tenant) => !hasCurrentContract(tenant) && hasPlannedContract(tenant));
  const archivedTenants = sortedTenants.filter(isInactiveTenant);
  const visibleActiveTenants = statusFilter === "archived" ? [] : activeTenants;
  const visiblePlannedTenants = statusFilter === "archived" ? [] : plannedTenants;
  const visibleArchivedTenants = statusFilter === "active" ? [] : archivedTenants;

  return (
    <div className="tenant-admin-page mx-auto max-w-[1460px] space-y-5">
      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-emerald-800">
              <Users size={15} />
              Mieterregister
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950">Mieterregister</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Aktive Mieter, beendete Mietverhältnisse und Archivstatus in einer eigenen Übersicht.
              Die Pflege erfolgt weiterhin über die Stammdatenmaske.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
            <Link
              to="/mieter/stammdaten"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white no-underline shadow-sm"
            >
              <UserCheck size={17} />
              Mieter anlegen
            </Link>
            <button
              type="button"
              onClick={() => void loadTenants()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-800 shadow-sm"
            >
              <RefreshCw size={17} />
              Neu laden
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-950">Übersicht</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Leerstand-Einträge aktualisieren Vertragsende und Archivstatus automatisch.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.12em] ${statusFilter === "all" ? "border-slate-900 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700"}`}
            >
              Alle {tenants.length}
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("active")}
              className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.12em] ${statusFilter === "active" ? "border-emerald-700 bg-emerald-700 text-white" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
            >
              Aktiv {activeTenants.length}
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("archived")}
              className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.12em] ${statusFilter === "archived" ? "border-slate-700 bg-slate-700 text-white" : "border-slate-200 bg-slate-100 text-slate-700"}`}
            >
              Archiv {archivedTenants.length}
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">{error}</div>
        ) : null}

        <div className="mt-5 space-y-6">
          {loading ? (
            <p className="text-sm font-semibold text-slate-500">Lade Mieterdaten...</p>
          ) : tenants.length ? (
            <>
              <TenantGroup title="Aktive Mieter" tenants={visibleActiveTenants} propertyLabelById={propertyLabelById} />
              <TenantGroup title="Geplante Mietverhältnisse" tenants={visiblePlannedTenants} propertyLabelById={propertyLabelById} />
              <TenantGroup title="Archivierte / nicht aktive Mieter" tenants={visibleArchivedTenants} propertyLabelById={propertyLabelById} />
            </>
          ) : (
            <p className="text-sm leading-6 text-slate-500">Noch keine Mieter-Stammdaten vorhanden.</p>
          )}
        </div>
      </section>

      <section className="rounded-[20px] border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
        <div className="flex items-center gap-2 font-black">
          <Building2 size={17} />
          Automatische Verbindung zu Leerstand
        </div>
        <p className="mt-2">
          Wird ein Leerstand gespeichert, beendet die App passende aktive Mietverträge am Vortag des Leerstands.
          Hat der Mieter danach keinen aktiven Vertrag mehr, erscheint er automatisch im Archiv.
        </p>
      </section>
    </div>
  );
}

function TenantGroup({
  title,
  tenants,
  propertyLabelById,
}: {
  title: string;
  tenants: TenantProfileWithContracts[];
  propertyLabelById: Record<string, string>;
}) {
  if (!tenants.length) return null;

  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
        {title.includes("Archiv") ? <Archive size={15} /> : <UserCheck size={15} />}
        {title}
      </h3>
      <div className="tenant-directory-grid">
        {tenants.map((tenant) => {
          const contract = primaryContract(tenant);
          const propertyLabel = contract?.property_id ? propertyLabelById[contract.property_id] : null;
          const updatedAt = formatDateParts(tenant.updated_at);
          return (
            <article key={tenant.id} className={`tenant-directory-card ${isInactiveTenant(tenant) ? "tenant-directory-card-archived" : ""}`}>
              <div className="tenant-directory-card-head">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4>{formatTenantName(tenant)}</h4>
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${tenantStatusClass(tenant)}`}>
                      {tenantStatusLabel(tenant)}
                    </span>
                  </div>
                  <p>{formatContact(tenant)}</p>
                </div>
                <Link
                  to={`/mieter/stammdaten?tenantId=${encodeURIComponent(tenant.id)}${contract?.id ? `&contractId=${encodeURIComponent(contract.id)}` : ""}`}
                  className="tenant-directory-edit"
                >
                  <Edit3 size={15} />
                  Bearbeiten
                </Link>
              </div>

              <div className="tenant-directory-meta">
                <div>
                  <span>Objekt / Einheit</span>
                  <b>{[propertyLabel || contract?.object_code || contract?.property_id || "Ohne Objekt", contract?.unit_label].filter(Boolean).join(" · ")}</b>
                </div>
                <div>
                  <span>Mietzeitraum</span>
                  <b>{contract ? `${formatShortDate(contract.start_date)} bis ${formatShortDate(contractEndDate(contract))}` : "Noch kein Mietvertrag"}</b>
                </div>
                <div>
                  <span>Miete</span>
                  <b>{formatMoney(contract?.total_rent)}</b>
                </div>
                <div>
                  <span>Aktualisiert</span>
                  <b className="tenant-directory-date">
                    <strong>{updatedAt.date}</strong>
                    {updatedAt.time ? <small>{updatedAt.time} Uhr</small> : null}
                  </b>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
