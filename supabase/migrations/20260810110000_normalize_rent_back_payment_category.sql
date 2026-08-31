-- Normalize explicit rent back-payment categories without touching mixed
-- monthly rent rows whose notes may mention a Nachzahlung.
-- Miete Nachzahlung remains tax-relevant, but is excluded from the regular
-- monthly rent-status calculation in the app.

UPDATE public.finance_entry
SET
  category = 'Miete Nachzahlung',
  tax_relevant = true
WHERE booking_date >= DATE '2024-01-01'
  AND booking_date <= CURRENT_DATE
  AND lower(trim(coalesce(entry_type::text, ''))) = 'income'
  AND lower(trim(coalesce(category, ''))) IN (
    'miete nachzahlung',
    'mietnachzahlung',
    'miet nachzahlung',
    'nachzahlung miete',
    'nachzahlung miet'
  );
