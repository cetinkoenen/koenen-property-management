-- Fügt jeder bestehenden TG-Abrechnung ein eigenes Freitextfeld für die mit
-- dem Mieter-Onepager versendeten Anlagen und Nachweise hinzu.

do $$
declare
  current_payload jsonb;
  updated_records jsonb;
begin
  select workspace.data
    into current_payload
    from public.apartment_billing_workspaces workspace
   where workspace.object_id = 'rosenstein-str-25-tiefgarage'
     and workspace.year = 'all'
   for update;

  if current_payload is null then
    raise exception 'Zentrale Tiefgaragenabrechnung rosenstein-str-25-tiefgarage/all fehlt';
  end if;

  select jsonb_agg(
           case
             when record ? 'attachmentNotes' then record
             else record || jsonb_build_object('attachmentNotes', '')
           end
           order by (record ->> 'year')::integer, record ->> 'unitCode'
         )
    into updated_records
    from jsonb_array_elements(current_payload -> 'records') record;

  update public.apartment_billing_workspaces workspace
     set data = jsonb_set(current_payload, '{records}', updated_records, true),
         updated_at = now()
   where workspace.object_id = 'rosenstein-str-25-tiefgarage'
     and workspace.year = 'all';

  if exists (
    select 1
      from jsonb_array_elements(updated_records) record
     where not (record ? 'attachmentNotes')
  ) then
    raise exception 'Nicht alle TG-Abrechnungen besitzen das Feld attachmentNotes';
  end if;
end
$$;
