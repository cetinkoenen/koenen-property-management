-- Hohenloher Str. 78: belegter Mietzahlungsbeginn 01.04.2025.
-- Die Zahlungen erfolgen jeweils ab dem 21. des Vormonats für den Folgemonat.

update public.tenant_contracts contract
set start_date = date '2025-04-01',
    updated_at = now()
from public.v_koenen_object_bridge bridge
where bridge.object_id::text = contract.property_id
  and public.koenen_normalize_object_name(bridge.property_name) = public.koenen_normalize_object_name('Hohenloher Str. 78')
  and not contract.is_deleted
  and contract.start_date = date '2025-03-01';

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
          '(miete|kaltmiete|warmmiete|monatsmiete|wohnungsmiete|garage|stellplatz|pacht)'
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
begin
  select bridge.object_id
  into target_object_id
  from public.v_koenen_object_bridge bridge
  where public.koenen_normalize_object_name(bridge.property_name) = public.koenen_normalize_object_name('Hohenloher Str. 78')
  order by bridge.object_id
  limit 1;

  if target_object_id is null then
    raise exception 'Hohenloher Str. 78 wurde nicht über v_koenen_object_bridge gefunden';
  end if;

  if exists (
    select 1
    from public.tenant_contracts contract
    where contract.property_id = target_object_id::text
      and not contract.is_deleted
      and contract.status <> 'vacant'
      and contract.start_date < date '2025-04-01'
  ) then
    raise exception 'Hohenloher-Mietvertrag beginnt weiterhin vor dem 01.04.2025';
  end if;

  if exists (
    select 1
    from public.v_mieteingaenge_monat monthly
    where monthly.object_id = target_object_id
      and monthly.mietmonat < date '2025-04-01'
      and monthly.mieteingang_summe <> 0
  ) then
    raise exception 'Hohenloher enthält weiterhin einen Mieteingang vor April 2025';
  end if;

  if not exists (
    select 1
    from public.v_mieteingaenge_monat monthly
    where monthly.object_id = target_object_id
      and monthly.mietmonat = date '2025-04-01'
      and monthly.mieteingang_summe = 1690.00
  ) then
    raise exception 'Hohenloher-Aprilmiete 2025 wurde nicht eindeutig mit 1.690,00 EUR zugeordnet';
  end if;
end
$$;
