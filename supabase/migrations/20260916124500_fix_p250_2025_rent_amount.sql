-- Der Tabellen-Trigger berechnet rent_monthly aus den Mietkomponenten.
-- Deshalb werden für P250 2025 alle vier Betragsfelder konsistent gesetzt.
-- Der bisherige Unique-Key ließ unit_id aus und blockierte dadurch zwei
-- Stellplätze mit gleicher Miete im gleichen Zeitraum.
alter table public.portfolio_property_rentals
  drop constraint if exists unique_rental_period;

drop index if exists public.unique_rental_period;

alter table public.portfolio_property_rentals
  add constraint unique_rental_period
  unique (property_id, unit_id, start_date, end_date, rent_monthly, rent_type);

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

  update public.portfolio_property_rentals rental
     set kaltmiete_laut_mietvertrag = 75,
         nebenkosten = 0,
         updated_at = now()
   where rental.property_id = target_property_id
     and rental.unit_id = p250_unit_id
     and rental.start_date = date '2025-11-14'
     and rental.end_date = date '2025-12-31';

  if not exists (
    select 1
      from public.portfolio_property_rentals rental
     where rental.property_id = target_property_id
       and rental.unit_id = p250_unit_id
       and rental.start_date = date '2025-11-14'
       and rental.end_date = date '2025-12-31'
       and rental.kaltmiete_laut_mietvertrag = 75
       and coalesce(rental.nebenkosten, 0) = 0
       and rental.gesamt_mietkosten = 75
       and rental.rent_monthly = 75
  ) then
    raise exception 'P250-Mietzeitraum 2025 ist nicht vollständig mit 75 EUR gespeichert';
  end if;
end
$$;
