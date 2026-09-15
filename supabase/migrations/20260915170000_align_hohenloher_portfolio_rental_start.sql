-- Hohenloher Str. 78: den veralteten Portfolio-Vermietungsbeginn an die
-- fachlich fuehrenden Mietquellen (Mietanpassung und Mietvertrag) angleichen.
-- Der Mietbeginn ist der 01.04.2025; Maerz 2025 muss deshalb neutral bleiben.

update public.portfolio_property_rentals rental
set start_date = date '2025-04-01',
    updated_at = now()
from public.portfolio_properties property
where property.id = rental.property_id
  and not coalesce(property.is_test, false)
  and public.koenen_normalize_object_name(property.name) =
      public.koenen_normalize_object_name('Hohenloher Str. 78')
  and rental.start_date = date '2025-03-01'
  and rental.end_date is null
  and rental.rent_monthly = 1960.00;

do $$
declare
  target_property_id uuid;
begin
  select property.id
  into target_property_id
  from public.portfolio_properties property
  where not coalesce(property.is_test, false)
    and public.koenen_normalize_object_name(property.name) =
        public.koenen_normalize_object_name('Hohenloher Str. 78')
  order by property.created_at
  limit 1;

  if target_property_id is null then
    raise exception 'Hohenloher Str. 78 wurde in portfolio_properties nicht gefunden';
  end if;

  if exists (
    select 1
    from public.portfolio_property_rentals rental
    where rental.property_id = target_property_id
      and rental.end_date is null
      and rental.start_date < date '2025-04-01'
  ) then
    raise exception 'Hohenloher-Portfolio-Vermietung beginnt weiterhin vor dem 01.04.2025';
  end if;

  if not exists (
    select 1
    from public.portfolio_property_rentals rental
    where rental.property_id = target_property_id
      and rental.start_date = date '2025-04-01'
      and rental.end_date is null
      and rental.rent_monthly = 1960.00
  ) then
    raise exception 'Hohenloher-Portfolio-Vermietung wurde nicht eindeutig auf den 01.04.2025 gesetzt';
  end if;
end
$$;
