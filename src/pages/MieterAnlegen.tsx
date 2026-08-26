import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Building2, CheckCircle2, Save, UserPlus } from "lucide-react";

import {
  createTenantWithContract,
  deriveRentalContractStatus,
  deriveTenantProfileStatus,
  listTenantProfilesWithContracts,
  updateTenantProfile,
  upsertTenantContractForTenant,
  type OccupancyContractStatus,
  type TenantContract,
  type TenantProfileWithContracts,
  type TenantStatus,
} from "../services/tenantService";
import { useAppData } from "../state/AppDataContext";

type FormState = {
  tenantNumber: string;
  salutation: string;
  firstName: string;
  lastName: string;
  companyName: string;
  email: string;
  phone: string;
  mobile: string;
  street: string;
  postalCode: string;
  city: string;
  bankName: string;
  iban: string;
  propertyId: string;
  unitLabel: string;
  rentType: string;
  coldRent: string;
  operatingCosts: string;
  totalRent: string;
  depositAmount: string;
  startDate: string;
  endDate: string;
  notes: string;
  status: TenantStatus;
};

const emptyForm: FormState = {
  tenantNumber: "",
  salutation: "Herr/Frau",
  firstName: "",
  lastName: "",
  companyName: "",
  email: "",
  phone: "",
  mobile: "",
  street: "",
  postalCode: "",
  city: "",
  bankName: "",
  iban: "",
  propertyId: "",
  unitLabel: "",
  rentType: "Hauptmiete",
  coldRent: "",
  operatingCosts: "",
  totalRent: "",
  depositAmount: "",
  startDate: "",
  endDate: "",
  notes: "",
  status: "active",
};

