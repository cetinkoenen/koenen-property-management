import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Car, Download, FileUp, Pencil, PlusCircle, RefreshCw, Search, Trash2, X } from "lucide-react";

import { isAdminEmail } from "@/auth/accessControl";
import { useAuth } from "@/auth/AuthProvider";
import { useAppData } from "@/state/AppDataContext";
import {
  calculateMileageTripAmount,
  deleteMileageTrip,
  MILEAGE_TRIP_REASONS,
  openMileageReceipt,
  saveMileageTrip,
  uploadMileageReceipt,
  type MileageTripReason,
  type MileageTripRow,
} from "@/services/mileageTripService";
import type { TravelTransportMode } from "@/lib/travelTax";
import { parseLocaleNumber } from "@/utils/numberParser";

type TripScope = "property" | "investment";

type TripForm = {
  id?: string;
  trip_scope: TripScope;
  property_id: string;
  portfolio_property_id: string;
  property_label: string;
  investment_address: string;
  datum: string;
  grund: MileageTripReason;
  start_adresse: string;
  zieladresse: string;
  distanz_km: string;
  hin_und_rueckfahrt: boolean;
  verkehrsmittel: TravelTransportMode;
  ticketpreis_brutto: string;
  mehrtaegige_reise: boolean;
  hotelkosten_brutto: string;
  anzahl_uebernachtungen: string;
  fruehstueck_inklusive: boolean;
  beleg_url: string;
};

const emptyForm = (): TripForm => ({
  trip_scope: "property",
  property_id: "",
  portfolio_property_id: "",
  property_label: "",
  investment_address: "",
  datum: new Date().toISOString().slice(0, 10),
  grund: "Kontrollfahrt",
  start_adresse: "",
  zieladresse: "",
  distanz_km: "",
  hin_und_rueckfahrt: true,
  verkehrsmittel: "car",
  ticketpreis_brutto: "",
  mehrtaegige_reise: false,
  hotelkosten_brutto: "",
  anzahl_uebernachtungen: "1",
  fruehstueck_inklusive: false,
  beleg_url: "",
});

function eur(value: number) {
  return value.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function dateDE(value: string) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}

