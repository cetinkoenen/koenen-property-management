-- Koenen Property Management – Phase 5E
-- Datenprüfung & Reparatur-Center
-- Reparierte Basisversion: kein UNION-ORDER-BY-Ausdruck und keine objects.name-Abhängigkeit.
-- Phase 5F überschreibt diese Funktion anschließend mit Objekt-Alias-Normalisierung.

drop function if exists public.get_koenen_data_quality_checks(integer);

create or replace function public.get_koenen_data_quality_checks(
  p_year integer default extract(year from now())::integer
)
returns table (
  severity text,
  area text,
  property_id uuid,
  property_name text,
  issue_code text,
  detail text,
  repair_hint text,
  expected_value numeric,
  actual_value numeric,
  delta numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with master as (
    select * from public.v_property_finance_master_yearly where year = p_year
  ), consistency as (
    select * from public.get_property_finance_consistency(p_year)
  ), ledger_counts as (
    select property_id, count(*)::numeric as ledger_count
    from public.property_loan_ledger
    group by property_id
  ), checks as (
    select
      case when c.severity = 'critical' then 1 when c.severity = 'warning' then 2 else 3 end as sort_rank,
      c.severity,
      c.area,
      c.property_id,
      c.property_name,
      lower(regexp_replace(c.area, '[^a-zA-Z0-9]+', '_', 'g'))::text as issue_code,
      c.detail,
      case
        when c.area ilike '%Restschuld%' then 'Darlehens-Ledger und Portfolio-Verknüpfung prüfen; danach Materialized Views aktualisieren.'
        when c.area ilike '%Einnahmen%' then 'Buchungen/Monate prüfen und ggf. Kategorie Miete/Income oder object_id korrigieren.'
        when c.area ilike '%Ausgaben%' then 'Buchungen/Monate prüfen und ggf. Kategorie/Ausgabentyp oder object_id korrigieren.'
        else 'Datenquelle prüfen und nach Korrektur neu prüfen.'
      end as repair_hint,
      c.expected_value,
      c.actual_value,
      c.delta
    from consistency c

    union all

    select
      1,
      'critical'::text,
      'Darlehensdaten'::text,
      m.property_id,
      m.property_name,
      'missing_loan_ledger'::text,
      'Keine Darlehens-Ledgerdaten bzw. keine aktuelle Restschuld im Backend-Finanzmaster gefunden.'::text,
      'Darlehensübersicht für dieses Objekt öffnen und mindestens eine Jahreszeile im property_loan_ledger erfassen.'::text,
      null::numeric,
      coalesce(l.ledger_count, 0)::numeric,
      null::numeric
    from master m
    left join ledger_counts l on l.property_id = m.property_id or l.property_id = m.portfolio_property_id
    where coalesce(l.ledger_count, 0) = 0 or m.latest_balance is null

    union all

    select
      2,
      'warning'::text,
      'Income/Buchungen'::text,
      m.property_id,
      m.property_name,
      'missing_income_current_year'::text,
      ('Keine Einnahmen/Mieten im Backend-Finanzmaster für ' || p_year || ' gefunden.')::text,
      'Monate/Buchungen prüfen: entry_type income, Kategorie Miete, object_id und Jahr müssen korrekt sein.'::text,
      1::numeric,
      coalesce(m.income, 0)::numeric,
      null::numeric
    from master m
    where coalesce(m.income, 0) = 0 and coalesce(m.rent_income, 0) = 0

    union all

    select
      case when m.net_cashflow < 0 then 1 else 2 end,
      case when m.net_cashflow < 0 then 'critical' else 'warning' end,
      'Liquidität'::text,
      m.property_id,
      m.property_name,
      'negative_cashflow'::text,
      ('Negativer Netto-Cashflow im Jahr ' || p_year || '.')::text,
      'Ausgaben/Capex prüfen oder Finanzierung/Vermietung analysieren. Ggf. Objektbericht generieren.'::text,
      0::numeric,
      m.net_cashflow::numeric,
      m.net_cashflow::numeric
    from master m
    where coalesce(m.net_cashflow, 0) < 0
  )
  select
    severity, area, property_id, property_name, issue_code, detail, repair_hint, expected_value, actual_value, delta
  from checks
  order by sort_rank, area, property_name nulls last;
$$;

grant execute on function public.get_koenen_data_quality_checks(integer) to authenticated;
