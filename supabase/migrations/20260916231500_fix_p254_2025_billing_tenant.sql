-- P254/2025 was rented only to Sebastian Pilsl during the billing period.
-- Correct the central billing record and reject stale multi-tenant wording.
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
    case when record ->> 'recordId' = 'p254-2025' then
      record || jsonb_build_object(
        'tenantName', 'Sebastian Pilsl',
        'recipientSalutation', 'Sehr geehrter Herr Pilsl,'
      )
    else record end
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
    from jsonb_array_elements(updated_records) record
    where record ->> 'recordId' = 'p254-2025'
      and record ->> 'tenantName' = 'Sebastian Pilsl'
      and record ->> 'recipientSalutation' = 'Sehr geehrter Herr Pilsl,'
      and coalesce(record ->> 'tenantName', '') not ilike '%Güzel%'
      and coalesce(record ->> 'recipientSalutation', '') not ilike '%Güzel%'
  ) then
    raise exception 'P254/2025 billing tenant was not corrected to Sebastian Pilsl';
  end if;
end $$;
