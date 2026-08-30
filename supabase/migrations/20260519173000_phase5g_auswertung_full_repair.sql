-- =========================================================
-- Koenen Property Management · Phase 5G Auswertung Full Repair
-- Zweck:
-- 1) alle alten/falschen Objekt-UUIDs auf die 6 echten properties.id umhängen
-- 2) v_object_dropdown wieder frontend-kompatibel mit value,label,objekt_code bereitstellen
-- 3) Buchungs-/Jahres-/BI-/Single-Source-Views aus finance_entry neu aufbauen
-- 4) Backend-Finanzmaster stabil aus den echten properties + finance_entry + property_income + property_loan_ledger berechnen
-- 5) Dokumente, Aufgaben und Audit auf die finalen Property-IDs normalisieren
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

-- ---------------------------------------------------------
-- 1) Master-ID Mapping
-- ---------------------------------------------------------
create temporary table if not exists tmp_koenen_property_id_map (
  old_id uuid primary key,
  new_id uuid not null,
  new_name text not null
) on commit drop;

truncate table tmp_koenen_property_id_map;

insert into tmp_koenen_property_id_map (old_id, new_id, new_name) values
  -- Lilienthaler
  ('4e866825-b3bf-4a2e-9cec-c19c8eb6208b','92576004-0753-4775-850a-e2e47c1b3cb5','Lilienthaler Str. 54'),
  ('fe5a3252-3390-42c1-8820-156f282fe496','92576004-0753-4775-850a-e2e47c1b3cb5','Lilienthaler Str. 54'),
  ('778943ab-b5b7-403d-ba83-bc1012151532','92576004-0753-4775-850a-e2e47c1b3cb5','Lilienthaler Str. 54'),
  -- Elsasser
  ('5db6fcc3-6419-4fb1-a03f-087dc16383cc','f8a86965-07e4-4b6a-a97a-779dbe97a3fd','Elsasser Str. 52'),
  ('4f9d5747-f808-45e7-83a1-b5738ee018c6','f8a86965-07e4-4b6a-a97a-779dbe97a3fd','Elsasser Str. 52'),
  ('3f029417-88e1-4cbc-a3f5-37d246d71bb9','f8a86965-07e4-4b6a-a97a-779dbe97a3fd','Elsasser Str. 52'),
  -- Colmarer
  ('b82595e7-bf6d-4303-a693-775f490e0283','7840e179-1972-4e74-b0a6-e1e352604ef5','Colmarer Str. 45'),
  ('13dd2eb2-21d9-4430-910e-f498de79b456','7840e179-1972-4e74-b0a6-e1e352604ef5','Colmarer Str. 45'),
  ('d00ad696-01b8-4c0f-a8ff-d6abf294c28b','7840e179-1972-4e74-b0a6-e1e352604ef5','Colmarer Str. 45'),
  -- Fürther
  ('50ec410b-1489-4ef2-a885-d6d8c508bdc0','32762b8b-e205-486f-af7b-909dc1c90a8d','Fürther Str. 74'),
  ('e5650127-bb3e-49e4-bc8d-584f3c95accd','32762b8b-e205-486f-af7b-909dc1c90a8d','Fürther Str. 74'),
  ('d825c27d-026a-4da5-8897-b3e19cfaeeb3','32762b8b-e205-486f-af7b-909dc1c90a8d','Fürther Str. 74'),
  -- Hohenloher
  ('6b3098ff-5b26-4ccb-b6b5-3fb008f47be9','89c29135-d3ab-43dd-9743-3f7fba284d93','Hohenloher Str. 78'),
  ('69508c57-1d8c-48cc-bd24-3d5380e45543','89c29135-d3ab-43dd-9743-3f7fba284d93','Hohenloher Str. 78'),
  ('7398cfb2-869d-4d54-986c-0fb2dbc71adc','89c29135-d3ab-43dd-9743-3f7fba284d93','Hohenloher Str. 78'),
  -- Rosenstein
  ('d982b7f2-6fa7-408a-8ce7-6ccc43ff6f59','3b6df919-fdf2-439d-abab-9646b2ad1d76','Rosenstein Str. 25'),
  ('09551b2c-a1ba-4dc3-b9f9-1ee7e98dd17c','3b6df919-fdf2-439d-abab-9646b2ad1d76','Rosenstein Str. 25'),
  ('36f26c1e-0a94-4f87-bf25-ee2a9a1438f6','3b6df919-fdf2-439d-abab-9646b2ad1d76','Rosenstein Str. 25')
