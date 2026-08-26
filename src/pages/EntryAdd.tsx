import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { clearAppDataCache } from "../lib/appCache";
import { canonicalizeFinanceCategory, getFinanceCategoryOptions } from "../lib/financeCategories";
import { NK_ABRECHNUNG_LABEL, buildNkMismatchMessage, classifyNkRelevance } from "../lib/nkClassification";
import { classifyTaxRelevance } from "../lib/taxClassification";
import { buildBusinessMealNote, calculateBusinessMealDeductible, isBusinessMealCategory } from "../lib/businessMealTax";
import { buildTelecommunicationNote, calculateTelecommunicationTax, isTelecommunicationCategory } from "../lib/telecommunicationTax";
import { PORTFOLIO_GENERAL_LABEL, PORTFOLIO_GENERAL_OBJECT_CODE, PORTFOLIO_GENERAL_OBJECT_ID, isPortfolioGeneralReference } from "../lib/portfolioExpense";
import { emitFinanceEntryChanged } from "../state/AppDataContext";

type DropdownRow = {
  /** Muss für finance_entry.object_id die UUID aus public.objects.id sein. */
  value: string;
  objekt_code: string;
  label: string;
  /** Kompatibilität: neuere v_object_dropdown-Views liefern object_id/property_id getrennt. */
  object_id?: string | null;
  property_id?: string | null;
};

type ObjectDropdownResponse = {
  value: string | null;
  objekt_code: string | null;
  label: string | null;
  object_id?: string | null;
  property_id?: string | null;
};

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseNumberInput(raw: string): number {
  const normalized = raw.replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function panelStyle(): React.CSSProperties {
  return {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 18,
    boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
  };
}

function fieldLabelStyle(): React.CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 900,
    opacity: 0.75,
    display: "block",
  };
}

function inputStyle(): React.CSSProperties {
  return {
    marginTop: 6,
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    fontWeight: 800,
    background: "#ffffff",
  };
}

