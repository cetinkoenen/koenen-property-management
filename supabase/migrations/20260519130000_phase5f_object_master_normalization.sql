-- =========================================================
-- Koenen Property Management – Phase 5F
-- Objekt-Master-Normalisierung / Single Source of Truth
-- Ziel:
--   - PLZ-/Stadtvarianten und "Objekt X –"-Präfixe zusammenführen
--   - technische/alte UUIDs als Aliase behalten
--   - Finanzmaster, Dokumentprüfung und Risikoampel nur noch gegen kanonische Objekte auswerten
-- =========================================================

create extension if not exists pgcrypto;

-- 1) Robustere Normalisierung: entfernt Objekt-Präfixe, PLZ/Stadt, technische Wörter.
create or replace function public.koenen_normalize_object_name(input text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(lower(coalesce(input, '')), 'straße|strasse', 'str', 'g'),
              '([a-zäöüß])str\y', '\1 str', 'g'
            ),
            '\yobjekt\s*[0-9]+\y\s*[–—-]?\s*', '', 'g'
          ),
          '\y[0-9]{5}\y', '', 'g'
        ),
        '\y(bremen|stuttgart|deutschland|germany|rls|test|trigger|debug|dummy|sample|core shadow|shadow|hauptmiete|wohnung|garage|darlehen|immobilie)\y', '', 'g'
      ),
      '[^a-z0-9äöüß]+', ' ', 'g'
    ),
    '\s+', ' ', 'g'
  ));
$$;

-- 2) Alle Objektquellen als Alias-Menge sammeln.
create or replace view public.v_koenen_property_object_aliases as
with raw_objects as (
  select
    value::uuid as source_property_id,
    null::uuid as source_portfolio_property_id,
    nullif(objekt_code, '')::text as objekt_code,
    nullif(label, '')::text as property_name,
    'v_object_dropdown'::text as source,
    40::int as source_rank
  from public.v_object_dropdown
  where value is not null

  union all

  select
    property_id::uuid as source_property_id,
    null::uuid as source_portfolio_property_id,
    null::text as objekt_code,
    nullif(property_name, '')::text as property_name,
    'vw_property_loan_dashboard_dedup'::text as source,
    20::int as source_rank
  from public.vw_property_loan_dashboard_dedup
  where property_id is not null

  union all

  select
    property_id::uuid as source_property_id,
    portfolio_property_id::uuid as source_portfolio_property_id,
    null::text as objekt_code,
    nullif(property_name, '')::text as property_name,
    'vw_property_loan_dashboard_portfolio_v2'::text as source,
    10::int as source_rank
  from public.vw_property_loan_dashboard_portfolio_v2
  where property_id is not null
), cleaned as (
  select
    source_property_id,
    source_portfolio_property_id,
    objekt_code,
    coalesce(property_name, objekt_code, source_property_id::text) as property_name,
    public.koenen_normalize_object_name(coalesce(property_name, objekt_code, source_property_id::text)) as normalized_name,
    source,
    source_rank
  from raw_objects
), canonical as (
  select distinct on (normalized_name)
    normalized_name,
    source_property_id as canonical_property_id,
    source_portfolio_property_id as canonical_portfolio_property_id,
    objekt_code as canonical_objekt_code,
    property_name as canonical_property_name,
    source as canonical_source
  from cleaned
  where normalized_name <> ''
    and normalized_name !~ '\y(rls|test|trigger|debug|dummy|sample)\y'
  order by
    normalized_name,
    source_rank asc,
    case when property_name ~* '^objekt\s*[0-9]+' then 2 else 1 end,
    length(property_name),
    property_name
)
select
  c.canonical_property_id as property_id,
  c.canonical_portfolio_property_id as portfolio_property_id,
  c.canonical_objekt_code as objekt_code,
  c.canonical_property_name as property_name,
  c.normalized_name,
  c.canonical_source as master_source,
  r.source_property_id as alias_property_id,
  r.source_portfolio_property_id as alias_portfolio_property_id,
  r.objekt_code as alias_objekt_code,
  r.property_name as alias_property_name,
  r.source as alias_source