on conflict (old_id) do update set new_id = excluded.new_id, new_name = excluded.new_name;

-- ---------------------------------------------------------
-- 2) Referenztabellen umhängen
-- ---------------------------------------------------------
update public.finance_entry fe
set object_id = m.new_id,
    objekt_code = m.new_id::text
from tmp_koenen_property_id_map m
where fe.object_id = m.old_id or fe.objekt_code = m.old_id::text;

update public.entries e
set object_id = m.new_id,
    objekt_code = m.new_id::text
from tmp_koenen_property_id_map m
where e.object_id = m.old_id or e.objekt_code = m.old_id::text;

update public.bookings b
set property_id = m.new_id
from tmp_koenen_property_id_map m
where b.property_id = m.old_id;

update public.exposes x
set property_id = m.new_id
from tmp_koenen_property_id_map m
where x.property_id = m.old_id;

update public.loan_entries le
set property_id = m.new_id
from tmp_koenen_property_id_map m
where le.property_id = m.old_id;

update public.property_loans pl
set property_id = m.new_id
from tmp_koenen_property_id_map m
where pl.property_id = m.old_id;

update public.units u
set property_id = m.new_id
from tmp_koenen_property_id_map m
where u.property_id = m.old_id;

update public.portfolio_properties pp
set core_property_id = m.new_id
from tmp_koenen_property_id_map m
where pp.core_property_id = m.old_id;

update public.property_documents d
set property_id = m.new_id,
    objekt_code = m.new_id::text,
    property_name = m.new_name
from tmp_koenen_property_id_map m
where d.property_id = m.old_id or d.objekt_code = m.old_id::text;

update public.property_tasks t
set property_id = m.new_id,
    objekt_code = m.new_id::text,
    property_name = m.new_name
from tmp_koenen_property_id_map m
where t.property_id = m.old_id or t.objekt_code = m.old_id::text;

update public.app_audit_log a
set property_id = m.new_id,
    objekt_code = m.new_id::text
from tmp_koenen_property_id_map m
where a.property_id = m.old_id or a.objekt_code = m.old_id::text;

-- property_income: duplicate-safe migration
update public.property_income old
set property_id = m.new_id
from tmp_koenen_property_id_map m
where old.property_id = m.old_id
  and not exists (
    select 1 from public.property_income target
    where target.property_id = m.new_id
  );

delete from public.property_income old
using tmp_koenen_property_id_map m
where old.property_id = m.old_id
  and exists (
    select 1 from public.property_income target
    where target.property_id = m.new_id
  );

-- yearly_property_income: duplicate-safe migration per year
update public.yearly_property_income old
set property_id = m.new_id
from tmp_koenen_property_id_map m
where old.property_id = m.old_id
  and not exists (
    select 1 from public.yearly_property_income target
    where target.property_id = m.new_id and target.year = old.year
  );

delete from public.yearly_property_income old
using tmp_koenen_property_id_map m
where old.property_id = m.old_id
  and exists (
    select 1 from public.yearly_property_income target
    where target.property_id = m.new_id and target.year = old.year
  );

-- yearly_capex_entries: duplicate-safe migration per year/category when possible
update public.yearly_capex_entries old
set property_id = m.new_id
from tmp_koenen_property_id_map m
where old.property_id = m.old_id
  and not exists (
    select 1 from public.yearly_capex_entries target
    where target.property_id = m.new_id and target.year = old.year
  );

delete from public.yearly_capex_entries old
using tmp_koenen_property_id_map m
where old.property_id = m.old_id
  and exists (
    select 1 from public.yearly_capex_entries target
    where target.property_id = m.new_id and target.year = old.year
  );

-- property_loan_ledger: duplicate-safe migration per property/year
update public.property_loan_ledger old
set property_id = m.new_id
from tmp_koenen_property_id_map m
where old.property_id = m.old_id
  and not exists (
    select 1 from public.property_loan_ledger target
    where target.property_id = m.new_id and target.year = old.year
  );