function parseMoneyInput(value: string): number | null {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function todayDateKey(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function deriveContractStatus(startDate: string, endDate: string): OccupancyContractStatus {
  return deriveRentalContractStatus(startDate, endDate);
}

function deriveTenantStatus(startDate: string, endDate: string, fallback: TenantStatus): TenantStatus {
  return deriveTenantProfileStatus(startDate, endDate, fallback);
}

function dateForInput(value: string | null | undefined): string {
  if (!value) return "";
  const rawValue = String(value).trim();
  const isoValue = rawValue.includes("T") ? rawValue.slice(0, 10) : rawValue;
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoValue)) return isoValue;
  const germanMatch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(isoValue.replace(/\s+/g, ""));
  if (germanMatch) {
    const [, day, month, year] = germanMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return "";
}

function moneyForInput(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return value.toFixed(2).replace(".", ",");
}

function contractSortValue(contract: TenantContract): string {
  return contract.start_date ?? contract.updated_at ?? contract.created_at ?? "";
}

function pickContractForEdit(tenant: TenantProfileWithContracts, preferredContractId?: string | null): TenantContract | null {
  const today = todayDateKey();
  const contracts = [...(tenant.tenant_contracts ?? [])].filter((contract) => contract.status !== "vacant");
  const preferredContract = contracts.find((contract) => contract.id === preferredContractId);
  if (preferredContract) return preferredContract;
  const activeContract = contracts
    .filter((contract) => {
      const startDate = dateForInput(contract.start_date);
      const endDate = dateForInput(contract.end_date);
      return (!startDate || startDate <= today) && (!endDate || endDate >= today);
    })
    .sort((left, right) => contractSortValue(right).localeCompare(contractSortValue(left)))[0];
  if (activeContract) return activeContract;

  const plannedContract = contracts
    .filter((contract) => {
      const startDate = dateForInput(contract.start_date);
      return Boolean(startDate && startDate > today);
    })
    .sort((left, right) => contractSortValue(left).localeCompare(contractSortValue(right)))[0];
  if (plannedContract) return plannedContract;

  return contracts.sort((left, right) => contractSortValue(right).localeCompare(contractSortValue(left)))[0] ?? null;
}

export default function MieterAnlegen() {
  const appData = useAppData();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState<FormState>(() => ({
    ...emptyForm,
    propertyId: searchParams.get("propertyId") ?? emptyForm.propertyId,
    unitLabel: searchParams.get("unit") ?? emptyForm.unitLabel,
  }));
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null);
  const [editingContractId, setEditingContractId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedProperty = useMemo(
    () => appData.objects.find((object) => object.id === form.propertyId),
    [appData.objects, form.propertyId],
  );
  const canSave = Boolean(form.lastName.trim() || form.companyName.trim()) && !saving;

  function updateField(event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function hydrateTenantForm(tenant: TenantProfileWithContracts, preferredContractId?: string | null) {
    const contract = pickContractForEdit(tenant, preferredContractId);
    const contractStartDate = dateForInput(contract?.start_date);
    const contractEndDate = dateForInput(contract?.end_date);
    setEditingTenantId(tenant.id);
    setEditingContractId(contract?.id ?? null);
    setError(null);
    setStatus(null);
    setForm((current) => ({
      ...current,
      tenantNumber: tenant.tenant_number ?? "",
      salutation: tenant.salutation ?? "Herr/Frau",
      firstName: tenant.first_name ?? "",
      lastName: tenant.last_name ?? "",
      companyName: tenant.company_name ?? "",
      email: tenant.email ?? "",
      phone: tenant.phone ?? "",
      mobile: tenant.mobile ?? "",
      street: tenant.street ?? "",
      postalCode: tenant.postal_code ?? "",
      city: tenant.city ?? "",
      bankName: tenant.bank_name ?? "",
      iban: tenant.iban ?? "",
      propertyId: contract?.property_id ?? current.propertyId,
      unitLabel: contract?.unit_label ?? "",
      rentType: contract?.rent_type ?? "Hauptmiete",
      coldRent: moneyForInput(contract?.cold_rent),
      operatingCosts: moneyForInput(contract?.operating_costs),
      totalRent: moneyForInput(contract?.total_rent),
      depositAmount: moneyForInput(contract?.deposit_amount),
      startDate: contractStartDate,
      endDate: contractEndDate,
      notes: contract?.notes ?? tenant.notes ?? "",
      status: contract ? deriveTenantStatus(contractStartDate, contractEndDate, tenant.status ?? "active") : tenant.status ?? "active",
    }));
  }

  useEffect(() => {
    const tenantId = searchParams.get("tenantId");
    const contractId = searchParams.get("contractId");
    if (!tenantId) return;
    if (editingTenantId === tenantId && (!contractId || editingContractId === contractId)) return;
    async function loadTenantForEdit() {
      try {
        const rows = await listTenantProfilesWithContracts(250);
        const editTenant = rows.find((tenant) => tenant.id === tenantId);
        if (editTenant) {
          hydrateTenantForm(editTenant, contractId);
        } else {
          setError("Mieterstammdaten konnten nicht gefunden werden. Bitte Mieterregister neu laden.");
        }
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : String(loadError);
        setError(`Mieterstammdaten konnten nicht geladen werden. (${message})`);
      }
    }

    void loadTenantForEdit();
  }, [editingContractId, editingTenantId, searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setError(null);

    if (!canSave) {
      setError("Bitte mindestens Nachname oder Firma eintragen.");
      return;
    }

    setSaving(true);

    try {
      if (editingTenantId) {
        const derivedProfileStatus = deriveTenantStatus(form.startDate, form.endDate, form.status);
        await updateTenantProfile(editingTenantId, {
          tenantNumber: form.tenantNumber,
          salutation: form.salutation,
          firstName: form.firstName,
          lastName: form.lastName,
          companyName: form.companyName,
          email: form.email,
          phone: form.phone,
          mobile: form.mobile,
          street: form.street,
          postalCode: form.postalCode,
          city: form.city,
          bankName: form.bankName,
          iban: form.iban,
          notes: form.notes,
          status: derivedProfileStatus,
        });
        const updatedContract = await upsertTenantContractForTenant(
          editingTenantId,
          {
            propertyId: form.propertyId,
            objectCode: selectedProperty?.code ?? form.propertyId,
            unitLabel: form.unitLabel,
            rentType: form.rentType,
            coldRent: parseMoneyInput(form.coldRent),
            operatingCosts: parseMoneyInput(form.operatingCosts),
            totalRent: parseMoneyInput(form.totalRent),
            depositAmount: parseMoneyInput(form.depositAmount),
            startDate: form.startDate,
            endDate: form.endDate,
            status: deriveContractStatus(form.startDate, form.endDate),
            notes: form.notes,
          },
          editingContractId,
          { preferUpdateExisting: true },
        );
        setStatus(
          updatedContract
            ? "Mieterstammdaten und Mietverhältnis wurden aktualisiert."
            : "Mieterstammdaten wurden aktualisiert.",
        );
        setEditingTenantId(null);
        setEditingContractId(null);
        setForm(emptyForm);
        window.dispatchEvent(new Event("koenen:tenant-changed"));
        navigate(`/mieter/register?updated=${Date.now()}`, { replace: true });
        return;
      }

      const result = await createTenantWithContract(
        {
          tenantNumber: form.tenantNumber,
          salutation: form.salutation,
          firstName: form.firstName,
          lastName: form.lastName,
          companyName: form.companyName,
          email: form.email,
          phone: form.phone,
          mobile: form.mobile,
          street: form.street,
          postalCode: form.postalCode,
          city: form.city,
          bankName: form.bankName,
          iban: form.iban,
          notes: form.notes,
          status: deriveTenantStatus(form.startDate, form.endDate, form.status),
        },
        {
          propertyId: form.propertyId,
          objectCode: selectedProperty?.code ?? form.propertyId,
          unitLabel: form.unitLabel,
          rentType: form.rentType,
          coldRent: parseMoneyInput(form.coldRent),
          operatingCosts: parseMoneyInput(form.operatingCosts),
          totalRent: parseMoneyInput(form.totalRent),
          depositAmount: parseMoneyInput(form.depositAmount),
          startDate: form.startDate,
          endDate: form.endDate,
          status: deriveContractStatus(form.startDate, form.endDate),
          notes: form.notes,
        },
      );

      setStatus(
        result.contract
          ? "Mieter und Mietverhältnis wurden gespeichert."
          : "Mieter wurde gespeichert.",
      );
      setForm(emptyForm);
      window.dispatchEvent(new Event("koenen:tenant-changed"));
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setError(`Speichern fehlgeschlagen: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setEditingTenantId(null);
    setEditingContractId(null);
    setForm(emptyForm);
    setStatus(null);
    setError(null);
  }

  return (
    <div className="tenant-admin-page mx-auto max-w-[1460px] space-y-5">
      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-indigo-700">
              <UserPlus size={15} />
              Mieter-Stammdaten
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950">
              {editingTenantId ? "Mieter bearbeiten" : "Mieter anlegen"}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Neue Mieterdaten werden in einer eigenen Stammdatenquelle gespeichert.
              Bestehende Buchungen, Darlehen, Charts und Portfolio-Berechnungen werden dabei nicht verändert.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
              Sicherer Start: neue Tabellen, keine Änderung an Buchungen.
            </div>
            <Link
              to="/mieter/register"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-black text-slate-800 no-underline shadow-sm"
            >
              Mieterregister öffnen
            </Link>
          </div>
        </div>
      </section>

      <div className="space-y-5">
        <form onSubmit={handleSubmit} className="min-w-0 space-y-5">
          <section className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm">
            <SectionTitle title="Person / Kontakt" />
            <div className="tenant-form-grid grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Mieternummer" name="tenantNumber" value={form.tenantNumber} onChange={updateField} />
              <SelectField
                label="Anrede"
                name="salutation"
                value={form.salutation}
                onChange={updateField}
                options={["Herr/Frau", "Herr", "Frau", "Firma", "Familie"]}
              />
              <SelectField
                label="Status"
                name="status"
                value={form.status}
                onChange={updateField}
                options={[
                  { value: "active", label: "Aktiv" },
                  { value: "notice", label: "Kündigung" },
                  { value: "former", label: "Archiviert / nicht aktiv" },
                  { value: "prospect", label: "Interessent" },
                ]}
              />
              <Field label="Vorname" name="firstName" value={form.firstName} onChange={updateField} />
              <Field label="Nachname" name="lastName" value={form.lastName} onChange={updateField} />
              <Field label="Firma / Familie" name="companyName" value={form.companyName} onChange={updateField} />
              <Field label="E-Mail" name="email" type="email" value={form.email} onChange={updateField} />
              <Field label="Telefon" name="phone" value={form.phone} onChange={updateField} />
              <Field label="Mobil" name="mobile" value={form.mobile} onChange={updateField} />
            </div>
          </section>

          <section className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm">
            <SectionTitle title="Adresse / Bank" />
            <div className="tenant-form-grid grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Straße" name="street" value={form.street} onChange={updateField} className="xl:col-span-2" />
              <Field label="PLZ" name="postalCode" value={form.postalCode} onChange={updateField} />
              <Field label="Ort" name="city" value={form.city} onChange={updateField} />
              <Field label="Bank" name="bankName" value={form.bankName} onChange={updateField} className="xl:col-span-2" />
              <Field label="IBAN" name="iban" value={form.iban} onChange={updateField} className="xl:col-span-2" />
            </div>
          </section>

          <section className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm">
            <SectionTitle title="Mietverhältnis" />
            <div className="tenant-form-grid grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="grid gap-2 text-sm font-bold text-slate-700 xl:col-span-2">
                Objekt
                <select
                  name="propertyId"
                  value={form.propertyId}
                  onChange={updateField}
                  className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 outline-none focus:border-indigo-400"
                >
                  <option value="">Noch keinem Objekt zuordnen</option>
                  {appData.objects.map((object) => (
                    <option key={object.id} value={object.id}>
                      {object.label}
                    </option>
                  ))}
                </select>
              </label>
              <Field label="Einheit / Stellplatz" name="unitLabel" value={form.unitLabel} onChange={updateField} />
              <SelectField
                label="Art"
                name="rentType"
                value={form.rentType}
                onChange={updateField}
                options={["Hauptmiete", "Garage", "Tiefgarage", "Stellplatz", "Gewerbe", "Sonstiges"]}
              />
              <Field label="Kaltmiete" name="coldRent" value={form.coldRent} onChange={updateField} inputMode="decimal" />
              <Field label="Nebenkosten" name="operatingCosts" value={form.operatingCosts} onChange={updateField} inputMode="decimal" />
              <Field label="Gesamtmiete" name="totalRent" value={form.totalRent} onChange={updateField} inputMode="decimal" />
              <Field label="Kaution" name="depositAmount" value={form.depositAmount} onChange={updateField} inputMode="decimal" />
              <Field label="Beginn" name="startDate" type="date" value={form.startDate} onChange={updateField} />
              <Field label="Ende" name="endDate" type="date" value={form.endDate} onChange={updateField} />
            </div>

            <label className="mt-4 grid gap-2 text-sm font-bold text-slate-700">
              Notizen
              <textarea
                name="notes"
                value={form.notes}
                onChange={updateField}
                rows={4}
                className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-medium text-slate-950 outline-none focus:border-indigo-400"
              />
            </label>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="submit"
                disabled={!canSave}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Save size={17} />
                {saving ? "Speichern..." : editingTenantId ? "Änderungen speichern" : "Speichern"}
              </button>
              {editingTenantId ? (
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-800 shadow-sm disabled:opacity-60"
                >
                  Abbrechen
                </button>
              ) : null}
              {status ? (
                <span className="inline-flex items-center gap-2 text-sm font-bold text-emerald-700">
                  <CheckCircle2 size={17} />
                  {status}
                </span>
              ) : null}
              {error ? <span className="text-sm font-bold text-red-700">{error}</span> : null}
            </div>
          </section>
        </form>

        <section className="rounded-[20px] border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
            <div className="flex items-center gap-2 font-black">
              <Building2 size={17} />
              Automatische Verbindung zu Leerstand
            </div>
            <p className="mt-2">
              Wenn ein Leerstand gespeichert wird, beendet die App passende aktive Mietverträge automatisch
              am Vortag des Leerstands und archiviert den Mieter, sobald kein weiterer aktiver Vertrag vorhanden ist.
            </p>
        </section>
      </div>
    </div>
  );
}

function SectionTitle({ title, compact = false }: { title: string; compact?: boolean }) {
  return (
    <h2 className={`${compact ? "mb-3 text-base" : "mb-4 text-lg"} font-black text-slate-950`}>
      {title}
    </h2>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  type = "text",
  inputMode,
  className = "",
}: {
  label: string;
  name: keyof FormState;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  inputMode?: "decimal";
  className?: string;
}) {
  return (
    <label className={`grid gap-2 text-sm font-bold text-slate-700 ${className}`}>
      {label}
      <input
        name={name}
        value={value}
        onChange={onChange}
        type={type}
        inputMode={inputMode}
        className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 outline-none focus:border-indigo-400"
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  value,
  onChange,
  options,
}: {
  label: string;
  name: keyof FormState;
  value: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  options: Array<string | { value: string; label: string }>;
}) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-700">
      {label}
      <select
        name={name}
        value={value}
        onChange={onChange}
        className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 outline-none focus:border-indigo-400"
      >
        {options.map((option) => {
          const value = typeof option === "string" ? option : option.value;
          const label = typeof option === "string" ? option : option.label;
          return (
            <option key={value} value={value}>
              {label}
            </option>
          );
        })}
      </select>
    </label>
  );
}