from canonical c
join cleaned r on r.normalized_name = c.normalized_name;

-- 3) Kanonische Objektliste: eine Zeile pro Immobilie.
create or replace view public.v_property_master_objects as
select distinct
  property_id,
  portfolio_property_id,
  objekt_code,
  property_name,
  normalized_name,
  master_source
from public.v_koenen_property_object_aliases;

-- 4) Zentrale Jahres-Finanzsicht gegen Alias-IDs joinen.
create or replace view public.v_property_finance_master_yearly as
with years as (
  select generate_series(2010, extract(year from now())::int + 5)::int as year
), props as (
  select * from public.v_property_master_objects
), aliases as (
  select * from public.v_koenen_property_object_aliases
), entry_sums as (
  select
    fe.object_id::uuid as source_property_id,
    nullif(fe.objekt_code, '') as objekt_code,
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
  group by fe.object_id::uuid, nullif(fe.objekt_code, ''), extract(year from fe.booking_date)::int
), entry_by_master as (
  select
    a.property_id,
    e.year,
    sum(e.income)::numeric as income,
    sum(e.expenses)::numeric as expenses,
    sum(e.rent_income)::numeric as rent_income,
    sum(e.capex)::numeric as capex
  from aliases a
  join entry_sums e on (
    e.source_property_id = a.alias_property_id
    or (a.alias_portfolio_property_id is not null and e.source_property_id = a.alias_portfolio_property_id)
    or (e.objekt_code is not null and public.koenen_normalize_object_name(e.objekt_code) = a.normalized_name)
    or (e.objekt_code is not null and a.normalized_name like '%' || public.koenen_normalize_object_name(e.objekt_code) || '%')
  )
  group by a.property_id, e.year
), ledger_by_year as (
  select
    a.property_id,
    l.year::int as year,
    sum(coalesce(l.interest, 0))::numeric as interest_total,
    sum(coalesce(l.principal, 0))::numeric as principal_total,
    max(l.balance)::numeric as balance_at_year
  from aliases a
  join public.property_loan_ledger l on l.property_id = a.alias_property_id or (a.alias_portfolio_property_id is not null and l.property_id = a.alias_portfolio_property_id)
  group by a.property_id, l.year
), latest_ledger as (
  select distinct on (a.property_id)
    a.property_id,
    l.year::int as latest_balance_year,
    l.balance::numeric as latest_balance
  from aliases a
  join public.property_loan_ledger l on l.property_id = a.alias_property_id or (a.alias_portfolio_property_id is not null and l.property_id = a.alias_portfolio_property_id)
  order by a.property_id, l.year desc, l.updated_at desc nulls last, l.created_at desc nulls last
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
  (coalesce(l.interest_total, 0) + coalesce(l.principal_total, 0))::numeric as debt_service,
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

-- 5) RPC: zentrale Masterdaten je Jahr.
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