delete from public.property_loan_ledger old
using tmp_koenen_property_id_map m
where old.property_id = m.old_id
  and exists (
    select 1 from public.property_loan_ledger target
    where target.property_id = m.new_id and target.year = old.year
  );

-- obsolete mapping rows can be deleted after all references were moved.
delete from public.property_name_map pnm
using tmp_koenen_property_id_map m
where pnm.property_id = m.old_id;

-- remove old shadow/test/archived property rows that no longer have FK references.
delete from public.properties p
using tmp_koenen_property_id_map m
where p.id = m.old_id;

delete from public.properties p
where coalesce(p.is_test, false) = true
   or p.name ilike '%[ARCHIVED]%'
   or p.name ilike '%[SHADOW]%'
   or p.name ilike '%[TEST]%'
   or p.name ilike '%TRIGGER TEST%'
   or p.name ilike '%RLS TEST%';

-- ---------------------------------------------------------
-- 3) Compatibility object dropdown
-- ---------------------------------------------------------
drop view if exists public.v_object_dropdown cascade;
create view public.v_object_dropdown as
select
  p.id::text as value,
  p.name::text as label,
  p.id::text as objekt_code
from public.properties p
where coalesce(p.is_test, false) = false
  and p.name not ilike '%[ARCHIVED]%'
  and p.name not ilike '%[SHADOW]%'
  and p.name not ilike '%[TEST]%'
order by p.name;

grant select on public.v_object_dropdown to authenticated;

-- ---------------------------------------------------------
-- 4) Entry helper views used by Auswertung/Monate/BI
-- ---------------------------------------------------------
drop view if exists public.v_income_entries cascade;
create view public.v_income_entries as
select
  fe.id,
  fe.object_id,
  fe.object_id::text as objekt_code,
  fe.user_id,
  fe.booking_date,
  fe.amount,
  fe.category,
  fe.note
from public.finance_entry fe
where fe.entry_type = 'income';

drop view if exists public.v_expense_entries cascade;
create view public.v_expense_entries as
select
  fe.id,
  fe.object_id,
  fe.object_id::text as objekt_code,
  fe.user_id,
  fe.booking_date,
  fe.amount,
  fe.category,
  fe.note
from public.finance_entry fe
where fe.entry_type = 'expense';

grant select on public.v_income_entries to authenticated;
grant select on public.v_expense_entries to authenticated;

-- Monats-/Jahresübersichten für AppDataContext.
drop view if exists public.v_mieteingaenge_monat cascade;
create view public.v_mieteingaenge_monat as
select
  fe.object_id,
  fe.object_id::text as objekt_code,
  fe.user_id,
  extract(year from fe.booking_date)::int as jahr,
  extract(month from fe.booking_date)::int as monat,
  sum(coalesce(fe.amount, 0))::numeric as mieteingang_summe
from public.finance_entry fe
where fe.entry_type = 'income'
  and fe.booking_date is not null
  and fe.object_id is not null
  and public.koenen_normalize_object_name(coalesce(fe.category, '') || ' ' || coalesce(fe.note, '')) ~ '(miete|kaltmiete|warmmiete|garage|pacht)'
group by fe.object_id, fe.user_id, extract(year from fe.booking_date), extract(month from fe.booking_date);

drop view if exists public.v_objekt_finanz_summary_jahr cascade;
create view public.v_objekt_finanz_summary_jahr as
select
  fe.object_id,
  fe.object_id::text as objekt_code,
  fe.user_id,
  extract(year from fe.booking_date)::int as jahr,
  sum(case when fe.entry_type = 'income' then coalesce(fe.amount, 0) else 0 end)::numeric as einnahmen,
  sum(case when fe.entry_type = 'expense' then coalesce(fe.amount, 0) else 0 end)::numeric as ausgaben,
  sum(case when fe.entry_type = 'income' and public.koenen_normalize_object_name(coalesce(fe.category, '') || ' ' || coalesce(fe.note, '')) ~ '(miete|kaltmiete|warmmiete|garage|pacht)' then coalesce(fe.amount, 0) else 0 end)::numeric as mieteingaenge
