-- P250 hatte im Januar 2026 laut bestaetigtem Vertrag noch 75 EUR.
-- Die Folgemiete von 85 EUR gilt erst fuer Steffen ab 01.03.2026.

do $$
declare
  target_property_id uuid;
  p250_unit_id uuid;
begin
  select property.id
    into target_property_id
    from public.portfolio_properties property
   where not coalesce(property.is_test, false)
     and public.koenen_normalize_object_name(property.name) =
         public.koenen_normalize_object_name('Rosenstein Str. 25')
   order by property.created_at
   limit 1;

  select unit.id
    into p250_unit_id
    from public.portfolio_units unit
   where unit.property_id = target_property_id
     and unit.name = 'Garage 1'
     and unit.is_active
   limit 1;

  update public.portfolio_property_rentals
     set kaltmiete_laut_mietvertrag = 75,
         nebenkosten = 0,
         updated_at = now()
   where property_id = target_property_id
     and unit_id = p250_unit_id
     and start_date = date '2026-01-01'
     and end_date = date '2026-01-31';

  if not exists (
    select 1
      from public.portfolio_property_rentals
     where property_id = target_property_id
       and unit_id = p250_unit_id
       and start_date = date '2026-01-01'
       and end_date = date '2026-01-31'
       and kaltmiete_laut_mietvertrag = 75
       and coalesce(nebenkosten, 0) = 0
       and gesamt_mietkosten = 75
       and rent_monthly = 75
  ) then
    raise exception 'P250 Januar 2026 konnte nicht konsistent auf 75 EUR gesetzt werden';
  end if;
end
$$;
