-- =========================================================
-- Koenen Property Management · Phase 5G Full Repair FIXED
-- Zweck:
--   - trennt sauber objects.id (Buchungen) und properties.id (Objektakte/Loans/Dokumente)
--   - stellt kompatible Backend-Views/RPCs für Auswertung, BI, Risikoampel,
--     Single Source, Archiv und Objekt-Jahresübersicht bereit
--   - vermeidet FK-Fehler bei finance_entry und entries
-- =========================================================

-- 0) Bridge: objects.id <-> properties.id
create or replace view public.v_koenen_object_bridge as
select *
from (
  values
    ('Lilienthaler Str. 54'::text, 'Objekt_1'::text, '4e866825-b3bf-4a2e-9cec-c19c8eb6208b'::uuid, '92576004-0753-4775-850a-e2e47c1b3cb5'::uuid),
    ('Elsasser Str. 52'::text,     'Objekt_2'::text, '5db6fcc3-6419-4fb1-a03f-087dc16383cc'::uuid, 'f8a86965-07e4-4b6a-a97a-779dbe97a3fd'::uuid),
    ('Colmarer Str. 45'::text,     'Objekt_3'::text, 'b82595e7-bf6d-4303-a693-775f490e0283'::uuid, '7840e179-1972-4e74-b0a6-e1e352604ef5'::uuid),
    ('Fürther Str. 74'::text,      'Objekt_4'::text, '50ec410b-1489-4ef2-a885-d6d8c508bdc0'::uuid, '32762b8b-e205-486f-af7b-909dc1c90a8d'::uuid),
    ('Hohenloher Str. 78'::text,   'Objekt_5'::text, '6b3098ff-5b26-4ccb-b6b5-3fb008f47be9'::uuid, '89c29135-d3ab-43dd-9743-3f7fba284d93'::uuid),
    ('Rosenstein Str. 25'::text,   'Objekt_6'::text, 'd982b7f2-6fa7-408a-8ce7-6ccc43ff6f59'::uuid, '3b6df919-fdf2-439d-abab-9646b2ad1d76'::uuid)
) as x(property_name, objekt_code, object_id, property_id);

-- 1) Korrekte Zuordnung in Buchungstabellen sicherstellen
-- finance_entry.object_id -> objects.id
update public.finance_entry f
set object_id = b.object_id,
    objekt_code = b.objekt_code
from public.v_koenen_object_bridge b
where f.object_id = b.property_id;

-- entries.property_id -> objects.id (trotz Spaltenname verweist FK auf objects.id)
update public.entries e
set property_id = b.object_id
from public.v_koenen_object_bridge b
where e.property_id = b.property_id;

-- 2) Objekt-Dropdown: kompatibel mit alten Frontend-/RPC-Erwartungen
-- enthält value/label UND objekt_code/object_id/property_id
create or replace view public.v_object_dropdown as
select
  b.property_id::text as value,
  b.property_name as label,
  b.objekt_code,
  b.object_id,
  b.property_id
from public.v_koenen_object_bridge b
join public.properties p on p.id = b.property_id
join public.objects o on o.id = b.object_id
where coalesce(p.is_test, false) = false
order by b.objekt_code;

-- 3) Finanzmaster View
-- Berechnet Einnahmen/Ausgaben aus finance_entry (objects.id) und verknüpft
-- Darlehen/Dokumente/Stammdaten über properties.id.
drop view if exists public.v_property_finance_master_yearly cascade;

