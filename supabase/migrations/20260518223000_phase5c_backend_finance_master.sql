-- Koenen Property Management – Phase 5C
-- Backend-Finanzlogik / Single Source of Truth
-- Ziel: Restschuld, Einnahmen, Ausgaben, Capex und Datenprüfung serverseitig vereinheitlichen.

create extension if not exists pgcrypto;

-- 1) Einheitliche Normalisierung für Objekt-/Straßennamen.
-- Diese Funktion verhindert u.a. Doppelzählungen wie „Rosensteinstraße“ vs. „Rosenstein Str.“.
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
        '\y(rls|test|trigger|debug|dummy|sample|core shadow|shadow|hauptmiete|wohnung|garage|darlehen|immobilie)\y', '', 'g'
      ),
      '[^a-z0-9äöüß]+', ' ', 'g'
    ),
    '\s+', ' ', 'g'
  ));
$$;

-- 2) Kanonische Objektliste als Backend-Basis.
-- Quelle: Objekt-Dropdown + Darlehensdashboard. Test-/Debug-Objekte werden zentral gefiltert.
create or replace view public.v_property_master_objects as
with raw_objects as (
  select
    value::uuid as property_id,
    null::uuid as portfolio_property_id,
    nullif(objekt_code, '')::text as objekt_code,
    nullif(label, '')::text as property_name,
    'v_object_dropdown'::text as source
  from public.v_object_dropdown
  where value is not null

  union all

  select
    property_id::uuid as property_id,
    null::uuid as portfolio_property_id,
    null::text as objekt_code,
    nullif(property_name, '')::text as property_name,
    'vw_property_loan_dashboard_dedup'::text as source
  from public.vw_property_loan_dashboard_dedup
  where property_id is not null

  union all

  select
    property_id::uuid as property_id,
    portfolio_property_id::uuid as portfolio_property_id,
    null::text as objekt_code,
    nullif(property_name, '')::text as property_name,
    'vw_property_loan_dashboard_portfolio_v2'::text as source
  from public.vw_property_loan_dashboard_portfolio_v2
  where property_id is not null
), cleaned as (
  select
    property_id,
    portfolio_property_id,
    objekt_code,
    coalesce(property_name, objekt_code, property_id::text) as property_name,
    public.koenen_normalize_object_name(coalesce(property_name, objekt_code, property_id::text)) as normalized_name,
    source
  from raw_objects
), ranked as (
  select *, row_number() over (
    partition by normalized_name
    order by
      case when source = 'vw_property_loan_dashboard_portfolio_v2' then 1 when source = 'vw_property_loan_dashboard_dedup' then 2 else 3 end,
      property_name
  ) as rn
  from cleaned
  where normalized_name <> ''
    and normalized_name !~ '\y(rls|test|trigger|debug|dummy|sample)\y'
)
select
  property_id,
  portfolio_property_id,
  objekt_code,
  property_name,
  normalized_name,
  source as master_source
from ranked
where rn = 1;

