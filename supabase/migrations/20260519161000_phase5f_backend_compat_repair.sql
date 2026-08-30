-- =========================================================
-- Koenen Property Management · Phase 5F Backend Compatibility Repair
-- Fixes:
-- 1) v_object_dropdown again exposes value, label AND objekt_code
-- 2) Backend finance master no longer depends on legacy object views
-- 3) RPCs return the columns expected by the current frontend
-- 4) Data-quality checks no longer reference missing objekt_code columns
-- =========================================================

create extension if not exists pgcrypto;

create or replace function public.koenen_normalize_object_name(input text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(coalesce(input, '')), 'straße|strasse', 'str', 'g'),
          '([a-zäöüß])str\y', '\1 str', 'g'
        ),
        '\y(rls|test|trigger|debug|dummy|sample|core shadow|shadow|hauptmiete|wohnung|garage|darlehen|immobilie|archived)\y', '', 'g'
      ),
      '[^a-z0-9äöüß]+', ' ', 'g'
    ),
    '\s+', ' ', 'g'
  ));
$$;

-- Current production view had only value,label. Add objekt_code back as a compatibility alias.
-- The app may select value,objekt_code,label in older modules.
create or replace view public.v_object_dropdown as
select
  p.id::text as value,
  p.name::text as label,
  p.id::text as objekt_code
from public.properties p
where coalesce(p.is_test, false) = false
  and p.name not ilike '%[ARCHIVED]%'
order by p.name;

grant select on public.v_object_dropdown to authenticated;

-- Rebuild backend master views without relying on old/shadow object sources.
drop view if exists public.v_property_finance_master_yearly cascade;
drop view if exists public.v_property_master_objects cascade;

create view public.v_property_master_objects as
select
  p.id::uuid as property_id,
  p.id::uuid as portfolio_property_id,
  p.id::text as objekt_code,
  p.name::text as property_name,
  public.koenen_normalize_object_name(p.name) as normalized_name,
  'properties'::text as master_source
from public.properties p
where coalesce(p.is_test, false) = false
  and p.name not ilike '%[ARCHIVED]%';

grant select on public.v_property_master_objects to authenticated;