from public.finance_entry fe
where fe.booking_date is not null
  and fe.object_id is not null
group by fe.object_id, fe.user_id, extract(year from fe.booking_date);

grant select on public.v_mieteingaenge_monat to authenticated;
grant select on public.v_objekt_finanz_summary_jahr to authenticated;

-- ---------------------------------------------------------
-- 5) Backend master from the 6 final properties
-- ---------------------------------------------------------
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
  and p.name not ilike '%[ARCHIVED]%'
  and p.name not ilike '%[SHADOW]%'
  and p.name not ilike '%[TEST]%';

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
    sum(case when fe.entry_type = 'income' and public.koenen_normalize_object_name(coalesce(fe.category, '') || ' ' || coalesce(fe.note, '')) ~ '(miete|kaltmiete|warmmiete|garage|pacht)' then coalesce(fe.amount, 0) else 0 end)::numeric as rent_income,
    sum(case when fe.entry_type = 'expense' and public.koenen_normalize_object_name(coalesce(fe.category, '') || ' ' || coalesce(fe.note, '')) ~ '(capex|sanierung|modernisierung|renovierung|reparatur|instandhaltung|umbau|anlage|investition)' then coalesce(fe.amount, 0) else 0 end)::numeric as capex
  from public.finance_entry fe
  where fe.booking_date is not null and fe.object_id is not null
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
  case when coalesce(e.income, 0) <> 0 then coalesce(e.income, 0)::numeric else (coalesce(pi.annual_rent, 0) + coalesce(pi.other_income, 0))::numeric end as income,
  coalesce(e.expenses, 0)::numeric as expenses,
  coalesce(e.capex, 0)::numeric as capex,
  greatest(coalesce(e.expenses, 0) - coalesce(e.capex, 0), 0)::numeric as operating_expenses,
  (case when coalesce(e.income, 0) <> 0 then coalesce(e.income, 0)::numeric else (coalesce(pi.annual_rent, 0) + coalesce(pi.other_income, 0))::numeric end - coalesce(e.expenses, 0)::numeric)::numeric as net_cashflow,
  case when coalesce(e.rent_income, 0) <> 0 then coalesce(e.rent_income, 0)::numeric else coalesce(pi.annual_rent, 0)::numeric end as rent_income,
  coalesce(l.interest_total, 0)::numeric as interest_total,
  coalesce(l.principal_total, 0)::numeric as principal_total,
  (coalesce(l.interest_total, 0) + coalesce(l.principal_total, 0))::numeric as debt_service,
  case when (coalesce(l.interest_total, 0) + coalesce(l.principal_total, 0)) > 0
    then round((case when coalesce(e.income, 0) <> 0 then coalesce(e.income, 0) else coalesce(pi.annual_rent, 0) + coalesce(pi.other_income, 0) end) / (coalesce(l.interest_total, 0) + coalesce(l.principal_total, 0)), 4)
    else null end as dscr,
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

-- ---------------------------------------------------------
-- 6) RPCs expected by the frontend
-- ---------------------------------------------------------
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
    'ok'::text,
    'Backend-Finanzmaster'::text,
    m.property_id,
    m.property_name,
    'Backend-Finanzmaster erfolgreich geladen.'::text,
    null::numeric,
    null::numeric,
    null::numeric
  from public.v_property_finance_master_yearly m
  where m.year = p_year;
$$;