-- 3) Zentrale Jahres-Finanzsicht.
-- Einnahmen/Ausgaben/Capex kommen aus finance_entry.
-- Restschuld/Zins/Tilgung kommen aus property_loan_ledger.
create or replace view public.v_property_finance_master_yearly as
with years as (
  select generate_series(2010, extract(year from now())::int + 5)::int as year
), props as (
  select * from public.v_property_master_objects
), entry_sums as (
  select
    coalesce(fe.object_id::uuid, null) as property_id,
    nullif(fe.objekt_code, '') as objekt_code,
    extract(year from fe.booking_date)::int as year,
    sum(case when fe.entry_type = 'income' then coalesce(fe.amount, 0) else 0 end)::numeric as income,
    sum(case when fe.entry_type = 'expense' then coalesce(fe.amount, 0) else 0 end)::numeric as expenses,
    sum(case
      when fe.entry_type = 'income' and public.koenen_normalize_object_name(coalesce(fe.category, '') || ' ' || coalesce(fe.note, '')) ~ '(miete|kaltmiete|warmmiete|garage|pacht)'
      then coalesce(fe.amount, 0) else 0 end)::numeric as rent_income,
    sum(case
      when fe.entry_type = 'expense' and public.koenen_normalize_object_name(coalesce(fe.category, '') || ' ' || coalesce(fe.note, '')) ~ '(capex|sanierung|modernisierung|renovierung|reparatur|instandhaltung|umbau|anlage|investition)'
      then coalesce(fe.amount, 0) else 0 end)::numeric as capex
  from public.finance_entry fe
  where fe.booking_date is not null
  group by coalesce(fe.object_id::uuid, null), nullif(fe.objekt_code, ''), extract(year from fe.booking_date)::int
), entry_by_master as (
  select
    p.property_id,
    e.year,
    sum(e.income)::numeric as income,
    sum(e.expenses)::numeric as expenses,
    sum(e.rent_income)::numeric as rent_income,
    sum(e.capex)::numeric as capex
  from props p
  left join entry_sums e on (
    e.property_id = p.property_id
    or (p.portfolio_property_id is not null and e.property_id = p.portfolio_property_id)
    or (e.objekt_code is not null and public.koenen_normalize_object_name(e.objekt_code) = p.normalized_name)
    or (e.objekt_code is not null and p.normalized_name like '%' || public.koenen_normalize_object_name(e.objekt_code) || '%')
  )
  where e.year is not null
  group by p.property_id, e.year
), ledger_by_year as (
  select
    p.property_id,
    l.year::int as year,
    sum(coalesce(l.interest, 0))::numeric as interest_total,
    sum(coalesce(l.principal, 0))::numeric as principal_total,
    max(l.balance)::numeric as balance_at_year
  from props p
  join public.property_loan_ledger l on l.property_id = p.property_id or (p.portfolio_property_id is not null and l.property_id = p.portfolio_property_id)
  group by p.property_id, l.year
), latest_ledger as (
  select distinct on (p.property_id)
    p.property_id,
    l.year::int as latest_balance_year,
    l.balance::numeric as latest_balance
  from props p
  join public.property_loan_ledger l on l.property_id = p.property_id or (p.portfolio_property_id is not null and l.property_id = p.portfolio_property_id)
  order by p.property_id, l.year desc, l.updated_at desc nulls last, l.created_at desc nulls last
)
select
  p.property_id,
  p.portfolio_property_id,
  p.objekt_code,
  p.property_name,
  p.normalized_name,
  y.year,
  coalesce(e.income, 0)::numeric as income,
  coalesce(e.expenses, 0)::numeric as expenses,
  coalesce(e.capex, 0)::numeric as capex,
  greatest(coalesce(e.expenses, 0) - coalesce(e.capex, 0), 0)::numeric as operating_expenses,
  (coalesce(e.income, 0) - coalesce(e.expenses, 0))::numeric as net_cashflow,
  coalesce(e.rent_income, 0)::numeric as rent_income,
  coalesce(l.interest_total, 0)::numeric as interest_total,
  coalesce(l.principal_total, 0)::numeric as principal_total,
  coalesce(l.interest_total, 0) + coalesce(l.principal_total, 0)::numeric as debt_service,
  case
    when coalesce(l.interest_total, 0) + coalesce(l.principal_total, 0) > 0
    then round(coalesce(e.income, 0) / (coalesce(l.interest_total, 0) + coalesce(l.principal_total, 0)), 4)
    else null
  end as dscr,
  l.balance_at_year::numeric as balance_at_year,
  ll.latest_balance::numeric as latest_balance,
  ll.latest_balance_year,
  now() as refreshed_at
from props p
cross join years y
left join entry_by_master e on e.property_id = p.property_id and e.year = y.year
left join ledger_by_year l on l.property_id = p.property_id and l.year = y.year
left join latest_ledger ll on ll.property_id = p.property_id;

-- 4) RPC: zentrale Masterdaten je Jahr.
create or replace function public.get_property_finance_master(p_year integer default extract(year from now())::integer)
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

