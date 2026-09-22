-- Elsasser Str. 52, November 2025:
-- Mietbeginn 18.11.2025, Monats-Warmmiete 660,00 EUR.
-- Der belegte Zeitanteil 18.-30.11. umfasst 13 von 30 Tagen:
-- 660,00 * 13 / 30 = 286,00 EUR.
-- Die Zahlung vom 21.11.2025 ist damit die vollstaendige November-Teilmonatsmiete.

do $$
declare
  affected_count integer;
begin
  update public.finance_entry
     set note = 'Elsasser Str. 52 · Mietmonat 11/2025 · anteilig 18.11.-30.11.2025 · Kaltmiete inkl. NK',
         tax_relevant = true,
         nk_relevant = true
   where id = 989
     and booking_date = date '2025-11-21'
     and entry_type = 'income'
     and amount = 286.00
     and category = 'Miete'
     and objekt_code = 'Objekt_2'
     and object_id = '5db6fcc3-6419-4fb1-a03f-087dc16383cc'::uuid
     and is_deleted = false
     and note = 'Elsasser Str. 52, Kaltmiete inkl NK Anteilig';
  get diagnostics affected_count = row_count;
  if affected_count <> 1 then
    raise exception 'Elsasser-Novembermiete entspricht nicht dem geprueften Ausgangsstand';
  end if;

  update public.tenant_contracts
     set end_date = null,
         status = 'active',
         notes = concat_ws(E'\n', nullif(notes, ''), 'Mietbeginn 18.11.2025; November 2025 zeitanteilig 13/30 = 286,00 EUR.')
   where id = 'ab8f5718-7728-4d4d-af48-1fdec45a9202'::uuid
     and tenant_id = '7e243c19-d34d-4b33-b8a7-3fcd7a50067f'::uuid
     and property_id = '5db6fcc3-6419-4fb1-a03f-087dc16383cc'
     and object_code = 'Objekt_2'
     and start_date = date '2025-11-18'
     and end_date = date '2025-10-30'
     and status = 'ended'
     and is_deleted = false;
  get diagnostics affected_count = row_count;
  if affected_count <> 1 then
    raise exception 'Elsasser-Mietvertrag entspricht nicht dem geprueften widerspruechlichen Ausgangsstand';
  end if;

  if not exists (
    select 1
      from public.finance_entry
     where id = 989
       and note like '%Mietmonat 11/2025%'
       and amount = 286.00
       and is_deleted = false
  ) or not exists (
    select 1
      from public.tenant_contracts
     where id = 'ab8f5718-7728-4d4d-af48-1fdec45a9202'::uuid
       and start_date = date '2025-11-18'
       and end_date is null
       and status = 'active'
  ) then
    raise exception 'Elsasser-Novemberkorrektur konnte nicht verifiziert werden';
  end if;
end
$$;
