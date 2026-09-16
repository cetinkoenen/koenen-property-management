-- Ergänzt den Bearbeitungsstatus für jede Tiefgaragenabrechnung.
-- Bereits inhaltlich befüllte Datensätze starten als "In Arbeit"; leere
-- Vorlagen bleiben "Offen". Bestehende Freigaben bleiben erhalten.

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

  select jsonb_agg(
    record || jsonb_build_object(
      'workflowStatus',
      case
        when coalesce((record ->> 'finalized')::boolean, false) then 'Freigegeben'
        when coalesce(record ->> 'workflowStatus', '') <> '' then record ->> 'workflowStatus'
        when coalesce((record ->> 'wegStatementTotal')::numeric, 0) <> 0
          or coalesce((record ->> 'tenantPrepayments')::numeric, 0) <> 0
          or exists (
            select 1
              from jsonb_array_elements(coalesce(record -> 'apportionableRows', '[]'::jsonb)) row
             where coalesce((row ->> 'totalCost')::numeric, 0) <> 0
          ) then 'In Arbeit'
        else 'Offen'
      end
    )
    order by (record ->> 'year')::integer, coalesce(record ->> 'unitCode', '')
  ) into updated_records
  from jsonb_array_elements(current_records) record;

  update public.apartment_billing_workspaces
     set data = jsonb_set(current_payload, '{records}', updated_records, true),
         updated_at = now()
   where object_id = 'rosenstein-str-25-tiefgarage'
     and year = 'all';
end
$$;
