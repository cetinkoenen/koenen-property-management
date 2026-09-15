-- Rosenstein Str. 25: Der belegte Vermietungszeitraum beginnt am 19.11.2025.
-- Die beiden historischen November-Zeiträume waren nur auf Monatsanfang
-- normalisiert. Das führte dazu, dass frühere Monate als fehlende Miete statt
-- als neutrale Vorperiode erschienen.

update public.portfolio_property_rentals rental
set start_date = date '2025-11-19',
    updated_at = now()
from public.portfolio_properties property
where property.id = rental.property_id
  and not coalesce(property.is_test, false)
  and public.koenen_normalize_object_name(property.name) =
      public.koenen_normalize_object_name('Rosenstein Str. 25')
  and rental.start_date = date '2025-11-01'
  and rental.end_date = date '2025-12-31';

do $$
declare
  target_property_id uuid;
  first_rental_start date;
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

  select min(rental.start_date)
  into first_rental_start
  from public.portfolio_property_rentals rental
  where rental.property_id = target_property_id;

  if first_rental_start is distinct from date '2025-11-19' then
    raise exception 'Rosenstein-Vermietungsbeginn ist %, erwartet wurde 2025-11-19', first_rental_start;
  end if;

  if exists (
    select 1
    from public.portfolio_property_rentals rental
    where rental.property_id = target_property_id
      and rental.start_date < date '2025-11-19'
  ) then
    raise exception 'Rosenstein enthält weiterhin einen Vermietungszeitraum vor dem 19.11.2025';
  end if;
end
$$;
