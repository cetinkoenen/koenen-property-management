-- Pro Jahr und Stellplatz wird eine eigene editierbare TG-Abrechnung geführt.
-- P250 bleibt vollständig erhalten; P253 und P254 werden für 2025 mit derselben
-- Berechnungsstruktur und leeren Betragsfeldern vorbereitet.

do $$
declare
  current_payload jsonb;
  next_records jsonb;
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

  with existing as (
    select record,
           (record ->> 'year')::integer as billing_year,
           case
             when concat_ws(' ', record ->> 'unitCode', record ->> 'unitLabel', record ->> 'propertyLabel') ilike '%P253%' then 'P253'
             when concat_ws(' ', record ->> 'unitCode', record ->> 'unitLabel', record ->> 'propertyLabel') ilike '%P254%' then 'P254'
             else 'P250'
           end as unit_code
      from jsonb_array_elements(current_payload -> 'records') record
  ), normalized as (
    select record || jsonb_build_object(
             'recordId', lower(unit_code) || '-' || billing_year,
             'unitCode', unit_code
           ) as record,
           billing_year,
           unit_code
      from existing
  ), prepared as (
    select normalized.record, normalized.billing_year, normalized.unit_code
      from normalized
    union all
    select jsonb_build_object(
      'recordId', lower(template.unit_code) || '-2025',
      'unitCode', template.unit_code,
      'year', 2025,
      'finalized', false,
      'finalizedAt', '',
      'propertyLabel', 'Rosenstein Str. 25 · ' || template.unit_code || ' · ' || template.reference,
      'unitLabel', 'Tiefgaragenstellplatz ' || template.unit_code,
      'periodFrom', '2025-11-14',
      'periodTo', '2025-12-31',
      'monthlyHausgeld', 0,
      'tenantPrepayments', 0,
      'landlordName', 'Nihal Könen',
      'landlordAddress', E'Hohenloher Str. 78/1\n74243 Langenbrettach',
      'tenantName', template.tenant_name,
      'tenantAddress', template.tenant_address,
      'totalUnits', 1,
      'yourUnits', 1,
      'footerNote', 'Vorbereitete Abrechnung für ' || template.unit_code || ' auf Grundlage des bestätigten Mietbeginns 14.11.2025. Bitte die Beträge aus der zugehörigen WEG-Abrechnung eintragen und vor Versand die mietvertragliche Umlagevereinbarung prüfen.',
      'wegStatementPeriodFrom', '2025-11-14',
      'wegStatementPeriodTo', '2025-12-31',
      'wegStatementTotal', 0,
      'wegOwnerPrepayments', 0,
      'wegOwnerSettlement', 0,
      'wegOwnerSettlementStatus', 'open',
      'wegOwnerSettlementPaidAt', '',
      'wegApportionableTotal', 0,
      'wegNonApportionableTotal', 0,
      'wegReserveTotal', 0,
      'section35aLaborShare', 0,
      'apportionableRows', jsonb_build_array(
        jsonb_build_object('id', lower(template.unit_code) || '-2025-grundsteuer', 'label', 'Grundsteuer', 'totalCost', 0, 'key', 'Direktbetrag', 'totalUnits', null, 'yourUnits', null, 'note', 'Betrag aus der WEG-Abrechnung eintragen'),
        jsonb_build_object('id', lower(template.unit_code) || '-2025-tiefgaragenstrom', 'label', 'Tiefgaragenstrom', 'totalCost', 0, 'key', 'Direktbetrag', 'totalUnits', null, 'yourUnits', null, 'note', 'Betrag aus der WEG-Abrechnung eintragen')
      ),
      'nonApportionableRows', jsonb_build_array(
        jsonb_build_object('id', lower(template.unit_code) || '-2025-verwalter', 'label', 'Verwaltergebühr Garage', 'totalCost', 0, 'key', 'Direktbetrag', 'totalUnits', null, 'yourUnits', null, 'note', 'Nicht umlagefähig; interne Eigentümer-Sicht'),
        jsonb_build_object('id', lower(template.unit_code) || '-2025-instandhaltung', 'label', 'Laufende Instandhaltung', 'totalCost', 0, 'key', 'Direktbetrag', 'totalUnits', null, 'yourUnits', null, 'note', 'Nicht umlagefähig; interne Eigentümer-Sicht'),
        jsonb_build_object('id', lower(template.unit_code) || '-2025-administration', 'label', 'Administrative Kosten', 'totalCost', 0, 'key', 'Direktbetrag', 'totalUnits', null, 'yourUnits', null, 'note', 'Nicht umlagefähig; interne Eigentümer-Sicht')
      )
    ), 2025, template.unit_code
      from (values
        ('P253', 'E008440000122', 'Lena Huhn', E'Rosensteinstr. 25\n70191 Stuttgart'),
        ('P254', 'E008440000123', 'Sebastian Pilsl', E'Rosensteinstr. 25\n70191 Stuttgart')
      ) as template(unit_code, reference, tenant_name, tenant_address)
     where not exists (
       select 1 from normalized
        where normalized.billing_year = 2025
          and normalized.unit_code = template.unit_code
     )
  )
  select jsonb_agg(prepared.record order by prepared.billing_year, prepared.unit_code)
    into next_records
    from prepared;

  update public.apartment_billing_workspaces workspace
     set data = jsonb_set(current_payload, '{records}', next_records, true),
         updated_at = now()
   where workspace.object_id = 'rosenstein-str-25-tiefgarage'
     and workspace.year = 'all';

  if (
    select count(*)
      from jsonb_array_elements(next_records) record
     where (record ->> 'year')::integer = 2025
       and record ->> 'unitCode' in ('P250', 'P253', 'P254')
  ) <> 3 then
    raise exception 'Die drei TG-Abrechnungen P250, P253 und P254 für 2025 wurden nicht vollständig vorbereitet';
  end if;
end
$$;