create view public.v_property_finance_master_yearly as
with years as (
  select generate_series(2010, extract(year from now())::int + 5)::int as year
), props as (
  select * from public.v_property_master_objects
), property_income_sums as (
  select
    property_id,
    sum(coalesce(annual_rent, 0))::numeric as annual_rent,
    sum(coalesce(other_income, 0))::numeric as other_income
  from public.property_income
  group by property_id
), entry_sums as (
  select
    fe.object_id::uuid as property_id,
    extract(year from fe.booking_date)::int as year,
    sum(case when fe.entry_type = 'income' then coalesce(fe.amount, 0) else 0 end)::numeric as income,
    sum(case when fe.entry_type = 'expense' then coalesce(fe.amount, 0) else 0 end)::numeric as expenses,
    sum(case
      when fe.entry_type = 'income'
       and public.koenen_normalize_object_name(coalesce(fe.category, '') || ' ' || coalesce(fe.note, '')) ~ '(miete|kaltmiete|warmmiete|garage|pacht)'
      then coalesce(fe.amount, 0) else 0 end)::numeric as rent_income,
    sum(case
      when fe.entry_type = 'expense'
       and public.koenen_normalize_object_name(coalesce(fe.category, '') || ' ' || coalesce(fe.note, '')) ~ '(capex|sanierung|modernisierung|renovierung|reparatur|instandhaltung|umbau|anlage|investition)'
      then coalesce(fe.amount, 0) else 0 end)::numeric as capex
  from public.finance_entry fe
  where fe.booking_date is not null
    and fe.object_id is not null
  group by fe.object_id::uuid, extract(year from fe.booking_date)::int
), ledger_by_year as (
  select
    l.property_id::uuid as property_id,
    l.year::int as year,
    sum(coalesce(l.interest, 0))::numeric as interest_total,
    sum(coalesce(l.principal, 0))::numeric as principal_total,
    max(l.balance)::numeric as balance_at_year
  from public.property_loan_ledger l
  group by l.property_id::uuid, l.year::int
), latest_ledger as (
  select distinct on (l.property_id)
    l.property_id::uuid as property_id,
    l.year::int as latest_balance_year,
    l.balance::numeric as latest_balance
  from public.property_loan_ledger l
  order by l.property_id, l.year desc, l.updated_at desc nulls last, l.created_at desc nulls last
)
select
  p.property_id,
  p.portfolio_property_id,
  p.objekt_code,
  p.property_name,
  p.normalized_name,
  y.year,
  case
    when coalesce(e.income, 0) <> 0 then coalesce(e.income, 0)::numeric
    else (coalesce(pi.annual_rent, 0) + coalesce(pi.other_income, 0))::numeric
  end as income,
  coalesce(e.expenses, 0)::numeric as expenses,
  coalesce(e.capex, 0)::numeric as capex,
  greatest(coalesce(e.expenses, 0) - coalesce(e.capex, 0), 0)::numeric as operating_expenses,
  (
    case
      when coalesce(e.income, 0) <> 0 then coalesce(e.income, 0)::numeric
      else (coalesce(pi.annual_rent, 0) + coalesce(pi.other_income, 0))::numeric
    end - coalesce(e.expenses, 0)::numeric
  )::numeric as net_cashflow,
  case
    when coalesce(e.rent_income, 0) <> 0 then coalesce(e.rent_income, 0)::numeric
    else coalesce(pi.annual_rent, 0)::numeric
  end as rent_income,
  coalesce(l.interest_total, 0)::numeric as interest_total,
  coalesce(l.principal_total, 0)::numeric as principal_total,
  (coalesce(l.interest_total, 0) + coalesce(l.principal_total, 0))::numeric as debt_service,
  case
    when (coalesce(l.interest_total, 0) + coalesce(l.principal_total, 0)) > 0
    then round(
      (case when coalesce(e.income, 0) <> 0 then coalesce(e.income, 0) else coalesce(pi.annual_rent, 0) + coalesce(pi.other_income, 0) end)
      / (coalesce(l.interest_total, 0) + coalesce(l.principal_total, 0)),
      4
    )
    else null
  end as dscr,
  l.balance_at_year::numeric as balance_at_year,
  ll.latest_balance::numeric as latest_balance,
  ll.latest_balance_year::integer as latest_balance_year,
  now() as refreshed_at
from props p
cross join years y
left join property_income_sums pi on pi.property_id = p.property_id
left join entry_sums e on e.property_id = p.property_id and e.year = y.year
left join ledger_by_year l on l.property_id = p.property_id and l.year = y.year
left join latest_ledger ll on ll.property_id = p.property_id;

grant select on public.v_property_finance_master_yearly to authenticated;

