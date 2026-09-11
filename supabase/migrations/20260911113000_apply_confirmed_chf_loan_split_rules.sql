-- Eigentümerbestätigung vom 11.09.2026:
-- Lilienthaler Str. 54 und Elsasser Str. 52 sind CHF-basierte Darlehen.
-- Die tatsächliche EUR-Abbuchung schwankt; die regelmäßige Tilgung ist fest.
-- Deshalb gilt für die gebuchte Rate: Zins = abs(Gesamtrate) - feste Tilgung.

do $$
declare
  expected_count integer;
  updated_count integer;
begin
  create temporary table confirmed_chf_loan_splits on commit drop as
  select distinct on (f.id)
    f.id,
    case
      when lower(coalesce(o.label, '')) like '%lilienthaler%' then 1100.00::numeric
      when lower(coalesce(o.label, '')) like '%elsasser%' then 300.00::numeric
    end as principal_amount,
    case
      when lower(coalesce(o.label, '')) like '%lilienthaler%'
        then 'rule:CHF-fixed-principal:1100:owner-confirmed-2026-09-11'
      when lower(coalesce(o.label, '')) like '%elsasser%'
        then 'rule:CHF-fixed-principal:300:owner-confirmed-2026-09-11'
    end as split_source
  from public.finance_entry f
  join public.v_object_dropdown o
    on o.object_id::text = f.object_id::text
    or (f.objekt_code is not null and o.objekt_code::text = f.objekt_code::text)
  where coalesce(f.is_deleted, false) = false
    and f.category = 'Kreditrate'
    and (
      lower(coalesce(o.label, '')) like '%lilienthaler%'
      or lower(coalesce(o.label, '')) like '%elsasser%'
    )
  order by f.id;

  if exists (
    select 1
    from public.finance_entry f
    join confirmed_chf_loan_splits rule on rule.id = f.id
    where abs(f.amount) < rule.principal_amount
  ) then
    raise exception 'CHF-Kreditrate ist kleiner als der bestätigte feste Tilgungsanteil';
  end if;

  select count(*) into expected_count from confirmed_chf_loan_splits;
  if expected_count = 0 then
    raise exception 'Keine CHF-Kreditraten für Lilienthaler/Elsasser gefunden';
  end if;

  update public.finance_entry f
  set
    loan_interest_amount = round(abs(f.amount) - rule.principal_amount, 2),
    loan_principal_amount = rule.principal_amount,
    loan_split_source = rule.split_source,
    tax_relevant = false
  from confirmed_chf_loan_splits rule
  where f.id = rule.id;

  get diagnostics updated_count = row_count;
  if updated_count <> expected_count then
    raise exception 'CHF-Aufteilung unvollständig: % von % Buchungen aktualisiert', updated_count, expected_count;
  end if;

  if exists (
    select 1
    from public.finance_entry f
    join confirmed_chf_loan_splits rule on rule.id = f.id
    where round(coalesce(f.loan_interest_amount, 0) + coalesce(f.loan_principal_amount, 0), 2) <> round(abs(f.amount), 2)
      or f.loan_principal_amount <> rule.principal_amount
      or f.loan_split_source <> rule.split_source
      or f.tax_relevant is distinct from false
  ) then
    raise exception 'CHF-Kreditraten konnten nicht konsistent gespeichert werden';
  end if;
end
$$;

comment on column public.finance_entry.loan_split_source is
  'Quelle der Zins-/Tilgungsaufteilung. CHF-Regeln verwenden die tatsächliche EUR-Rate minus den vom Eigentümer bestätigten festen Tilgungsanteil.';
