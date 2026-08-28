-- Phase 4: P250 Rosenstein ist ausschließlich im Februar 2026 leer.
-- Der vorherige Vertrag endet am 31.01.2026, der Folgevertrag beginnt am 01.03.2026.

update public.unit_vacancies
set start_date = '2026-02-01'::date,
    updated_at = now()
where id = 'c29ff409-9f08-411d-a7fd-f8257b455869'::uuid
  and object_code = 'Objekt_6'
  and unit_label = 'P250'
  and start_date = '2026-01-01'::date
  and end_date = '2026-02-28'::date
  and not is_deleted;
