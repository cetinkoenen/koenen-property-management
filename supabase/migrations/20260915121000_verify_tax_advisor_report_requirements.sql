-- Harte Nachpruefung der am 15.09.2026 eingespielten Stammdatenkorrektur.

do $$
begin
  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.property_mileage_trips'::regclass
      and constraint_row.conname = 'property_mileage_trips_grund_check'
      and pg_get_constraintdef(constraint_row.oid) like '%Immobilienmakler%'
      and pg_get_constraintdef(constraint_row.oid) like '%Besichtigungstermin%'
  ) then
    raise exception 'Fahrtgruende wurden nicht vollstaendig in der Datenbank freigegeben';
  end if;

  if not exists (
    select 1
    from public.tenant_contracts contract
    join public.tenant_profiles tenant on tenant.id = contract.tenant_id
    join public.properties property on property.id::text = contract.property_id
    where not contract.is_deleted
      and lower(btrim(coalesce(tenant.first_name, ''))) = 'wolfgang'
      and lower(btrim(coalesce(tenant.last_name, ''))) = 'stange'
      and public.koenen_normalize_object_name(property.name) = public.koenen_normalize_object_name('Fürther Str. 74')
      and lower(coalesce(contract.unit_label, '')) similar to '%(garage|stellplatz)%'
      and contract.total_rent is not null
      and contract.cold_rent is not null
      and contract.operating_costs is not null
      and abs(contract.cold_rent + contract.operating_costs - contract.total_rent) <= 0.01
  ) then
    raise exception 'Fuerther Garage ist nicht vollstaendig und konsistent mit Wolfgang Stange verknuepft';
  end if;
end
$$;
