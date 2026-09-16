-- Professional letter metadata for the 2025 Tiefgarage one-pagers.
-- The report remains driven by the central billing workspace; this migration
-- only enriches the existing records and does not create another data source.
do $$
declare
  current_payload jsonb;
  updated_records jsonb;
begin
  select data
    into current_payload
  from public.apartment_billing_workspaces
  where object_id = 'rosenstein-str-25-tiefgarage'
    and year = 'all'
  for update;

  if current_payload is null or jsonb_typeof(current_payload -> 'records') <> 'array' then
    raise exception 'Central Tiefgarage billing workspace is missing or invalid';
  end if;

  select jsonb_agg(
    case coalesce(record ->> 'recordId', '')
      when 'p250-2025' then
        record
        || jsonb_build_object(
          'recipientSalutation', 'Sehr geehrte Frau Frommer,',
          'landlordBankAccountHolder', coalesce(nullif(record ->> 'landlordName', ''), 'Nihal Könen')
        )
        || jsonb_build_object(
          'apportionableRows', (
            select jsonb_agg(
              case coalesce(cost_row ->> 'id', '')
                when 'p250-2025-grundsteuer' then cost_row || jsonb_build_object(
                  'sourceTotalCost', 15403.92,
                  'reportAllocationLabel', 'laut Bescheid'
                )
                when 'p250-2025-tiefgaragenstrom' then cost_row || jsonb_build_object(
                  'sourceTotalCost', 9018.14,
                  'reportAllocationLabel', '1 / 274 Stellplätze'
                )
                else cost_row
              end
              order by ordinality
            )
            from jsonb_array_elements(record -> 'apportionableRows') with ordinality rows(cost_row, ordinality)
          )
        )
      when 'p253-2025' then record || jsonb_build_object(
        'recipientSalutation', 'Sehr geehrte Frau Huhn,',
        'landlordBankAccountHolder', coalesce(nullif(record ->> 'landlordName', ''), 'Nihal Könen')
      )
      when 'p254-2025' then record || jsonb_build_object(
        'recipientSalutation', 'Sehr geehrte Herren Pilsl und Güzel,',
        'landlordBankAccountHolder', coalesce(nullif(record ->> 'landlordName', ''), 'Nihal Könen')
      )
      else record
    end
    order by (record ->> 'year')::integer, coalesce(record ->> 'unitCode', '')
  ) into updated_records
  from jsonb_array_elements(current_payload -> 'records') record;

  update public.apartment_billing_workspaces
  set data = jsonb_set(current_payload, '{records}', updated_records, true),
      updated_at = now()
  where object_id = 'rosenstein-str-25-tiefgarage'
    and year = 'all';

  if not exists (
    select 1
    from jsonb_array_elements(updated_records) record,
         jsonb_array_elements(record -> 'apportionableRows') row
    where record ->> 'recordId' = 'p250-2025'
      and row ->> 'id' = 'p250-2025-tiefgaragenstrom'
      and (row ->> 'sourceTotalCost')::numeric = 9018.14
  ) then
    raise exception 'P250 report metadata was not written';
  end if;
end $$;