-- 5) Datenkonsistenzprüfung: Finanzsummen, Ledger/Portfolio, Duplicate-Namen.
create or replace function public.get_property_finance_consistency(p_year integer default extract(year from now())::integer)
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
  with master as (
    select * from public.v_property_finance_master_yearly where year = p_year
  ), yearly_view as (
    select
      object_id::uuid as property_id,
      jahr::int as year,
      coalesce(einnahmen, 0)::numeric as income,
      coalesce(ausgaben, 0)::numeric as expenses
    from public.v_objekt_finanz_summary_jahr
    where jahr = p_year
  ), portfolio as (
    select property_id::uuid as property_id, coalesce(last_balance, 0)::numeric as last_balance
    from public.vw_property_loan_dashboard_portfolio_v2
  ), duplicate_names as (
    select normalized_name, count(*) as duplicate_count, string_agg(property_name, ' | ' order by property_name) as names
    from (
      select value::uuid as property_id, coalesce(label, objekt_code, value::text) as property_name, public.koenen_normalize_object_name(coalesce(label, objekt_code, value::text)) as normalized_name
      from public.v_object_dropdown
      where value is not null
    ) s
    where normalized_name <> '' and normalized_name !~ '\y(rls|test|trigger|debug|dummy|sample)\y'
    group by normalized_name
    having count(*) > 1
  )
  select
    case when abs(m.income - y.income) > 1 then 'warning' else 'ok' end as severity,
    'Einnahmen'::text as area,
    m.property_id,
    m.property_name,
    'Master-Finanzsicht vs. v_objekt_finanz_summary_jahr'::text as detail,
    m.income as expected_value,
    y.income as actual_value,
    (m.income - y.income) as delta
  from master m
  join yearly_view y on y.property_id = m.property_id
  where abs(m.income - y.income) > 1

  union all

  select
    case when abs(m.expenses - y.expenses) > 1 then 'warning' else 'ok' end,
    'Ausgaben'::text,
    m.property_id,
    m.property_name,
    'Master-Finanzsicht vs. v_objekt_finanz_summary_jahr'::text,
    m.expenses,
    y.expenses,
    (m.expenses - y.expenses)
  from master m
  join yearly_view y on y.property_id = m.property_id
  where abs(m.expenses - y.expenses) > 1

  union all

  select
    case when abs(coalesce(m.latest_balance, 0) - coalesce(p.last_balance, 0)) > 1 then 'critical' else 'ok' end,
    'Restschuld'::text,
    m.property_id,
    m.property_name,
    'Ledger-Masterwert vs. Portfolio-Dashboard'::text,
    coalesce(m.latest_balance, 0),
    coalesce(p.last_balance, 0),
    coalesce(m.latest_balance, 0) - coalesce(p.last_balance, 0)
  from master m
  join portfolio p on p.property_id = m.property_id
  where abs(coalesce(m.latest_balance, 0) - coalesce(p.last_balance, 0)) > 1

  union all

  select
    'warning'::text,
    'Doppelte Objektnamen'::text,
    null::uuid,
    d.names::text,
    'Mehrere Objektquellen normalisieren auf denselben Namen. Bitte IDs/Objektstammdaten prüfen.'::text,
    d.duplicate_count::numeric,
    null::numeric,
    null::numeric
  from duplicate_names d;
$$;

-- 6) RPC für Refresh bekannter Materialized Views.
-- Diese Funktion ist idempotent und überspringt Views, die im Projekt nicht existieren.
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

-- 7) Leserechte/RPC-Rechte für authentifizierte App-Nutzung.
grant select on public.v_property_master_objects to authenticated;
grant select on public.v_property_finance_master_yearly to authenticated;
grant execute on function public.get_property_finance_master(integer) to authenticated;
grant execute on function public.get_property_finance_consistency(integer) to authenticated;
grant execute on function public.refresh_koenen_finance_materialized_views() to authenticated;
