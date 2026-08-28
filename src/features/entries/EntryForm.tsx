// src/features/entries/EntryForm.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { canonicalizeFinanceCategory, getFinanceCategoryOptions } from "../../lib/financeCategories";
import { emitFinanceEntryChanged, useAppData } from "../../state/AppDataContext";

type EntryType = "income" | "expense";

type ObjectRow = {
  id: string;
  code: string;
  street: string | null;
};

type EntryFormProps = {
  onCreated?: () => void;
  defaultObjectId?: string; // ✅ neu
};

export function EntryForm({ onCreated, defaultObjectId }: EntryFormProps) {
  const appData = useAppData();
  const [objectId, setObjectId] = useState(defaultObjectId ?? "");
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().slice(0, 10));
  const [entryType, setEntryType] = useState<EntryType>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");

  const [objects, setObjects] = useState<ObjectRow[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [useCategoryDropdown, setUseCategoryDropdown] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const objectLabel = (o: ObjectRow) => `${o.code} — ${o.street ?? ""}`.trim();

  // Objekte laden
  useEffect(() => {
    let cancelled = false;

    async function loadObjects() {
      const res = await supabase
        .from("objects")
        .select("id, code, street")
        .order("code", { ascending: true });

      if (cancelled) return;
      if (res.error) {
        console.error(res.error);
        return;
      }

      const rows = (res.data ?? []) as ObjectRow[];
      setObjects(rows);

      // Default setzen
      if (rows.length) {
        if (defaultObjectId && rows.some((o) => o.id === defaultObjectId)) {
          setObjectId(defaultObjectId);
        } else if (!rows.some((o) => o.id === objectId)) {
          setObjectId(rows[0].id);
        }
      }
    }

    loadObjects();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wenn App defaultObjectId ändert -> sync
  useEffect(() => {
    const syncDefaultObject = window.setTimeout(() => {
      if (defaultObjectId) setObjectId(defaultObjectId);
    }, 0);
    return () => window.clearTimeout(syncDefaultObject);
  }, [defaultObjectId]);

  // Kategorien laden
  useEffect(() => {
    let cancelled = false;

    async function loadCategories() {
      const res = await supabase
        .from("finance_entry")
        .select("category")
        .eq("is_deleted", false)
        .order("category", { ascending: true });

      if (cancelled) return;
      if (res.error) {
        console.error(res.error);
        return;
      }

      const cats = (res.data ?? [])
        .map((r: any) => canonicalizeFinanceCategory((r.category ?? "").trim()))
        .filter(Boolean);
      setCategoryOptions(Array.from(new Set(cats)));
    }

    loadCategories();
    return () => {
      cancelled = true;
    };
  }, []);

  const mergedObjectOptions = useMemo(() => {
    if (objects.length > 0) return objects;
    // Fallback (falls objects noch lädt)
    return objectId ? [{ id: objectId, code: "Objekt", street: null }] : [];
  }, [objects, objectId]);

  const mergedCategoryOptions = useMemo(() => getFinanceCategoryOptions(entryType, categoryOptions), [entryType, categoryOptions]);

  const validate = () => {
    if (!objectId) return "Bitte Objekt wählen.";
    if (!bookingDate) return "Bitte Buchungsdatum auswählen.";
    const amountNumber = Number(amount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) return "Bitte gültigen Betrag (> 0) eingeben.";
    if (!category.trim()) return "Bitte Kategorie wählen/eingeben.";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    const selected = objects.find((o) => o.id === objectId);
    const objektCodeBackup = selected?.code ?? null; // ✅ optional backup

    setLoading(true);

    const resolvedCategory = canonicalizeFinanceCategory(category.trim(), entryType);

    const { error } = await supabase.from("finance_entry").insert({
      object_id: objectId,                // ✅ neu (richtig)
      objekt_code: objektCodeBackup,      // ✅ optional (für Übergang/Debug)
      booking_date: bookingDate,
      entry_type: entryType,
      amount: Number(amount),
      category: resolvedCategory,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setAmount("");
    setSuccess("Gespeichert ✅");

    const cat = canonicalizeFinanceCategory(category.trim(), entryType);
    if (cat && !categoryOptions.includes(cat)) {
      setCategoryOptions((prev) => Array.from(new Set([...prev, cat])).sort());
    }

    emitFinanceEntryChanged();
    void appData.refresh();
    onCreated?.();
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12, maxWidth: 520 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span>Objekt</span>
        <select value={objectId} onChange={(e) => setObjectId(e.target.value)} disabled={loading}>
          {mergedObjectOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {objectLabel(o)}
            </option>
          ))}
        </select>
        <small style={{ opacity: 0.7 }}>
          Quelle: <code>public.objects</code> (id, code, street)
        </small>
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>Buchungsdatum</span>
        <input type="date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} disabled={loading} />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>Typ</span>
        <select value={entryType} onChange={(e) => setEntryType(e.target.value as EntryType)} disabled={loading}>
          <option value="expense">Ausgabe</option>
          <option value="income">Einnahme</option>
        </select>
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>Betrag</span>
        <input
          type="number"
          step="0.01"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={loading}
          placeholder="z.B. 250.00"
        />
      </label>

      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12 }}>
          <span>Kategorie</span>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, opacity: 0.85 }}>
            <input type="checkbox" checked={useCategoryDropdown} onChange={(e) => setUseCategoryDropdown(e.target.checked)} />
            Dropdown nutzen
          </label>
        </div>

        {useCategoryDropdown ? (
          <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={loading}>
            <option value="">— Kategorie wählen —</option>
            {mergedCategoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : (
          <input value={category} onChange={(e) => setCategory(e.target.value)} disabled={loading} placeholder="z.B. Miete, Handwerker" />
        )}
      </div>

      {error && (
        <div style={{ padding: 10, border: "1px solid #f2b8b5", borderRadius: 10 }}>
          ❌ {error}
        </div>
      )}
      {success && (
        <div style={{ padding: 10, border: "1px solid #b7e1cd", borderRadius: 10 }}>
          ✅ {success}
        </div>
      )}

      <button disabled={loading}>{loading ? "Speichern..." : "Eintrag speichern"}</button>
    </form>
  );
}
