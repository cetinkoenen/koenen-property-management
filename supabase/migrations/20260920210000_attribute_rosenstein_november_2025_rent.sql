-- Die anteiligen Rosenstein-Novembermieten gingen erst am 03.12.2025 ein.
-- Der explizite Mietmonat ist die zentrale, pruefbare Zuordnung fuer
-- Mieteingang, Konsistenzpruefung, Cockpit und Berichte.

do $$
declare
  target_property_id uuid;
  p254_unit_id uuid;
begin
  update public.finance_entry
     set note = case id
       when 650 then 'P250 - E008440000121 · Mietmonat November 2025 · anteilig ab 14.11.2025'
       when 1306 then 'P253 - E008440000122 · Mietmonat November 2025 · anteilig ab 14.11.2025'
       when 1307 then 'P254 - E008440000123 · Mietmonat November 2025 · anteilig ab 14.11.2025'
       else note
     end
   where id in (650, 1306, 1307)
     and booking_date = date '2025-12-03'
     and entry_type = 'income'
     and category = 'Miete'
     and not coalesce(is_deleted, false);

  if (
    select count(*)
      from public.finance_entry
     where id in (650, 1306, 1307)
       and note ilike '%Mietmonat November 2025%'
       and not coalesce(is_deleted, false)
  ) <> 3 then
    raise exception 'Die drei anteiligen Novembermieten konnten nicht eindeutig zugeordnet werden';
  end if;

  select property.id
    into target_property_id
    from public.portfolio_properties property
   where not coalesce(property.is_test, false)
     and public.koenen_normalize_object_name(property.name) =
         public.koenen_normalize_object_name('Rosenstein Str. 25')
   order by property.created_at
   limit 1;

  select unit.id
    into p254_unit_id
    from public.portfolio_units unit
   where unit.property_id = target_property_id
     and unit.name = 'Garage 3'
     and unit.is_active
   limit 1;

  -- 81 EUR / 30 Tage * 17 Miettage (14.-30.11.) = 45,90 EUR.
  update public.portfolio_property_rentals
     set kaltmiete_laut_mietvertrag = 81,
         nebenkosten = 0,
         updated_at = now()
   where property_id = target_property_id
     and unit_id = p254_unit_id
     and start_date = date '2025-11-14'
     and end_date = date '2025-12-31';

  if not exists (
    select 1
      from public.portfolio_property_rentals
     where property_id = target_property_id
       and unit_id = p254_unit_id
       and start_date = date '2025-11-14'
       and end_date = date '2025-12-31'
       and rent_monthly = 81
       and gesamt_mietkosten = 81
  ) then
    raise exception 'P254-Mietzeitraum 2025 konnte nicht auf 81 EUR korrigiert werden';
  end if;
end
$$;