export default function EntryAdd() {
  const [objects, setObjects] = useState<DropdownRow[]>([]);
  const [objectId, setObjectId] = useState<string>("");
  const [objektCodePreview, setObjektCodePreview] = useState<string>("");

  const [kind, setKind] = useState<"income" | "expense">("income");
  const [bookingDate, setBookingDate] = useState<string>(() => toISODate(new Date()));
  const [amount, setAmount] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [customCategory, setCustomCategory] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [businessMealPersons, setBusinessMealPersons] = useState<string>("");
  const [businessMealOccasion, setBusinessMealOccasion] = useState<string>("");
  const [telecomSpouseA, setTelecomSpouseA] = useState<string>("");
  const [telecomSpouseB, setTelecomSpouseB] = useState<string>("");
  const [telecomLandlineInternet, setTelecomLandlineInternet] = useState<string>("");
  const [taxRelevant, setTaxRelevant] = useState<boolean>(true);
  const [nkRelevant, setNkRelevant] = useState<boolean>(false);

  const [saving, setSaving] = useState<boolean>(false);
  const [loadingObjects, setLoadingObjects] = useState<boolean>(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [pendingTaxPrompt, setPendingTaxPrompt] = useState<boolean>(false);
  const [pendingNkPrompt, setPendingNkPrompt] = useState<boolean>(false);

  const amountNumber = useMemo(() => parseNumberInput(amount), [amount]);
  const categoryOptions = useMemo(() => getFinanceCategoryOptions(kind), [kind]);
  const resolvedCategory = useMemo(() => {
    const selected = category === "__NEW__" ? customCategory : category;
    return canonicalizeFinanceCategory(selected, kind);
  }, [category, customCategory, kind]);
  const taxRule = useMemo(
    () => classifyTaxRelevance({ entry_type: kind, category: resolvedCategory, note, objekt_code: objektCodePreview }),
    [kind, note, objektCodePreview, resolvedCategory],
  );
  const nkRule = useMemo(
    () => classifyNkRelevance({ entry_type: kind, category: resolvedCategory, note }),
    [kind, note, resolvedCategory],
  );
  const selectedObjectLabel = useMemo(() => objects.find((object) => String(object.value) === String(objectId))?.label ?? "", [objectId, objects]);
  const isPortfolioGeneralSelected = isPortfolioGeneralReference(objectId) || isPortfolioGeneralReference(objektCodePreview);
  const isBusinessMeal = kind === "expense" && isBusinessMealCategory(resolvedCategory);
  const isTelecommunication = kind === "expense" && isTelecommunicationCategory(resolvedCategory);
  const businessMealDeductible = useMemo(() => calculateBusinessMealDeductible(amountNumber), [amountNumber]);
  const telecomSpouseANumber = useMemo(() => parseNumberInput(telecomSpouseA || "0"), [telecomSpouseA]);
  const telecomSpouseBNumber = useMemo(() => parseNumberInput(telecomSpouseB || "0"), [telecomSpouseB]);
  const telecomLandlineInternetNumber = useMemo(() => parseNumberInput(telecomLandlineInternet || "0"), [telecomLandlineInternet]);
  const telecomDetails = useMemo(
    () => calculateTelecommunicationTax({
      spouseA: telecomSpouseANumber,
      spouseB: telecomSpouseBNumber,
      landlineInternet: telecomLandlineInternetNumber,
    }),
    [telecomLandlineInternetNumber, telecomSpouseANumber, telecomSpouseBNumber],
  );
  const effectiveAmountNumber = isTelecommunication ? telecomDetails.totalAmount : amountNumber;

  useEffect(() => {
    setTaxRelevant(taxRule.taxRelevant);
  }, [taxRule.taxRelevant, taxRule.locked, resolvedCategory, kind]);

  useEffect(() => {
    let alive = true;

    async function loadObjects() {
      setLoadingObjects(true);

      const { data, error } = await supabase
        .from("v_object_dropdown")
        .select("value,objekt_code,label,object_id,property_id")
        .order("label", { ascending: true });

      if (!alive) return;

      if (error) {
        setMsg(`❌ Fehler beim Laden der Objektliste: ${error.message}`);
        setObjects([]);
        setLoadingObjects(false);
        return;
      }

      const dbObjects = ((data ?? []) as ObjectDropdownResponse[])
        .filter((x) => (x.object_id || x.value) && x.objekt_code && x.label)
        .map((x) => ({
          ...x,
          // Wichtig: finance_entry.object_id verweist auf public.objects.id.
          // In neueren Backend-Views ist value teilweise property_id; deshalb immer object_id bevorzugen.
          value: String(x.object_id ?? x.value),
          objekt_code: String(x.objekt_code),
          label: String(x.label),
          object_id: x.object_id == null ? null : String(x.object_id),
          property_id: x.property_id == null ? null : String(x.property_id),
        })) as DropdownRow[];

      const list: DropdownRow[] = [
        {
          value: PORTFOLIO_GENERAL_OBJECT_ID,
          objekt_code: PORTFOLIO_GENERAL_OBJECT_CODE,
          label: PORTFOLIO_GENERAL_LABEL,
          object_id: null,
          property_id: null,
        },
        ...dbObjects,
      ];

      setObjects(list);

      if (!objectId && list.length > 0) {
        setObjectId(String(list[0].value));
        setObjektCodePreview(list[0].objekt_code);
      }

      setLoadingObjects(false);
    }

    void loadObjects();

    return () => {
      alive = false;
    };
  }, [objectId]);

  function onSelectObject(newId: string) {
    setObjectId(newId);
    const selected = objects.find((o) => String(o.value) === String(newId));
    setObjektCodePreview(selected ? selected.objekt_code : "");
  }

  function resetForm() {
    setAmount("");
    setCategory("");
    setCustomCategory("");
    setNote("");
    setBusinessMealPersons("");
    setBusinessMealOccasion("");
    setTelecomSpouseA("");
    setTelecomSpouseB("");
    setTelecomLandlineInternet("");
    setTaxRelevant(true);
    setNkRelevant(false);
    setMsg(null);
  }

  async function save(options?: { bypassTaxPrompt?: boolean; forceTaxRelevant?: boolean; bypassNkPrompt?: boolean; forceNkRelevant?: boolean }) {
    setMsg(null);

    if (!objectId) {
      setMsg("❌ Bitte ein Objekt auswählen.");
      return;
    }

    if (!bookingDate) {
      setMsg("❌ Bitte ein Datum auswählen.");
      return;
    }

    if (isTelecommunication) {
      if (telecomSpouseA.trim() === "" || !Number.isFinite(telecomSpouseANumber) || telecomSpouseANumber < 0) {
        setMsg("❌ Bitte Mobilfunkvertrag Ehepartner A als gültigen Betrag eintragen.");
        return;
      }
      if (telecomSpouseB.trim() === "" || !Number.isFinite(telecomSpouseBNumber) || telecomSpouseBNumber < 0) {
        setMsg("❌ Bitte Mobilfunkvertrag Ehepartner B als gültigen Betrag eintragen.");
        return;
      }
      if (telecomLandlineInternet.trim() === "" || !Number.isFinite(telecomLandlineInternetNumber) || telecomLandlineInternetNumber < 0) {
        setMsg("❌ Bitte Festnetz & Internet als gültigen Betrag eintragen.");
        return;
      }
      if (telecomDetails.totalAmount <= 0) {
        setMsg("❌ Bitte mindestens einen Telekommunikationsbetrag größer als 0 eintragen.");
        return;
      }
    }

    if (!isTelecommunication && (!amount || !Number.isFinite(amountNumber) || amountNumber <= 0)) {
      setMsg("❌ Bitte einen gültigen Betrag größer als 0 eingeben.");
      return;
    }

    if (!resolvedCategory) {
      setMsg("❌ Bitte eine Kategorie auswählen oder eine neue Kategorie eintragen.");
      return;
    }

    if (isBusinessMeal) {
      if (!businessMealPersons.trim()) {
        setMsg("❌ Bitte bei Bewirtungskosten die bewirteten Personen eintragen.");
        return;
      }
      if (!businessMealOccasion.trim()) {
        setMsg("❌ Bitte bei Bewirtungskosten den Anlass / das Thema der Besprechung eintragen.");
        return;
      }
      if (!selectedObjectLabel.trim()) {
        setMsg("❌ Bitte bei Bewirtungskosten eine Ziel-Immobilie auswählen.");
        return;
      }
    }

    if (!options?.bypassTaxPrompt && taxRule.taxRelevant && !taxRule.locked && !taxRelevant) {
      setPendingTaxPrompt(true);
      return;
    }

    const nextNkRelevant = options?.forceNkRelevant ?? nkRelevant;
    if (!options?.bypassNkPrompt && nkRule.nkRelevant !== nkRelevant) {
      setPendingNkPrompt(true);
      return;
    }

    setSaving(true);

    try {
      const resolvedNote = isBusinessMeal
        ? buildBusinessMealNote({
            existingNote: note,
            totalAmount: amountNumber,
            persons: businessMealPersons,
            occasion: businessMealOccasion,
            targetObject: selectedObjectLabel || objektCodePreview || "Nicht zugeordnet",
          })
        : isTelecommunication
          ? buildTelecommunicationNote({
              existingNote: note,
              spouseA: telecomSpouseANumber,
              spouseB: telecomSpouseBNumber,
              landlineInternet: telecomLandlineInternetNumber,
            })
        : note.trim() || null;
      const payload = {
        object_id: isPortfolioGeneralSelected ? null : objectId,
        objekt_code: objektCodePreview || null,
        entry_type: kind,
        booking_date: bookingDate,
        amount: effectiveAmountNumber,
        category: resolvedCategory || null,
        note: resolvedNote,
        tax_relevant: taxRule.locked ? false : options?.forceTaxRelevant ? true : taxRelevant,
        nk_relevant: nextNkRelevant,
      };

      const { error } = await supabase.from("finance_entry").insert(payload);

      if (error) {
        throw error;
      }

      clearAppDataCache();
      emitFinanceEntryChanged();
      setMsg("✅ Buchung erfolgreich gespeichert. Mieteingang und Auswertungen werden aktualisiert.");
      setAmount("");
      setCategory("");
      setCustomCategory("");
      setNote("");
      setBusinessMealPersons("");
      setBusinessMealOccasion("");
      setTelecomSpouseA("");
      setTelecomSpouseB("");
      setTelecomLandlineInternet("");
      setTaxRelevant(classifyTaxRelevance({ entry_type: kind }).taxRelevant);
      setNkRelevant(false);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setMsg(`❌ Speichern fehlgeschlagen: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: 24,
        display: "grid",
        gap: 18,
      }}
    >
      {pendingTaxPrompt ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tax-watchdog-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            display: "grid",
            placeItems: "center",
            padding: 18,
            background: "rgba(15,23,42,0.42)",
          }}
        >
          <section
            style={{
              width: "min(560px, 100%)",
              borderRadius: 22,
              border: "1px solid #dbe5ef",
              background: "#ffffff",
              boxShadow: "0 24px 70px rgba(15,23,42,0.24)",
              padding: 22,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 950, letterSpacing: "0.16em", textTransform: "uppercase", color: "#315f72" }}>
              Steuer-Waechter
            </div>
            <h2 id="tax-watchdog-title" style={{ margin: "8px 0 8px", fontSize: 24, lineHeight: 1.1, fontWeight: 950, color: "#0f172a" }}>
              Steuerrelevante Buchung erkannt
            </h2>
            <p style={{ margin: 0, color: "#475569", fontSize: 15, fontWeight: 750, lineHeight: 1.5 }}>
              Die App erkennt diese Buchung als <strong>{taxRule.group}</strong>. Das Feld <strong>St.</strong> ist aktuell nicht gesetzt.
            </p>
            <div
              style={{
                marginTop: 14,
                border: "1px solid #bfdbfe",
                borderRadius: 16,
                background: "#eff6ff",
                padding: 14,
                color: "#1e3a8a",
                fontSize: 13,
                fontWeight: 850,
                lineHeight: 1.45,
              }}
            >
              {taxRule.hint}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
              <button
                type="button"
                onClick={() => {
                  setPendingTaxPrompt(false);
                  setTaxRelevant(true);
                  void save({ bypassTaxPrompt: true, forceTaxRelevant: true });
                }}
                style={{
                  minHeight: 44,
                  border: "1px solid #315f72",
                  borderRadius: 13,
                  background: "#315f72",
                  color: "#ffffff",
                  padding: "10px 14px",
                  fontSize: 14,
                  fontWeight: 950,
                  cursor: "pointer",
                }}
              >
                Als steuerrelevant speichern
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingTaxPrompt(false);
                  void save({ bypassTaxPrompt: true });
                }}
                style={{
                  minHeight: 44,
                  border: "1px solid #e2e8f0",
                  borderRadius: 13,
                  background: "#ffffff",
                  color: "#0f172a",
                  padding: "10px 14px",
                  fontSize: 14,
                  fontWeight: 950,
                  cursor: "pointer",
                }}
              >
                Trotzdem ohne St speichern
              </button>
              <button
                type="button"
                onClick={() => setPendingTaxPrompt(false)}
                style={{
                  minHeight: 44,
                  border: "1px solid #e2e8f0",
                  borderRadius: 13,
                  background: "#f8fafc",
                  color: "#475569",
                  padding: "10px 14px",
                  fontSize: 14,
                  fontWeight: 950,
                  cursor: "pointer",
                }}
              >
                Abbrechen
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {pendingNkPrompt ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="nk-watchdog-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 81,
            display: "grid",
            placeItems: "center",
            padding: 18,
            background: "rgba(15,23,42,0.42)",
          }}
        >
          <section
            style={{
              width: "min(600px, 100%)",
              borderRadius: 22,
              border: "1px solid #dbe5ef",
              background: "#ffffff",
              boxShadow: "0 24px 70px rgba(15,23,42,0.24)",
              padding: 22,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 950, letterSpacing: "0.16em", textTransform: "uppercase", color: "#315f72" }}>
              Nebenkostenabrechnung
            </div>
            <h2 id="nk-watchdog-title" style={{ margin: "8px 0 8px", fontSize: 24, lineHeight: 1.1, fontWeight: 950, color: "#0f172a" }}>
              {NK_ABRECHNUNG_LABEL}-Kennzeichen prüfen
            </h2>
            <p style={{ margin: 0, color: "#475569", fontSize: 15, fontWeight: 750, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
              {buildNkMismatchMessage(nkRule, nkRelevant)}
            </p>
            <div
              style={{
                marginTop: 14,
                border: "1px solid #bfdbfe",
                borderRadius: 16,
                background: "#eff6ff",
                padding: 14,
                color: "#1e3a8a",
                fontSize: 13,
                fontWeight: 850,
                lineHeight: 1.45,
              }}
            >
              {NK_ABRECHNUNG_LABEL} steuert nur die Nebenkostenabrechnung. Das Steuerkennzeichen St. bleibt davon getrennt.
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
              <button
                type="button"
                onClick={() => {
                  setPendingNkPrompt(false);
                  setNkRelevant(nkRule.nkRelevant);
                  void save({ bypassTaxPrompt: true, bypassNkPrompt: true, forceNkRelevant: nkRule.nkRelevant });
                }}
                style={{
                  minHeight: 44,
                  border: "1px solid #315f72",
                  borderRadius: 13,
                  background: "#315f72",
                  color: "#ffffff",
                  padding: "10px 14px",
                  fontSize: 14,
                  fontWeight: 950,
                  cursor: "pointer",
                }}
              >
                Empfehlung übernehmen
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingNkPrompt(false);
                  void save({ bypassTaxPrompt: true, bypassNkPrompt: true });
                }}
                style={{
                  minHeight: 44,
                  border: "1px solid #e2e8f0",
                  borderRadius: 13,
                  background: "#ffffff",
                  color: "#0f172a",
                  padding: "10px 14px",
                  fontSize: 14,
                  fontWeight: 950,
                  cursor: "pointer",
                }}
              >
                Bewusst so speichern
              </button>
              <button
                type="button"
                onClick={() => setPendingNkPrompt(false)}
                style={{
                  minHeight: 44,
                  border: "1px solid #e2e8f0",
                  borderRadius: 13,
                  background: "#f8fafc",
                  color: "#475569",
                  padding: "10px 14px",
                  fontSize: 14,
                  fontWeight: 950,
                  cursor: "pointer",
                }}
              >
                Abbrechen
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <header>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h1
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 950,
              letterSpacing: "-0.03em",
              color: "#111827",
            }}
          >
            Buchung erfassen
          </h1>
          <Link
            to="/transaktionsregeln"
            style={{
              minHeight: 42,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "10px 14px",
              borderRadius: 14,
              border: "1px solid #d8d2c7",
              background: "#ffffff",
              color: "#111827",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 900,
              boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
            }}
          >
            Transaktionsregeln
          </Link>
        </div>

        <div style={{ marginTop: 8, opacity: 0.7, fontSize: 15 }}>
          Neue Einnahme oder Ausgabe für ein Objekt anlegen
        </div>
      </header>

      {msg && (
        <div
          style={{
            border: msg.startsWith("❌") ? "1px solid #fecaca" : "1px solid #d1fae5",
            background: msg.startsWith("❌") ? "#fff1f2" : "#ecfdf5",
            color: msg.startsWith("❌") ? "#7f1d1d" : "#065f46",
            padding: 12,
            borderRadius: 12,
            fontWeight: 800,
            whiteSpace: "pre-wrap",
          }}
        >
          {msg}
        </div>
      )}

      <section
        style={{
          ...panelStyle(),
          padding: 18,
          display: "grid",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 14,
          }}
        >
          <label style={fieldLabelStyle()}>
            Objekt
            <select
              value={objectId}
              onChange={(e) => onSelectObject(e.target.value)}
              style={inputStyle()}
              disabled={loadingObjects || objects.length === 0}
            >
              {objects.length === 0 ? (
                <option value="">Keine Objekte gefunden</option>
              ) : (
                objects.map((o) => (
                  <option key={String(o.value)} value={String(o.value)}>
                    {o.label}
                  </option>
                ))
              )}
            </select>

            <div style={{ marginTop: 6, fontSize: 11, opacity: 0.65 }}>
              Objekt-Code: <b>{objektCodePreview || "—"}</b>
            </div>
            {isPortfolioGeneralSelected ? (
              <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: "#315f72", lineHeight: 1.35 }}>
                Für übergreifende Kosten wie Software, Steuerberater, Büro/Porto oder Verwaltung. Steuerbericht verteilt anteilig auf die 5 vermieteten Objekte.
              </div>
            ) : null}
          </label>

          <label style={fieldLabelStyle()}>
            Typ
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as "income" | "expense")}
              style={inputStyle()}
            >
              <option value="income">Einnahme</option>
              <option value="expense">Ausgabe</option>
            </select>
          </label>

          <label style={fieldLabelStyle()}>
            Datum
            <input
              type="date"
              value={bookingDate}
              onChange={(e) => setBookingDate(e.target.value)}
              style={inputStyle()}
            />
          </label>

          <label style={fieldLabelStyle()}>
            Betrag (EUR)
            <input
              value={isTelecommunication ? telecomDetails.totalAmount.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={isBusinessMeal ? "Gesamtsumme laut Beleg" : isTelecommunication ? "wird aus Telekom-Feldern berechnet" : "z. B. 123,45"}
              style={inputStyle()}
              disabled={isTelecommunication}
            />
          </label>

          <label style={fieldLabelStyle()}>
            Kategorie
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={inputStyle()}
            >
              <option value="">Kategorie auswählen</option>
              {categoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              <option value="__NEW__">Neue Kategorie…</option>
            </select>
          </label>

          {category === "__NEW__" && (
            <label style={fieldLabelStyle()}>
              Neue Kategorie
              <input
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                placeholder="Neue Kategorie eingeben"
                style={inputStyle()}
              />
            </label>
          )}

          {isBusinessMeal && (
            <>
              <label style={fieldLabelStyle()}>
                Bewirtete Personen
                <input
                  value={businessMealPersons}
                  onChange={(e) => setBusinessMealPersons(e.target.value)}
                  placeholder="Namen der bewirteten Personen"
                  style={inputStyle()}
                  required
                />
              </label>

              <label style={fieldLabelStyle()}>
                Anlass / Thema
                <input
                  value={businessMealOccasion}
                  onChange={(e) => setBusinessMealOccasion(e.target.value)}
                  placeholder="z. B. Besprechung Sanierung Elsasser Str."
                  style={inputStyle()}
                  required
                />
              </label>

              <div
                style={{
                  ...panelStyle(),
                  alignSelf: "end",
                  padding: 12,
                  borderColor: "#bbf7d0",
                  background: "#f0fdf4",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: "0.12em", textTransform: "uppercase", color: "#166534" }}>
                  Steuerlicher Bewirtungsbeleg
                </div>
                <div style={{ marginTop: 6, fontSize: 20, fontWeight: 950, color: "#064e3b" }}>
                  {businessMealDeductible.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                </div>
                <div style={{ marginTop: 3, fontSize: 12, fontWeight: 800, color: "#64748b" }}>
                  70% absetzbar · 30% privat · Ziel: {selectedObjectLabel || "Objekt auswählen"}
                </div>
              </div>
            </>
          )}

          {isTelecommunication && (
            <>
              <div
                style={{
                  ...panelStyle(),
                  gridColumn: "1 / -1",
                  display: "grid",
                  gap: 12,
                  padding: 14,
                  background: "#f8fafc",
                }}
              >
                <div>
                  <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>
                    Handy & Internet
                  </div>
                  <div style={{ marginTop: 4, fontSize: 13, fontWeight: 800, color: "#64748b", lineHeight: 1.35 }}>
                    Drei Einzelwerte erfassen; steuerlich werden 20% je Vertrag, maximal 20 EUR, berechnet.
                  </div>
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  <label style={fieldLabelStyle()}>
                    Mobilfunk Ehepartner A
                    <input
                      value={telecomSpouseA}
                      onChange={(e) => setTelecomSpouseA(e.target.value)}
                      placeholder="z. B. 39,99"
                      style={inputStyle()}
                      required
                    />
                  </label>

                  <label style={fieldLabelStyle()}>
                    Mobilfunk Ehepartner B
                    <input
                      value={telecomSpouseB}
                      onChange={(e) => setTelecomSpouseB(e.target.value)}
                      placeholder="z. B. 29,99"
                      style={inputStyle()}
                      required
                    />
                  </label>

                  <label style={fieldLabelStyle()}>
                    Festnetz & Internet
                    <input
                      value={telecomLandlineInternet}
                      onChange={(e) => setTelecomLandlineInternet(e.target.value)}
                      placeholder="z. B. 44,99"
                      style={inputStyle()}
                      required
                    />
                  </label>
                </div>
              </div>
              <div
                style={{
                  ...panelStyle(),
                  alignSelf: "end",
                  padding: 12,
                  borderColor: "#bfdbfe",
                  background: "#eff6ff",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: "0.12em", textTransform: "uppercase", color: "#1d4ed8" }}>
                  Telekommunikation steuerlich
                </div>
                <div style={{ marginTop: 6, fontSize: 20, fontWeight: 950, color: "#1e3a8a" }}>
                  {telecomDetails.deductibleTotal.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                </div>
                <div style={{ marginTop: 3, fontSize: 12, fontWeight: 800, color: "#64748b", lineHeight: 1.35 }}>
                  20% je Vertrag, maximal 20 EUR · je vermietetes Objekt {telecomDetails.allocatedPerRentedObject.toLocaleString("de-DE", { style: "currency", currency: "EUR" })} · Hohenloher 0,00 EUR
                </div>
              </div>
            </>
          )}

          <label style={fieldLabelStyle()}>
            Notiz
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="optional"
              style={inputStyle()}
            />
          </label>

          <div style={{ alignSelf: "end", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label
              style={{
                ...fieldLabelStyle(),
                minHeight: 44,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 12px",
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                background: "#f8fafc",
              }}
            >
              <input
                type="checkbox"
                checked={taxRelevant}
                disabled={taxRule.locked}
                onChange={(event) => setTaxRelevant(taxRule.locked ? false : event.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              St.
            </label>
            {taxRule.hint ? (
              <span style={{ flexBasis: "100%", fontSize: 12, fontWeight: 800, color: taxRule.locked ? "#9f1239" : "#64748b" }}>
                {taxRule.hint}
              </span>
            ) : null}
            <label
              style={{
                ...fieldLabelStyle(),
                minHeight: 44,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 12px",
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                background: "#f8fafc",
              }}
            >
              <input
                type="checkbox"
                checked={nkRelevant}
                onChange={(event) => setNkRelevant(event.target.checked)}
                title="Nebenkostenabrechnung relevant Ja/Nein"
                style={{ width: 18, height: 18 }}
              />
              {NK_ABRECHNUNG_LABEL}
            </label>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #315f72",
              background: "#315f72",
              color: "#ffffff",
              fontWeight: 900,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Speichert…" : "Speichern"}
          </button>

          <button
            type="button"
            onClick={resetForm}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Leeren
          </button>
        </div>
      </section>
    </div>
  );
}
