-- Die Mieterakte (tenant_contracts) ist die fachliche Quelle fuer aktuelle
-- Mietverhaeltnisse. portfolio_property_rentals bleibt die daraus abgeleitete
-- Zeitreihe fuer Mietentwicklung, Leerstand und historische Auswertungen.
-- Diese Migration gleicht die beim Mieterwechsel 2026 stehen gebliebenen
-- Rosenstein-Zeitraeume einmalig mit den bestaetigten Vertraegen ab.

do $$
declare
  target_property_id uuid;
  p250_unit_id uuid;
  p253_unit_id uuid;
  p254_unit_id uuid;
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
    raise exception 'Rosenstein Garage 1 bis Garage 3 wurden nicht vollstaendig gefunden';
  end if;

  -- P250: Miriam endet im Januar; Steffen beginnt zum 01.03.2026 mit 85 EUR.
  update public.portfolio_property_rentals
     set end_date = date '2026-01-31', updated_at = now()
   where property_id = target_property_id
     and unit_id = p250_unit_id
     and start_date = date '2026-01-01';

  if not exists (
    select 1 from public.portfolio_property_rentals
     where property_id = target_property_id
       and unit_id = p250_unit_id
       and start_date = date '2026-03-01'
  ) then
    insert into public.portfolio_property_rentals (
      id, property_id, unit_id, rent_type, rent_monthly,
      kaltmiete_laut_mietvertrag, nebenkosten, start_date, end_date,
      created_at, updated_at
    ) values (
      gen_random_uuid(), target_property_id, p250_unit_id, 'MONTHLY', 85,
      85, 0, date '2026-03-01', null, now(), now()
    );
  end if;

  -- P253: Lena ist bis einschliesslich 29.09.2026 vermietet.
  update public.portfolio_property_rentals
     set end_date = date '2026-09-29', updated_at = now()
   where property_id = target_property_id
     and unit_id = p253_unit_id
     and start_date = date '2026-01-01';

  -- P254: Sebastian endet im Mai; Oemer beginnt zum 01.08.2026 mit 94 EUR.
  update public.portfolio_property_rentals
     set end_date = date '2026-05-31', updated_at = now()
   where property_id = target_property_id
     and unit_id = p254_unit_id
     and start_date = date '2026-01-01';

  if not exists (
    select 1 from public.portfolio_property_rentals
     where property_id = target_property_id
       and unit_id = p254_unit_id
       and start_date = date '2026-08-01'
  ) then
    insert into public.portfolio_property_rentals (
      id, property_id, unit_id, rent_type, rent_monthly,
      kaltmiete_laut_mietvertrag, nebenkosten, start_date, end_date,
      created_at, updated_at
    ) values (
      gen_random_uuid(), target_property_id, p254_unit_id, 'MONTHLY', 94,
      89, 5, date '2026-08-01', null, now(), now()
    );
  end if;

  if not exists (
    select 1 from public.portfolio_property_rentals
     where property_id = target_property_id and unit_id = p250_unit_id
       and start_date = date '2026-03-01' and end_date is null
       and rent_monthly = 85
  ) or not exists (
    select 1 from public.portfolio_property_rentals
     where property_id = target_property_id and unit_id = p254_unit_id
       and start_date = date '2026-08-01' and end_date is null
       and rent_monthly = 94
  ) then
    raise exception 'Aktuelle Rosenstein-Vermietungszeitraeume konnten nicht konsistent hergestellt werden';
  end if;
end
$$;
