-- Fuerther Str. 74: Die Bankbuchung vom 10.12.2025 ueber 2.278,89 EUR
-- begleicht nachweislich drei Monatsmieten zu je 661,34 EUR sowie die
-- NK-Nachzahlung 2024 ueber 294,87 EUR.
--
-- 3 * 661,34 + 294,87 = 2.278,89 EUR
--
-- Die Sammelbuchung wird deshalb revisionssicher soft-deleted und in vier
-- fachliche Teilbuchungen zerlegt. So bleiben Mieteingang, NK-Abrechnung und
-- Steuerreport ohne Sonder-/Doppelquelle centgenau aus derselben Buchungsquelle.

do $$
declare
  source_entry public.finance_entry%rowtype;
  nk_entry_id bigint;
  workspace_payload jsonb;
begin
  select *
    into source_entry
    from public.finance_entry
   where id = 1190
     and booking_date = date '2025-12-10'
     and entry_type = 'income'
     and amount = 2278.89
     and category = 'Miete'
     and objekt_code = 'Objekt_4'
     and object_id = '50ec410b-1489-4ef2-a885-d6d8c508bdc0'::uuid
     and is_deleted = false
   for update;

  if not found then
    raise exception 'Fuerther-Sammelzahlung 10.12.2025 entspricht nicht dem geprueften Ausgangsstand';
  end if;

  if exists (
    select 1 from public.finance_entry
     where is_deleted = false
       and booking_date = date '2025-12-10'
       and objekt_code = 'Objekt_4'
       and note like 'Fürther Str. 74 · Sammelzahlung 10.12.2025 · Mietmonat %'
  ) then
    raise exception 'Fuerther-Sammelzahlung wurde bereits fachlich aufgeteilt';
  end if;

  update public.finance_entry
     set is_deleted = true,
         deleted_at = now()
   where id = source_entry.id;

  insert into public.finance_entry
    (objekt_code, booking_date, entry_type, amount, category, note, user_id,
     object_id, is_deleted, tax_relevant, nk_relevant)
  values
    ('Objekt_4', date '2025-12-10', 'income', 661.34, 'Miete',
     'Fürther Str. 74 · Sammelzahlung 10.12.2025 · Mietmonat 10/2025 · Original gesamt 2.278,89 EUR',
     source_entry.user_id, source_entry.object_id, false, true, false),
    ('Objekt_4', date '2025-12-10', 'income', 661.34, 'Miete',
     'Fürther Str. 74 · Sammelzahlung 10.12.2025 · Mietmonat 11/2025 · Original gesamt 2.278,89 EUR',
     source_entry.user_id, source_entry.object_id, false, true, false),
    ('Objekt_4', date '2025-12-10', 'income', 661.34, 'Miete',
     'Fürther Str. 74 · Sammelzahlung 10.12.2025 · Mietmonat 12/2025 · Original gesamt 2.278,89 EUR',
     source_entry.user_id, source_entry.object_id, false, true, false);

  insert into public.finance_entry
    (objekt_code, booking_date, entry_type, amount, category, note, user_id,
     object_id, is_deleted, tax_relevant, nk_relevant)
  values
    ('Objekt_4', date '2025-12-10', 'income', 294.87, 'NK-Nachzahlung',
     'Fürther Str. 74 · NK-Abrechnung 2024 ausgeglichen · Anteil aus Sammelzahlung 10.12.2025 · Original gesamt 2.278,89 EUR',
     source_entry.user_id, source_entry.object_id, false, true, true)
  returning id into nk_entry_id;

  select data
    into workspace_payload
    from public.apartment_billing_workspaces
   where id = '1604d957-0793-44d4-82a5-405222d0ca37'::uuid
     and object_id = 'Objekt_4'
     and year = '2024'
   for update;

  if not found
     or (workspace_payload #>> '{billings,0,workspace,apartments,0,advancePayments}')::numeric <> 1320
  then
    raise exception 'Fuerther-NK-Abrechnung 2024 entspricht nicht dem geprueften Stand';
  end if;

  update public.apartment_billing_workspaces
     set data = jsonb_set(
       data,
       '{billings,0,workspace,meta}',
       (data #> '{billings,0,workspace,meta}') || jsonb_build_object(
         'settlementStatus', 'Ausgeglichen',
         'settlementDate', '2025-12-10',
         'settlementAmount', 294.87,
         'settlementEntryId', nk_entry_id,
         'settlementReference', 'NK-Nachzahlung aus Sammelzahlung 2.278,89 EUR; Buchung 10.12.2025'
       ),
       false
     ),
     updated_at = now()
   where id = '1604d957-0793-44d4-82a5-405222d0ca37'::uuid;

  if (
    select round(sum(amount)::numeric, 2)
      from public.finance_entry
     where is_deleted = false
       and booking_date = date '2025-12-10'
       and objekt_code = 'Objekt_4'
       and note like 'Fürther Str. 74 ·%Sammelzahlung%'
  ) <> 2278.89 then
    raise exception 'Fuerther-Teilbuchungen ergeben nicht 2.278,89 EUR';
  end if;
end
$$;
