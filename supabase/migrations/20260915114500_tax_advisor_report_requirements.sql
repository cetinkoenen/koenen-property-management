-- Steuerberaterreport 2026-09-15:
-- 1) zwei fachlich eindeutige Fahrtgruende erlauben;
-- 2) die Fuerther Garage deterministisch mit Wolfgang Stange verknuepfen.

alter table public.property_mileage_trips
  drop constraint if exists property_mileage_trips_grund_check;

alter table public.property_mileage_trips
  add constraint property_mileage_trips_grund_check
  check (
    grund in (
      'Handwerkertermin',
      'Eigentümerversammlung',
      'Mieterwechsel/Besichtigung',
      'Immobilienmakler',
      'Besichtigungstermin',
      'Kontrollfahrt',
      'Bank-/Notartermin'
    )
  );

do $$
declare
  target_user_id uuid;
  target_tenant_id uuid;
  target_property_id text;
  first_garage_payment date;
  current_garage_rent numeric(12,2);
  updated_contracts integer := 0;
begin
  select tp.user_id, tp.id
    into target_user_id, target_tenant_id
  from public.tenant_profiles tp
  where not tp.is_deleted
    and lower(btrim(coalesce(tp.first_name, ''))) = 'wolfgang'
    and lower(btrim(coalesce(tp.last_name, ''))) = 'stange'
  order by case when tp.status = 'active' then 0 else 1 end, tp.updated_at desc
  limit 1;

  if target_tenant_id is null then
    raise exception 'Wolfgang Stange wurde in tenant_profiles nicht eindeutig gefunden';
  end if;

  select p.id::text
    into target_property_id
  from public.properties p
  where public.koenen_normalize_object_name(p.name) = public.koenen_normalize_object_name('Fürther Str. 74')
  order by p.created_at
  limit 1;

  if target_property_id is null then
    raise exception 'Fuerther Str. 74 wurde in properties nicht gefunden';
  end if;

  update public.tenant_contracts tc
  set tenant_id = target_tenant_id,
      property_id = target_property_id,
      object_code = 'Objekt_4',
      unit_label = 'Garage',
      rent_type = coalesce(nullif(tc.rent_type, ''), 'garage'),
      updated_at = now()
  where tc.user_id = target_user_id
    and not tc.is_deleted
    and (
      tc.property_id = target_property_id
      or tc.object_code = 'Objekt_4'
      or exists (
        select 1
        from public.v_koenen_object_bridge bridge
        where bridge.property_id::text = target_property_id
          and (
            bridge.object_id::text = tc.property_id
            or bridge.objekt_code = tc.object_code
            or bridge.object_id::text = tc.object_code
          )
      )
    )
    and lower(coalesce(tc.unit_label, '')) similar to '%(garage|stellplatz)%';

  get diagnostics updated_contracts = row_count;

  if updated_contracts = 0 then
    select min(fe.booking_date),
           (array_agg(abs(fe.amount) order by fe.booking_date desc, fe.created_at desc))[1]
      into first_garage_payment, current_garage_rent
    from public.finance_entry fe
    where fe.user_id = target_user_id
      and (
        fe.object_id::text = target_property_id
        or exists (
          select 1
          from public.v_koenen_object_bridge bridge
          where bridge.property_id::text = target_property_id
            and (
              bridge.object_id = fe.object_id
              or bridge.objekt_code = fe.objekt_code
              or bridge.object_id::text = fe.objekt_code
              or bridge.property_id::text = fe.objekt_code
            )
        )
      )
      and fe.entry_type = 'income'
      and lower(coalesce(fe.category, '')) in ('miete garage', 'garage', 'stellplatz')
      and coalesce(fe.is_deleted, false) = false;

    if first_garage_payment is null or current_garage_rent is null then
      raise exception 'Fuerther Garage: kein bestehender Vertrag und keine belegte Garagenmiete als Quelle gefunden';
    end if;

    insert into public.tenant_contracts (
      user_id, tenant_id, property_id, object_code, unit_label, rent_type,
      cold_rent, operating_costs, total_rent, start_date, status, notes
    ) values (
      target_user_id, target_tenant_id, target_property_id, 'Objekt_4', 'Garage', 'garage',
      current_garage_rent, 0, current_garage_rent, first_garage_payment, 'active',
      'Zentrale Mieterzuordnung aus belegten Garagen-Mieteingaengen; korrigiert am 15.09.2026.'
    );
  end if;
end
$$;