create view public.v_property_finance_master_yearly as
with years as (
  select generate_series(2016, extract(year from current_date)::int + 1)::int as year
),
booking_by_year as (
  select
    b.property_id,
    extract(year from f.booking_date)::int as year,
    sum(case when lower(coalesce(f.entry_type,'')) in ('income','einnahme') or lower(coalesce(f.category,'')) like '%miete%'
             then coalesce(f.amount,0)::numeric else 0::numeric end) as income,
    sum(case when lower(coalesce(f.entry_type,'')) in ('income','einnahme') or lower(coalesce(f.category,'')) like '%miete%'
             then coalesce(f.amount,0)::numeric else 0::numeric end) as rent_income,
    sum(case when lower(coalesce(f.entry_type,'')) in ('expense','ausgabe','cost','kosten')
              and lower(coalesce(f.category,'')) like '%capex%'
             then abs(coalesce(f.amount,0)::numeric) else 0::numeric end) as capex,
    sum(case when lower(coalesce(f.entry_type,'')) in ('expense','ausgabe','cost','kosten')
             then abs(coalesce(f.amount,0)::numeric) else 0::numeric end) as expenses
  from public.finance_entry f
  join public.v_koenen_object_bridge b on b.object_id = f.object_id
  where f.booking_date is not null
  group by b.property_id, extract(year from f.booking_date)::int
),
static_income as (
  select
    property_id,
    coalesce(annual_rent,0)::numeric as annual_rent,
    coalesce(other_income,0)::numeric as other_income
  from public.property_income
),
loan_latest as (
  select distinct on (property_id)
    property_id,
    year as latest_loan_year,
    balance::numeric as latest_balance
  from public.property_loan_ledger
  order by property_id, year desc
),
loan_by_year as (
  select
    property_id,
    year,
    coalesce(interest,0)::numeric as interest,
    coalesce(principal,0)::numeric as principal,
    coalesce(balance,0)::numeric as balance
  from public.property_loan_ledger
)
select
  b.property_id,
  b.object_id,
  b.objekt_code,
  b.property_name,
  y.year,
  coalesce(byy.income, si.annual_rent + si.other_income, 0)::numeric as income,
  coalesce(byy.rent_income, si.annual_rent, 0)::numeric as rent_income,
  coalesce(byy.expenses, 0)::numeric as expenses,
  coalesce(byy.capex, 0)::numeric as capex,
  coalesce(lby.interest, 0)::numeric as interest,
  coalesce(lby.principal, 0)::numeric as principal,
  (coalesce(lby.interest,0) + coalesce(lby.principal,0))::numeric as debt_service,
  (
    coalesce(byy.income, si.annual_rent + si.other_income, 0)
    - coalesce(byy.expenses,0)
    - coalesce(byy.capex,0)
    - coalesce(lby.interest,0)
    - coalesce(lby.principal,0)
  )::numeric as net_cashflow,
  case
    when (coalesce(lby.interest,0) + coalesce(lby.principal,0)) > 0
    then round((coalesce(byy.income, si.annual_rent + si.other_income, 0) - coalesce(byy.expenses,0)) / (coalesce(lby.interest,0) + coalesce(lby.principal,0)), 2)
    else null::numeric
  end as dscr,
  coalesce(lby.balance, ll.latest_balance)::numeric as latest_balance,
  b.property_id as portfolio_property_id
from public.v_koenen_object_bridge b
cross join years y
left join booking_by_year byy on byy.property_id = b.property_id and byy.year = y.year
left join static_income si on si.property_id = b.property_id
left join loan_by_year lby on lby.property_id = b.property_id and lby.year = y.year
left join loan_latest ll on ll.property_id = b.property_id;