-- RPC: frontend-compatible backend master.
drop function if exists public.get_property_finance_master(integer);
create function public.get_property_finance_master(p_year integer default extract(year from now())::integer)
returns table (
  property_id uuid,
  portfolio_property_id uuid,
  objekt_code text,
  property_name text,
  normalized_name text,
  year integer,
  income numeric,
  expenses numeric,
  capex numeric,
  operating_expenses numeric,
  net_cashflow numeric,
  rent_income numeric,
  interest_total numeric,
  principal_total numeric,
  debt_service numeric,
  dscr numeric,
  balance_at_year numeric,
  latest_balance numeric,
  latest_balance_year integer,
  refreshed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    property_id, portfolio_property_id, objekt_code, property_name, normalized_name, year,
    income, expenses, capex, operating_expenses, net_cashflow, rent_income,
    interest_total, principal_total, debt_service, dscr, balance_at_year,
    latest_balance, latest_balance_year, refreshed_at
  from public.v_property_finance_master_yearly
  where year = p_year
  order by property_name;
$$;

grant execute on function public.get_property_finance_master(integer) to authenticated;

-- Lightweight consistency RPC. It deliberately avoids old views that may not exist anymore.
drop function if exists public.get_property_finance_consistency(integer);
create function public.get_property_finance_consistency(p_year integer default extract(year from now())::integer)
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
    'ok'::text as severity,
    'Backend-Finanzmaster'::text as area,
    m.property_id,
    m.property_name,
    'Backend-Finanzmaster erfolgreich geladen.'::text as detail,
    null::numeric as expected_value,
    null::numeric as actual_value,
    null::numeric as delta
  from public.v_property_finance_master_yearly m
  where m.year = p_year;
$$;

grant execute on function public.get_property_finance_consistency(integer) to authenticated;

-- Data-quality RPC without references to missing objekt_code columns.
drop function if exists public.get_koenen_data_quality_checks(integer);
create function public.get_koenen_data_quality_checks(p_year integer default extract(year from now())::integer)
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
  ), document_counts as (
    select property_id, count(*)::numeric as document_count
    from public.property_documents
    group by property_id
  ), ledger_counts as (
    select property_id, count(*)::numeric as ledger_count
    from public.property_loan_ledger
    group by property_id
  ), duplicate_names as (
    select normalized_name, count(*) as duplicate_count, string_agg(property_name, ' | ' order by property_name) as names
    from public.v_property_master_objects
    where normalized_name <> ''
    group by normalized_name
    having count(*) > 1
  )
  select
    'info'::text,
    'System'::text,
    m.property_id,
    m.property_name,
    'finance_master_loaded'::text,
    'Finanzmaster erfolgreich geladen.'::text,
    'Keine Aktion erforderlich.'::text,
    null::numeric,
    null::numeric,
    null::numeric
  from master m

  union all

  select
    'warning'::text,
    'Dokumente'::text,
    m.property_id,
    m.property_name,
    'missing_documents'::text,
    'Keine Dokumente gefunden.'::text,
    'Dokumente hochladen.'::text,
    1::numeric,
    coalesce(d.document_count, 0)::numeric,
    null::numeric
  from master m
  left join document_counts d on d.property_id = m.property_id
  where coalesce(d.document_count, 0) = 0

  union all

  select
    'warning'::text,
    'Darlehen'::text,
    m.property_id,
    m.property_name,
    'missing_loan_ledger'::text,
    'Keine Darlehensdaten gefunden.'::text,
    'property_loan_ledger prüfen.'::text,
    1::numeric,
    coalesce(l.ledger_count, 0)::numeric,
    null::numeric
  from master m
  left join ledger_counts l on l.property_id = m.property_id
  where coalesce(l.ledger_count, 0) = 0

  union all

  select
    'warning'::text,
    'Doppelte Objekte'::text,
    null::uuid,
    d.names::text,
    'duplicate_names'::text,
    'Doppelte normalisierte Namen erkannt.'::text,
    'Objekte bereinigen.'::text,
    d.duplicate_count::numeric,
    null::numeric,
    null::numeric
  from duplicate_names d
  order by 2, 4;
$$;

grant execute on function public.get_koenen_data_quality_checks(integer) to authenticated;

-- Refresh RPC remains safe if some materialized views do not exist.
create or replace function public.refresh_koenen_finance_materialized_views()
returns table (view_name text, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  view_names text[] := array[
    'mv_property_latest_balance',
    'mv_portfolio_loan_totals_by_year',
    'mv_latest_loan_balance',
    'mv_property_loan_dashboard',
    'mv_property_rent_history_monthly',
    'mv_portfolio_debt_over_time'
  ];
  v text;
begin
  foreach v in array view_names loop
    if to_regclass('public.' || v) is not null then
      begin
        execute format('refresh materialized view public.%I', v);
        view_name := v;
        status := 'refreshed';
        return next;
      exception when others then
        view_name := v;
        status := 'error: ' || sqlerrm;
        return next;
      end;
    else
      view_name := v;
      status := 'not_found';
      return next;
    end if;
  end loop;
end;
$$;

grant execute on function public.refresh_koenen_finance_materialized_views() to authenticated;
