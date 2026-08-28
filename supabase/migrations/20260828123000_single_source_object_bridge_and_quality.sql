-- Phase 4: zentrale Objektzuordnung und relationale Datenqualitätschecks.
-- Die Zuordnung properties <-> objects lebt ausschließlich in property_id_aliases.

insert into public.property_id_aliases (legacy_property_id, object_id)
values (
  '92576004-0753-4775-850a-e2e47c1b3cb5'::uuid,
  '4e866825-b3bf-4a2e-9cec-c19c8eb6208b'::uuid
)
on conflict do nothing;

update public.portfolio_properties
set core_property_id = null,
    updated_at = now()
where id = 'f8a86965-07e4-4b6a-a97a-779dbe97a3fd'::uuid
  and is_test
  and core_property_id = id;

update public.portfolio_properties
set core_property_id = 'f8a86965-07e4-4b6a-a97a-779dbe97a3fd'::uuid,
    updated_at = now()
where id = 'e66f0f2f-1199-4b6a-a426-64809d865ae3'::uuid
  and core_property_id is null;

create or replace view public.v_koenen_object_bridge as
select
  p.name as property_name,
  o.code as objekt_code,
  o.id as object_id,
  p.id as property_id
from public.properties p
join public.property_id_aliases a on a.legacy_property_id = p.id
join public.objects o on o.id = a.object_id
where coalesce(p.is_test, false) = false;

revoke all on public.v_koenen_object_bridge from anon;
grant select on public.v_koenen_object_bridge to authenticated;

