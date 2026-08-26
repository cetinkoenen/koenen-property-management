-- Rueckwirkende Bereinigung von Kauf-/Erwerbsnebenkosten.
--
-- Diese Kosten sind steuerlich wichtig fuer Dokumentation und AfA-/Anschaffungskostenbasis,
-- aber sie sind keine laufenden Werbungskosten per St-Haekchen in der Buchungsliste.
-- Zeitraum: alle aktiven Ausgaben ab 01.01.2024 bis zum Ausfuehrungsdatum.

create table if not exists public.finance_entry_backup_acquisition_side_cost_20260803 as
select
  now() as backup_created_at,
  entry.*
from public.finance_entry as entry
where false;

-- Internal repair snapshots must never be reachable through PostgREST.
alter table public.finance_entry_backup_acquisition_side_cost_20260803
  enable row level security;

revoke all privileges
  on table public.finance_entry_backup_acquisition_side_cost_20260803
  from anon, authenticated;

drop policy if exists deny_browser_api_access
  on public.finance_entry_backup_acquisition_side_cost_20260803;

create policy deny_browser_api_access
  on public.finance_entry_backup_acquisition_side_cost_20260803
  for all
  to anon, authenticated
  using (false)
  with check (false);

create temporary table acquisition_side_cost_candidates on commit drop as
select id
from (
  select
    id,
    lower(
      regexp_replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(
                    replace(coalesce(note, '') || ' ' || coalesce(category, ''), 'ß', 'ss'),
                    'Ä',
                    'ae'
                  ),
                  'ä',
                  'ae'
                ),
                'Ö',
                'oe'
              ),
              'ö',
              'oe'
            ),
            'Ü',
            'ue'
          ),
          'ü',
          'ue'
        ),
        '[^a-zA-Z0-9]+',
        ' ',
        'g'
      )
    ) as searchable_text
  from public.finance_entry
  where coalesce(is_deleted, false) = false
    and entry_type = 'expense'
    and booking_date >= date '2024-01-01'
    and booking_date <= current_date
) as candidates
where
  searchable_text like '%notar%'
  or searchable_text like '%grundbuch%'
  or searchable_text like '%grunderwerbsteuer%'
  or searchable_text like '%grunderwerbssteuer%'
  or searchable_text like '%makler%'
  or searchable_text like '%eigentrumumschreibung%'
  or searchable_text like '%eigentumsumschreibung%'
  or searchable_text like '%eigentrumsumschreibung%'
  or searchable_text like '%eigentumsueberschreibung%'
  or searchable_text like '%eigentumsuebertragung%'
  or searchable_text like '%anschaffungskosten%'
  or searchable_text like '%anschaffungsnebenkosten%'
  or searchable_text like '%erwerbsnebenkosten%'
  or searchable_text like '%kaufnebenkosten%'
  or searchable_text like '%kaufvertrag%';

insert into public.finance_entry_backup_acquisition_side_cost_20260803
select
  now() as backup_created_at,
  entry.*
from public.finance_entry as entry
join acquisition_side_cost_candidates as candidates on candidates.id = entry.id
where not exists (
  select 1
  from public.finance_entry_backup_acquisition_side_cost_20260803 as backup
  where backup.id = entry.id
);

update public.finance_entry as entry
set
  category = 'Erwerbsnebenkosten / Anschaffungskosten',
  tax_relevant = false
from acquisition_side_cost_candidates as candidates
where entry.id = candidates.id;

-- Verifikation nach Ausfuehrung:
-- select id, booking_date, objekt_code, amount, category, tax_relevant, note
-- from public.finance_entry
-- where category = 'Erwerbsnebenkosten / Anschaffungskosten'
--   and booking_date >= date '2024-01-01'
-- order by booking_date, id;
