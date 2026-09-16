-- Entfernt die vom Nutzer bestätigten, noch nicht erstellten leeren Vorlagen
-- P250/2026 und P250/2027 aus der zentralen TG-Abrechnungsverwaltung.

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

  select coalesce(jsonb_agg(record order by (record ->> 'year')::integer, coalesce(record ->> 'unitCode', '')), '[]'::jsonb)
    into updated_records
    from jsonb_array_elements(current_records) record
   where coalesce(record ->> 'recordId', '') not in ('p250-2026', 'p250-2027');

  if (
    select count(*)
      from jsonb_array_elements(updated_records) record
     where coalesce(record ->> 'recordId', '') in ('p250-2025', 'p253-2025', 'p254-2025')
  ) <> 3 then
    raise exception 'Die drei Abrechnungen P250/P253/P254 für 2025 müssen erhalten bleiben';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(updated_records) record
     where coalesce(record ->> 'recordId', '') in ('p250-2026', 'p250-2027')
  ) then
    raise exception 'Nicht erstellte TG-Abrechnungen 2026/2027 wurden nicht vollständig entfernt';
  end if;

  update public.apartment_billing_workspaces
     set data = jsonb_set(current_payload, '{records}', updated_records, true),
         updated_at = now()
   where object_id = 'rosenstein-str-25-tiefgarage'
     and year = 'all';
end
$$;