-- 6) Reparierte Qualitätsprüfung: keine doppelten Objektvarianten mehr.
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
  ), aliases as (
    select * from public.v_koenen_property_object_aliases
  ), raw_name_groups as (
    select
      normalized_name,
      count(distinct alias_property_id) as alias_count,
      count(distinct property_id) as canonical_count,
      string_agg(distinct alias_property_name, ' | ' order by alias_property_name) as names
    from aliases
    group by normalized_name
  ), document_counts as (
    select
      a.property_id,
      count(d.*)::numeric as document_count
    from aliases a
    left join public.property_documents d on (
      d.property_id = a.alias_property_id
      or d.portfolio_property_id = a.alias_portfolio_property_id
      or (d.objekt_code is not null and public.koenen_normalize_object_name(d.objekt_code) = a.normalized_name)
      or (d.property_name is not null and public.koenen_normalize_object_name(d.property_name) = a.normalized_name)
    )
    group by a.property_id
  ), ledger_counts as (
    select
      a.property_id,
      count(l.*)::numeric as ledger_count,
      max(l.year)::numeric as max_ledger_year
    from aliases a
    left join public.property_loan_ledger l on l.property_id = a.alias_property_id or (a.alias_portfolio_property_id is not null and l.property_id = a.alias_portfolio_property_id)
    group by a.property_id
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
        when c.area ilike '%Doppelte%' then 'Objektstammdaten bereinigen: doppelte Namen/IDs zusammenführen oder Testobjekte entfernen.'
        else 'Datenquelle prüfen und nach Korrektur neu prüfen.'
      end as repair_hint,
      c.expected_value,
      c.actual_value,
      c.delta
    from consistency c

    union all

    select
      1 as sort_rank,
      'critical'::text as severity,
      'Darlehensdaten'::text as area,
      m.property_id,
      m.property_name,
      'missing_loan_ledger'::text as issue_code,
      'Keine Darlehens-Ledgerdaten bzw. keine aktuelle Restschuld im Backend-Finanzmaster gefunden.'::text as detail,
      'Darlehensübersicht für dieses Objekt öffnen und mindestens eine Jahreszeile im property_loan_ledger erfassen.'::text as repair_hint,
      null::numeric as expected_value,
      coalesce(l.ledger_count, 0)::numeric as actual_value,
      null::numeric as delta
    from master m
    left join ledger_counts l on l.property_id = m.property_id
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

    union all

    select
      2,
      'warning'::text,
      'Capex'::text,
      m.property_id,
      m.property_name,
      'high_capex_ratio'::text,
      'Capex ist höher als 75 % der Jahreseinnahmen.'::text,
      'Capex-Kategorien in Monate/Buchungen prüfen; Sanierung/Reparatur ggf. sauber zuordnen.'::text,
      round(m.income * 0.75, 2),
      m.capex,
      round(m.capex - (m.income * 0.75), 2)
    from master m
    where coalesce(m.income, 0) > 0 and coalesce(m.capex, 0) > (m.income * 0.75)

    union all

    select
      2,
      'warning'::text,
      'Dokumente'::text,
      m.property_id,
      m.property_name,
      'missing_documents'::text,
      'Im Dokumentenarchiv sind für dieses Objekt noch keine Dokumente gespeichert.'::text,
      'Objektakte → Dokumente öffnen und Mietvertrag, Energieausweis, Darlehensunterlagen oder Rechnungen hochladen.'::text,
      1::numeric,
      coalesce(d.document_count, 0)::numeric,
      null::numeric
    from master m
    left join document_counts d on d.property_id = m.property_id
    where coalesce(d.document_count, 0) = 0

    union all

    select
      3,
      'ok'::text,
      'Objekt-Master'::text,
      null::uuid,
      g.names::text,
      'aliases_merged'::text,
      'Mehrere Objektvarianten wurden zu einer kanonischen Immobilie zusammengeführt.'::text,
      'Keine Aktion erforderlich, solange die Anzeige nur einmal erscheint. Optional können Alt-IDs später bereinigt werden.'::text,
      g.alias_count::numeric,
      g.canonical_count::numeric,
      null::numeric
    from raw_name_groups g
    where g.alias_count > 1 and g.canonical_count = 1
  )
  select
    severity,
    area,
    property_id,
    property_name,
    issue_code,
    detail,
    repair_hint,
    expected_value,
    actual_value,
    delta
  from checks
  order by sort_rank, area, property_name nulls last;
$$;

grant select on public.v_koenen_property_object_aliases to authenticated;
grant select on public.v_property_master_objects to authenticated;
grant select on public.v_property_finance_master_yearly to authenticated;
grant execute on function public.get_property_finance_master(integer) to authenticated;
grant execute on function public.get_koenen_data_quality_checks(integer) to authenticated;
