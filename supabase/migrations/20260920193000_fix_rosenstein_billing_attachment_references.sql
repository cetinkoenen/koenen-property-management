-- Korrigiert vertauschte Stellplatznummern und unvollstaendige E-Referenzen
-- im Anlagenverzeichnis der bereits freigegebenen TG-Abrechnungen 2025.

do $$
declare
  current_payload jsonb;
  corrected_records jsonb;
begin
  select workspace.data
    into current_payload
    from public.apartment_billing_workspaces workspace
   where workspace.object_id = 'rosenstein-str-25-tiefgarage'
     and workspace.year = 'all'
   for update;

  if current_payload is null then
    raise exception 'Zentrale Rosenstein-Tiefgaragenabrechnung fehlt';
  end if;

  select jsonb_agg(
    case record ->> 'unitCode'
      when 'P250' then record || jsonb_build_object(
        'attachmentNotes', E'WEG-Jahresabrechnung 2025\nEinzelabrechnung Tiefgaragenstellplatz P250 E008440000121\nBeleg Grundsteuer'
      )
      when 'P253' then record || jsonb_build_object(
        'attachmentNotes', E'WEG-Jahresabrechnung 2025\nEinzelabrechnung Tiefgaragenstellplatz P253 E008440000122\nBeleg Grundsteuer'
      )
      when 'P254' then record || jsonb_build_object(
        'attachmentNotes', E'WEG-Jahresabrechnung 2025\nEinzelabrechnung Tiefgaragenstellplatz P254 E008440000123\nBeleg Grundsteuer'
      )
      else record
    end
    order by record ->> 'unitCode'
  )
    into corrected_records
    from jsonb_array_elements(current_payload -> 'records') record;

  update public.apartment_billing_workspaces
     set data = jsonb_set(current_payload, '{records}', corrected_records, true),
         updated_at = now()
   where object_id = 'rosenstein-str-25-tiefgarage'
     and year = 'all';

  if exists (
    select 1
      from jsonb_array_elements(corrected_records) record
     where record ->> 'attachmentNotes' not like '%' || (record ->> 'unitCode') || '%'
        or record ->> 'attachmentNotes' not like '%E00844000012%'
  ) then
    raise exception 'Anlagenverzeichnis ist nicht konsistent mit den Rosenstein-Einheiten';
  end if;
end
$$;
