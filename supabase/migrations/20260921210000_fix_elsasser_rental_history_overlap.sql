-- Elsasser Str. 52: Die zentrale Vermietungszeitreihe enthaelt bereits die
-- bestaetigte Erhoehung auf 620 EUR ab 01.10.2025. Der vorherige Zeitraum
-- darf deshalb nicht parallel bis in den November laufen.

do $$
declare
  target_property_id uuid;
begin
  select property.id
    into target_property_id
    from public.portfolio_properties property
   where not coalesce(property.is_test,false)
     and public.koenen_normalize_object_name(property.name) = public.koenen_normalize_object_name('Elsasser Str. 52')
   order by property.created_at
   limit 1;

  if target_property_id is null then
    raise exception 'Elsasser Str. 52 wurde in portfolio_properties nicht gefunden';
  end if;

  update public.portfolio_property_rentals
     set end_date = date '2025-09-29', updated_at = now()
   where property_id = target_property_id
     and start_date = date '2024-10-01'
     and end_date = date '2025-11-16'
     and kaltmiete_laut_mietvertrag = 530.00
     and nebenkosten = 80.00
     and coalesce(gesamt_mietkosten,rent_monthly) = 610.00;

  if not exists (
    select 1 from public.portfolio_property_rentals
     where property_id = target_property_id
       and start_date = date '2024-10-01' and end_date = date '2025-09-29'
       and kaltmiete_laut_mietvertrag = 530.00 and nebenkosten = 80.00
       and coalesce(gesamt_mietkosten,rent_monthly) = 610.00
  ) or not exists (
    select 1 from public.portfolio_property_rentals
     where property_id = target_property_id
       and start_date = date '2025-10-01' and end_date = date '2025-11-17'
       and kaltmiete_laut_mietvertrag = 540.00 and nebenkosten = 80.00
       and coalesce(gesamt_mietkosten,rent_monthly) = 620.00
  ) or not exists (
    select 1 from public.portfolio_property_rentals
     where property_id = target_property_id
       and start_date = date '2025-11-18' and end_date is null
       and kaltmiete_laut_mietvertrag = 550.00 and nebenkosten = 110.00
       and coalesce(gesamt_mietkosten,rent_monthly) = 660.00
  ) then
    raise exception 'Elsasser-Mietfolge 610/620/660 EUR konnte nicht eindeutig hergestellt werden';
  end if;

  if exists (
    select 1
      from public.portfolio_property_rentals left_period
      join public.portfolio_property_rentals right_period
        on right_period.property_id = left_period.property_id
       and right_period.unit_id is not distinct from left_period.unit_id
       and right_period.id > left_period.id
       and right_period.start_date <= coalesce(left_period.end_date,date '9999-12-31')
       and left_period.start_date <= coalesce(right_period.end_date,date '9999-12-31')
     where left_period.property_id = target_property_id
  ) then
    raise exception 'Elsasser-Vermietungszeitraeume ueberlappen weiterhin';
  end if;
end
$$;
