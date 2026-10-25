-- Colmarer Str. 45: Kündigung zum 01.02.2027 bedeutet letzter Vertragstag
-- 31.01.2027 und Leerstand ab 01.02.2027. Die drei zentralen Zeitquellen
-- werden auf denselben Stichtag geschlossen.

do $$
declare
  core_id uuid;
  portfolio_id uuid;
begin
  select object_id
    into core_id
    from public.v_object_dropdown
   where public.koenen_normalize_object_name(label) = public.koenen_normalize_object_name('Colmarer Str. 45')
   limit 1;

  select id
    into portfolio_id
    from public.portfolio_properties
   where public.koenen_normalize_object_name(name) = public.koenen_normalize_object_name('Colmarer Str. 45')
     and not coalesce(is_test, false)
   order by created_at
   limit 1;

  if core_id is null or portfolio_id is null then
    raise exception 'Colmarer Str. 45 wurde nicht eindeutig aufgelöst';
  end if;

  update public.tenant_contracts
     set end_date = date '2027-01-31',
         status = 'active',
         updated_at = now()
   where id = 'e7179ff9-61ca-4ebc-940c-29507994e7eb'::uuid
     and property_id::text = core_id::text
     and start_date = date '2025-08-01'
     and not coalesce(is_deleted, false);

  update public.portfolio_property_rentals
     set end_date = date '2027-01-31',
         updated_at = now()
   where id = '9a123ec0-6f7b-4ca9-bfce-901290f8bfc7'::uuid
     and property_id::text = portfolio_id::text
     and start_date = date '2025-08-01';

  update public.rent_adjustments
     set effective_end_date = date '2027-01-31',
         updated_at = now()
   where id = '36e6135a-d4a8-4cd8-96ca-b0eaf5ece1ac'::uuid
     and property_id::text = core_id::text
     and effective_date = date '2025-08-01'
     and not coalesce(is_deleted, false);

  if not exists (
    select 1 from public.tenant_contracts
     where id = 'e7179ff9-61ca-4ebc-940c-29507994e7eb'::uuid
       and end_date = date '2027-01-31'
  ) or not exists (
    select 1 from public.portfolio_property_rentals
     where id = '9a123ec0-6f7b-4ca9-bfce-901290f8bfc7'::uuid
       and end_date = date '2027-01-31'
  ) or not exists (
    select 1 from public.rent_adjustments
     where id = '36e6135a-d4a8-4cd8-96ca-b0eaf5ece1ac'::uuid
       and effective_end_date = date '2027-01-31'
  ) or not exists (
    select 1 from public.unit_vacancies
     where property_id::text = core_id::text
       and start_date = date '2027-02-01'
       and status <> 'ended'
       and not coalesce(is_deleted, false)
  ) then
    raise exception 'Colmarer-Kündigung konnte nicht vollständig synchronisiert werden';
  end if;
end
$$;
