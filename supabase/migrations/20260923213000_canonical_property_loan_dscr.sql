-- Canonical yearly DSCR for the loan overview.
--
-- Definition:
--   NOI  = operating income - operating expenses
--   DSCR = NOI / (interest + principal)
--
-- Financing, deposits and capital expenditure are deliberately not operating
-- income/expenses. Interest and principal come exclusively from the canonical
-- property_loan_ledger, so loan payments are not counted twice.

create or replace view public.v_property_loan_dscr_yearly
with (security_invoker = true)
as
with active_entries as (
  select
    bridge.property_id,
    bridge.property_name,
    extract(year from entry.booking_date)::integer as year,
    lower(btrim(coalesce(entry.entry_type::text, ''))) as entry_type,
    lower(btrim(coalesce(entry.category, ''))) as category,
    abs(coalesce(entry.amount, 0)::numeric) as amount
  from public.finance_entry entry
  join public.v_koenen_object_bridge bridge
    on bridge.object_id = entry.object_id
    or bridge.property_id = entry.object_id
    or lower(btrim(bridge.objekt_code)) = lower(btrim(coalesce(entry.objekt_code, '')))
  where entry.booking_date is not null
    and not coalesce(entry.is_deleted, false)
),
booking_by_year as (
  select
    property_id,
    property_name,
    year,
    sum(
      case
        when entry_type in ('income', 'einnahme')
          and category !~ '(kaution|darlehen|kredit|eigenkapital|kapitaleinlage|verkauf|ablösung|abloesung|durchlauf)'
        then amount
        else 0::numeric
      end
    )::numeric as operating_income,
    sum(
      case
        when entry_type in ('expense', 'ausgabe', 'cost', 'kosten')
          and category !~ '(kreditrate|darlehen|tilgung|zins|kaution|erwerb|anschaffung|capex|sanierung|modernisierung|renovierung|umbau|investition)'
        then amount
        else 0::numeric
      end
    )::numeric as operating_expenses
  from active_entries
  group by property_id, property_name, year
),
loan_by_year as (
  select
    ledger.property_id,
    ledger.year::integer as year,
    sum(abs(coalesce(ledger.interest, 0)::numeric))::numeric as interest,
    sum(abs(coalesce(ledger.principal, 0)::numeric))::numeric as principal
  from public.property_loan_ledger ledger
  group by ledger.property_id, ledger.year
),
property_years as (
  select property_id, property_name, year from booking_by_year
  union
  select bridge.property_id, bridge.property_name, loan.year
  from loan_by_year loan
  join public.v_koenen_object_bridge bridge on bridge.property_id = loan.property_id
)
select
  years.property_id,
  years.property_name,
  years.year,
  coalesce(bookings.operating_income, 0)::numeric as operating_income,
  coalesce(bookings.operating_expenses, 0)::numeric as operating_expenses,
  (
    coalesce(bookings.operating_income, 0)
    - coalesce(bookings.operating_expenses, 0)
  )::numeric as noi,
  coalesce(loan.interest, 0)::numeric as interest,
  coalesce(loan.principal, 0)::numeric as principal,
  (coalesce(loan.interest, 0) + coalesce(loan.principal, 0))::numeric as debt_service,
  case
    when (coalesce(loan.interest, 0) + coalesce(loan.principal, 0)) > 0
      then round(
        (
          coalesce(bookings.operating_income, 0)
          - coalesce(bookings.operating_expenses, 0)
        ) / (coalesce(loan.interest, 0) + coalesce(loan.principal, 0)),
        4
      )
    else null::numeric
  end as dscr
from property_years years
left join booking_by_year bookings
  on bookings.property_id = years.property_id
 and bookings.year = years.year
left join loan_by_year loan
  on loan.property_id = years.property_id
 and loan.year = years.year;

comment on view public.v_property_loan_dscr_yearly is
  'Single source of truth for yearly DSCR: NOI from active finance_entry operating items divided by interest plus principal from property_loan_ledger.';

revoke all on public.v_property_loan_dscr_yearly from public, anon;
grant select on public.v_property_loan_dscr_yearly to authenticated, service_role;
