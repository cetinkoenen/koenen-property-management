-- Eindeutige historische Ueberlappungen schliessen: Der jeweils folgende,
-- bereits gespeicherte Mietzeitraum ersetzt ab seinem Beginn den vorherigen.
-- Betraege und Startdaten bleiben unveraendert.

update public.portfolio_property_rentals
   set end_date = date '2019-12-31', updated_at = now()
 where id = '2997038c-9208-4c8d-8b43-a3e1a2d11431'
   and start_date = date '2019-09-01' and end_date = date '2020-12-31'
   and coalesce(gesamt_mietkosten,rent_monthly) = 50.00;

update public.portfolio_property_rentals
   set end_date = date '2021-09-30', updated_at = now()
 where id = 'f8a251ec-5737-4c11-a612-9619619f3aae'
   and start_date = date '2020-10-01' and end_date = date '2021-12-30'
   and coalesce(gesamt_mietkosten,rent_monthly) = 575.00;

update public.portfolio_property_rentals
   set end_date = date '2023-05-31', updated_at = now()
 where id = '9cced394-bb84-4cff-b35e-e0486bfb10d7'
   and start_date = date '2021-09-01' and end_date = date '2024-07-30'
   and coalesce(gesamt_mietkosten,rent_monthly) = 60.00;

do $$
begin
  if not exists (
    select 1 from public.portfolio_property_rentals
     where id = '2997038c-9208-4c8d-8b43-a3e1a2d11431' and end_date = date '2019-12-31'
  ) or not exists (
    select 1 from public.portfolio_property_rentals
     where id = 'f8a251ec-5737-4c11-a612-9619619f3aae' and end_date = date '2021-09-30'
  ) or not exists (
    select 1 from public.portfolio_property_rentals
     where id = '9cced394-bb84-4cff-b35e-e0486bfb10d7' and end_date = date '2023-05-31'
  ) then
    raise exception 'Historische Mietzeitraeume konnten nicht eindeutig geschlossen werden';
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
  ) then
    raise exception 'Es bestehen weiterhin ueberlappende Vermietungszeitraeume';
  end if;
end
$$;
