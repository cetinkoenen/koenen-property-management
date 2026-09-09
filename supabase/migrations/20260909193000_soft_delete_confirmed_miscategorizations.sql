-- Vom Benutzer am 09.09.2026 fachlich bestaetigte Fehlbuchungen.
-- Soft-Delete bewahrt die Datensaetze fuer Audit und Wiederherstellung.
do $$
declare
  matched_count integer;
begin
  select count(*)
    into matched_count
  from public.finance_entry
  where booking_date = date '2025-11-03'
    and entry_type = 'income'
    and lower(coalesce(category, '')) = 'kreditrate'
    and lower(coalesce(note, '')) like '%ablösung darlehen%'
    and coalesce(is_deleted, false) = false;

  if matched_count <> 1 then
    raise exception 'Erwartete genau eine Lilienthaler-Ablösungsbuchung am 03.11.2025, gefunden: %', matched_count;
  end if;

  update public.finance_entry
  set is_deleted = true,
      deleted_at = now()
  where booking_date = date '2025-11-03'
    and entry_type = 'income'
    and lower(coalesce(category, '')) = 'kreditrate'
    and lower(coalesce(note, '')) like '%ablösung darlehen%'
    and coalesce(is_deleted, false) = false;

  select count(*)
    into matched_count
  from public.finance_entry
  where booking_date = date '2025-07-28'
    and entry_type = 'expense'
    and lower(coalesce(category, '')) = 'miete'
    and abs(abs(amount) - 1650.00) < 0.005
    and coalesce(is_deleted, false) = false;

  if matched_count <> 1 then
    raise exception 'Erwartete genau eine Hohenloher-Doppelzahlung am 28.07.2025, gefunden: %', matched_count;
  end if;

  update public.finance_entry
  set is_deleted = true,
      deleted_at = now()
  where booking_date = date '2025-07-28'
    and entry_type = 'expense'
    and lower(coalesce(category, '')) = 'miete'
    and abs(abs(amount) - 1650.00) < 0.005
    and coalesce(is_deleted, false) = false;
end
$$;
