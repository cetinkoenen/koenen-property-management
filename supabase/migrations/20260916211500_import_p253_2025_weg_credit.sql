-- Korrigiert die WEG-Eigentümerabrechnung P253/2025 anhand der Originalabrechnung.
-- P253 hat zusätzlich 9,40 EUR Verrechnung aus umlagefähigen Betriebskosten
-- und daher ein Guthaben von 3,69 EUR statt einer Nachforderung.

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
     where coalesce(record ->> 'recordId', '') = 'p253-2025'
  ) then
    raise exception 'Tiefgaragenabrechnung P253/2025 fehlt im zentralen Datensatz';
  end if;

  select jsonb_agg(
    case
      when coalesce(record ->> 'recordId', '') = 'p253-2025' then
        record || jsonb_build_object(
          'wegStatementPeriodFrom', '2025-11-14',
          'wegStatementPeriodTo', '2025-12-31',
          'wegStatementTotal', 24.56,
          'wegApportionableTotal', 5.44,
          'wegNonApportionableTotal', 12.22,
          'wegReserveTotal', 6.90,
          'wegApportionableOffset', 9.40,
          'wegNonApportionableOffset', 11.99,
          'wegReserveOffset', 6.86,
          'wegOwnerPrepayments', 28.25,
          'wegOwnerSettlement', -3.69,
          'section35aLaborShare', 0.77
        )
      else record
    end
    order by (record ->> 'year')::integer, coalesce(record ->> 'unitCode', '')
  ) into updated_records
  from jsonb_array_elements(current_records) record;

  if round(24.56::numeric - 9.40::numeric - 11.99::numeric - 6.86::numeric, 2) <> -3.69 then
    raise exception 'P253/2025 WEG-Guthaben ist rechnerisch nicht 3,69 EUR';
  end if;

  update public.apartment_billing_workspaces
     set data = jsonb_set(current_payload, '{records}', updated_records, true),
         updated_at = now()
   where object_id = 'rosenstein-str-25-tiefgarage'
     and year = 'all';
end
$$;