create or replace function public.get_koenen_data_quality_checks(p_year integer)
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
loan_counts as (
  select property_id, count(*)::numeric as loan_count
  from public.property_loan_ledger
  group by property_id
),
canonical_ids as (
  select id::text as id from public.properties
  union select id::text from public.portfolio_properties
  union select core_property_id::text from public.portfolio_properties where core_property_id is not null
  union select id::text from public.objects
  union select legacy_property_id::text from public.property_id_aliases
  union select object_id::text from public.property_id_aliases
),
checks as (
  select
    'warning'::text as severity,
    'Dokumente'::text as area,
    m.property_id,
    m.property_name,
    'missing_documents'::text as issue_code,
    'Keine Dokumente gefunden.'::text as detail,
    'Dokumente in der Objektakte hochladen.'::text as repair_hint,
    1::numeric as expected_value,
    coalesce(d.document_count, 0)::numeric as actual_value,
    null::numeric as delta
  from master m
  left join document_counts d on d.property_id = m.property_id
  where coalesce(d.document_count, 0) = 0

  union all

  select
    'warning', 'Darlehen', m.property_id, m.property_name,
    'missing_loan_ledger', 'Keine Darlehensdaten gefunden.',
    'Darlehensübersicht für dieses Objekt prüfen.',
    1::numeric, coalesce(l.loan_count, 0)::numeric, null::numeric
  from master m
  left join loan_counts l on l.property_id = m.property_id
  where coalesce(l.loan_count, 0) = 0

  union all

  select
    'info', 'System', m.property_id, m.property_name,
    'finance_master_loaded', 'Finanzmaster erfolgreich geladen.',
    'Keine Aktion erforderlich.', null::numeric, null::numeric, null::numeric
  from master m

  union all

  select
    'critical', 'Objektzuordnung', null::uuid, 'Portfolio gesamt',
    'orphan_object_alias', 'Eine oder mehrere Alias-Zuordnungen verweisen auf kein vorhandenes Buchungsobjekt.',
    'Objekt-Alias und objects-Stammsatz prüfen.', 0::numeric, count(*)::numeric, count(*)::numeric
  from public.property_id_aliases a
  left join public.objects o on o.id = a.object_id
  where o.id is null
  having count(*) > 0

  union all

  select
    'critical', 'Objektzuordnung', null::uuid, 'Portfolio gesamt',
    'ambiguous_property_alias', 'Mindestens eine Immobilien-ID ist mehreren Buchungsobjekten zugeordnet.',
    'Mehrdeutige Alias-Zuordnung entfernen.', 0::numeric, count(*)::numeric, count(*)::numeric
  from (
    select legacy_property_id
    from public.property_id_aliases
    group by legacy_property_id
    having count(distinct object_id) > 1
  ) ambiguous
  having count(*) > 0

  union all

  select
    'warning', 'Portfolio-Link', pp.id, pp.name,
    'missing_core_property', 'Der Portfolio-Datensatz hat keine Verknüpfung zur zentralen Immobilie.',
    'Core-Immobilie im Administrator zuordnen.', 1::numeric, 0::numeric, -1::numeric
  from public.portfolio_properties pp
  where not pp.is_test and pp.core_property_id is null

  union all

  select
    'critical', 'Portfolio-Link', pp.id, pp.name,
    'orphan_core_property', 'Der Portfolio-Datensatz verweist auf eine nicht vorhandene zentrale Immobilie.',
    'Core-Immobilien-ID korrigieren.', 1::numeric, 0::numeric, -1::numeric
  from public.portfolio_properties pp
  left join public.properties p on p.id = pp.core_property_id
  where pp.core_property_id is not null and p.id is null

  union all

  select
    'critical', 'Buchungen', b.property_id, coalesce(b.property_name, f.objekt_code, 'Unbekanntes Objekt'),
    'orphan_finance_object', 'Aktive Buchungen verweisen auf eine nicht vorhandene Objekt-ID.',
    'Objektzuordnung der betroffenen Buchungen korrigieren.', 0::numeric, count(*)::numeric, count(*)::numeric
  from public.finance_entry f
  left join public.objects o on o.id = f.object_id
  left join public.v_koenen_object_bridge b on b.object_id = f.object_id
  where not f.is_deleted and f.object_id is not null and o.id is null
  group by b.property_id, b.property_name, f.objekt_code

  union all

  select
    'critical', 'Buchungen', null::uuid, 'Ohne Objekt',
    'missing_finance_object', 'Aktive Buchungen haben weder Objekt-ID noch Objektcode.',
    'Objekt in der Buchung nachtragen oder ausdrücklich als Portfolio-Allgemein kennzeichnen.',
    0::numeric, count(*)::numeric, count(*)::numeric
  from public.finance_entry
  where not is_deleted and object_id is null and nullif(btrim(objekt_code), '') is null
  having count(*) > 0

  union all

  select
    'warning', 'Buchungen', null::uuid, 'Portfolio gesamt',
    'duplicate_finance_groups', 'Es gibt Gruppen vollständig identischer aktiver Buchungen.',
    'Buchungen in der Monatsansicht prüfen; echte Dubletten löschen, wiederkehrende Zahlungen belassen.',
    0::numeric, count(*)::numeric, count(*)::numeric
  from (
    select 1
    from public.finance_entry
    where not is_deleted
    group by user_id, object_id, coalesce(objekt_code, ''), booking_date, entry_type, amount,
             coalesce(category, ''), coalesce(note, '')
    having count(*) > 1
  ) duplicate_groups
  having count(*) > 0

  union all

  select
    'critical', 'Mietverträge', null::uuid, 'Portfolio gesamt',
    'invalid_tenant_property', 'Aktive Mietverträge haben keine oder eine unbekannte Objektzuordnung.',
    'Objekt-ID im Mietvertrag korrigieren.', 0::numeric, count(*)::numeric, count(*)::numeric
  from public.tenant_contracts t
  where not t.is_deleted
    and (
      nullif(btrim(t.property_id), '') is null
      or not exists (select 1 from canonical_ids c where c.id = t.property_id)
    )
  having count(*) > 0

  union all

  select
    'critical', 'Mietverträge', null::uuid, 'Portfolio gesamt',
    'tenant_date_order', 'Bei aktiven Mietverträgen liegt das Enddatum vor dem Startdatum.',
    'Vertragszeitraum korrigieren.', 0::numeric, count(*)::numeric, count(*)::numeric
  from public.tenant_contracts
  where not is_deleted and start_date is not null and end_date is not null and end_date < start_date
  having count(*) > 0

  union all

  select
    'warning', 'Mietverträge', null::uuid, 'Portfolio gesamt',
    'tenant_rent_total_mismatch', 'Kaltmiete plus Nebenkosten stimmt nicht mit der Warmmiete überein.',
    'Mietbestandteile im Mietvertrag abgleichen.', 0::numeric, count(*)::numeric, count(*)::numeric
  from public.tenant_contracts
  where not is_deleted and cold_rent is not null and operating_costs is not null and total_rent is not null
    and abs(cold_rent + operating_costs - total_rent) > 0.01
  having count(*) > 0

  union all

  select
    'warning', 'Mietanpassungen', null::uuid, 'Portfolio gesamt',
    'rent_adjustment_total_mismatch', 'Bei Mietanpassungen stimmt Kaltmiete plus Nebenkosten nicht mit der Warmmiete überein.',
    'Mietbestandteile in der Mietanpassung abgleichen.', 0::numeric, count(*)::numeric, count(*)::numeric
  from public.rent_adjustments
  where not is_deleted and new_cold_rent is not null and new_operating_costs is not null and new_total_rent is not null
    and abs(new_cold_rent + new_operating_costs - new_total_rent) > 0.01
  having count(*) > 0

  union all

  select
    'critical', 'Mietanpassungen', null::uuid, 'Portfolio gesamt',
    'rent_adjustment_date_order', 'Bei Mietanpassungen liegt das Gültigkeitsende vor dem Startdatum.',
    'Gültigkeitszeitraum der Mietanpassung korrigieren.', 0::numeric, count(*)::numeric, count(*)::numeric
  from public.rent_adjustments
  where not is_deleted and effective_end_date is not null and effective_end_date < effective_date
  having count(*) > 0

  union all

  select
    'warning', 'Leerstand', b.property_id, coalesce(b.property_name, v.object_label, 'Unbekanntes Objekt'),
    'vacancy_contract_overlap',
    ('Leerstand und Mietvertrag überschneiden sich für Einheit ' || coalesce(nullif(v.unit_label, ''), 'ohne Bezeichnung') || '.')::text,
    'Beginn des Leerstands und Vertragsende abgleichen.', 0::numeric, count(*)::numeric, count(*)::numeric
  from public.unit_vacancies v
  join public.tenant_contracts t on not v.is_deleted and not t.is_deleted
    and (nullif(v.property_id, '') = nullif(t.property_id, '') or (nullif(v.object_code, '') is not null and v.object_code = t.object_code))
    and coalesce(v.unit_label, '') = coalesce(t.unit_label, '')
    and daterange(v.start_date, coalesce(v.end_date + 1, 'infinity'::date), '[)')
        && daterange(coalesce(t.start_date, '-infinity'::date), coalesce(t.end_date + 1, 'infinity'::date), '[)')
  left join public.v_koenen_object_bridge b on b.object_id::text = v.property_id or b.objekt_code = v.object_code
  group by b.property_id, b.property_name, v.object_label, v.unit_label

  union all

  select
    'critical', 'Darlehen', null::uuid, 'Portfolio gesamt',
    'orphan_loan_property', 'Darlehenszeilen verweisen auf keine bekannte Immobilie.',
    'Immobilien-ID in der Darlehensübersicht korrigieren.', 0::numeric, count(*)::numeric, count(*)::numeric
  from public.property_loan_ledger l
  where not exists (select 1 from canonical_ids c where c.id = l.property_id::text)
  having count(*) > 0

  union all

  select
    'critical', 'Darlehen', null::uuid, 'Portfolio gesamt',
    'duplicate_loan_year', 'Für eine Immobilie und ein Jahr existieren mehrere Darlehenszeilen.',
    'Doppelte Darlehensjahre prüfen und zusammenführen.', 0::numeric, sum(row_count - 1)::numeric, sum(row_count - 1)::numeric
  from (
    select count(*)::numeric as row_count
    from public.property_loan_ledger
    group by property_id, year
    having count(*) > 1
  ) duplicates
  having sum(row_count - 1) > 0

  union all

  select
    'warning', 'Zusatzdaten', null::uuid, 'Portfolio gesamt',
    'orphan_property_extra', 'Zusatzdaten verweisen auf keine bekannte Immobilie oder Einheit.',
    'Property-ID der Zusatzdaten prüfen.', 0::numeric, count(*)::numeric, count(*)::numeric
  from public.property_extra_info e
  where not exists (
    select 1 from canonical_ids c
    where c.id = e.property_id or c.id = split_part(e.property_id, '::', 1)
  )
  having count(*) > 0
)
select *
from checks
order by
  case severity when 'critical' then 1 when 'warning' then 2 else 3 end,
  area,
  property_name;
$$;

grant execute on function public.get_koenen_data_quality_checks(integer) to authenticated;