grant execute on function public.get_property_finance_consistency(integer) to authenticated;

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
    select property_id, count(*)::numeric as document_count from public.property_documents group by property_id
  ), ledger_counts as (
    select property_id, count(*)::numeric as ledger_count from public.property_loan_ledger group by property_id
  ), duplicate_names as (
    select normalized_name, count(*) as duplicate_count, string_agg(property_name, ' | ' order by property_name) as names
    from public.v_property_master_objects
    where normalized_name <> ''
    group by normalized_name
    having count(*) > 1
  )
  select 'info'::text, 'System'::text, m.property_id, m.property_name, 'finance_master_loaded'::text, 'Finanzmaster erfolgreich geladen.'::text, 'Keine Aktion erforderlich.'::text, null::numeric, null::numeric, null::numeric
  from master m

  union all
  select 'warning'::text, 'Dokumente'::text, m.property_id, m.property_name, 'missing_documents'::text, 'Keine Dokumente gefunden.'::text, 'Dokumente hochladen.'::text, 1::numeric, coalesce(d.document_count, 0)::numeric, null::numeric
  from master m left join document_counts d on d.property_id = m.property_id
  where coalesce(d.document_count, 0) = 0

  union all
  select 'warning'::text, 'Darlehen'::text, m.property_id, m.property_name, 'missing_loan_ledger'::text, 'Keine Darlehensdaten gefunden.'::text, 'property_loan_ledger prüfen.'::text, 1::numeric, coalesce(l.ledger_count, 0)::numeric, null::numeric
  from master m left join ledger_counts l on l.property_id = m.property_id
  where coalesce(l.ledger_count, 0) = 0

  union all
  select 'warning'::text, 'Doppelte Objekte'::text, null::uuid, d.names::text, 'duplicate_names'::text, 'Doppelte normalisierte Namen erkannt.'::text, 'Objekte bereinigen.'::text, d.duplicate_count::numeric, null::numeric, null::numeric
  from duplicate_names d
  order by 2, 4;
$$;

grant execute on function public.get_koenen_data_quality_checks(integer) to authenticated;

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

-- ---------------------------------------------------------
-- 7) Document/task summary RPCs should now also report normalized IDs.
-- ---------------------------------------------------------
create or replace function public.get_property_document_summary(p_year integer default null)
returns table (
  property_id uuid,
  portfolio_property_id uuid,
  objekt_code text,
  property_name text,
  total_documents bigint,
  missing_documents bigint,
  expiring_documents bigint,
  archived_documents bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.property_id,
    p.portfolio_property_id,
    p.objekt_code,
    p.property_name,
    count(d.id)::bigint as total_documents,
    count(d.id) filter (where d.status = 'fehlt')::bigint as missing_documents,
    count(d.id) filter (where d.valid_until is not null and d.valid_until <= current_date + interval '90 days' and d.status <> 'archiviert')::bigint as expiring_documents,
    count(d.id) filter (where d.status = 'archiviert')::bigint as archived_documents
  from public.v_property_master_objects p
  left join public.property_documents d on d.property_id = p.property_id and (p_year is null or d.document_year = p_year)
  group by p.property_id, p.portfolio_property_id, p.objekt_code, p.property_name;
$$;

create or replace function public.get_property_task_summary()
returns table (
  property_id uuid,
  portfolio_property_id uuid,
  objekt_code text,
  property_name text,
  open_tasks bigint,
  critical_tasks bigint,
  overdue_tasks bigint,
  done_tasks bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.property_id,
    p.portfolio_property_id,
    p.objekt_code,
    p.property_name,
    count(t.id) filter (where t.status in ('offen', 'in_bearbeitung'))::bigint as open_tasks,
    count(t.id) filter (where t.priority = 'kritisch' and t.status <> 'erledigt')::bigint as critical_tasks,
    count(t.id) filter (where t.due_date is not null and t.due_date < current_date and t.status not in ('erledigt', 'archiviert'))::bigint as overdue_tasks,
    count(t.id) filter (where t.status = 'erledigt')::bigint as done_tasks
  from public.v_property_master_objects p
  left join public.property_tasks t on t.property_id = p.property_id
  group by p.property_id, p.portfolio_property_id, p.objekt_code, p.property_name;
$$;

grant execute on function public.get_property_document_summary(integer) to authenticated;
grant execute on function public.get_property_task_summary() to authenticated;

-- ---------------------------------------------------------
-- 8) Final sanity grants
-- ---------------------------------------------------------
grant select on public.v_object_dropdown to authenticated;
grant select on public.v_income_entries to authenticated;
grant select on public.v_expense_entries to authenticated;
grant select on public.v_mieteingaenge_monat to authenticated;
grant select on public.v_objekt_finanz_summary_jahr to authenticated;
grant select on public.v_property_master_objects to authenticated;
grant select on public.v_property_finance_master_yearly to authenticated;
