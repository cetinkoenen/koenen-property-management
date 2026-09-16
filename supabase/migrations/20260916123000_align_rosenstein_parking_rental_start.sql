-- Einheitlicher, bestätigter Mietbeginn für die drei Rosenstein-TG-Stellplätze.
-- Diese zentrale Vermietungsquelle versorgt Mieteingang, Mietentwicklung,
-- Leerstand, Immobilienvermögen und die Berichte.

do $$
declare
  target_property_id uuid;
  p250_unit_id uuid;
  p253_unit_id uuid;
  p254_unit_id uuid;
  current_payload jsonb;
  updated_records jsonb;
begin
  select property.id
    into target_property_id
    from public.portfolio_properties property
   where not coalesce(property.is_test, false)
     and public.koenen_normalize_object_name(property.name) =
         public.koenen_normalize_object_name('Rosenstein Str. 25')
   order by property.created_at
   limit 1;

  if target_property_id is null then
    raise exception 'Rosenstein Str. 25 wurde in portfolio_properties nicht gefunden';
  end if;

  select unit.id into p250_unit_id
    from public.portfolio_units unit
   where unit.property_id = target_property_id and unit.name = 'Garage 1' and unit.is_active
   limit 1;
  select unit.id into p253_unit_id
    from public.portfolio_units unit
   where unit.property_id = target_property_id and unit.name = 'Garage 2' and unit.is_active
   limit 1;
  select unit.id into p254_unit_id
    from public.portfolio_units unit
   where unit.property_id = target_property_id and unit.name = 'Garage 3' and unit.is_active
   limit 1;

  if p250_unit_id is null or p253_unit_id is null or p254_unit_id is null then
    raise exception 'Die drei aktiven Rosenstein-TG-Einheiten Garage 1 bis Garage 3 wurden nicht vollständig gefunden';
  end if;

  update public.portfolio_property_rentals rental
     set start_date = date '2025-11-14',
         updated_at = now()
   where rental.property_id = target_property_id
     and rental.unit_id in (p250_unit_id, p253_unit_id, p254_unit_id)
     and rental.start_date = date '2025-11-19'
     and rental.end_date = date '2025-12-31';

  -- P250 fehlte für 2025 in der zentralen Einheiten-Vermietung. Die Monatsmiete
  -- 75 EUR wird durch die vorhandene November-Zahlung 42,50 EUR bestätigt:
  -- 75 EUR * 17/30 Tage (14.-30.11.) = 42,50 EUR.
  if not exists (
    select 1
      from public.portfolio_property_rentals rental
     where rental.property_id = target_property_id
       and rental.unit_id = p250_unit_id
       and rental.start_date <= date '2025-12-31'
       and coalesce(rental.end_date, date '9999-12-31') >= date '2025-11-14'
  ) then
    insert into public.portfolio_property_rentals (
      id, property_id, unit_id, rent_type, rent_monthly,
      start_date, end_date, created_at, updated_at
    ) values (
      gen_random_uuid(), target_property_id, p250_unit_id, 'MONTHLY', 75,
      date '2025-11-14', date '2025-12-31', now(), now()
    );
  end if;

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
      when (record ->> 'year')::integer = 2025 then
        record || jsonb_build_object(
          'periodFrom', '2025-11-14',
          'periodTo', '2025-12-31',
          'footerNote', 'Entwurf auf Grundlage der WEG-Abrechnung 2025. Der bestätigte Miet- und Abrechnungsbeginn für P250 ist der 14.11.2025; der Zeitraum bis 31.12.2025 umfasst 48 Tage. Vor Versand ist die mietvertragliche Umlagevereinbarung zu prüfen.',
          'apportionableRows', jsonb_build_array(
            jsonb_build_object(
              'id', 'p250-2025-grundsteuer',
              'label', 'Grundsteuer',
              'totalCost', 1.11,
              'key', 'Direktbetrag',
              'totalUnits', null,
              'yourUnits', null,
              'note', 'Mieteranteil laut WEG-Abrechnung für 14.11.-31.12.2025 (48 Tage)'
            ),
            jsonb_build_object(
              'id', 'p250-2025-tiefgaragenstrom',
              'label', 'Tiefgaragenstrom',
              'totalCost', 4.33,
              'key', 'Direktbetrag',
              'totalUnits', null,
              'yourUnits', null,
              'note', 'Mieteranteil laut WEG-Abrechnung für 14.11.-31.12.2025 (48 Tage)'
            )
          )
        )
      else record
    end
    order by (record ->> 'year')::integer
  ) into updated_records
  from jsonb_array_elements(current_payload -> 'records') record;

  update public.apartment_billing_workspaces workspace
     set data = jsonb_set(current_payload, '{records}', updated_records, true),
         updated_at = now()
   where workspace.object_id = 'rosenstein-str-25-tiefgarage'
     and workspace.year = 'all';

  if (
    select count(*)
      from public.portfolio_property_rentals rental
     where rental.property_id = target_property_id
       and rental.unit_id in (p250_unit_id, p253_unit_id, p254_unit_id)
       and rental.start_date = date '2025-11-14'
       and rental.end_date = date '2025-12-31'
  ) <> 3 then
    raise exception 'Nicht alle drei Rosenstein-Stellplätze beginnen am 14.11.2025';
  end if;

  if (
    select round(sum((row ->> 'totalCost')::numeric), 2)
      from jsonb_array_elements(updated_records) record,
           jsonb_array_elements(record -> 'apportionableRows') row
     where (record ->> 'year')::integer = 2025
  ) <> 5.44 then
    raise exception 'P250-Mieterabrechnung 2025 ist nicht 5,44 EUR';
  end if;
end
$$;
