-- P250 / Januar 2026:
-- 75,00 EUR Eingang am 09.01.2026 plus 10,00 EUR Restzahlung am 31.01.2026
-- ergeben die vollstaendige Sollmiete von 85,00 EUR.
-- Der ausdrueckliche Mietmonat verhindert, dass die spaete Restzahlung durch
-- die allgemeine Monatsende-Regel faelschlich dem Februar zugeordnet wird.

do $$
declare
  affected_count integer;
begin
  update public.finance_entry
     set note = 'P250 - E008440000121 · Mietmonat 01/2026 · Restzahlung 10,00 EUR zur Januar-Sollmiete 85,00 EUR',
         tax_relevant = true,
         nk_relevant = false
   where id = 37
     and booking_date = date '2026-01-31'
     and entry_type = 'income'
     and amount = 10.00
     and category = 'Miete'
     and objekt_code = 'Objekt_6'
     and object_id = 'd982b7f2-6fa7-408a-8ce7-6ccc43ff6f59'::uuid
     and note = 'P250 - E008440000121'
     and is_deleted = false;
  get diagnostics affected_count = row_count;
  if affected_count <> 1 then
    raise exception 'P250-Restzahlung 31.01.2026 entspricht nicht dem geprueften Ausgangsstand';
  end if;

  if (
    select round(sum(amount)::numeric, 2)
      from public.finance_entry
     where is_deleted = false
       and entry_type = 'income'
       and category = 'Miete'
       and object_id = 'd982b7f2-6fa7-408a-8ce7-6ccc43ff6f59'::uuid
       and (
         (id = 49 and booking_date = date '2026-01-09' and amount = 75.00)
         or (id = 37 and booking_date = date '2026-01-31' and amount = 10.00 and note like '%Mietmonat 01/2026%')
       )
  ) <> 85.00 then
    raise exception 'P250-Januarmiete ergibt nicht 85,00 EUR';
  end if;
end
$$;
