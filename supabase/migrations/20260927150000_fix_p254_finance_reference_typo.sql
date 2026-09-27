begin;

-- Korrigiert genau den belegten Tippfehler auf die verbindliche
-- Rosenstein-Einheitenreferenz aus den zentralen Stammdaten.
update public.finance_entry
set note = 'P254 - E008440000123 Nachzahlungen'
where id = 130
  and booking_date = date '2026-03-30'
  and category = 'Verwaltungskosten'
  and amount = 21.76
  and is_deleted = false
  and note = 'P254 - E008440000124 Nachzahlungen';

commit;
