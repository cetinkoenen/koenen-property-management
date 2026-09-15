-- Die separat gebuchte Kategorie Mietbestandteil-NK ist Bestandteil der
-- Hohenloher-Gesamtmiete und muss in derselben Monatsquelle enthalten sein.

create or replace view public.v_mieteingaenge_monat
with (security_invoker = true)
as
with normalized as (
  select
    fe.object_id,
    fe.objekt_code,
    date_trunc(
      'month',
      case
        when extract(day from fe.booking_date)::int >=
          case
            when public.koenen_normalize_object_name(coalesce(bridge.property_name, fe.objekt_code, '')) =
              public.koenen_normalize_object_name('Hohenloher Str. 78')
            then 21
            else 25
          end
        then fe.booking_date + interval '1 month'
        else fe.booking_date
      end
    )::date as mietmonat,
    fe.amount,
    fe.category,
    fe.note
  from public.finance_entry fe
  left join public.v_koenen_object_bridge bridge on bridge.object_id = fe.object_id
  where fe.entry_type = 'income'
    and fe.booking_date is not null
    and fe.object_id is not null
    and coalesce(fe.is_deleted, false) = false
)
select
  object_id,
  objekt_code,
  mietmonat,
  coalesce(
    sum(
      case
        when lower(coalesce(category, '') || ' ' || coalesce(note, '')) ~
          '(miete|mietbestandteil[- _]?nk|kaltmiete|warmmiete|monatsmiete|wohnungsmiete|garage|stellplatz|pacht)'
        then coalesce(amount, 0)
        else 0
      end
    ),
    0
  )::numeric(12,2) as mieteingang_summe
from normalized
group by object_id, objekt_code, mietmonat;

grant select on public.v_mieteingaenge_monat to authenticated;

do $$
declare
  target_object_id uuid;
  expected_row record;
  actual_amount numeric(12,2);
begin
  select bridge.object_id
  into target_object_id
  from public.v_koenen_object_bridge bridge
  where public.koenen_normalize_object_name(bridge.property_name) = public.koenen_normalize_object_name('Hohenloher Str. 78')
  order by bridge.object_id
  limit 1;

  for expected_row in
    select *
    from (values
      (date '2025-04-01', 1690.00::numeric),
      (date '2025-05-01', 1690.00::numeric),
      (date '2025-06-01', 1690.00::numeric),
      (date '2025-07-01', 1960.00::numeric),
      (date '2025-08-01', 1960.00::numeric),
      (date '2025-09-01', 1960.00::numeric),
      (date '2025-10-01', 1960.00::numeric),
      (date '2025-11-01', 1960.00::numeric),
      (date '2025-12-01', 1960.00::numeric),
      (date '2026-01-01', 1960.00::numeric),
      (date '2026-02-01', 1960.00::numeric),
      (date '2026-03-01', 1960.00::numeric),
      (date '2026-04-01', 1960.00::numeric),
      (date '2026-05-01', 1960.00::numeric),
      (date '2026-06-01', 1960.00::numeric),
      (date '2026-07-01', 1960.00::numeric),
      (date '2026-08-01', 1960.00::numeric),
      (date '2026-09-01', 1960.00::numeric)
    ) as expected(mietmonat, amount)
  loop
    select monthly.mieteingang_summe
    into actual_amount
    from public.v_mieteingaenge_monat monthly
    where monthly.object_id = target_object_id
      and monthly.mietmonat = expected_row.mietmonat;

    if actual_amount is distinct from expected_row.amount then
      raise exception 'Hohenloher %: erwartet %, gefunden %', expected_row.mietmonat, expected_row.amount, actual_amount;
    end if;
  end loop;
end
$$;
