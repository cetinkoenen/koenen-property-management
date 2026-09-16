-- Ergänzt die nachvollziehbare Aufteilung der WEG-Verrechnungen für P250/2025.
-- Die Mieterabrechnung bleibt davon unberührt; die Werte gehören ausschließlich
-- zur internen Eigentümerabrechnung.

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
     where coalesce(record ->> 'recordId', '') = 'p250-2025'
  ) then
    raise exception 'Tiefgaragenabrechnung P250/2025 fehlt im zentralen Datensatz';
  end if;

  select jsonb_agg(
    case
      when coalesce(record ->> 'recordId', '') = 'p250-2025' then
        record || jsonb_build_object(
          'wegStatementTotal', 24.56,
          'wegApportionableTotal', 5.44,
          'wegNonApportionableTotal', 12.22,
          'wegReserveTotal', 6.90,
          'wegNonApportionableOffset', 11.99,
          'wegReserveOffset', 6.86,
          'wegOwnerPrepayments', 18.85,
          'wegOwnerSettlement', 5.71
        )
      else record
    end
    order by (record ->> 'year')::integer, coalesce(record ->> 'unitCode', '')
  ) into updated_records
  from jsonb_array_elements(current_records) record;

  if round(24.56::numeric - 11.99::numeric - 6.86::numeric, 2) <> 5.71 then
    raise exception 'P250/2025 WEG-Verrechnung ist rechnerisch nicht 5,71 EUR';
  end if;

  update public.apartment_billing_workspaces
     set data = jsonb_set(current_payload, '{records}', updated_records, true),
         updated_at = now()
   where object_id = 'rosenstein-str-25-tiefgarage'
     and year = 'all';
end
$$;