function normalize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll("ß", "ss")
    .replace(/[ä]/g, "ae")
    .replace(/[ö]/g, "oe")
    .replace(/[ü]/g, "ue")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export default function Fahrtenbuch() {
  const appData = useAppData();
  const { user } = useAuth();
  const isAdmin = isAdminEmail(user?.email);
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [propertyFilter, setPropertyFilter] = useState("ALL");
  const [scopeFilter, setScopeFilter] = useState<"ALL" | TripScope>("ALL");
  const [search, setSearch] = useState("");
  const [trips, setTrips] = useState<MileageTripRow[]>([]);
  const [form, setForm] = useState<TripForm>(() => emptyForm());
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const propertyOptions = useMemo(() => {
    return appData.portfolioRows
      .map((row) => ({
        property_id: row.property_id,
        portfolio_property_id: row.portfolio_property_id ?? "",
        label: row.property_name,
      }))
      .filter((row) => row.property_id && row.label)
      .sort((a, b) => a.label.localeCompare(b.label, "de"));
  }, [appData.portfolioRows]);

  const selectedProperty = propertyOptions.find((property) => property.property_id === form.property_id);
  const travelBreakdown = calculateMileageTripAmount({
    verkehrsmittel: form.verkehrsmittel,
    distanz_km: form.distanz_km,
    hin_und_rueckfahrt: form.hin_und_rueckfahrt,
    ticketpreis_brutto: form.ticketpreis_brutto,
    mehrtaegige_reise: form.mehrtaegige_reise,
    hotelkosten_brutto: form.hotelkosten_brutto,
    anzahl_uebernachtungen: form.anzahl_uebernachtungen,
    fruehstueck_inklusive: form.fruehstueck_inklusive,
  });

  const loadTrips = useCallback(async () => {
    setLoading(true);
    setStatus("");
    try {
      const { listMileageTrips } = await import("@/services/mileageTripService");
      const rows = await listMileageTrips({ year, scope: scopeFilter === "ALL" ? undefined : scopeFilter });
      setTrips(rows);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Fahrten konnten nicht geladen werden.");
      setTrips([]);
    } finally {
      setLoading(false);
    }
  }, [scopeFilter, year]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTrips();
  }, [loadTrips]);

  const filteredTrips = useMemo(() => {
    const query = normalize(search);
    return trips.filter((trip) => {
      if (propertyFilter !== "ALL") {
        if (propertyFilter === "INVESTMENT" && trip.trip_scope !== "investment") return false;
        if (propertyFilter !== "INVESTMENT" && trip.property_id !== propertyFilter) return false;
      }
      if (!query) return true;
      return normalize(`${trip.property_label} ${trip.investment_address ?? ""} ${trip.grund} ${trip.start_adresse} ${trip.zieladresse}`).includes(query);
    });
  }, [propertyFilter, search, trips]);

  const totals = useMemo(() => {
    return filteredTrips.reduce(
      (acc, trip) => {
        acc.amount += trip.berechneter_betrag;
        acc.travel += trip.fahrtkosten_betrag || trip.berechneter_betrag;
        acc.vma += trip.vma_betrag || 0;
        acc.hotel += trip.hotelkosten_brutto || 0;
        acc.km += trip.verkehrsmittel === "car" ? trip.distanz_km * (trip.hin_und_rueckfahrt ? 2 : 1) : 0;
        return acc;
      },
      { amount: 0, travel: 0, vma: 0, hotel: 0, km: 0 },
    );
  }, [filteredTrips]);

  function update<K extends keyof TripForm>(key: K, value: TripForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handlePropertyChange(propertyId: string) {
    const property = propertyOptions.find((item) => item.property_id === propertyId);
    setForm((current) => ({
      ...current,
      property_id: property?.property_id ?? "",
      portfolio_property_id: property?.portfolio_property_id ?? "",
      property_label: property?.label ?? "",
      zieladresse: property?.label ?? "",
    }));
  }

  function startEdit(trip: MileageTripRow) {
    setForm({
      id: trip.id,
      trip_scope: trip.trip_scope,
      property_id: trip.property_id ?? "",
      portfolio_property_id: trip.portfolio_property_id ?? "",
      property_label: trip.property_label,
      investment_address: trip.investment_address ?? "",
      datum: trip.datum,
      grund: trip.grund,
      start_adresse: trip.start_adresse,
      zieladresse: trip.zieladresse,
      distanz_km: String(trip.distanz_km).replace(".", ","),
      hin_und_rueckfahrt: trip.hin_und_rueckfahrt,
      verkehrsmittel: trip.verkehrsmittel,
      ticketpreis_brutto: String(trip.ticketpreis_brutto || "").replace(".", ","),
      mehrtaegige_reise: trip.mehrtaegige_reise,
      hotelkosten_brutto: String(trip.hotelkosten_brutto || "").replace(".", ","),
      anzahl_uebernachtungen: String(trip.anzahl_uebernachtungen || 1),
      fruehstueck_inklusive: trip.fruehstueck_inklusive,
      beleg_url: trip.beleg_url ?? "",
    });
    setReceiptFile(null);
    setStatus("Fahrt wird bearbeitet.");
  }

  function resetForm() {
    setForm(emptyForm());
    setReceiptFile(null);
    setStatus("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || saving) return;
    const distance = parseLocaleNumber(form.distanz_km, 0);
    const propertyLabel = form.trip_scope === "investment" ? form.property_label.trim() : selectedProperty?.label ?? form.property_label.trim();
    const destination = form.trip_scope === "investment" ? form.zieladresse.trim() || form.investment_address.trim() : form.zieladresse.trim();
    if (!form.datum || !propertyLabel || !form.start_adresse.trim() || !destination) {
      setStatus("Bitte Datum, Objekt/Investment, Start und Ziel vollständig erfassen.");
      return;
    }
    if (form.verkehrsmittel === "car" && distance <= 0) {
      setStatus("Bitte bei eigenem Auto eine Distanz größer als 0 erfassen.");
      return;
    }
    if (form.verkehrsmittel === "public_transport" && parseLocaleNumber(form.ticketpreis_brutto, 0) <= 0) {
      setStatus("Bitte bei Bahn/ÖPNV einen Ticketpreis größer als 0 erfassen.");
      return;
    }

    setSaving(true);
    setStatus("Speichert...");
    try {
      const receiptPath = receiptFile
        ? await uploadMileageReceipt(form.property_id || `investment-${Date.now()}`, receiptFile)
        : form.beleg_url || null;
      await saveMileageTrip({
        id: form.id,
        trip_scope: form.trip_scope,
        property_id: form.trip_scope === "property" ? form.property_id : null,
        portfolio_property_id: form.trip_scope === "property" ? form.portfolio_property_id || null : null,
        property_label: propertyLabel,
        investment_address: form.trip_scope === "investment" ? form.investment_address || destination : null,
        datum: form.datum,
        grund: form.grund,
        start_adresse: form.start_adresse,
        zieladresse: destination,
        distanz_km: distance,
        hin_und_rueckfahrt: form.hin_und_rueckfahrt,
        verkehrsmittel: form.verkehrsmittel,
        ticketpreis_brutto: form.ticketpreis_brutto,
        mehrtaegige_reise: form.mehrtaegige_reise,
        hotelkosten_brutto: form.hotelkosten_brutto,
        anzahl_uebernachtungen: form.anzahl_uebernachtungen,
        fruehstueck_inklusive: form.fruehstueck_inklusive,
        beleg_url: receiptPath,
      });
      resetForm();
      await loadTrips();
      setStatus("Fahrt gespeichert.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Fahrt konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(trip: MileageTripRow) {
    if (!isAdmin) return;
    const confirmed = window.confirm(`Fahrt vom ${dateDE(trip.datum)} wirklich löschen?`);
    if (!confirmed) return;
    setStatus("Löscht...");
    try {
      await deleteMileageTrip(trip.id);
      await loadTrips();
      setStatus("Fahrt gelöscht.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Fahrt konnte nicht gelöscht werden.");
    }
  }

  return (
    <div className="space-y-5">
      {!isAdmin ? (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-black text-blue-900">
          Nur-Lesen-Zugang: Fahrten sind sichtbar, Änderungen sind dem Admin vorbehalten.
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Fahrten</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{filteredTrips.length}</p>
        </div>
        <div className="rounded-[18px] border border-teal-100 bg-teal-50 p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-teal-700">Abgerechnete Kilometer</p>
          <p className="mt-2 text-2xl font-black text-teal-900">{totals.km.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km</p>
        </div>
        <div className="rounded-[18px] border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Werbungskosten Anlage V</p>
          <p className="mt-2 text-2xl font-black text-emerald-900">{eur(totals.amount)}</p>
        </div>
      </section>

      <section className="grid min-w-0 gap-5">
        <form onSubmit={handleSubmit} className="min-w-0 rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Fahrtenbuch</p>
              <h2 className="text-xl font-black text-slate-950">{form.id ? "Fahrt bearbeiten" : "Neue Fahrt erfassen"}</h2>
            </div>
            {form.id ? (
              <button type="button" onClick={resetForm} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700">
                <X size={16} /> Abbrechen
              </button>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-4">
            <label className="grid min-w-0 gap-1 text-xs font-black text-slate-700">
              Art
              <select value={form.trip_scope} disabled={!isAdmin} onChange={(event) => update("trip_scope", event.target.value as TripScope)} className="min-h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">
                <option value="property">Bestandsimmobilie</option>
                <option value="investment">Investment / Kaufprüfung</option>
              </select>
            </label>

            {form.trip_scope === "property" ? (
              <label className="grid min-w-0 gap-1 text-xs font-black text-slate-700 lg:col-span-3">
                Immobilie
                <select value={form.property_id} disabled={!isAdmin} onChange={(event) => handlePropertyChange(event.target.value)} className="min-h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">
                  <option value="">Bitte auswählen</option>
                  {propertyOptions.map((property) => (
                    <option key={property.property_id} value={property.property_id}>{property.label}</option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label className="grid min-w-0 gap-1 text-xs font-black text-slate-700 lg:col-span-1">
                  Investment / Objektname
                  <input value={form.property_label} disabled={!isAdmin} onChange={(event) => update("property_label", event.target.value)} placeholder="z. B. Hasengasse 3" className="min-h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold" />
                </label>
                <label className="grid min-w-0 gap-1 text-xs font-black text-slate-700 lg:col-span-2">
                  Investment-Adresse
                  <input value={form.investment_address} disabled={!isAdmin} onChange={(event) => update("investment_address", event.target.value)} placeholder="Straße, PLZ Ort" className="min-h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold" />
                </label>
              </>
            )}

            <label className="grid min-w-0 gap-1 text-xs font-black text-slate-700">
              Datum
              <input type="date" value={form.datum} disabled={!isAdmin} onChange={(event) => update("datum", event.target.value)} className="min-h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold" />
            </label>
            <label className="grid min-w-0 gap-1 text-xs font-black text-slate-700">
              Grund
              <select value={form.grund} disabled={!isAdmin} onChange={(event) => update("grund", event.target.value as MileageTripReason)} className="min-h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">
                {MILEAGE_TRIP_REASONS.map((reason) => (
                  <option key={reason} value={reason}>{reason}</option>
                ))}
              </select>
            </label>

            <div className="grid min-w-0 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 lg:col-span-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Route</p>
                <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 shadow-sm">Start → Ziel</span>
              </div>
              <div className="grid min-w-0 gap-3 md:grid-cols-2">
                <label className="grid min-w-0 gap-1 text-xs font-black text-slate-700">
                  Start-Adresse
                  <input value={form.start_adresse} disabled={!isAdmin} onChange={(event) => update("start_adresse", event.target.value)} placeholder="z. B. Zuhause / Büro" className="min-h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold" />
                </label>
                <label className="grid min-w-0 gap-1 text-xs font-black text-slate-700">
                  Ziel-Adresse
                  <input value={form.zieladresse} disabled={!isAdmin} onChange={(event) => update("zieladresse", event.target.value)} placeholder="Objektadresse / Terminort" className="min-h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold" />
                </label>
              </div>
            </div>

            <label className="grid min-w-0 gap-1 text-xs font-black text-slate-700">
              Verkehrsmittel
              <select
                value={form.verkehrsmittel}
                disabled={!isAdmin}
                onChange={(event) => update("verkehrsmittel", event.target.value as TravelTransportMode)}
                className="min-h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"
              >
                <option value="car">Eigenes Auto</option>
                <option value="public_transport">Bahn/ÖPNV</option>
              </select>
            </label>

            {form.verkehrsmittel === "public_transport" ? (
              <label className="grid min-w-0 gap-1 text-xs font-black text-slate-700">
                Ticketpreis brutto
                <input
                  inputMode="decimal"
                  value={form.ticketpreis_brutto}
                  disabled={!isAdmin}
                  onChange={(event) => update("ticketpreis_brutto", event.target.value)}
                  placeholder="z. B. 49,00"
                  className="min-h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"
                />
              </label>
            ) : (
              <div className="grid min-w-0 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="grid min-w-0 gap-1 text-xs font-black text-slate-700">
                Einfache Strecke in km
                <input inputMode="decimal" value={form.distanz_km} disabled={!isAdmin} onChange={(event) => update("distanz_km", event.target.value)} placeholder="z. B. 24,5" className="min-h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold" />
              </label>
              <label className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700">
                <input type="checkbox" checked={form.hin_und_rueckfahrt} disabled={!isAdmin} onChange={(event) => update("hin_und_rueckfahrt", event.target.checked)} className="h-4 w-4" />
                Hin/Rück
              </label>
            </div>
            )}

            <div className="grid min-w-0 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 lg:col-span-2">
              <label className="inline-flex items-center gap-2 text-sm font-black text-slate-700">
                <input
                  type="checkbox"
                  checked={form.mehrtaegige_reise}
                  disabled={!isAdmin}
                  onChange={(event) => update("mehrtaegige_reise", event.target.checked)}
                  className="h-4 w-4"
                />
                Mehrtägige Reise mit Übernachtung?
              </label>
              {form.mehrtaegige_reise ? (
                <div className="grid min-w-0 gap-3 sm:grid-cols-3">
                  <label className="grid min-w-0 gap-1 text-xs font-black text-slate-700">
                    Hotelkosten brutto
                    <input
                      inputMode="decimal"
                      value={form.hotelkosten_brutto}
                      disabled={!isAdmin}
                      onChange={(event) => update("hotelkosten_brutto", event.target.value)}
                      placeholder="z. B. 120,00"
                      className="min-h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"
                    />
                  </label>
                  <label className="grid min-w-0 gap-1 text-xs font-black text-slate-700">
                    Übernachtungen
                    <input
                      type="number"
                      min={1}
                      value={form.anzahl_uebernachtungen}
                      disabled={!isAdmin}
                      onChange={(event) => update("anzahl_uebernachtungen", event.target.value)}
                      className="min-h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"
                    />
                  </label>
                  <label className="inline-flex min-h-10 items-center gap-2 self-end rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.fruehstueck_inklusive}
                      disabled={!isAdmin}
                      onChange={(event) => update("fruehstueck_inklusive", event.target.checked)}
                      className="h-4 w-4"
                    />
                    Frühstück inklusive
                  </label>
                </div>
              ) : null}
            </div>

            <label className="grid min-w-0 gap-1 text-xs font-black text-slate-700 lg:col-span-2">
              Beleg / Foto optional
              <span className="inline-flex min-h-10 min-w-0 items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-3 text-sm font-semibold text-slate-500">
                <FileUp size={16} />
                <input type="file" disabled={!isAdmin} onChange={(event: ChangeEvent<HTMLInputElement>) => setReceiptFile(event.target.files?.[0] ?? null)} className="w-full min-w-0 text-sm" />
              </span>
            </label>

            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 lg:col-span-1">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-700">Automatisch berechnet</p>
              <p className="mt-1 text-xl font-black text-blue-950">{eur(travelBreakdown.totalAmount)}</p>
              <div className="mt-2 grid gap-1 text-[11px] font-bold leading-4 text-blue-800">
                <span>{form.verkehrsmittel === "car" ? "Fahrtkosten" : "Ticket"}: {eur(travelBreakdown.travelCosts)}</span>
                <span>VMA: {eur(travelBreakdown.vmaAmount)}</span>
                <span>Hotel: {eur(travelBreakdown.hotelCosts)}</span>
              </div>
            </div>

            <button type="submit" disabled={!isAdmin || saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#255f6f] px-4 text-sm font-black text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 lg:col-span-1 lg:self-end">
              <PlusCircle size={17} /> {saving ? "Speichert..." : form.id ? "Änderung speichern" : "Fahrt speichern"}
            </button>
            {status ? <p className="text-sm font-bold text-slate-500 lg:col-span-2">{status}</p> : null}
          </div>
        </form>

        <section className="min-w-0 rounded-[22px] border border-slate-200 bg-white shadow-sm">
          <div className="grid min-w-0 gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 xl:grid-cols-[120px_minmax(220px,1fr)_150px_minmax(220px,1fr)_140px] xl:items-end">
            <label className="grid min-w-0 gap-1 text-xs font-black text-slate-700">
              Steuerjahr
              <input type="number" value={year} onChange={(event) => setYear(Number(event.target.value) || currentYear)} className="min-h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold" />
            </label>
            <label className="grid min-w-0 gap-1 text-xs font-black text-slate-700">
              Objekt / Investment
              <select value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)} className="min-h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">
                <option value="ALL">Alle Fahrten</option>
                <option value="INVESTMENT">Nur Investments / Kaufprüfungen</option>
                {propertyOptions.map((property) => (
                  <option key={property.property_id} value={property.property_id}>{property.label}</option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 gap-1 text-xs font-black text-slate-700">
              Typ
              <select value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value as "ALL" | TripScope)} className="min-h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">
                <option value="ALL">Alle Typen</option>
                <option value="property">Bestand</option>
                <option value="investment">Investment</option>
              </select>
            </label>
            <label className="grid min-w-0 gap-1 text-xs font-black text-slate-700">
              Suche
              <span className="relative">
                <Search size={15} className="absolute left-3 top-3 text-slate-400" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Grund, Objekt, Adresse" className="min-h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 pl-9 text-sm font-semibold" />
              </span>
            </label>
            <button type="button" onClick={() => void loadTrips()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700">
              <RefreshCw size={16} /> Neu laden
            </button>
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px] table-fixed border-collapse text-left text-[13px]">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="w-[88px] px-2 py-3">Datum</th>
                  <th className="w-[150px] px-2 py-3">Objekt / Investment</th>
                  <th className="w-[155px] px-2 py-3">Grund</th>
                  <th className="px-2 py-3">Strecke</th>
                  <th className="w-[92px] px-2 py-3">km / Typ</th>
                  <th className="w-[112px] px-2 py-3">Betrag</th>
                  <th className="w-[54px] px-2 py-3">Beleg</th>
                  <th className="w-[82px] px-2 py-3 text-right">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrips.map((trip) => (
                  <tr key={trip.id} className="border-t border-slate-100 align-top">
                    <td className="px-2 py-3 font-extrabold text-slate-950">{dateDE(trip.datum)}</td>
                    <td className="px-2 py-3">
                      <strong className="block break-words font-extrabold leading-5 text-slate-950">{trip.property_label}</strong>
                      <span className="mt-1 block text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">{trip.trip_scope === "investment" ? "Investment / Kaufprüfung" : "Bestandsimmobilie"}</span>
                      {trip.investment_address ? <span className="mt-1 block text-xs font-bold text-slate-500">{trip.investment_address}</span> : null}
                    </td>
                    <td className="break-words px-2 py-3 font-bold leading-5 text-slate-700">{trip.grund}</td>
                    <td className="break-words px-2 py-3 text-xs font-bold leading-5 text-slate-500">
                      <span className="block text-slate-700">{trip.start_adresse}</span>
                      <span className="block">→ {trip.zieladresse}</span>
                    </td>
                    <td className="px-2 py-3 font-bold leading-5 text-slate-700">
                      {trip.verkehrsmittel === "public_transport"
                        ? "Bahn/ÖPNV"
                        : (trip.distanz_km * (trip.hin_und_rueckfahrt ? 2 : 1)).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      <span className="block text-[11px] text-slate-500">{trip.verkehrsmittel === "public_transport" ? "Ticket" : trip.hin_und_rueckfahrt ? "Hin/Rück" : "Einfach"}</span>
                    </td>
                    <td className="px-2 py-3">
                      <strong className="block font-extrabold text-emerald-700">{eur(trip.berechneter_betrag)}</strong>
                      <span className="mt-1 block text-[10px] font-bold leading-4 text-slate-500">
                        Fahrt {eur(trip.fahrtkosten_betrag || trip.berechneter_betrag)} · VMA {eur(trip.vma_betrag || 0)} · Hotel {eur(trip.hotelkosten_brutto || 0)}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      {trip.beleg_url ? (
                        <button type="button" onClick={() => void openMileageReceipt(trip.beleg_url ?? "")} aria-label="Beleg öffnen" title="Beleg öffnen" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700">
                          <Download size={14} />
                        </button>
                      ) : <span className="font-bold text-slate-400">-</span>}
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex justify-end gap-2">
                        <button type="button" disabled={!isAdmin} onClick={() => startEdit(trip)} aria-label={`Fahrt vom ${dateDE(trip.datum)} bearbeiten`} title="Bearbeiten" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">
                          <Pencil size={15} />
                        </button>
                        <button type="button" disabled={!isAdmin} onClick={() => void handleDelete(trip)} aria-label={`Fahrt vom ${dateDE(trip.datum)} löschen`} title="Löschen" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredTrips.length ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm font-bold text-slate-500">
                      {loading ? "Fahrten werden geladen..." : "Keine Fahrten für diese Auswahl gefunden."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 p-4 md:hidden">
            {filteredTrips.map((trip) => (
              <article key={trip.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-950">{dateDE(trip.datum)}</p>
                    <h3 className="mt-1 text-lg font-black leading-tight text-slate-950">{trip.property_label}</h3>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                      {trip.trip_scope === "investment" ? "Investment / Kaufprüfung" : "Bestandsimmobilie"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" disabled={!isAdmin} onClick={() => startEdit(trip)} aria-label={`Fahrt vom ${dateDE(trip.datum)} bearbeiten`} title="Bearbeiten" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">
                      <Pencil size={15} />
                    </button>
                    <button type="button" disabled={!isAdmin} onClick={() => void handleDelete(trip)} aria-label={`Fahrt vom ${dateDE(trip.datum)} löschen`} title="Löschen" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 text-sm font-bold text-slate-600">
                  <div>
                    <span className="block text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Grund</span>
                    {trip.grund}
                  </div>
                  <div>
                    <span className="block text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Strecke</span>
                    {trip.start_adresse} → {trip.zieladresse}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">km</p>
                    <p className="text-sm font-black text-slate-900">
                      {trip.verkehrsmittel === "public_transport"
                        ? "Bahn/ÖPNV"
                        : (trip.distanz_km * (trip.hin_und_rueckfahrt ? 2 : 1)).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs font-bold text-slate-500">{trip.verkehrsmittel === "public_transport" ? "Ticket" : trip.hin_und_rueckfahrt ? "Hin/Rück" : "Einfach"}</p>
                  </div>
                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Betrag</p>
                    <p className="text-sm font-black text-emerald-700">{eur(trip.berechneter_betrag)}</p>
                    <p className="mt-1 text-[11px] font-bold leading-4 text-slate-500">
                      Fahrt {eur(trip.fahrtkosten_betrag || trip.berechneter_betrag)} · VMA {eur(trip.vma_betrag || 0)} · Hotel {eur(trip.hotelkosten_brutto || 0)}
                    </p>
                  </div>
                </div>

                {trip.beleg_url ? (
                  <button type="button" onClick={() => void openMileageReceipt(trip.beleg_url ?? "")} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700">
                    <Download size={14} /> Beleg öffnen
                  </button>
                ) : null}
              </article>
            ))}
            {!filteredTrips.length ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-500">
                {loading ? "Fahrten werden geladen..." : "Keine Fahrten für diese Auswahl gefunden."}
              </div>
            ) : null}
          </div>
        </section>
      </section>

      <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-[#255f6f]">
            <Car size={19} />
          </span>
          <div>
            <h2 className="text-lg font-black text-slate-950">Steuerliche Einordnung</h2>
            <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
              Diese zentrale Liste ist die Quelle für Fahrtkosten im Steuer-Center. Bestandsimmobilien und ernsthafte Kaufprüfungen werden gemeinsam dokumentiert und nach Steuerjahr auswertbar.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