-- 4) RPC: Finanzmaster für Frontend
create or replace function public.get_property_finance_master(p_year integer default extract(year from current_date)::int)
returns table (
  property_id uuid,
  object_id uuid,
  objekt_code text,
  property_name text,
  year integer,
  income numeric,
  rent_income numeric,
  expenses numeric,
  capex numeric,
  interest numeric,
  principal numeric,
  debt_service numeric,
  net_cashflow numeric,
  dscr numeric,
  latest_balance numeric,
  portfolio_property_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    property_id,
    object_id,
    objekt_code,
    property_name,
    year,
    income,
    rent_income,
    expenses,
    capex,
    interest,
    principal,
    debt_service,
    net_cashflow,
    dscr,
    latest_balance,
    portfolio_property_id
  from public.v_property_finance_master_yearly
  where year = p_year
  order by objekt_code;
$$;

grant execute on function public.get_property_finance_master(integer) to authenticated;

-- 5) Consistency/Fallback RPC
create or replace function public.get_property_finance_consistency(p_year integer default extract(year from current_date)::int)
returns table (
  severity text,
  area text,
  property_id uuid,
  property_name text,
  detail text,
  expected_value numeric,
  actual_value numeric,
  delta numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    case when m.net_cashflow < 0 then 'warning' else 'info' end::text as severity,
    'Cashflow'::text as area,
    m.property_id,
    m.property_name,
    case when m.net_cashflow < 0
      then 'Negativer Cashflow im ausgewählten Jahr.'
      else 'Cashflow-Daten erfolgreich geladen.'
    end::text as detail,
    0::numeric as expected_value,
    m.net_cashflow::numeric as actual_value,
    m.net_cashflow::numeric as delta
  from public.v_property_finance_master_yearly m
  where m.year = p_year;
$$;

grant execute on function public.get_property_finance_consistency(integer) to authenticated;

-- 6) Data-Quality RPC
create or replace function public.get_koenen_data_quality_checks(p_year integer default extract(year from current_date)::int)
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
),
document_counts as (
  select property_id, count(*)::numeric as document_count
  from public.property_documents
  group by property_id
),
ledger_counts as (
  select property_id, count(*)::numeric as ledger_count
  from public.property_loan_ledger
  group by property_id
),
checks as (
  select
    'info'::text as severity,
    'System'::text as area,
    m.property_id,
    m.property_name,
    'finance_master_loaded'::text as issue_code,
    'Finanzmaster erfolgreich geladen.'::text as detail,
    'Keine Aktion erforderlich.'::text as repair_hint,
    null::numeric as expected_value,
    null::numeric as actual_value,
    null::numeric as delta
  from master m

  union all

  select
    'warning'::text,
    'Dokumente'::text,
    m.property_id,
    m.property_name,
    'missing_documents'::text,
    'Keine Dokumente gefunden.'::text,
    'Dokumente in der Objektakte hochladen.'::text,
    1::numeric,
    coalesce(d.document_count,0)::numeric,
    null::numeric
  from master m
  left join document_counts d on d.property_id = m.property_id
  where coalesce(d.document_count,0) = 0

  union all

  select
    'warning'::text,
    'Darlehen'::text,
    m.property_id,
    m.property_name,
    'missing_loan_ledger'::text,
    'Keine Darlehensdaten gefunden.'::text,
    'Darlehensübersicht prüfen.'::text,
    1::numeric,
    coalesce(l.ledger_count,0)::numeric,
    null::numeric
  from master m
  left join ledger_counts l on l.property_id = m.property_id
  where coalesce(l.ledger_count,0) = 0

  union all

  select
    'critical'::text,
    'Liquidität'::text,
    m.property_id,
    m.property_name,
    'negative_cashflow'::text,
    ('Negativer Netto-Cashflow im Jahr ' || p_year || '.')::text,
    'Einnahmen/Ausgaben/Darlehen prüfen.'::text,
    0::numeric,
    m.net_cashflow::numeric,
    m.net_cashflow::numeric
  from master m
  where coalesce(m.net_cashflow,0) < 0
)
select * from checks
order by 2, 4;
$$;

grant execute on function public.get_koenen_data_quality_checks(integer) to authenticated;

-- 7) Kompatible Views für Unterseiten
create or replace view public.v_auswertung_object_yearly as
select * from public.v_property_finance_master_yearly;

create or replace view public.v_portfolio_performance_by_object as
select
  property_id,
  object_id,
  objekt_code,
  property_name,
  year,
  income,
  expenses,
  capex,
  debt_service,
  net_cashflow,
  dscr,
  latest_balance
from public.v_property_finance_master_yearly;

create or replace view public.v_object_risk_ampel as
select
  property_id,
  object_id,
  objekt_code,
  property_name,
  year,
  case
    when coalesce(net_cashflow,0) < 0 then 'rot'
    when coalesce(dscr, 99) < 1.1 then 'gelb'
    else 'gruen'
  end as risk_status,
  net_cashflow,
  dscr,
  latest_balance
from public.v_property_finance_master_yearly;

-- 8) Optional Materialized Views refreshen, wenn vorhanden
DO $$
BEGIN
  IF to_regclass('public.mv_latest_loan_balance') IS NOT NULL THEN
    REFRESH MATERIALIZED VIEW public.mv_latest_loan_balance;
  END IF;
  IF to_regclass('public.mv_property_loan_dashboard') IS NOT NULL THEN
    REFRESH MATERIALIZED VIEW public.mv_property_loan_dashboard;
  END IF;
  IF to_regclass('public.mv_portfolio_loan_totals_by_year') IS NOT NULL THEN
    REFRESH MATERIALIZED VIEW public.mv_portfolio_loan_totals_by_year;
  END IF;
  IF to_regclass('public.mv_portfolio_debt_over_time') IS NOT NULL THEN
    REFRESH MATERIALIZED VIEW public.mv_portfolio_debt_over_time;
  END IF;
END $$;
