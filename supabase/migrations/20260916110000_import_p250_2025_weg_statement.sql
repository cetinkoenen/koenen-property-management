-- Import der geprüften WEG-Abrechnung 2025 für Rosensteinstr. 25 / P250.
-- Eigentümerabrechnung und zeitanteilige Mieterabrechnung bleiben bewusst getrennt.

do $$
declare
  current_payload jsonb;
  current_records jsonb;
  updated_records jsonb;
begin
  select data
    into current_payload
    from public.apartment_billing_workspaces
   where object_id = 'rosenstein-str-25-tiefgarage'
     and year = 'all'
   for update;

  if current_payload is null then
    raise exception 'Zentrale Tiefgaragenabrechnung rosenstein-str-25-tiefgarage/all fehlt';
  end if;

  current_records := coalesce(current_payload -> 'records', '[]'::jsonb);

  if not exists (
    select 1
      from jsonb_array_elements(current_records) record
     where (record ->> 'year')::integer = 2025
  ) then
    raise exception 'Tiefgaragenabrechnung 2025 fehlt im zentralen Datensatz';
  end if;

  select jsonb_agg(
    case
      when (record ->> 'year')::integer = 2025 then
        record || jsonb_build_object(
          'finalized', false,
          'finalizedAt', '',
          'propertyLabel', 'Rosenstein Str. 25 · P250 · E008440000121',
          'unitLabel', 'Tiefgaragenstellplatz P250',
          'periodFrom', '2025-11-19',
          'periodTo', '2025-12-31',
          'monthlyHausgeld', 0,
          'tenantPrepayments', 0,
          'landlordName', 'Nihal Könen',
          'landlordAddress', E'Hohenloher Str. 78/1\n74243 Langenbrettach',
          'tenantName', 'Miriam Frommer',
          'tenantAddress', E'Rosenstein Straße 29\n70191 Stuttgart',
          'totalUnits', 1,
          'yourUnits', 1,
          'footerNote', 'Entwurf auf Grundlage der WEG-Abrechnung 2025. Der WEG-Zeitraum 14.11.–31.12.2025 umfasst 48 Tage; wegen Mietbeginn am 19.11.2025 wurden die umlagefähigen Kosten zeitanteilig mit 43/48 angesetzt. Vor Versand ist die mietvertragliche Umlagevereinbarung zu prüfen.',
          'wegStatementPeriodFrom', '2025-11-14',
          'wegStatementPeriodTo', '2025-12-31',
          'wegStatementTotal', 24.56,
          'wegOwnerPrepayments', 18.85,
          'wegOwnerSettlement', 5.71,
          'wegOwnerSettlementStatus', 'open',
          'wegOwnerSettlementPaidAt', '',
          'wegApportionableTotal', 5.44,
          'wegNonApportionableTotal', 12.22,
          'wegReserveTotal', 6.90,
          'section35aLaborShare', 0.77,
          'apportionableRows', jsonb_build_array(
            jsonb_build_object(
              'id', 'p250-2025-grundsteuer',
              'label', 'Grundsteuer',
              'totalCost', 0.99,
              'key', 'Direktbetrag',
              'totalUnits', null,
              'yourUnits', null,
              'note', 'Zeitanteil Mieter: 1,11 € × 43/48 Tage = 0,99 €'
            ),
            jsonb_build_object(
              'id', 'p250-2025-tiefgaragenstrom',
              'label', 'Tiefgaragenstrom',
              'totalCost', 3.88,
              'key', 'Direktbetrag',
              'totalUnits', null,
              'yourUnits', null,
              'note', 'Zeitanteil Mieter: 4,33 € × 43/48 Tage = 3,88 €'
            )
          ),
          'nonApportionableRows', jsonb_build_array(
            jsonb_build_object('id', 'p250-2025-verwalter', 'label', 'Verwaltergebühr Garage', 'totalCost', 10.33, 'key', 'Direktbetrag', 'totalUnits', null, 'yourUnits', null, 'note', 'Nicht umlagefähig; interne Eigentümer-Sicht'),
            jsonb_build_object('id', 'p250-2025-instandhaltung', 'label', 'Laufende Instandhaltung', 'totalCost', 1.66, 'key', 'Direktbetrag', 'totalUnits', null, 'yourUnits', null, 'note', 'Nicht umlagefähig; interne Eigentümer-Sicht'),
            jsonb_build_object('id', 'p250-2025-administration', 'label', 'Administrative Kosten', 'totalCost', 0.23, 'key', 'Direktbetrag', 'totalUnits', null, 'yourUnits', null, 'note', 'Nicht umlagefähig; interne Eigentümer-Sicht')
          )
        )
      else record
    end
    order by (record ->> 'year')::integer
  ) into updated_records
  from jsonb_array_elements(current_records) record;

  update public.apartment_billing_workspaces
     set data = jsonb_set(current_payload, '{records}', updated_records, true),
         updated_at = now()
   where object_id = 'rosenstein-str-25-tiefgarage'
     and year = 'all';

  if (
    select round(sum((row ->> 'totalCost')::numeric), 2)
      from jsonb_array_elements(updated_records) record,
           jsonb_array_elements(record -> 'apportionableRows') row
     where (record ->> 'year')::integer = 2025
  ) <> 4.87 then
    raise exception 'P250-Mieteranteil 2025 ist nicht 4,87 EUR';
  end if;

  if 24.56 - 18.85 <> 5.71 then
    raise exception 'WEG-Nachforderung 2025 ist rechnerisch nicht 5,71 EUR';
  end if;
end
$$;
