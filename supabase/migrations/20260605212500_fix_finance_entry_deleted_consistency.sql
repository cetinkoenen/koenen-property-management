-- Koenen Property Management: Konsistente Buchungsquellen
-- Gelöschte Buchungen dürfen in Jahres-/Mietviews nicht mehr mitgezählt werden.

create or replace view public.v_objekt_finanz_summary_jahr as
select
  fe.object_id,
  fe.objekt_code,
  fe.user_id,
  extract(year from fe.booking_date)::int as jahr,
  sum(case when fe.entry_type = 'income' then coalesce(fe.amount, 0) else 0 end)::numeric(12,2) as einnahmen,
  sum(case when fe.entry_type = 'expense' then coalesce(fe.amount, 0) else 0 end)::numeric(12,2) as ausgaben,
  sum(
    case
      when fe.entry_type = 'income'
        and lower(coalesce(fe.category, '') || ' ' || coalesce(fe.note, '')) ~
          '(miete|kaltmiete|warmmiete|monatsmiete|wohnungsmiete|garage|stellplatz|pacht)'
      then coalesce(fe.amount, 0)
      else 0
    end
  )::numeric(12,2) as mieteingaenge
from public.finance_entry fe
where fe.booking_date is not null
  and fe.object_id is not null
  and coalesce(fe.is_deleted, false) = false
group by fe.object_id, fe.objekt_code, fe.user_id, extract(year from fe.booking_date);

create or replace view public.v_mieteingaenge_monat as
with normalized as (
  select
    fe.object_id,
    fe.objekt_code,
    date_trunc(
      'month',
      case
        when extract(day from fe.booking_date)::int >= 25 then fe.booking_date + interval '1 month'
        else fe.booking_date
      end
    )::date as mietmonat,
    fe.amount,
    fe.category,
    fe.note
  from public.finance_entry fe
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

grant select on public.v_objekt_finanz_summary_jahr to authenticated;
grant select on public.v_mieteingaenge_monat to authenticated;
