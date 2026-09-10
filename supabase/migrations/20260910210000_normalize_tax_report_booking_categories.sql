-- Steuer-/Nebenkosten-Konsistenz ab 2024.
-- Nur anhand eindeutiger Buchungstexte werden Kategorien/Kennzeichen korrigiert.

-- Quartalsweise Steuerzahlungen mit Steuer-Nummer sind objektbezogene Grundsteuer.
update public.finance_entry
set
  category = 'Grundsteuer',
  tax_relevant = true,
  nk_relevant = true
where coalesce(is_deleted, false) = false
  and booking_date >= date '2024-01-01'
  and entry_type = 'expense'
  and lower(trim(coalesce(category, ''))) = 'steuer'
  and lower(coalesce(note, '')) ~ '(^|[^0-9])[1-4][[:space:]]*(jv|vj)[[:space:]]*20[0-9]{2}[[:space:]]*steuer[[:space:]]*[0-9]';

-- Erwerbs-/Anschaffungsnebenkosten sind niemals umlagefähige Betriebskosten.
update public.finance_entry
set nk_relevant = false
where coalesce(is_deleted, false) = false
  and booking_date >= date '2024-01-01'
  and category = 'Erwerbsnebenkosten / Anschaffungskosten'
  and nk_relevant is distinct from false;

-- Dieser Finanzierungszufluss ist anhand des Buchungstexts eindeutig belegt.
update public.finance_entry
set
  category = 'Darlehensauszahlung',
  tax_relevant = false,
  nk_relevant = false
where coalesce(is_deleted, false) = false
  and booking_date >= date '2024-01-01'
  and entry_type = 'income'
  and lower(coalesce(note, '')) like 'darlehensauszahlung%';
