begin;

-- Beim Anlegen der davorliegenden Leerstaende wurden zwei spaeter beginnende
-- Anschlussvertraege irrtuemlich rueckwirkend beendet. Die IDs, Einheiten,
-- Start- und falschen Enddaten begrenzen die Reparatur eindeutig.
update public.tenant_contracts
   set end_date = null,
       status = 'active',
       updated_at = now()
 where id = '3c7992b2-36e9-4725-bfb9-b26de2242f02'
   and object_code = 'Objekt_6'
   and unit_label = 'P250'
   and start_date = date '2026-03-01'
   and end_date = date '2026-01-30'
   and is_deleted = false;

update public.tenant_contracts
   set end_date = null,
       status = 'active',
       updated_at = now()
 where id = '2ff43777-9483-48f5-ba1c-04feb31f0763'
   and object_code = 'Objekt_6'
   and unit_label = 'P254'
   and start_date = date '2026-08-01'
   and end_date = date '2026-05-30'
   and is_deleted = false;

do $$
begin
  if exists (
    select 1
      from public.tenant_contracts
     where not is_deleted
       and end_date is not null
       and start_date is not null
       and end_date < start_date
  ) then
    raise exception 'Es bestehen weiterhin Mietvertraege mit Enddatum vor Vertragsbeginn';
  end if;
end
$$;

commit;
